"""
Sound-to-Image Pipeline
Converts audio files into images based on the Bouba/Kiki effect.

Usage:
    python main.py input.wav -o output.png
    python main.py input.wav --seed 42 --size 1024
    python main.py input.wav --features-only
"""

import argparse
import json
import sys
import os

from audio_analysis import analyze_audio
from renderer import render_image


def main():
    parser = argparse.ArgumentParser(
        description="Generate an image from audio based on the Bouba/Kiki effect"
    )
    parser.add_argument("input", help="Path to audio file (WAV, MP3, etc.)")
    parser.add_argument("-o", "--output", default="output.png", help="Output PNG path")
    parser.add_argument("--size", type=int, default=1024, help="Image size in pixels (square)")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducibility")
    parser.add_argument(
        "--features-only", action="store_true",
        help="Only print extracted features as JSON, don't generate image"
    )

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    # Step 1: Analyze audio
    print(f"Analyzing: {args.input}")
    features = analyze_audio(args.input)

    # Print features
    print("\nExtracted features:")
    for key, value in features.items():
        filled = int(value * 30)
        bar = "#" * filled + "-" * (30 - filled)
        label = f"  {key:>12}: {bar} {value:.3f}"
        print(label)

    bouba_kiki = "Kiki (angular/sharp)" if features["angularity"] > 0.5 else "Bouba (round/smooth)"
    print(f"\n  Character: {bouba_kiki}")

    if args.features_only:
        print("\n" + json.dumps(features, indent=2))
        return

    # Step 2: Render image
    print(f"\nRendering: {args.output} ({args.size}x{args.size})")
    render_image(features, args.output, width=args.size, height=args.size, seed=args.seed)
    print("Done.")


if __name__ == "__main__":
    main()
