# Bouba/Kiki Sound Generator

## IMPORTANT: Do Not Edit Legacy Files

**NEVER edit `src/soundGenerationLegacy.js`** - This file is a preserved copy of the original working sound generation system. It exists as a safety backup and should remain untouched.

When working on sound generation improvements, **only edit `src/soundGenerationV2.js`** (the experimental version). The UI has a toggle to switch between Legacy and V2 engines for testing.

---

## Regenerating Showcase Audio Files

The showcase page (`/showcase`) plays pre-generated audio when users click on the Bouba/Kiki 3D renders. These audio files are stored in `public/audio/` and must be regenerated whenever:

1. **The example images change** (`public/examples/bouba.jpg` or `public/examples/kiki.jpg`)
2. **The sound generation engine is updated** (`src/soundGenerationLegacy.js` or the engine being used)
3. **The image analysis algorithm changes** (`src/imageAnalysis.js` or `src/angularityAnalysis.js`)

### How to Regenerate

1. Start the dev server: `npm run dev`
2. Navigate to `/dev` (Dev Tools page)
3. Click "Generate All" to download both `bouba.wav` and `kiki.wav`
4. Move the downloaded files to `public/audio/`

The audio export utility (`src/audioExport.js`) uses `OfflineAudioContext` to render the same sound generation algorithm to WAV files.

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

---

## Reverse (Sound → Image)

The `/reverse` page (`src/pages/ReversePage.jsx`) flips the project: upload an audio file, paste a direct audio URL, or pick a baked example, and the app generates an animated visual. Two generators are available via tab switch:

- **Voronoi** — static image. `src/voronoiGenerator.js` builds a tessellation from the audio's aggregate features. One-shot render; doesn't animate during playback. Snapshot/poster style.
- **Particle trails (stipple)** — animated. `src/stippleGenerator.js` runs a Rowbyte-Stipple-inspired particle simulation that evolves with the audio playhead. Deterministic w.r.t. `audio.currentTime` so scrubbing, restart, and replay all reproduce identical animation per loaded file.

### Audio analysis pipeline (`src/audioAnalysis.js`)

`analyzeAudioFile(arrayBuffer)` returns `{ features, timeline }`:

- **`features`** — aggregate scalars (angularity, brightness, complexity, etc.) used by both generators for static seed/init.
- **`timeline`** — per-FFT-hop arrays (Float32Array, hop = 512 samples at 44.1 kHz → ~86 fps):
  - `levels[3]` — log-mapped band energy (bass / mid / treble), splits at ~1.5 kHz and ~6 kHz.
  - `flux[3]` — per-band positive spectral delta. Drives onset detection.
  - `centroids[3]` — per-band normalized spectral centroid in [0, 1].
  - `pitches` — per-frame normalized pitch in [0, 1] over 80–1300 Hz (log scale). Computed via Harmonic Product Spectrum.
  - `confidences` — per-frame pitch confidence in [0, 1]. Low when no clear monophonic melody (drums / noise / dense mix).
  - `frameRate`, `frameCount`.

FFT_SIZE = 2048, HOP_SIZE = 512 (Meyda).

### Stipple generator architecture

320 free particles. Forces sum each frame; integration with damping; soft edge spring + hard bounce backup. Mutual repulsion (universal across roles, spatial-hash grid by cell size = repel radius) is the load-bearing piece — without it the field collapses to point clusters.

**Three differentiated band roles** (each band engages a distinct visual phenomenon, not the same idiom in different colours):

- **Bass → satellites only.** Two roaming point sources. Each has `(baseX, baseY)`, a `(targetX, targetY)` slide target, Lissajous drift, and a `repelFrames` counter for the post-onset attract→repel flip. On a bass onset, one satellite gets a new target relative to its previous target (chained onsets travel further). With probability `(angularity - 0.3)·0.7`, the satellite teleports to the target; otherwise it slides smoothly. The flip-to-repel only fires on teleporting onsets, calming kiki considerably. Satellites also:
  - Mutually repel each other (inverse-square, keeps spread on canvas).
  - Drift through the curl flow field at half-speed (carries them between onsets).
  - Both `(baseX, baseY)` AND `(targetX, targetY)` are moved by repel + flow together, so the existing slide mechanic preserves onset-jump motion.
- **Mid → single horizontal stripe** at canvas mid Y. Two structural drivers:
  - Horizontal: `midX` smoothly tracks the mid centroid (gated by mid level so silence centres the target).
  - Vertical: `midYNow` is a confidence-weighted lerp between a slow curl-flow Y-bob (no-melody fallback) and a pitch-driven Y target (melody following).
  - Mid onsets fire a one-frame lateral kiki jerk on stripe particles.
- **Treble → noise modulation, no spatial structure.** Sustained treble multiplies per-particle noise amplitude (`1 + level·2.4`); treble onset adds `+ onset·3.5`. Field shimmers more when treble is loud. No point or line; treble lives "in the air."

**Particle roles** (assigned at init, deterministic via seeded RNG). Each particle stores per-role weights for `midW`, `satW`, `noiseW`, `flowW` plus a render `size`. Repulsion + bouba rotation + edge handling stay universal so the field still coheres.

| Role | % | midW | satW | noiseW | flowW | Size |
|---|---|---|---|---|---|---|
| flow | 70% | 1.00 | 1.00 | 1.0 | 0.50 | 2 px |
| orbit | 15% | 0.35 | 2.20 | 0.7 | 0.15 | 3 px |
| shimmer | 15% | 0.40 | 0.40 | 3.0 | 1.00 | 1 px |

**Pitch tracking** drives the mid stripe's Y target. Per-frame HPS pitch is normalized to canvas Y over `±32%` of canvas height around centre (high pitch → up). Smoothed pitch normally tracks via EMA at `α = 0.12`. If raw-target differs from smoothed by more than `PITCH_JUMP_THRESHOLD = 0.10` in normalized space (≈ 5 semitones) AND confidence is above 0.30, smoothed pitch *snaps* to target — the stripe jumps instantly, particles catch up via their normal force lag (instant transition, gradual visual response = how humans perceive note jumps). Smoothed confidence (slower EMA, `α = 0.08`) is the lerp factor between curl-flow Y-bob and pitch-driven Y.

**Curl flow field** — analytic curl of `ψ = sin(arg_x)·cos(arg_y)`, divergence-free, particles circulate in eddies and can't all be pushed to one corner. `FLOW_K = 0.008` → ~1.3 oscillations across canvas; `FLOW_T = 0.0015` → ~48 s morph cycle. Always-on (silence isn't static); audio-modulated on top (`flowGain = FLOW_AMP_BASE + audioEnergy · FLOW_AMP_AUDIO`). Per-particle slow gating (`flowPulse = max(0, sin(t · flowFreq + flowPhase))`, period 21–70 s) means at any moment only ~half the particles feel meaningful flow; the active subset rotates through the population over the song.

**Onset detection** uses adaptive flux thresholds per band. Each band has its own EMA flux baseline; onsets fire when raw flux exceeds `baseline · fluxSensitivity + 0.012`. `ONSET_REFRACTORY = 10` frames (≈ 116 ms) between onsets per band.

**Bouba rotational drift** — gentle tangential current around canvas centre, scaled by `(1 - angularity)`. Off in kiki regime.

**Determinism.** Same seed + same audio file = identical animation. `reset()` re-seeds the RNG and re-applies init. Backward scrubbing triggers reset+replay-to-target; forward scrubbing steps incrementally.

### Page flow (`src/pages/ReversePage.jsx`)

- **Audio sources**: file upload, baked `bouba`/`kiki` examples (from `public/audio/`), and direct audio URL paste. URL paste validates with `new URL()`, bounces YouTube / Spotify / SoundCloud / Apple Music with a friendly message (browsers can't extract DRM-locked streams), checks `Content-Length` against the 50 MB cap, then runs the result through the same pipeline as a local upload.
- **Playback sync**: `readFrameAt(idx)` fills scratch buffers (`levelBuf`, `fluxBuf`, `centroidBuf`, `pitchBuf`) from the timeline; `syncTo(targetIdx)` either steps forward or resets+replays from frame 0 if currentTime jumped backward.
- **Debug overlay** — toggle button on page; defaults to **on** while iterating. Self-contained: fenced inside `// ── DEBUG ──` … `// ── END DEBUG ──` blocks in both `stippleGenerator.js` and `ReversePage.jsx` for clean removal later. Shows per-band level bars + onset flashes (top-left), mid stripe + centroid needle (live `midYNow`), bass satellite halos + filled/hollow markers (attract vs repel state), faint full-canvas tint pulsing with treble (the only way to "see" treble's effect since it has no position), and a `flow N orbit N shimmer N` role-count readout.

### Where to tune

All knobs at the top of `stippleGenerator.js` in named constants, grouped by section. The biggest "feel" levers:

- `DAMPING` (0.78) — single biggest knob. Lower = more friction.
- `ATTRACT_GAIN` (1.0), `SAT_GAIN` (500), `BOUBA_ROT_GAIN` (0.18), `KIKI_JERK_MAG` (2.5), `NOISE_AMP_BASE` (0.09) — per-force gains.
- `ROLE_CUM_PROB` and `ROLE_PROFILE` — population mix and per-role weights.
- `PITCH_JUMP_THRESHOLD` (0.10), `PITCH_SMOOTH` (0.12), `PITCH_CONF_SMOOTH` (0.08), `PITCH_RANGE_FRAC` (0.32) — pitch follower behaviour.
- `FLOW_AMP_BASE` (0.30), `FLOW_AMP_AUDIO` (0.45), `FLOW_K` (0.008), `FLOW_T` (0.0015) — flow field magnitude / scale / morph speed.
- `SAT_TELEPORT_PROB_GAIN` (0.7), `SAT_SLIDE_RATE_MIN/MAX` (0.04 / 0.14), `SAT_STEP_BASE/PER_ANGULARITY` (0.06 / 0.45) — bass satellite onset-response feel.

### State as of last session

Most recent addition: **pitch tracking** via HPS, driving the mid stripe Y. Stripe snaps on pitch leaps > 5 semitones with high confidence, glides smoothly otherwise. Confidence-weighted blend with the existing curl bob fallback for non-melodic content.

The two-step path before that was: differentiated band roles (bass→satellites, mid→stripe, treble→sparkle) and per-role particle weights, then having the wells themselves be affected by other forces (satellite mutual repulsion + flow drift, mid stripe Y bob from flow).

Iteration cadence has been "user listens to a track, calls out what feels off, we tune." Recurring user preference: structural / behavioural depth over surface visual effects (trails, palettes). Don't propose visual-glitter ideas without a behavioural justification — see `feedback memory: visual taste — depth over surface effects`.

**Open threads to revisit:**
- Pitch tracking quality on dense polyphonic mixes — HPS is robust on monophonic / vocal-led tracks; dense music may give noisy targets that the confidence gate suppresses imperfectly.
- Voronoi generator currently doesn't react during playback (static one-shot only). Could be animated from `levels` / `flux` too if we want a live mode there.
- Velocity-based dot stretch trails (AE Stipple signature) — previously deferred ("not visual glitter for now"). Could be reconsidered if the model feels too placid.
- Per-band color tinting — also deferred. Could be revisited as a *behavioural* signal (e.g. tint by velocity or by role) rather than aesthetic tinting.

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
│   ├── App.jsx                    # Main router component
│   ├── main.jsx                   # React entry point
│   ├── index.css                  # Tailwind imports
│   ├── imageAnalysis.js           # Visual property extraction (image → features)
│   ├── angularityAnalysis.js      # Multi-scale angularity detection
│   ├── imageTransform.js          # Sharpen/blur filters
│   ├── soundGeneration.js         # Original sound module (can be removed)
│   ├── soundGenerationLegacy.js   # PRESERVED - Do not edit!
│   ├── soundGenerationV2.js       # Experimental - Edit this one
│   ├── audioExport.js             # WAV export using OfflineAudioContext
│   ├── visualizationUtils.js      # Sampling point rendering
│   ├── audioAnalysis.js           # Audio → features + per-hop timeline (reverse pipeline)
│   ├── voronoiGenerator.js        # Reverse: static Voronoi tessellation generator
│   ├── stippleGenerator.js        # Reverse: animated particle-field generator (active)
│   ├── pages/
│   │   ├── HomePage.jsx           # Landing page
│   │   ├── ShowcasePage.jsx       # 3D renders with click-to-play audio
│   │   ├── AppPage.jsx            # Main image analysis app
│   │   ├── DevToolsPage.jsx       # Audio generation dev tools
│   │   └── ReversePage.jsx        # Reverse: sound → animated image
│   └── components/
│       ├── BoubaBlob.jsx          # 3D blob with halftone + reveal mask
│       ├── KikiUrchin.jsx         # 3D urchin with halftone + reveal mask
│       └── NoiseAnimation.jsx     # Background animation
├── public/
│   ├── examples/          # Example images (bouba.jpg, kiki.jpg)
│   └── audio/             # Pre-generated audio (bouba.wav, kiki.wav)
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
