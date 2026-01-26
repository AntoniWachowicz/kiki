/**
 * Sound Generation Module V2
 * Experimental sound generation system with smooth angularity scaling
 *
 * Key improvement: Angularity now scales parameters WITHIN each mode
 * - Kiki mode: 51% = mild, 100% = extreme
 * - Bouba mode: 49% = mild, 0% = extreme
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
  }
};

/**
 * Create FM synthesis oscillator for complex images
 */
const createFMOsc = (audioContext, carrierFreq, time, duration, modDepth, modRatio) => {
  try {
    const modFreq = carrierFreq * modRatio;

    const carrier = audioContext.createOscillator();
    carrier.frequency.setValueAtTime(carrierFreq, time);

    const modulator = audioContext.createOscillator();
    modulator.frequency.setValueAtTime(modFreq, time);

    const modGain = audioContext.createGain();
    modGain.gain.setValueAtTime(carrierFreq * modDepth, time);

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
 * Linear interpolation helper
 */
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Choose waveform based on intensity (0 = soft, 1 = harsh)
 */
const getWaveform = (intensity, warmth) => {
  if (intensity < 0.33) return 'sine';
  if (intensity < 0.66) return warmth > 0 ? 'triangle' : 'sine';
  return warmth > 0 ? 'square' : 'sawtooth';
};

/**
 * Generate Kiki mode sound (angular/sharp)
 *
 * Intensity (0-1) scales:
 * - Attack sharpness (faster attacks at high intensity)
 * - Note duration (shorter, more staccato at high intensity)
 * - Waveform harshness (sine → triangle → sawtooth/square)
 * - Filter brightness (higher cutoff at high intensity)
 * - Percussion volume (louder at high intensity)
 * - Filter resonance (more aggressive at high intensity)
 */
const generateKikiSound = (audioContext, analysis, masterGain, now, totalDuration, intensity) => {
  const { brightness, complexity, rhythm, warmth, saturation, texture, segmentData } = analysis;

  // Base parameters
  const baseFreq = 220 + (brightness * 220);
  const expandedMinorScale = [
    0, 2, 3, 5, 7, 8, 10, 12,
    14, 15, 17, 19, 20, 22, 24, 26
  ];

  // Intensity-scaled parameters
  const bpm = lerp(80, 60 + rhythm * 240, intensity);  // Faster at high intensity
  const beatLength = 60 / bpm / 4;

  // Filter gets brighter with intensity
  const filterCutoff = lerp(800, 500 + (warmth + 1) * 2500, intensity);
  const filterQ = lerp(1, 1 + saturation * 15, intensity);

  // Attack gets sharper with intensity
  const attackTime = lerp(0.05, 0.005, intensity);

  // Notes get shorter with intensity
  const noteDecayMult = lerp(0.7, 0.3, intensity);

  // Percussion volume scales with intensity
  const kickVolume = lerp(0.15, 0.4, intensity);
  const hihatVolume = lerp(0.02, 0.1, intensity);

  const noiseAmount = texture;

  // ============ BASS PATTERN ============
  const bassNotes = [0, 0, 5, 0, 3, 0, 5, 3];

  // Waveform harshness based on intensity
  const bassWaveform = intensity > 0.5 ? (warmth > 0 ? 'square' : 'sawtooth') : 'triangle';

  for (let i = 0; i < Math.floor(totalDuration / beatLength); i++) {
    const time = now + (i * beatLength);
    const noteIndex = bassNotes[i % bassNotes.length];
    const freq = (baseFreq * 0.5) * Math.pow(2, expandedMinorScale[noteIndex] / 12);

    const osc = audioContext.createOscillator();
    osc.type = bassWaveform;
    osc.frequency.setValueAtTime(freq, time);

    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterCutoff * 0.8, time);
    filter.Q.setValueAtTime(filterQ, time);

    const gain = audioContext.createGain();
    const noteDuration = beatLength * noteDecayMult;

    // Sharp attack at high intensity
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.25, time + attackTime);
    gain.gain.exponentialRampToValueAtTime(0.01, time + noteDuration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    addNoise(audioContext, gain, time, noteDuration, noiseAmount * intensity);

    osc.start(time);
    osc.stop(time + noteDuration + 0.01);
  }

  // ============ MELODY ============
  // Waveform for melody based on intensity
  const melodyWaveform = getWaveform(intensity, warmth);

  // Fixed note spacing - keeps density consistent regardless of total duration
  // At high intensity, notes are closer together (faster melody)
  const melodyNoteSpacing = lerp(0.35, 0.15, intensity);
  const totalMelodyNotes = Math.floor(totalDuration / melodyNoteSpacing);

  for (let i = 0; i < totalMelodyNotes; i++) {
    const segment = segmentData[i % segmentData.length];  // Loop through segments
    const time = now + (i * melodyNoteSpacing);
    const noteIndex = Math.floor(segment.brightness * 15);
    const freq = baseFreq * 2 * Math.pow(2, expandedMinorScale[noteIndex] / 12);

    // Note duration scales with intensity (shorter = more staccato)
    const noteDuration = lerp(0.25, 0.03, intensity) + (1 - segment.angularity) * 0.1;

    // Use FM synthesis at higher complexity OR high intensity
    const useFM = complexity > 0.6 || intensity > 0.7;

    if (useFM) {
      const modDepth = lerp(1, 5, intensity) * saturation;
      const modRatio = lerp(1, 4, intensity);
      const fm = createFMOsc(audioContext, freq, time, noteDuration, modDepth, modRatio);

      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterCutoff * 1.5, time);
      filter.Q.setValueAtTime(filterQ * 0.5, time);

      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.15, time + attackTime);
      gain.gain.exponentialRampToValueAtTime(0.01, time + noteDuration);

      fm.carrier.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      addNoise(audioContext, gain, time, noteDuration, noiseAmount * intensity);
    } else {
      const osc = audioContext.createOscillator();
      osc.type = melodyWaveform;
      osc.frequency.setValueAtTime(freq, time);

      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterCutoff * 1.5, time);
      filter.Q.setValueAtTime(filterQ * 0.5, time);

      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.18, time + attackTime);
      gain.gain.exponentialRampToValueAtTime(0.01, time + noteDuration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      addNoise(audioContext, gain, time, noteDuration, noiseAmount * intensity);

      osc.start(time);
      osc.stop(time + noteDuration + 0.01);
    }
  }

  // ============ KICK DRUM ============
  // Only add percussion at higher intensity
  if (intensity > 0.3) {
    for (let i = 0; i < totalDuration / beatLength; i++) {
      const time = now + (i * beatLength);

      const kick = audioContext.createOscillator();
      // Higher pitch sweep at higher intensity
      const kickStartFreq = lerp(100, 180, intensity);
      kick.frequency.setValueAtTime(kickStartFreq, time);
      kick.frequency.exponentialRampToValueAtTime(40, time + 0.05);

      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(kickVolume, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);

      kick.connect(gain);
      gain.connect(masterGain);

      if (texture > 0.3) {
        addNoise(audioContext, gain, time, 0.15, noiseAmount);
      }

      kick.start(time);
      kick.stop(time + 0.2);
    }
  }

  // ============ HI-HAT ============
  // Only add hi-hat at moderate+ intensity
  if (intensity > 0.4) {
    const hihatRate = intensity > 0.7 ? beatLength / 2 : beatLength;

    for (let i = 0; i < totalDuration / hihatRate; i++) {
      const time = now + (i * hihatRate);

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
      filter.frequency.setValueAtTime(lerp(6000, 10000, intensity), time);

      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(hihatVolume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      noise.start(time);
    }
  }
};

/**
 * Generate Bouba mode sound (round/smooth)
 *
 * Intensity (0-1) scales:
 * - Attack time (slower attacks at high intensity)
 * - Portamento/glide (more glide at high intensity)
 * - Vibrato depth (deeper at high intensity)
 * - Pad chord volume (louder at high intensity)
 * - Filter darkness (lower cutoff at high intensity)
 * - Note overlap (more legato at high intensity)
 */
const generateBoubaSound = (audioContext, analysis, masterGain, now, totalDuration, intensity) => {
  const { brightness, complexity, warmth, saturation, texture, segmentData } = analysis;

  // Base parameters
  const baseFreq = 220 + (brightness * 220);
  const expandedMinorScale = [
    0, 2, 3, 5, 7, 8, 10, 12,
    14, 15, 17, 19, 20, 22, 24, 26
  ];

  // Intensity-scaled parameters
  // Filter gets darker/warmer with intensity
  const filterCutoff = lerp(2000, 500, intensity) + (warmth + 1) * 500;
  const filterQ = lerp(0.5, 2 + saturation * 3, intensity);

  // Note duration (needed to clamp envelope times)
  const noteDuration = totalDuration / segmentData.length;

  // Attack/decay get slower with intensity, but clamped to fit within note
  // At high intensity, use more of the note for attack/decay (up to 80% total)
  const maxEnvelopeTime = noteDuration * lerp(0.4, 0.8, intensity);
  const attackTime = Math.min(lerp(0.05, 0.3, intensity), maxEnvelopeTime * 0.6);
  const decayTime = Math.min(lerp(0.05, 0.25, intensity), maxEnvelopeTime * 0.4);

  // Glide amount increases with intensity
  const glideAmount = lerp(0.3, 0.9, intensity);

  // Vibrato depth increases with intensity
  const vibratoDepth = lerp(2, 8, intensity) + saturation * 4;
  const vibratoRate = lerp(6, 4, intensity);  // Slower vibrato at high intensity

  // Pad volume increases with intensity
  const padVolume = lerp(0.02, 0.06, intensity);

  // Bass drone volume
  const droneVolume = lerp(0.15, 0.25, intensity);

  const noiseAmount = texture;

  // ============ BASS DRONE ============
  const bassDrone = audioContext.createOscillator();
  bassDrone.type = 'sine';
  bassDrone.frequency.setValueAtTime(baseFreq * 0.5, now);

  // Add subtle movement to bass at higher intensity
  if (intensity > 0.5) {
    const bassLFO = audioContext.createOscillator();
    bassLFO.frequency.setValueAtTime(0.5, now);
    const bassLFOGain = audioContext.createGain();
    bassLFOGain.gain.setValueAtTime(baseFreq * 0.02 * intensity, now);
    bassLFO.connect(bassLFOGain);
    bassLFOGain.connect(bassDrone.frequency);
    bassLFO.start(now);
    bassLFO.stop(now + totalDuration);
  }

  const bassFilter = audioContext.createBiquadFilter();
  bassFilter.type = 'lowpass';
  bassFilter.frequency.setValueAtTime(filterCutoff * 0.6, now);
  bassFilter.Q.setValueAtTime(filterQ, now);

  const bassGain = audioContext.createGain();
  // Slower fade in/out at higher intensity
  const fadeTime = lerp(0.5, 1.5, intensity);
  bassGain.gain.setValueAtTime(0, now);
  bassGain.gain.linearRampToValueAtTime(droneVolume, now + fadeTime);
  bassGain.gain.linearRampToValueAtTime(droneVolume, now + totalDuration - fadeTime);
  bassGain.gain.linearRampToValueAtTime(0, now + totalDuration);

  bassDrone.connect(bassFilter);
  bassFilter.connect(bassGain);
  bassGain.connect(masterGain);

  addNoise(audioContext, bassGain, now, totalDuration, noiseAmount * 0.5);

  bassDrone.start(now);
  bassDrone.stop(now + totalDuration);

  // ============ MELODY ============
  // Waveform: sine at high intensity (purest), triangle at low
  const melodyWaveform = intensity > 0.5 ? 'sine' : (warmth > 0 ? 'triangle' : 'sine');

  // Fixed note spacing for Bouba - slower, more legato than Kiki
  // At high intensity (very round), notes are longer and more connected
  const melodyNoteSpacing = lerp(0.4, 0.6, intensity);
  const totalMelodyNotes = Math.floor(totalDuration / melodyNoteSpacing);

  for (let i = 0; i < totalMelodyNotes; i++) {
    const segmentIndex = i % segmentData.length;
    const segment = segmentData[segmentIndex];
    const time = now + (i * melodyNoteSpacing);
    const noteIndex = Math.floor(segment.brightness * 15);
    const freq = baseFreq * Math.pow(2, expandedMinorScale[noteIndex] / 12);

    // Calculate glide target (next note in the looping sequence)
    const nextSegmentIndex = (i + 1) % segmentData.length;
    const nextSegment = segmentData[nextSegmentIndex];
    const nextNoteIndex = Math.floor(nextSegment.brightness * 15);
    const nextFreq = baseFreq * Math.pow(2, expandedMinorScale[nextNoteIndex] / 12);
    const glideTime = melodyNoteSpacing * glideAmount;

    const osc = audioContext.createOscillator();
    osc.type = melodyWaveform;
    osc.frequency.setValueAtTime(freq, time);

    // Apply glide to next note
    osc.frequency.exponentialRampToValueAtTime(nextFreq, time + glideTime);

    // Add vibrato
    const vibrato = audioContext.createOscillator();
    vibrato.frequency.setValueAtTime(vibratoRate, time);
    const vibratoGain = audioContext.createGain();
    // Vibrato fades in (clamped to not exceed note duration)
    const vibratoFadeIn = Math.min(attackTime * 1.5, melodyNoteSpacing * 0.5);
    vibratoGain.gain.setValueAtTime(0, time);
    vibratoGain.gain.linearRampToValueAtTime(vibratoDepth, time + vibratoFadeIn);
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);

    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterCutoff, time);
    filter.Q.setValueAtTime(filterQ * 0.5, time);

    // Use melodyNoteSpacing for envelope timing
    const safeAttack = Math.min(attackTime, melodyNoteSpacing * 0.4);
    const safeDecay = Math.min(decayTime, melodyNoteSpacing * 0.3);

    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.15, time + safeAttack);
    gain.gain.linearRampToValueAtTime(0.12, time + melodyNoteSpacing - safeDecay);
    gain.gain.linearRampToValueAtTime(0, time + melodyNoteSpacing);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    addNoise(audioContext, gain, time, melodyNoteSpacing, noiseAmount * 0.3);

    osc.start(time);
    osc.stop(time + melodyNoteSpacing + 0.1);
    vibrato.start(time);
    vibrato.stop(time + melodyNoteSpacing + 0.1);
  }

  // ============ PAD CHORDS ============
  // More prominent at higher intensity
  const chordNotes = [0, 3, 5, 7];  // Minor 7th chord

  // Add more chord notes at higher intensity
  const activeChordNotes = intensity > 0.6
    ? [...chordNotes, 10, 12]  // Add 9th and octave
    : chordNotes;

  activeChordNotes.forEach((noteOffset, i) => {
    const freq = baseFreq * Math.pow(2, expandedMinorScale[noteOffset] / 12);

    const osc = audioContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    // Vibrato on pad
    const vibrato = audioContext.createOscillator();
    vibrato.frequency.setValueAtTime(vibratoRate * 0.8, now);
    const padVibratoGain = audioContext.createGain();
    padVibratoGain.gain.setValueAtTime(vibratoDepth * 0.5, now);
    vibrato.connect(padVibratoGain);
    padVibratoGain.connect(osc.frequency);

    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterCutoff * 0.8, now);

    const gain = audioContext.createGain();
    const padFade = lerp(1, 2, intensity);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(padVolume, now + padFade);
    gain.gain.linearRampToValueAtTime(padVolume, now + totalDuration - padFade);
    gain.gain.linearRampToValueAtTime(0, now + totalDuration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    if (texture > 0.2) {
      addNoise(audioContext, gain, now, totalDuration, noiseAmount * 0.2);
    }

    osc.start(now);
    osc.stop(now + totalDuration);
    vibrato.start(now);
    vibrato.stop(now + totalDuration);
  });

  // ============ SUB BASS (at high intensity) ============
  if (intensity > 0.6) {
    const subBass = audioContext.createOscillator();
    subBass.type = 'sine';
    subBass.frequency.setValueAtTime(baseFreq * 0.25, now);

    const subGain = audioContext.createGain();
    const subVolume = lerp(0, 0.15, (intensity - 0.6) / 0.4);
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(subVolume, now + fadeTime);
    subGain.gain.linearRampToValueAtTime(subVolume, now + totalDuration - fadeTime);
    subGain.gain.linearRampToValueAtTime(0, now + totalDuration);

    subBass.connect(subGain);
    subGain.connect(masterGain);

    subBass.start(now);
    subBass.stop(now + totalDuration);
  }
};

/**
 * Main sound generation function (V2)
 * @param {AudioContext} audioContext - Web Audio API context
 * @param {Object} analysis - Image analysis results
 * @param {number} duration - Sound duration in seconds (default: 5)
 * @param {number} volume - Master volume (0-1, default: 0.5)
 * @returns {Promise<void>} Resolves when sound generation is complete
 * @throws {Error} If audio context is invalid or sound generation fails
 */
export const generateSoundV2 = async (audioContext, analysis, duration = 5, volume = 0.5) => {
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
    const angularity = analysis.angularity;

    // Calculate intensity within each mode (0-1 scale)
    // Kiki: 0.5 → 0 intensity, 1.0 → 1 intensity
    // Bouba: 0.5 → 0 intensity, 0.0 → 1 intensity

    if (angularity > 0.5) {
      const kikiIntensity = (angularity - 0.5) / 0.5;  // 0 at 51%, 1 at 100%
      console.log(`Kiki mode - intensity: ${(kikiIntensity * 100).toFixed(0)}%`);
      generateKikiSound(audioContext, analysis, masterGain, now, totalDuration, kikiIntensity);
    } else {
      const boubaIntensity = (0.5 - angularity) / 0.5;  // 0 at 49%, 1 at 0%
      console.log(`Bouba mode - intensity: ${(boubaIntensity * 100).toFixed(0)}%`);
      generateBoubaSound(audioContext, analysis, masterGain, now, totalDuration, boubaIntensity);
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
