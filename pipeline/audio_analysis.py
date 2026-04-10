"""
Audio Analysis Module
Extracts visual-equivalent features from audio for image generation.
Mirrors the 7 properties from imageAnalysis.js but derived from sound.
"""

import numpy as np
import librosa


def compute_angularity(y, sr):
    """
    Composite angularity score from audio characteristics.
    High angularity = sharp, percussive, noisy (Kiki)
    Low angularity = smooth, tonal, sustained (Bouba)
    """
    # Zero-crossing rate: sharp waveforms cross zero often
    zcr = librosa.feature.zero_crossing_rate(y=y)[0].mean()
    zcr_score = min(zcr / 0.10, 1.0)

    # Spectral centroid: bright/harsh sounds have high centroid
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0].mean()
    centroid_normalized = centroid / sr
    centroid_score = min(centroid_normalized / 0.15, 1.0)

    # Onset sharpness: how sudden are transients
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    if len(onset_env) > 1:
        onset_diff = np.diff(onset_env).clip(min=0)
        onset_sharpness = onset_diff.mean()
        onset_score = min(onset_sharpness / 2.0, 1.0)
    else:
        onset_score = 0.0

    # Percussive energy ratio: how much of the signal is percussive vs harmonic
    y_harmonic, y_percussive = librosa.effects.hpss(y)
    harmonic_energy = np.sum(y_harmonic ** 2)
    percussive_energy = np.sum(y_percussive ** 2)
    total_energy = harmonic_energy + percussive_energy
    if total_energy > 0:
        percussive_ratio = percussive_energy / total_energy
    else:
        percussive_ratio = 0.0
    percussive_score = min(percussive_ratio / 0.4, 1.0)

    angularity = (
        0.30 * zcr_score +
        0.20 * centroid_score +
        0.25 * onset_score +
        0.25 * percussive_score
    )
    return max(0.0, min(1.0, angularity))


def compute_brightness(y, sr):
    """
    Spectral rolloff as a proxy for perceived brightness.
    High rolloff = bright sound = bright image.
    """
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.85)[0].mean()
    # Normalize: rolloff typically ranges 1000-10000 Hz
    return max(0.0, min(1.0, (rolloff - 500) / 8000))


def compute_warmth(y, sr):
    """
    Balance of low vs high frequency energy.
    Warm = bass-heavy (positive), cool = treble-heavy (negative).
    Returns -1 to +1, then normalized to 0-1 for consistency.
    """
    S = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=S.shape[0] * 2 - 2)

    # Energy below 500 Hz vs above 2000 Hz
    low_mask = freqs < 500
    high_mask = freqs > 2000

    low_energy = S[low_mask, :].sum() if low_mask.any() else 0
    high_energy = S[high_mask, :].sum() if high_mask.any() else 0

    total = low_energy + high_energy
    if total == 0:
        return 0.5

    # -1 (all treble) to +1 (all bass), then map to 0-1
    warmth_raw = (low_energy - high_energy) / total
    return (warmth_raw + 1.0) / 2.0


def compute_complexity(y, sr):
    """
    Spectral bandwidth — wide bandwidth = complex sound.
    """
    bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0].mean()
    # Typical range 500-5000 Hz
    return max(0.0, min(1.0, (bandwidth - 300) / 4000))


def compute_rhythm(y, sr):
    """
    Onset density — how many transient events per second.
    High rhythm = lots of events = dynamic.
    """
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onsets = librosa.onset.onset_detect(y=y, sr=sr, onset_envelope=onset_env)
    duration = librosa.get_duration(y=y, sr=sr)

    if duration == 0:
        return 0.0

    onsets_per_second = len(onsets) / duration
    # Normalize: 0-10 onsets/sec maps to 0-1
    return max(0.0, min(1.0, onsets_per_second / 10.0))


def compute_saturation(y, sr):
    """
    RMS energy as a proxy for saturation/vibrancy.
    Loud = vivid, quiet = muted.
    """
    rms = librosa.feature.rms(y=y)[0].mean()
    # RMS typically 0.0-0.3 for normalized audio
    return max(0.0, min(1.0, rms / 0.25))


def compute_texture(y, sr):
    """
    Spectral flatness variation over time.
    High variation = grainy/textured, low variation = smooth.
    """
    flatness = librosa.feature.spectral_flatness(y=y)[0]
    if len(flatness) < 2:
        return 0.0
    texture = np.std(flatness)
    return max(0.0, min(1.0, texture / 0.15))


def analyze_audio(path):
    """
    Main analysis function. Loads audio and extracts all features.

    Parameters:
        path: Path to audio file (WAV, MP3, etc.)

    Returns:
        dict with keys: angularity, brightness, warmth, complexity,
                        rhythm, saturation, texture (all 0-1 floats)
    """
    y, sr = librosa.load(path, sr=22050, mono=True)

    # Trim silence from edges
    y, _ = librosa.effects.trim(y, top_db=30)

    if len(y) == 0:
        raise ValueError("Audio file is silent or empty after trimming")

    features = {
        "angularity": compute_angularity(y, sr),
        "brightness": compute_brightness(y, sr),
        "warmth": compute_warmth(y, sr),
        "complexity": compute_complexity(y, sr),
        "rhythm": compute_rhythm(y, sr),
        "saturation": compute_saturation(y, sr),
        "texture": compute_texture(y, sr),
    }

    return features


if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python audio_analysis.py <audio_file>")
        sys.exit(1)

    features = analyze_audio(sys.argv[1])
    print(json.dumps(features, indent=2))
