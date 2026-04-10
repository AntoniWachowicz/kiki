"""
Renderer Module
Draws shapes to PNG using pycairo.
Handles background, shape fill, gradients, and glow effects.
"""

import math
import cairo

from shape_generator import generate_shape, smooth_points


def _features_to_colors(features):
    """
    Map audio features to color values.

    Returns:
        bg_color: (r, g, b) background color
        shape_color: (r, g, b) main shape fill
        accent_color: (r, g, b) for highlights/glow
    """
    warmth = features["warmth"]
    brightness = features["brightness"]
    saturation = features["saturation"]
    angularity = features["angularity"]

    # Background: dark, tinted by warmth
    # Warm → deep red-brown, cool → deep blue-grey
    bg_r = 0.05 + warmth * 0.08
    bg_g = 0.04 + (1.0 - abs(warmth - 0.5)) * 0.04
    bg_b = 0.05 + (1.0 - warmth) * 0.08
    bg_color = (bg_r, bg_g, bg_b)

    # Shape color: driven by warmth and brightness
    # Base hue from warmth, lightness from brightness, vividness from saturation
    base_sat = 0.3 + saturation * 0.7

    if warmth > 0.5:
        # Warm side: oranges, reds, yellows
        t = (warmth - 0.5) * 2.0  # 0-1 within warm range
        shape_r = 0.4 + brightness * 0.5 + t * 0.1
        shape_g = 0.2 + brightness * 0.3 - angularity * 0.1
        shape_b = 0.1 + brightness * 0.15
    else:
        # Cool side: blues, teals, purples
        t = (0.5 - warmth) * 2.0
        shape_r = 0.1 + brightness * 0.2
        shape_g = 0.2 + brightness * 0.3 - angularity * 0.1
        shape_b = 0.4 + brightness * 0.4 + t * 0.1

    # Desaturate by blending toward grey
    grey = (shape_r + shape_g + shape_b) / 3.0
    shape_r = grey + (shape_r - grey) * base_sat
    shape_g = grey + (shape_g - grey) * base_sat
    shape_b = grey + (shape_b - grey) * base_sat

    shape_color = (
        max(0, min(1, shape_r)),
        max(0, min(1, shape_g)),
        max(0, min(1, shape_b)),
    )

    # Accent: lighter, more saturated version of shape color
    accent_color = (
        max(0, min(1, shape_color[0] * 1.4 + 0.1)),
        max(0, min(1, shape_color[1] * 1.3 + 0.05)),
        max(0, min(1, shape_color[2] * 1.4 + 0.1)),
    )

    return bg_color, shape_color, accent_color


def _draw_polygon(ctx, points):
    """Draw a closed polygon path from a list of (x, y) points."""
    if not points:
        return
    ctx.move_to(points[0][0], points[0][1])
    for x, y in points[1:]:
        ctx.line_to(x, y)
    ctx.close_path()


def _draw_glow(ctx, cx, cy, radius, color, intensity):
    """Draw a radial glow effect behind the shape."""
    glow_radius = radius * (1.3 + intensity * 0.5)

    pattern = cairo.RadialGradient(cx, cy, radius * 0.2, cx, cy, glow_radius)
    pattern.add_color_stop_rgba(0, color[0], color[1], color[2], 0.3 * intensity)
    pattern.add_color_stop_rgba(0.5, color[0], color[1], color[2], 0.1 * intensity)
    pattern.add_color_stop_rgba(1, color[0], color[1], color[2], 0.0)

    ctx.set_source(pattern)
    ctx.arc(cx, cy, glow_radius, 0, 2 * math.pi)
    ctx.fill()


def render_image(features, output_path, width=1024, height=1024, seed=None):
    """
    Render an image from audio features.

    Parameters:
        features: dict from audio_analysis
        output_path: path to save PNG
        width, height: image dimensions
        seed: random seed for shape generation
    """
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, width, height)
    ctx = cairo.Context(surface)

    bg_color, shape_color, accent_color = _features_to_colors(features)

    # Fill background
    ctx.set_source_rgb(*bg_color)
    ctx.paint()

    cx = width / 2.0
    cy = height / 2.0
    base_radius = min(width, height) * 0.3

    # Scale radius by saturation (louder = bigger presence)
    base_radius *= 0.7 + features["saturation"] * 0.6

    # Draw glow behind shape
    glow_intensity = 0.4 + features["brightness"] * 0.6
    _draw_glow(ctx, cx, cy, base_radius, accent_color, glow_intensity)

    # Generate shape
    points = generate_shape(features, cx, cy, base_radius, num_points=256, seed=seed)

    # Smooth bouba shapes with Chaikin subdivision
    angularity = features["angularity"]
    if angularity < 0.4:
        smooth_iters = int(3 * (1.0 - angularity))
        points = smooth_points(points, iterations=max(1, smooth_iters))
    elif angularity < 0.6:
        points = smooth_points(points, iterations=1)
    # High angularity: no smoothing, keep sharp

    # Draw shape with radial gradient fill
    _draw_polygon(ctx, points)

    # Create radial gradient for the fill
    pattern = cairo.RadialGradient(
        cx - base_radius * 0.2, cy - base_radius * 0.2, base_radius * 0.1,
        cx, cy, base_radius * 1.1
    )
    pattern.add_color_stop_rgb(0, *accent_color)
    pattern.add_color_stop_rgb(0.6, *shape_color)
    # Darken at edges
    dark_color = tuple(c * 0.5 for c in shape_color)
    pattern.add_color_stop_rgb(1, *dark_color)

    ctx.set_source(pattern)
    ctx.fill_preserve()

    # Stroke outline
    # Bouba: soft, thin outline; Kiki: harder, thicker outline
    stroke_width = 1.0 + angularity * 3.0
    stroke_alpha = 0.3 + angularity * 0.5
    ctx.set_source_rgba(accent_color[0], accent_color[1], accent_color[2], stroke_alpha)
    ctx.set_line_width(stroke_width)
    ctx.stroke()

    # For high-texture audio, add a second translucent shape layer offset slightly
    if features["texture"] > 0.3:
        offset_points = generate_shape(
            features, cx + 5, cy + 3, base_radius * 0.95,
            num_points=256, seed=(seed + 1) if seed else 1
        )
        if angularity < 0.5:
            offset_points = smooth_points(offset_points, iterations=1)

        _draw_polygon(ctx, offset_points)
        ctx.set_source_rgba(
            shape_color[0], shape_color[1], shape_color[2],
            0.15 + features["texture"] * 0.2
        )
        ctx.fill()

    surface.write_to_png(output_path)
    surface.finish()


if __name__ == "__main__":
    # Quick test: render a bouba and a kiki shape
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

    render_image(bouba_features, "test_bouba.png", seed=42)
    print("Wrote test_bouba.png")

    render_image(kiki_features, "test_kiki.png", seed=42)
    print("Wrote test_kiki.png")
