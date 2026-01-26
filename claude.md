# Bouba/Kiki Sound Generator

## IMPORTANT: Do Not Edit Legacy Files

**NEVER edit `src/soundGenerationLegacy.js`** - This file is a preserved copy of the original working sound generation system. It exists as a safety backup and should remain untouched.

When working on sound generation improvements, **only edit `src/soundGenerationV2.js`** (the experimental version). The UI has a toggle to switch between Legacy and V2 engines for testing.

---

## Overview
An interactive web application that translates visual properties of images into sound, based on the psychological Bouba/Kiki effect. The project explores cross-sensory perception by mapping shape characteristics (rounded vs. angular), color, texture, and complexity into corresponding audio properties.

## Inspiration & Goals
This project sits at the intersection of multiple domains:
- **Synesthesia & Cross-Sensory Perception**: Exploring how visual and auditory experiences can map to each other
- **Educational Tool**: Demonstrating concepts in psychology, signal processing, and the Bouba/Kiki effect
- **Creative Sound Design**: Practical application for generating unique soundscapes from visual input
- **Artistic Experimentation**: Personal exploration of generative audio and visual analysis

## Tech Stack
- **Frontend**: React 18 + Vite
- **Styling**: Tailwind CSS
- **Icons**: lucide-react
- **Audio**: Web Audio API (browser native)
- **Canvas**: HTML5 Canvas for image processing

## How It Works

### Visual Analysis Pipeline
The app analyzes uploaded images across multiple dimensions:

1. **Brightness** (0-100%)
   - Average luminance of all pixels
   - Maps to base frequency/pitch in sound generation

2. **Angularity** (0-100%, Bouba ← → Kiki)
   - Advanced edge detection using gradient analysis
   - Edge direction alignment (geometric vs organic patterns)
   - Edge coherence (long continuous vs short broken edges)
   - Corner sharpness detection
   - Determines overall sound character (smooth/rounded vs sharp/percussive)

3. **Complexity** (0-100%)
   - Variance in brightness and edge patterns across image regions
   - Triggers FM synthesis at >60% complexity
   - Affects envelope shapes and harmonic content

4. **Rhythm** (0-100%)
   - Brightness variation between sampled regions
   - Maps to tempo: 60 BPM (static) to 300 BPM (highly dynamic)

5. **Color Warmth** (-100% to +100%)
   - Red/orange (warm) vs blue/cyan (cool)
   - Controls filter cutoff frequencies and tone color

6. **Saturation** (0-100%)
   - Grayscale vs vibrant color
   - Determines harmonic richness and FM modulation depth

7. **Texture** (0-100%)
   - High-frequency pixel-to-pixel variation
   - Adds analog-style noise and grit to audio output

### Sampling Methods
Four different approaches to extract melodic information from images:
- **Brightness Pathfinding**: Follows the brightest pixels across the image
- **Edge Following**: Traces detected edges by strength
- **Scattered**: Fixed 16-point pattern sampling
- **Regions**: 4×4 grid averaging

### Sound Generation
Uses Web Audio API with two distinct modes:

**Bouba Mode** (Angularity ≤ 50%):
- Sine wave bass drone with slow envelope
- Smooth portamento between notes
- Sustained pad chords with vibrato
- Warm, round timbres

**Kiki Mode** (Angularity > 50%):
- Square/sawtooth bassline with sharp attacks
- Staccato melody notes
- Kick drum and hi-hat percussion
- Bright, aggressive timbres

**Advanced Synthesis Features**:
- FM synthesis for complex images (complexity >60%)
- Color-based filtering (500Hz-4500Hz range)
- Texture-based analog noise and distortion
- Dynamic tempo scaling

## Current Features
- Image upload and analysis
- Real-time visual property extraction
- Four sampling method options
- Two-mode sound generation (Bouba/Kiki)
- Visual feedback showing all analysis parameters
- 5-second audio composition playback

## Planned Features
- **Advanced Synthesis Controls**: User-adjustable parameters for fine-tuning sound generation
- **Real-time Drawing/Camera Input**: Generate sounds from hand-drawn shapes or live webcam feed
- **Audio Export**: Save generated compositions as WAV/MP3 files

## Technical Challenges

### Edge Detection Algorithm Tuning
- Balancing sensitivity to detect meaningful edges without noise
- Differentiating geometric/angular patterns from organic/curved ones
- Threshold tuning (increased from 20 to 35) to reduce false positives
- Combining multiple detection strategies (direction alignment, edge coherence, corner detection)

### Web Audio API Synthesis Design
- Mapping visual properties to musically meaningful parameters
- Creating distinct "Bouba" vs "Kiki" sonic identities
- Balancing multiple oscillators and effects without clipping
- Timing and scheduling audio events for smooth playback

### Performance Optimization
- Image analysis runs synchronously on upload
- Canvas downscaling (max 800×600) for faster processing
- Selective pixel sampling (every 2-4 pixels) in analysis passes
- Edge tracing capped at 100 steps to prevent infinite loops

## Project Structure
```
O:\jsc\bouba\
├── src/
│   ├── App.jsx                    # Main component with all logic
│   ├── main.jsx                   # React entry point
│   ├── index.css                  # Tailwind imports
│   ├── imageAnalysis.js           # Visual property extraction
│   ├── angularityAnalysis.js      # Multi-scale angularity detection
│   ├── imageTransform.js          # Sharpen/blur filters
│   ├── soundGeneration.js         # Original sound module (can be removed)
│   ├── soundGenerationLegacy.js   # PRESERVED - Do not edit!
│   ├── soundGenerationV2.js       # Experimental - Edit this one
│   └── visualizationUtils.js      # Sampling point rendering
├── public/examples/       # Example images
├── dist/                  # Build output
├── index.html             # HTML entry point
├── package.json           # Dependencies
├── vite.config.js         # Vite configuration
├── tailwind.config.js     # Tailwind configuration
└── postcss.config.js      # PostCSS configuration
```

## Running the Project
```bash
npm install        # Install dependencies
npm run dev        # Start development server
npm run build      # Build for production
npm run preview    # Preview production build
```

## The Bouba/Kiki Effect
A well-documented psychological phenomenon where people consistently match:
- Rounded, smooth shapes → "bouba" (soft, rounded phonemes)
- Angular, spiky shapes → "kiki" (sharp, hard phonemes)

This app extends that association into the auditory domain, creating a synesthetic experience where visual shape characteristics directly influence sound synthesis parameters.
