import Meyda from 'meyda';

const FRAME_SIZE = 2048;
const HOP_SIZE = 512;

export async function analyzeAudioFile(input) {
  let arrayBuffer;
  if (input instanceof ArrayBuffer) {
    arrayBuffer = input;
  } else if (input && typeof input.arrayBuffer === 'function') {
    arrayBuffer = await input.arrayBuffer();
  } else {
    throw new Error('Unsupported audio input');
  }

  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('Web Audio API not supported in this browser');
  const ctx = new Ctx();
  let audioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch (err) {
    throw new Error('Could not decode audio file');
  } finally {
    ctx.close();
  }

  const samples = toMono(audioBuffer);
  const trimmed = trimSilence(samples);
  if (trimmed.length < FRAME_SIZE) {
    throw new Error('Audio is too short to analyze');
  }

  return aggregate(trimmed, audioBuffer.sampleRate);
}

function toMono(audioBuffer) {
  const numCh = audioBuffer.numberOfChannels;
  const len = audioBuffer.length;
  if (numCh === 1) return audioBuffer.getChannelData(0).slice();
  const out = new Float32Array(len);
  for (let ch = 0; ch < numCh; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < len; i++) out[i] += data[i];
  }
  for (let i = 0; i < len; i++) out[i] /= numCh;
  return out;
}

function trimSilence(samples, threshold = 0.01) {
  let start = 0;
  let end = samples.length;
  while (start < end && Math.abs(samples[start]) < threshold) start++;
  while (end > start && Math.abs(samples[end - 1]) < threshold) end--;
  return samples.slice(start, end);
}

function aggregate(samples, sampleRate) {
  Meyda.bufferSize = FRAME_SIZE;

  const featureList = [
    'rms',
    'zcr',
    'spectralCentroid',
    'spectralRolloff',
    'spectralFlatness',
    'spectralSpread',
    'loudness',
    'amplitudeSpectrum',
  ];

  const rmsArr = [];
  const zcrArr = [];
  const centroidArr = [];
  const rolloffArr = [];
  const flatnessArr = [];
  const spreadArr = [];
  const fluxArr = [];
  let lowLoudnessSum = 0;
  let highLoudnessSum = 0;
  let totalLoudnessSum = 0;
  let loudnessFrameCount = 0;
  let prevSpectrum = null;

  for (let i = 0; i + FRAME_SIZE <= samples.length; i += HOP_SIZE) {
    const frame = samples.slice(i, i + FRAME_SIZE);
    let f;
    try {
      f = Meyda.extract(featureList, frame);
    } catch (e) {
      continue;
    }
    if (!f) continue;

    rmsArr.push(f.rms || 0);
    zcrArr.push(f.zcr || 0);
    centroidArr.push(f.spectralCentroid || 0);
    rolloffArr.push(f.spectralRolloff || 0);
    flatnessArr.push(f.spectralFlatness || 0);
    spreadArr.push(f.spectralSpread || 0);

    if (f.amplitudeSpectrum) {
      if (prevSpectrum) {
        let flux = 0;
        const n = Math.min(prevSpectrum.length, f.amplitudeSpectrum.length);
        for (let k = 0; k < n; k++) {
          const d = f.amplitudeSpectrum[k] - prevSpectrum[k];
          if (d > 0) flux += d;
        }
        fluxArr.push(flux);
      }
      prevSpectrum = new Float32Array(f.amplitudeSpectrum);
    }

    if (f.loudness && f.loudness.specific) {
      const bands = f.loudness.specific;
      loudnessFrameCount++;
      for (let b = 0; b < bands.length; b++) {
        const v = bands[b] || 0;
        totalLoudnessSum += v;
        if (b <= 5) lowLoudnessSum += v;
        else if (b >= 15) highLoudnessSum += v;
      }
    }
  }

  if (rmsArr.length === 0) {
    throw new Error('No analyzable frames in audio');
  }

  const rmsMean = mean(rmsArr);
  const zcrVar = variance(zcrArr);
  const centroidMean = mean(centroidArr);
  const rolloffMean = mean(rolloffArr);
  const flatnessStd = stddev(flatnessArr);
  const spreadMean = mean(spreadArr);

  const centroidHz = centroidMean * (sampleRate / FRAME_SIZE);
  const centroidNorm = clamp(centroidHz / 5000);

  const highBandRatio = totalLoudnessSum > 0 ? highLoudnessSum / totalLoudnessSum : 0;
  const warmth = lowLoudnessSum + highLoudnessSum > 0
    ? lowLoudnessSum / (lowLoudnessSum + highLoudnessSum)
    : 0.5;

  const zcrVarNorm = clamp(zcrVar / 0.0015);
  const angularity = clamp(
    0.50 * clamp(highBandRatio * 2.2) +
    0.25 * zcrVarNorm +
    0.25 * centroidNorm
  );

  const brightness = clamp((rolloffMean - 500) / 9500);

  const spreadHz = spreadMean * (sampleRate / FRAME_SIZE);
  const complexity = clamp((spreadHz - 300) / 3700);

  const rhythm = computeRhythm(fluxArr, sampleRate);
  const saturation = clamp(rmsMean / 0.25);
  const texture = clamp(flatnessStd / 0.12);

  return {
    angularity,
    brightness,
    warmth,
    complexity,
    rhythm,
    saturation,
    texture,
  };
}

function computeRhythm(flux, sampleRate) {
  if (flux.length < 10) return 0;
  const hopSeconds = HOP_SIZE / sampleRate;

  const windowFrames = Math.max(5, Math.floor(0.5 / hopSeconds));
  const residual = new Float32Array(flux.length);
  const scratch = [];
  for (let i = 0; i < flux.length; i++) {
    const s = Math.max(0, i - windowFrames);
    const e = Math.min(flux.length, i + windowFrames + 1);
    scratch.length = 0;
    for (let k = s; k < e; k++) scratch.push(flux[k]);
    scratch.sort((a, b) => a - b);
    const med = scratch[Math.floor(scratch.length / 2)];
    residual[i] = Math.max(0, flux[i] - med);
  }

  const sortedRes = Array.from(residual).sort((a, b) => a - b);
  const med = sortedRes[Math.floor(sortedRes.length / 2)] || 0;
  const absDev = Array.from(residual, (v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = absDev[Math.floor(absDev.length / 2)] || 0;
  const threshold = 1.5 * mad + 1e-6;

  const minGap = Math.max(1, Math.floor(0.05 / hopSeconds));
  let peaks = 0;
  let lastPeak = -minGap - 1;
  for (let i = 1; i < residual.length - 1; i++) {
    if (
      residual[i] > threshold &&
      residual[i] >= residual[i - 1] &&
      residual[i] >= residual[i + 1] &&
      i - lastPeak >= minGap
    ) {
      peaks++;
      lastPeak = i;
    }
  }

  const duration = (flux.length * HOP_SIZE) / sampleRate;
  if (duration <= 0) return 0;
  const onsetsPerSec = peaks / duration;
  return clamp(Math.log1p(onsetsPerSec) / Math.log1p(8));
}

function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const v of arr) s += v || 0;
  return s / arr.length;
}

function variance(arr) {
  if (!arr.length) return 0;
  const m = mean(arr);
  let s = 0;
  for (const v of arr) {
    const d = (v || 0) - m;
    s += d * d;
  }
  return s / arr.length;
}

function stddev(arr) {
  return Math.sqrt(variance(arr));
}

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}
