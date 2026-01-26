/**
 * Sound Generation Module
 * Converts visual analysis data into audio using Web Audio API
 */

/**
 * Add noise/grit to a gain node for textured images
 */
const addNoise = (audioContext, gainNode, time, duration, noiseAmount) => {
  if (noiseAmount < 0.05) return;

  try {
    const noiseBufferSize = audioContext.sampleRate * duration;
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
  } catch (error) {
    console.error('Failed to add noise:', error);
    // Continue without noise if it fails
  }
};

/**
 * Create FM synthesis oscillator for complex images
 */
const createFMOsc = (audioContext, carrierFreq, time, duration, complexity, saturation) => {
  try {
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
  } catch (error) {
    console.error('Failed to create FM oscillator:', error);
    throw error;
  }
};

/**
 * Generate Kiki mode sound (angular/sharp)
 */
const generateKikiSound = (audioContext, analysis, masterGain, now, totalDuration) => {
  const { brightness, complexity, rhythm, warmth, saturation, texture, segmentData } = analysis;

  const baseFreq = 220 + (brightness * 220);
  const expandedMinorScale = [
    0, 2, 3, 5, 7, 8, 10, 12,
    14, 15, 17, 19, 20, 22, 24, 26
  ];

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

    addNoise(audioContext, gain, time, noteDuration, noiseAmount);

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
      const fm = createFMOsc(audioContext, freq, time, noteDuration, complexity, saturation);

      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterCutoff * 1.5, time);

      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + noteDuration);

      fm.carrier.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      addNoise(audioContext, gain, time, noteDuration, noiseAmount);
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

      addNoise(audioContext, gain, time, noteDuration, noiseAmount);

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
      addNoise(audioContext, gain, time, 0.15, noiseAmount);
    }

    kick.start(time);
    kick.stop(time + 0.15);
  }

  // Hi-hat
  for (let i = 0; i < totalDuration / (beatLength / 2); i++) {
    const time = now + (i * beatLength / 2);

    const bufferSize = audioContext.sampleRate * 0.03;
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
 * Generate Bouba mode sound (round/smooth)
 */
const generateBoubaSound = (audioContext, analysis, masterGain, now, totalDuration) => {
  const { brightness, complexity, warmth, saturation, texture, segmentData } = analysis;

  const baseFreq = 220 + (brightness * 220);
  const expandedMinorScale = [
    0, 2, 3, 5, 7, 8, 10, 12,
    14, 15, 17, 19, 20, 22, 24, 26
  ];

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
  bassGain.gain.linearRampToValueAtTime(0.2, now + 1);
  bassGain.gain.linearRampToValueAtTime(0.2, now + totalDuration - 1);
  bassGain.gain.linearRampToValueAtTime(0, now + totalDuration);

  bassDrone.connect(bassFilter);
  bassFilter.connect(bassGain);
  bassGain.connect(masterGain);

  addNoise(audioContext, bassGain, now, totalDuration, noiseAmount);

  bassDrone.start(now);
  bassDrone.stop(now + totalDuration);

  // Melody
  const noteDuration = totalDuration / segmentData.length;

  segmentData.forEach((segment, index) => {
    const time = now + (index * noteDuration);
    const noteIndex = Math.floor(segment.brightness * 15);
    const freq = baseFreq * Math.pow(2, expandedMinorScale[noteIndex] / 12);

    const attackTime = 0.2 + (1 - complexity) * 0.3;
    const decayTime = 0.2 + (1 - complexity) * 0.3;

    if (complexity > 0.6) {
      const fm = createFMOsc(audioContext, freq, time, noteDuration, complexity, saturation);

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
      gain.gain.linearRampToValueAtTime(0.1, time + noteDuration - decayTime);
      gain.gain.linearRampToValueAtTime(0, time + noteDuration);

      fm.carrier.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      addNoise(audioContext, gain, time, noteDuration, noiseAmount);
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
      gain.gain.linearRampToValueAtTime(0.12, time + noteDuration - decayTime);
      gain.gain.linearRampToValueAtTime(0, time + noteDuration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      addNoise(audioContext, gain, time, noteDuration, noiseAmount);

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
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.04, now + 1.5);
    gain.gain.linearRampToValueAtTime(0.04, now + totalDuration - 1.5);
    gain.gain.linearRampToValueAtTime(0, now + totalDuration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    if (texture > 0.2) {
      addNoise(audioContext, gain, now, totalDuration, noiseAmount);
    }

    osc.start(now);
    osc.stop(now + totalDuration);
    vibrato.start(now);
    vibrato.stop(now + totalDuration);
  });
};

/**
 * Main sound generation function
 * @param {AudioContext} audioContext - Web Audio API context
 * @param {Object} analysis - Image analysis results
 * @param {number} duration - Sound duration in seconds (default: 5)
 * @param {number} volume - Master volume (0-1, default: 0.5)
 * @returns {Promise<void>} Resolves when sound generation is complete
 * @throws {Error} If audio context is invalid or sound generation fails
 */
export const generateSound = async (audioContext, analysis, duration = 5, volume = 0.5) => {
  try {
    if (!audioContext || !(audioContext instanceof AudioContext)) {
      throw new Error('Invalid AudioContext provided');
    }

    if (!analysis || typeof analysis !== 'object') {
      throw new Error('Invalid analysis data provided');
    }

    // Clamp volume to valid range
    const clampedVolume = Math.max(0, Math.min(1, volume));

    // Resume audio context if suspended (browser policy)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const now = audioContext.currentTime;

    const masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(clampedVolume, now);
    masterGain.connect(audioContext.destination);

    const totalDuration = duration;

    // Choose sound mode based on angularity
    if (analysis.angularity > 0.5) {
      generateKikiSound(audioContext, analysis, masterGain, now, totalDuration);
    } else {
      generateBoubaSound(audioContext, analysis, masterGain, now, totalDuration);
    }

    // Return a promise that resolves when sound is done
    return new Promise((resolve) => {
      setTimeout(() => resolve(), totalDuration * 1000);
    });
  } catch (error) {
    console.error('Sound generation failed:', error);
    throw new Error(`Sound generation failed: ${error.message}`);
  }
};
