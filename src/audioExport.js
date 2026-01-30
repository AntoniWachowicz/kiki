/**
 * Audio Export Utility
 * Renders audio using OfflineAudioContext and exports as WAV
 */

/**
 * Encode audio buffer to WAV format
 */
const encodeWAV = (audioBuffer) => {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const samples = audioBuffer.length;
  const dataSize = samples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // Write WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channels and write samples
  const channelData = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
};

/**
 * Add noise to a gain node
 */
const addNoiseOffline = (audioContext, gainNode, time, duration, noiseAmount) => {
  if (noiseAmount < 0.05 || duration <= 0 || time < 0) return;

  const noiseBufferSize = Math.max(1, Math.floor(audioContext.sampleRate * duration));
  const noiseBuffer = audioContext.createBuffer(1, noiseBufferSize, audioContext.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);

  for (let i = 0; i < noiseBufferSize; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * noiseAmount * 0.5;
  }

  const noise = audioContext.createBufferSource();
  noise.buffer = noiseBuffer;

  const noiseGain = audioContext.createGain();
  noiseGain.gain.setValueAtTime(noiseAmount * 0.6, time);

  noise.connect(noiseGain);
  noiseGain.connect(gainNode);
  noise.start(time);
};

/**
 * Create FM synthesis oscillator
 */
const createFMOscOffline = (audioContext, carrierFreq, time, duration, complexity, saturation) => {
  const modRatio = 1 + complexity * 3;
  const modFreq = carrierFreq * modRatio;
  const modIndex = saturation * 5;

  const carrier = audioContext.createOscillator();
  carrier.frequency.setValueAtTime(carrierFreq, time);

  const modulator = audioContext.createOscillator();
  modulator.frequency.setValueAtTime(modFreq, time);

  const modGain = audioContext.createGain();
  modGain.gain.setValueAtTime(carrierFreq * modIndex, time);

  modulator.connect(modGain);
  modGain.connect(carrier.frequency);

  modulator.start(time);
  modulator.stop(time + duration);
  carrier.start(time);
  carrier.stop(time + duration);

  return { carrier, modulator };
};

/**
 * Generate Kiki mode sound
 */
const generateKikiSoundOffline = (audioContext, analysis, masterGain, now, totalDuration) => {
  const { brightness, complexity, rhythm, warmth, saturation, texture, segmentData } = analysis;

  const baseFreq = 220 + (brightness * 220);
  const expandedMinorScale = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 22, 24, 26];

  const bpm = 60 + (rhythm * 240);
  const beatLength = 60 / bpm / 4;

  const filterCutoff = 500 + (warmth + 1) * 2000;
  const noiseAmount = texture;

  // Bass pattern
  const bassNotes = [0, 0, 5, 0, 3, 0, 5, 3];

  for (let i = 0; i < Math.floor(totalDuration / beatLength); i++) {
    const time = now + (i * beatLength);
    const noteIndex = bassNotes[i % bassNotes.length];
    const freq = (baseFreq * 0.5) * Math.pow(2, expandedMinorScale[noteIndex] / 12);

    const osc = audioContext.createOscillator();
    osc.type = warmth > 0 ? 'square' : 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterCutoff, time);
    filter.Q.setValueAtTime(1 + saturation * 10, time);

    const gain = audioContext.createGain();
    const noteDuration = beatLength * (0.3 + complexity * 0.4);
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + noteDuration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    addNoiseOffline(audioContext, gain, time, noteDuration, noiseAmount);

    osc.start(time);
    osc.stop(time + noteDuration);
  }

  // Melody
  segmentData.forEach((segment, index) => {
    const time = now + (index * (totalDuration / segmentData.length));
    const noteIndex = Math.floor(segment.brightness * 15);
    const freq = baseFreq * 2 * Math.pow(2, expandedMinorScale[noteIndex] / 12);
    const noteDuration = 0.05 + (1 - segment.angularity) * 0.15;

    if (complexity > 0.6) {
      const fm = createFMOscOffline(audioContext, freq, time, noteDuration, complexity, saturation);

      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterCutoff * 1.5, time);

      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + noteDuration);

      fm.carrier.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      addNoiseOffline(audioContext, gain, time, noteDuration, noiseAmount);
    } else {
      const osc = audioContext.createOscillator();
      osc.type = saturation > 0.5 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, time);

      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterCutoff * 1.5, time);

      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.18, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + noteDuration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      addNoiseOffline(audioContext, gain, time, noteDuration, noiseAmount);

      osc.start(time);
      osc.stop(time + noteDuration);
    }
  });

  // Kick drum
  for (let i = 0; i < totalDuration / beatLength; i++) {
    const time = now + (i * beatLength);

    const kick = audioContext.createOscillator();
    kick.frequency.setValueAtTime(150, time);
    kick.frequency.exponentialRampToValueAtTime(40, time + 0.05);

    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);

    kick.connect(gain);
    gain.connect(masterGain);

    if (texture > 0.3) {
      addNoiseOffline(audioContext, gain, time, 0.15, noiseAmount);
    }

    kick.start(time);
    kick.stop(time + 0.15);
  }

  // Hi-hat
  for (let i = 0; i < totalDuration / (beatLength / 2); i++) {
    const time = now + (i * beatLength / 2);

    const bufferSize = Math.floor(audioContext.sampleRate * 0.03);
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let j = 0; j < bufferSize; j++) {
      data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufferSize * 0.05));
    }

    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;

    const filter = audioContext.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8000, time);

    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    noise.start(time);
  }
};

/**
 * Generate Bouba mode sound
 */
const generateBoubaSoundOffline = (audioContext, analysis, masterGain, now, totalDuration) => {
  const { brightness, complexity, warmth, saturation, texture, segmentData } = analysis;

  const baseFreq = 220 + (brightness * 220);
  const expandedMinorScale = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 22, 24, 26];

  const filterCutoff = 500 + (warmth + 1) * 2000;
  const noiseAmount = texture;

  // Bass drone
  const bassDrone = audioContext.createOscillator();
  bassDrone.type = 'sine';
  bassDrone.frequency.setValueAtTime(baseFreq * 0.5, now);

  const bassFilter = audioContext.createBiquadFilter();
  bassFilter.type = 'lowpass';
  bassFilter.frequency.setValueAtTime(filterCutoff * 0.8, now);
  bassFilter.Q.setValueAtTime(1 + saturation * 5, now);

  const bassGain = audioContext.createGain();
  bassGain.gain.setValueAtTime(0, now);
  bassGain.gain.linearRampToValueAtTime(0.2, now + Math.min(1, totalDuration * 0.2));
  bassGain.gain.linearRampToValueAtTime(0.2, now + Math.max(totalDuration * 0.2, totalDuration - 1));
  bassGain.gain.linearRampToValueAtTime(0, now + totalDuration);

  bassDrone.connect(bassFilter);
  bassFilter.connect(bassGain);
  bassGain.connect(masterGain);

  addNoiseOffline(audioContext, bassGain, now, totalDuration, noiseAmount);

  bassDrone.start(now);
  bassDrone.stop(now + totalDuration);

  // Melody
  const noteDuration = totalDuration / segmentData.length;

  segmentData.forEach((segment, index) => {
    const time = now + (index * noteDuration);
    const noteIndex = Math.floor(segment.brightness * 15);
    const freq = baseFreq * Math.pow(2, expandedMinorScale[noteIndex] / 12);

    // Clamp attack/decay to fit within note duration
    const rawAttack = 0.2 + (1 - complexity) * 0.3;
    const rawDecay = 0.2 + (1 - complexity) * 0.3;
    const attackTime = Math.min(rawAttack, noteDuration * 0.3);
    const decayTime = Math.min(rawDecay, noteDuration * 0.3);
    const sustainEnd = Math.max(attackTime + 0.01, noteDuration - decayTime);

    if (complexity > 0.6) {
      const fm = createFMOscOffline(audioContext, freq, time, noteDuration, complexity, saturation);

      if (index < segmentData.length - 1) {
        const nextNoteIndex = Math.floor(segmentData[index + 1].brightness * 15);
        const nextFreq = baseFreq * Math.pow(2, expandedMinorScale[nextNoteIndex] / 12);
        const glideTime = noteDuration * (0.5 + (1 - complexity) * 0.3);
        fm.carrier.frequency.exponentialRampToValueAtTime(nextFreq, time + glideTime);
      }

      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterCutoff * 0.9, time);

      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.12, time + attackTime);
      gain.gain.linearRampToValueAtTime(0.1, time + sustainEnd);
      gain.gain.linearRampToValueAtTime(0, time + noteDuration);

      fm.carrier.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      addNoiseOffline(audioContext, gain, time, noteDuration, noiseAmount);
    } else {
      const osc = audioContext.createOscillator();
      osc.type = warmth > 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, time);

      if (index < segmentData.length - 1) {
        const nextNoteIndex = Math.floor(segmentData[index + 1].brightness * 15);
        const nextFreq = baseFreq * Math.pow(2, expandedMinorScale[nextNoteIndex] / 12);
        const glideTime = noteDuration * (0.5 + (1 - complexity) * 0.3);
        osc.frequency.exponentialRampToValueAtTime(nextFreq, time + glideTime);
      }

      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterCutoff, time);

      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.15, time + attackTime);
      gain.gain.linearRampToValueAtTime(0.12, time + sustainEnd);
      gain.gain.linearRampToValueAtTime(0, time + noteDuration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      addNoiseOffline(audioContext, gain, time, noteDuration, noiseAmount);

      osc.start(time);
      osc.stop(time + noteDuration);
    }
  });

  // Pad chords
  const chordNotes = [0, 3, 5, 7];

  chordNotes.forEach((noteOffset) => {
    const freq = baseFreq * Math.pow(2, expandedMinorScale[noteOffset] / 12);

    const osc = audioContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    const vibrato = audioContext.createOscillator();
    vibrato.frequency.setValueAtTime(5, now);
    const vibratoGain = audioContext.createGain();
    vibratoGain.gain.setValueAtTime(3 + saturation * 5, now);
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);

    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterCutoff * 1.2, now);

    const gain = audioContext.createGain();
    const padAttack = Math.min(1.5, totalDuration * 0.3);
    const padSustainEnd = Math.max(padAttack + 0.01, totalDuration - 1.5);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.04, now + padAttack);
    gain.gain.linearRampToValueAtTime(0.04, now + padSustainEnd);
    gain.gain.linearRampToValueAtTime(0, now + totalDuration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    if (texture > 0.2) {
      addNoiseOffline(audioContext, gain, now, totalDuration, noiseAmount);
    }

    osc.start(now);
    osc.stop(now + totalDuration);
    vibrato.start(now);
    vibrato.stop(now + totalDuration);
  });
};

/**
 * Render audio to a WAV blob using OfflineAudioContext
 * @param {Object} analysis - Image analysis results
 * @param {number} duration - Duration in seconds
 * @param {number} volume - Volume (0-1)
 * @returns {Promise<Blob>} WAV audio blob
 */
export const renderAudioToWav = async (analysis, duration = 5, volume = 0.5) => {
  const sampleRate = 44100;
  const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  const masterGain = offlineCtx.createGain();
  masterGain.gain.setValueAtTime(volume, 0);
  masterGain.connect(offlineCtx.destination);

  // Generate sound based on angularity
  if (analysis.angularity > 0.5) {
    generateKikiSoundOffline(offlineCtx, analysis, masterGain, 0, duration);
  } else {
    generateBoubaSoundOffline(offlineCtx, analysis, masterGain, 0, duration);
  }

  const renderedBuffer = await offlineCtx.startRendering();
  return encodeWAV(renderedBuffer);
};

/**
 * Download a blob as a file
 */
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
