"""
Shape Generator Module
Generates shape geometry from audio features.
Low angularity → smooth bezier blobs (Bouba)
High angularity → sharp star polygons (Kiki)
Intermediate values produce hybrid forms.
"""

import math
import numpy as np


def _superformula_radius(angle, m, n1, n2, n3, a=1.0, b=1.0):
    """
    Compute radius at a given angle using the superformula.
    Controls the fundamental shape character.
    """
    cos_part = abs(math.cos(m * angle / 4.0) / a)
    sin_part = abs(math.sin(m * angle / 4.0) / b)

    # Avoid division by zero
    value = cos_part ** n2 + sin_part ** n3
    if value == 0:
        return 1.0

    return value ** (-1.0 / n1)


def generate_shape(features, cx, cy, base_radius, num_points=256, seed=None):
    """
    Generate a shape as a list of (x, y) points.

    Uses the superformula with parameters derived from audio features.
    The shape smoothly transitions from Bouba (smooth blob) to
    Kiki (sharp star) based on angularity.

    Parameters:
        features: dict from audio_analysis with angularity, complexity, etc.
        cx, cy: center position
        base_radius: base size of the shape
        num_points: number of vertices (more = smoother curves)
        seed: random seed for reproducibility

    Returns:
        list of (x, y) tuples forming a closed polygon
    """
    rng = np.random.default_rng(seed)

    ang = features["angularity"]
    complexity = features["complexity"]
    texture = features["texture"]
    rhythm = features["rhythm"]

    # Superformula parameters, interpolated by angularity
    # m = number of symmetry lobes
    #   Bouba: low m (3-4) = few broad lobes
    #   Kiki: high m (5-12) = many sharp points
    m = 3 + ang * 9

    # n1 controls roundness vs spikiness
    #   High n1 = round, low n1 = spiky
    n1 = 0.3 + (1.0 - ang) * 9.0

    # n2, n3 control the shape of the lobes
    n2 = 1.0 + ang * 4.0
    n3 = 1.0 + ang * 4.0

    # Generate base superformula shape
    points = []
    angles = np.linspace(0, 2 * math.pi, num_points, endpoint=False)

    for angle in angles:
        r = _superformula_radius(angle, m, n1, n2, n3)
        points.append((angle, r))

    # Normalize radii to 0-1 range, then scale to base_radius
    radii = [r for _, r in points]
    max_r = max(radii) if radii else 1.0
    min_r = min(radii) if radii else 0.0
    r_range = max_r - min_r if max_r != min_r else 1.0

    normalized = []
    for angle, r in points:
        r_norm = (r - min_r) / r_range
        # Map to a range: inner_radius to base_radius
        # More angular = deeper indentations between spikes
        inner_ratio = 0.85 - ang * 0.4  # 0.85 for bouba, 0.45 for kiki
        r_final = base_radius * (inner_ratio + r_norm * (1.0 - inner_ratio))
        normalized.append((angle, r_final))

    # Add organic variation based on complexity
    # More complex audio = more layers of perturbation
    if complexity > 0.1:
        harmonics = int(2 + complexity * 6)  # 2-8 harmonics
        amplitudes = rng.uniform(0.3, 1.0, harmonics) * complexity * base_radius * 0.08
        phases = rng.uniform(0, 2 * math.pi, harmonics)
        freqs = rng.integers(2, 15, harmonics)

        perturbed = []
        for angle, r in normalized:
            perturbation = sum(
                a * math.sin(f * angle + p)
                for a, f, p in zip(amplitudes, freqs, phases)
            )
            perturbed.append((angle, r + perturbation))
        normalized = perturbed

    # Add fine-grain texture noise
    if texture > 0.05:
        noise_amp = texture * base_radius * 0.03
        textured = []
        for angle, r in normalized:
            noise = rng.normal(0, noise_amp)
            textured.append((angle, r + noise))
        normalized = textured

    # Add rhythmic pulsing — periodic bumps
    if rhythm > 0.1:
        pulse_count = int(3 + rhythm * 10)
        pulse_amp = rhythm * base_radius * 0.06
        pulsed = []
        for angle, r in normalized:
            pulse = pulse_amp * abs(math.sin(pulse_count * angle))
            pulsed.append((angle, r + pulse))
        normalized = pulsed

    # Convert polar to cartesian
    cartesian = []
    for angle, r in normalized:
        x = cx + r * math.cos(angle)
        y = cy + r * math.sin(angle)
        cartesian.append((x, y))

    return cartesian


def smooth_points(points, iterations=2):
    """
    Apply Chaikin's corner-cutting algorithm to smooth a polygon.
    Used for Bouba shapes to get bezier-like curves from point lists.
    """
    result = points
    for _ in range(iterations):
        smoothed = []
        n = len(result)
        for i in range(n):
            p0 = result[i]
            p1 = result[(i + 1) % n]
            # 3/4 toward current + 1/4 toward next
            q = (0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1])
            # 1/4 toward current + 3/4 toward next
            r = (0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1])
            smoothed.append(q)
            smoothed.append(r)
        result = smoothed
    return result


if __name__ == "__main__":
    # Quick visual test — print points for a bouba and kiki shape
    bouba_features = {
        "angularity": 0.15, "complexity": 0.3, "rhythm": 0.2,
        "texture": 0.1, "brightness": 0.6, "warmth": 0.7,
        "saturation": 0.5
    }
    kiki_features = {
        "angularity": 0.85, "complexity": 0.6, "rhythm": 0.7,
        "texture": 0.4, "brightness": 0.5, "warmth": 0.3,
        "saturation": 0.6
    }

    bouba = generate_shape(bouba_features, 0, 0, 100, seed=42)
    kiki = generate_shape(kiki_features, 0, 0, 100, seed=42)

    print(f"Bouba shape: {len(bouba)} points")
    print(f"  radius range: {min(math.hypot(x, y) for x, y in bouba):.1f} - {max(math.hypot(x, y) for x, y in bouba):.1f}")
    print(f"Kiki shape: {len(kiki)} points")
    print(f"  radius range: {min(math.hypot(x, y) for x, y in kiki):.1f} - {max(math.hypot(x, y) for x, y in kiki):.1f}")
