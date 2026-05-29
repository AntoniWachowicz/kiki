// Particle field with three differentiated band roles, so each frequency
// range engages a different visual phenomenon instead of all of them
// repeating the same idiom in different colours.
//
//   Bass   → point sources. Two satellites that drift via Lissajous, jump
//            their anchor on each bass onset, and flip attract→repel for a
//            few frames at high angularity. Bass content concentrates the
//            eye on specific punching points.
//   Mid    → a single horizontal stripe at canvas centre. Carries the
//            centroid axis: the well's "deepest point" shifts left/right
//            with where mid energy lives within 1.5–6 kHz. Mid onsets fire
//            a one-frame lateral kiki jerk for stripe particles.
//   Treble → no spatial structure. Modulates per-particle noise amplitude:
//            sustained treble = global shimmer; treble onset = brief
//            sparkle pulse that decays with the onset spike. Treble lives
//            "in the air" rather than at any place.
//
// Plus the unchanged shared layers:
//   - Mutual repulsion (spatial-grid neighbours) — keeps the field spread.
//   - Bouba rotational drift — slow tangential current at low angularity.
//   - Per-particle deterministic sin-sum noise — base organic life.
//   - Damping + soft edge spring + hard bounce backup.
//
// Determinism: same seed + same timeline → same animation. Same as before.

// ── Population ──────────────────────────────────────────────────────────────
const N_PARTICLES = 320;

// Particle roles. Each particle is assigned one role at init (seeded RNG,
// so deterministic). The role gives it a triple of force-weights for the
// three audio-driven forces — mid-stripe pull, bass-satellite pull, and
// per-particle noise — plus a render size in pixels. Repulsion, edge
// handling, and bouba rotation stay universal so the field still coheres.
//
//   flow    — the bulk. Standard response. 2 px dots. They form the main
//             stripe and follow the centroid axis.
//   orbit   — bass-bound. Lower mid-pull, much higher sat-pull. 3 px so
//             they read as "heavier." Cluster around active bass
//             satellites like moons.
//   shimmer — sparkle. Lower mid + sat pull, 3× noise. 1 px so they read
//             as fine dust. Twinkle constantly, more so in loud treble.
const ROLE_FLOW = 0;
const ROLE_ORBIT = 1;
const ROLE_SHIMMER = 2;
// Cumulative thresholds. Tweak the gaps to change population mix.
const ROLE_CUM_PROB = [0.70, 0.85, 1.00];
// Force-weight tables: per-role multipliers on each audio-driven force
// plus the rendered dot size. flowW scales the curl-noise flow field
// (see FLOW_* below) so different roles ride the currents differently.
const ROLE_PROFILE = [
  { midW: 1.00, satW: 1.00, noiseW: 1.0, flowW: 0.50, size: 2 },  // flow
  { midW: 0.35, satW: 2.20, noiseW: 0.7, flowW: 0.15, size: 3 },  // orbit
  { midW: 0.40, satW: 0.40, noiseW: 3.0, flowW: 1.00, size: 1 },  // shimmer
];

// ── Audio smoothing ─────────────────────────────────────────────────────────
const LEVEL_SMOOTH = 0.30;
const FLUX_BASELINE_SMOOTH = 0.04;
const ONSET_DECAY = 0.85;
const ONSET_REFRACTORY = 10;
const ONSET_BOOST = 0.6;

// ── Mid stripe ──────────────────────────────────────────────────────────────
const MID_CENTER_Y = 0.5;            // fraction of canvas height
const MID_SIGMA_FRAC = 0.22;         // stripe half-width as fraction of height
const MIDX_SIGMA_FRAC = 0.30;        // horizontal well width
const MIDX_SPAN_FRAC = 0.65;         // how far bandX can wander from centre
const MIDX_SMOOTH = 0.10;            // tracking speed for the horizontal target
const MIDX_AUDIBLE_THRESH = 0.04;    // collapse target below this mid level
const MIDX_GAIN_FRAC = 0.55;         // horizontal pull vs vertical (less = looser)
// When no melody is detected the stripe falls back to a slow curl-flow
// Y-bob (max ±MID_FLOW_AMP px). When a melody IS detected, the stripe Y
// instead follows the pitch contour, blended in by detected confidence.
const MID_FLOW_AMP = 28;
// Pitch tracking. Pitch is normalized [0, 1] over four octaves (80 Hz–
// 1.3 kHz). A pitch of 0 maps to the bottom of the pitch span, 1 to the
// top — so high notes raise the stripe, low notes drop it.
const PITCH_RANGE_FRAC = 0.32;       // pitch maps to ±32 % of canvas height around centre
const PITCH_SMOOTH = 0.12;           // EMA rate for normal pitch tracking
const PITCH_CONF_SMOOTH = 0.08;      // EMA rate for confidence — slower, so brief tonal blips don't switch modes
const PITCH_JUMP_THRESHOLD = 0.10;   // ≈ 5 semitones in normalized space — bigger gaps snap instead of smoothing
const PITCH_JUMP_CONF = 0.30;        // jumps only fire when confidence is at least this high

// ── Force tunings ───────────────────────────────────────────────────────────
const ATTRACT_GAIN = 0.45;           // base mid-well pull magnitude

const REPEL_GAIN = 30;
const REPEL_RADIUS = 100;
const REPEL_RADIUS_SQ = REPEL_RADIUS * REPEL_RADIUS;
const REPEL_SOFTENING = 30;
const REPEL_SOFTENING_SQ = REPEL_SOFTENING * REPEL_SOFTENING;

// Velocity alignment (Boids). Each particle is nudged toward the mean
// velocity of its spatial neighbours. Oscillating particles bleed their
// bounce into the surrounding drift rather than returning to the same spot.
const ALIGN_RADIUS    = 90;
const ALIGN_RADIUS_SQ = ALIGN_RADIUS * ALIGN_RADIUS;
const ALIGN_GAIN      = 0.06;

// Per-particle organic noise. No audio coupling — pure baseline life
// for the field. Treble's character coupling now lives in the field-
// tension block below.
const NOISE_AMP_BASE = 0.008;
const NOISE_FREQ_MIN = 0.0020;
const NOISE_FREQ_MAX = 0.0070;

// ── Treble: field tension ───────────────────────────────────────────────────
// Treble level scales the *character* of the field — mutual repulsion
// strength and integration damping — instead of any direct visual
// quantity. Quiet treble leaves the field viscous and clumpable; loud
// treble makes it springy and crisp, with particles snapping apart and
// oscillating after impulses. Onsets give a brief extra spike on top.
//
// This is the abstraction we want for the "high frequency = sharpness"
// feeling: the system's *behaviour* shifts, no on-screen "treble meter."
const TREBLE_TENSION_LEVEL_GAIN = 1.0;   // multiplier on smoothLevels[2]
const TREBLE_TENSION_ONSET_GAIN = 0.25;  // brief spike on a fresh treble onset
const TREBLE_REPEL_BOOST = 0.18;         // +18% mutual repulsion at full tension
const TREBLE_DAMPING_BOOST = 0.02;       // DAMPING shifts from 0.86 → 0.88 max
                                         // (higher = slightly more inertia
                                         //  preserved on impulses)

// ── Bass well (single gravity well) ─────────────────────────────────────────
const BASS_SAT_COUNT = 1;
const SAT_DRIFT_FREQ_X = 0.0030;
const SAT_DRIFT_FREQ_Y = 0.0040;
const SAT_DRIFT_AMP_FRAC = 0.13;
const SAT_GAIN = 200;
const SAT_RADIUS = 80;               // base influence radius
const SAT_RADIUS_EXPAND = 0.3;       // extra radius per unit of s0 (louder = wider reach)
const SAT_SOFTENING = 50;
const SAT_SOFTENING_SQ = SAT_SOFTENING * SAT_SOFTENING;
const SAT_DRAG_GAIN = 5.0;           // how strongly well movement drags nearby particles
const SAT_FLOW_GAIN = 0.5;
const SAT_SLIDE_RATE_MIN = 0.04;
const SAT_SLIDE_RATE_MAX = 0.14;
const SAT_STEP_BASE = 0.06;
const SAT_STEP_PER_ANGULARITY = 0.45;

// ── Bouba rotation / Kiki jerk ──────────────────────────────────────────────
const BOUBA_ROT_GAIN = 0.03;
const KIKI_JERK_MAG = 1.0;

// ── Curl flow field ─────────────────────────────────────────────────────────
// Always-on, slowly evolving vector field that pushes particles around in
// gentle eddies — keeps the canvas alive in silence and adds a layer of
// motion that doesn't come from the wells. Computed as the 2D curl of a
// scalar potential ψ = sin(kx+ωt)·cos(ky-αωt), which makes it divergence-
// free: particles circulate, none are pushed to the edges of the canvas.
//   FLOW_K controls spatial scale: at 0.008 the wavelength is ~785 px so a
//   1024-canvas holds ~1.3 oscillations — a few distinct eddies, not a
//   uniform breeze.
//   FLOW_T controls how fast the field morphs: at 0.0015 a full cycle is
//   ~48 s @ 86 fps, so the eddies drift slowly.
//   FLOW_AMP_BASE is the always-on magnitude; FLOW_AMP_AUDIO is added,
//   scaled by mean band level, so loud passages strengthen the currents.
const FLOW_K = 0.008;
const FLOW_T = 0.0015;
const FLOW_AMP_BASE = 0.02;
const FLOW_AMP_AUDIO = 0.80;

// Per-particle slow gating. Each particle has its own pulse cycle
// (period 21–70 s) and phase, so at any moment only a *subset* of the
// population feels meaningful flow — and the active subset rotates
// through the population over the song's runtime. The pulse is
// max(0, sin(...)), so it's exactly zero for half of each cycle and
// ramps smoothly through its on-half. Average per-particle gain over
// time is 1/π ≈ 0.32, so this also drops overall flow strength to ~32%
// of its raw value, which made the bouba regime too pushy.
const FLOW_PULSE_FREQ_MIN = 0.0015;  // ~70 s period at 86 fps
const FLOW_PULSE_FREQ_MAX = 0.0050;  // ~21 s period

// ── Integration ─────────────────────────────────────────────────────────────
// Velocity-dependent inertia: fast particles retain momentum (high effective
// damping) while near-still particles stop quickly (low effective damping).
// A kicked particle glides in a smooth arc then decelerates to rest — "fish
// school" feel rather than oscillating around a fixed attractor.
//   effectiveDamping = clamp(DAMPING_BASE + speed * DAMPING_INERTIA, _, DAMPING_MAX)
const DAMPING_BASE    = 0.92;  // damping for nearly-still particles
const DAMPING_INERTIA = 0.025; // additional damping per px/frame of speed
const DAMPING_MAX     = 0.96;  // ceiling — fast particles coast a bit longer
const EDGE_MARGIN = 14;
const EDGE_FORCE = 0.35;
const EDGE_BOUNCE = 0.4;

// ── Trace line width ─────────────────────────────────────────────────────────
// Particle segments scale from TRACE_WIDTH_MIN (near-still) to TRACE_WIDTH_MAX
// (fast-moving). Speed is bucketed into TRACE_N_BUCKETS draw calls per frame
// so we avoid one ctx.stroke() per particle.
const TRACE_SPEED_THRESH   = 1.0; // px/frame — below this, no etching at all
const TRACE_WELL_RADIUS    = 280; // px — beyond this from all wells, no etching
const TRACE_WELL_RADIUS_SQ = TRACE_WELL_RADIUS * TRACE_WELL_RADIUS;
const TRACE_WIDTH_MIN  = 0.5;
const TRACE_WIDTH_MAX  = 4.0;
const TRACE_SPEED_MAX  = 2.0;  // px/frame that maps to max width
const TRACE_N_BUCKETS  = 5;
const TRACE_WIDTH_CURVE = 3.0; // power applied to t before width lerp — >1 biases toward thin

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function halton(index, base) {
  let f = 1;
  let r = 0;
  let i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

function makeGrid(width, height, cellSize) {
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const buckets = new Array(cols * rows);
  for (let i = 0; i < buckets.length; i++) buckets[i] = [];
  return { cols, rows, cellSize, buckets };
}

function rebuildGrid(grid, particles) {
  const buckets = grid.buckets;
  for (let i = 0; i < buckets.length; i++) buckets[i].length = 0;
  const { cols, rows, cellSize } = grid;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    let cx = Math.floor(p.x / cellSize);
    let cy = Math.floor(p.y / cellSize);
    if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
    if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
    buckets[cy * cols + cx].push(i);
  }
}

export function createStippleSession(features, seed, width, height, nParticles = N_PARTICLES) {
  const { complexity, angularity } = features;

  const attractGain = ATTRACT_GAIN * (0.4 + angularity * 1.2);
  const fluxSensitivity = 1.2 + (1 - angularity) * 1.8;
  const noiseSpeedScale = 0.85 + complexity * 0.5;
  const boubaAmt = Math.max(0, 1 - angularity * 1.4);
  const kikiAmt = Math.max(0, angularity - 0.3) * 1.4;
  const satSlideRate = SAT_SLIDE_RATE_MIN + angularity * (SAT_SLIDE_RATE_MAX - SAT_SLIDE_RATE_MIN);

  const minDim = Math.min(width, height);
  const satDriftAmp = SAT_DRIFT_AMP_FRAC * minDim;
  const cxCanvas = width / 2;
  const cyCanvas = height / 2;

  // Mid stripe geometry (the only spatial well now).
  const midY = MID_CENTER_Y * height;
  const sigmaY = MID_SIGMA_FRAC * height;
  const sigmaSqY = sigmaY * sigmaY;
  const sigmaX = MIDX_SIGMA_FRAC * width;
  const sigmaSqX = sigmaX * sigmaX;
  const midXSpan = MIDX_SPAN_FRAC * (width / 2);
  const midHorizGain = ATTRACT_GAIN * MIDX_GAIN_FRAC;

  const grid = makeGrid(width, height, REPEL_RADIUS);

  // Per-band audio state — still 3-wide so existing onset/level bookkeeping
  // works without special cases. Indices: 0 bass, 1 mid, 2 treble.
  const smoothLevels = [0, 0, 0];
  const fluxBaseline = [0, 0, 0];
  const onset = [0, 0, 0];
  const onsetCooldown = [0, 0, 0];

  // Mid horizontal target — single scalar, smoothed toward the centroid.
  let midX = cxCanvas;
  // Mid Y target — combination of pitch follower (when melody detected)
  // and slow curl-flow bob (fallback). Updated in update() each frame.
  let midYNow = midY;
  // Smoothed pitch contour and confidence. smoothedPitch tracks the
  // detected pitch via EMA, except when the raw pitch jumps by more than
  // PITCH_JUMP_THRESHOLD (and conf is high), in which case it snaps —
  // mirroring how a listener perceives a note transition as instantaneous.
  let smoothedPitch = 0.5;
  let smoothedConf = 0;

  // Bass satellites only. All have band=0 hardcoded.
  const satellites = new Array(BASS_SAT_COUNT);

  // Mid kiki jerk: -1, 0, or +1 for one frame after a mid onset.
  let midJerk = 0;

  const particles = new Array(nParticles);
  let rng = null;
  // Separate RNG for the trace canvas (treble scatter etc.) so consuming
  // random numbers in drawTraces doesn't desync the sim's main rng. Both
  // are seeded from the same input so a given seed + audio still produces
  // a fully deterministic replay.
  let traceRng = null;
  let t = 0;
  // When true, the wells (mid stripe + bass satellites) stay locked at
  // their seeded positions. They still PULSE attract/repel from onsets
  // (so the audio still drives the field), but they don't move — useful
  // for inspecting the trace canvas without the wells streaking it.
  let stationaryWells = false;
  // Per-band enable flags. When a band is disabled, its smoothed level
  // and onsets are forced to zero, which zeroes every audio→force
  // coupling driven by that band: bass→satellite pull, mid→stripe pull
  // and kiki jerk, treble→noise multiplier (base noise still runs). The
  // visual structures themselves (satellites, stripe well, particles)
  // stay in place; the audio just stops driving them.
  const bandEnabled = [true, true, true];

  // Which channels the trace canvas draws each frame. They compose freely:
  //   particles — line segments from every particle's prev → current pos.
  //               The "field record" view; rich but visually crowded.
  //   wells     — continuous strokes following the bass satellites and the
  //               mid stripe centre. Path of the audio-driven structures.
  //   events    — discrete marks placed only on onset firings: filled disc
  //               at the firing satellite (bass), cross at stripe (mid),
  //               scattered fine dots (treble). A graphic score of hits.
  const traceModes = { particles: true, wells: false, events: false };

  // Which satellite index fired the most recent bass onset, so the events
  // mode can mark just *that* one (kiki: one jumps far, the other stays —
  // marking both dilutes the asymmetry).
  let lastBassSat = -1;

  // Per-frame "an onset fired this frame" flags. onset[b] is a decaying
  // float used by force code; this is a clean boolean for the trace.
  const onsetFired = [false, false, false];

  // Previous mid stripe position, snapshotted at the end of update() so
  // the wells trace draws (prev → current) in the next call to
  // drawTraces. Same pattern as particles' prevX/prevY.
  let prevMidXTrace = cxCanvas;
  let prevMidYTrace = midY;

  function reset() {
    rng = mulberry32(seed);
    // Derive a distinct stream from the same seed so trace draws are
    // deterministic AND independent of the main rng's call count.
    traceRng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    t = 0;
    for (let b = 0; b < 3; b++) {
      smoothLevels[b] = 0;
      fluxBaseline[b] = 0;
      onset[b] = 0;
      onsetCooldown[b] = 0;
    }
    midX = cxCanvas;
    midYNow = midY;
    smoothedPitch = 0.5;
    smoothedConf = 0;
    midJerk = 0;
    prevMidXTrace = cxCanvas;
    prevMidYTrace = midY;
    lastBassSat = -1;
    onsetFired[0] = onsetFired[1] = onsetFired[2] = false;

    // Bass satellites — anchored across the canvas (not tied to a band Y
    // any more, so they can roam). Distinct Lissajous freqs per satellite.
    // baseX/Y is the *current* anchor; targetX/Y is where it's heading.
    // On non-teleport onsets, baseX/Y slides toward targetX/Y at
    // `satSlideRate` per frame.
    for (let s = 0; s < BASS_SAT_COUNT; s++) {
      const baseX = (0.2 + rng() * 0.6) * width;
      const baseY = (0.2 + rng() * 0.6) * height;
      satellites[s] = {
        baseX,
        baseY,
        targetX: baseX,
        targetY: baseY,
        x: baseX,
        y: baseY,
        // Previous render pos for the wells trace mode.
        prevX: baseX,
        prevY: baseY,
        freqX: SAT_DRIFT_FREQ_X * (0.7 + rng() * 0.6),
        freqY: SAT_DRIFT_FREQ_Y * (0.7 + rng() * 0.6),
        phaseX: rng() * Math.PI * 2,
        phaseY: rng() * Math.PI * 2,
        strength: 0,
      };
    }

    const offset = 1 + Math.floor(rng() * 97);
    for (let i = 0; i < nParticles; i++) {
      const r = rng();
      let role = ROLE_FLOW;
      if (r >= ROLE_CUM_PROB[0]) role = (r < ROLE_CUM_PROB[1]) ? ROLE_ORBIT : ROLE_SHIMMER;
      const profile = ROLE_PROFILE[role];
      const px = (0.05 + halton(i + offset, 2) * 0.9) * width;
      const py = (0.05 + halton(i + offset, 3) * 0.9) * height;
      particles[i] = {
        x: px,
        y: py,
        // Previous position for the trace canvas — line segments are drawn
        // from (prevX, prevY) to (x, y) every frame. Initialised to current
        // position so the first frame draws a zero-length segment.
        prevX: px,
        prevY: py,
        vx: 0,
        vy: 0,
        freqA: NOISE_FREQ_MIN + rng() * (NOISE_FREQ_MAX - NOISE_FREQ_MIN),
        freqB: NOISE_FREQ_MIN + rng() * (NOISE_FREQ_MAX - NOISE_FREQ_MIN),
        phaseA: rng() * Math.PI * 2,
        phaseB: rng() * Math.PI * 2,
        // Personal flow-pulse cycle. Different freq + phase per particle
        // so the "currently in the flow" subset rotates over time.
        flowFreq: FLOW_PULSE_FREQ_MIN + rng() * (FLOW_PULSE_FREQ_MAX - FLOW_PULSE_FREQ_MIN),
        flowPhase: rng() * Math.PI * 2,
        // Per-particle repulsion strength. Log-uniform [0.15, 2.4] so a few
        // particles carve large voids while most are passive and pack tightly.
        // Radius stays global (grid correctness); only push magnitude varies.
        repelScale: Math.exp(rng() * Math.log(16) - Math.log(6.67)),
        role,
        midW: profile.midW,
        satW: profile.satW,
        noiseW: profile.noiseW,
        flowW: profile.flowW,
        size: profile.size,
      };
    }
  }

  // Extend physics bounds 4 % beyond each canvas edge so the edge-spring
  // accumulation line and the dark halo it creates are off-screen.
  // Particles can wander into the overshoot zone; the canvas clips them when
  // drawing so nothing appears outside the visible area.
  // Pre-allocated per-bucket index lists for velocity-width batching.
  // Filled and drained each drawTraces() call — no per-frame heap allocation.
  const trBuckets = Array.from({ length: TRACE_N_BUCKETS }, () => new Int32Array(nParticles));
  const trCounts  = new Int32Array(TRACE_N_BUCKETS);

  const overshoot = Math.round(Math.min(width, height) * 0.04);
  const physX0 = -overshoot;
  const physX1 =  width  + overshoot;
  const physY0 = -overshoot;
  const physY1 =  height + overshoot;

  reset();

  function detectOnsets(rawFlux) {
    midJerk = 0;
    onsetFired[0] = onsetFired[1] = onsetFired[2] = false;
    for (let b = 0; b < 3; b++) {
      if (!bandEnabled[b]) {
        // Hard-zero the band: no flux baseline tracking either, so when
        // the band is re-enabled it adapts cleanly from quiet.
        onset[b] = 0;
        fluxBaseline[b] = 0;
        onsetCooldown[b] = 0;
        continue;
      }
      fluxBaseline[b] += (rawFlux[b] - fluxBaseline[b]) * FLUX_BASELINE_SMOOTH;
      onset[b] *= ONSET_DECAY;
      if (onsetCooldown[b] > 0) onsetCooldown[b]--;
      const threshold = fluxBaseline[b] * fluxSensitivity + 0.012;
      if (onsetCooldown[b] === 0 && rawFlux[b] > threshold) {
        onset[b] = 1;
        onsetCooldown[b] = ONSET_REFRACTORY;
        onsetFired[b] = true;

        if (b === 0) {
          // BASS: drift the well toward a new target on each onset.
          // Successive onsets chain from the previous target so the well
          // roams continuously rather than bouncing around one anchor.
          const sat = satellites[0];
          lastBassSat = 0;
          if (!stationaryWells) {
            const stepFrac = SAT_STEP_BASE + angularity * SAT_STEP_PER_ANGULARITY;
            const ang = rng() * Math.PI * 2;
            const step = (0.4 + rng() * 0.6) * minDim * stepFrac;
            let nx = sat.targetX + Math.cos(ang) * step;
            let ny = sat.targetY + Math.sin(ang) * step;
            if (nx < width * 0.15) nx = width * 0.15;
            else if (nx > width * 0.85) nx = width * 0.85;
            if (ny < height * 0.15) ny = height * 0.15;
            else if (ny > height * 0.85) ny = height * 0.85;
            sat.targetX = nx;
            sat.targetY = ny;
          }
        } else if (b === 1) {
          // MID: kiki jerk for stripe particles, one frame.
          if (kikiAmt > 0) midJerk = rng() < 0.5 ? -1 : 1;
        }
        // TREBLE (b === 2): nothing extra. The onset[2] spike already
        // boosts the global noise term in update().
      }
    }
  }

  function update(rawLevels, rawFlux, rawCentroid, rawPitch) {
    t++;
    // Snapshot well positions BEFORE any updates this frame, so the
    // wells trace can draw (prev → current) segments after we recompute.
    prevMidXTrace = midX;
    prevMidYTrace = midYNow;
    for (let s = 0; s < satellites.length; s++) {
      satellites[s].prevX = satellites[s].x;
      satellites[s].prevY = satellites[s].y;
    }
    for (let b = 0; b < 3; b++) {
      // Disabled bands feed zero into the smoother, so smoothLevels[b]
      // ramps down to zero over a few frames after toggle-off rather
      // than snapping (matches the visual feel of the band fading out).
      const lvl = bandEnabled[b] ? rawLevels[b] : 0;
      smoothLevels[b] += (lvl - smoothLevels[b]) * LEVEL_SMOOTH;
    }
    // Mid horizontal target tracks the mid centroid, gated by mid level
    // (silent mid → centred target, no jitter). Skipped in stationary
    // mode so the stripe well stays locked at canvas centre.
    if (!stationaryWells) {
      const midAudible = Math.min(1, Math.max(0, (smoothLevels[1] - MIDX_AUDIBLE_THRESH) * 6));
      const midC = rawCentroid ? rawCentroid[1] : 0.5;
      const midTarget = cxCanvas + (midC - 0.5) * 2 * midXSpan * midAudible;
      midX += (midTarget - midX) * MIDX_SMOOTH;
    }

    detectOnsets(rawFlux);

    // Effective per-band strengths. s0 (bass) and s1 (mid) drive force
    // magnitudes directly; s2 (treble) is folded into the field-tension
    // factor below — it tunes the *character* of the simulation rather
    // than adding any direct force or visible quantity.
    const s0 = smoothLevels[0] + onset[0] * ONSET_BOOST;
    const s1 = smoothLevels[1] + onset[1] * ONSET_BOOST;
    const trebleTension = Math.min(
      1,
      smoothLevels[2] * TREBLE_TENSION_LEVEL_GAIN + onset[2] * TREBLE_TENSION_ONSET_GAIN,
    );
    // dampingBase feeds into per-particle velocity-dependent damping below.
    const dampingBase = DAMPING_BASE + trebleTension * TREBLE_DAMPING_BOOST;
    const effectiveRepelGain = REPEL_GAIN * (1 + trebleTension * TREBLE_REPEL_BOOST);

    // Curl flow field: per-frame gain (audio-modulated) and time argument.
    // Declared up here because the satellite block below uses them too.
    const audioEnergy = (smoothLevels[0] + smoothLevels[1] + smoothLevels[2]) / 3;
    const flowGain = FLOW_AMP_BASE + audioEnergy * FLOW_AMP_AUDIO;
    const flowTime = t * FLOW_T;
    const flowTimeY = flowTime * 0.7;

    // The wells themselves are also pushed by other forces this frame:
    //   (a) satellites repel each other (mutual inverse-square), so they
    //       maintain a spread when onsets randomly place them close.
    //   (b) satellites drift through the curl flow field at half a
    //       particle's responsiveness, so they migrate even between
    //       onsets.
    //   (c) the mid stripe's Y position bobs ±MID_FLOW_AMP following the
    //       curl flow sampled at (midX, midY).
    // Both target *and* base are moved by (a) and (b), so the existing
    // slide mechanic still propagates onset jumps correctly.
    const xMin = width * 0.10;
    const xMax = width * 0.90;
    const yMin = height * 0.10;
    const yMax = height * 0.90;
    // Curl-flow drift + onset-driven slide + Lissajous around the anchor.
    for (let s = 0; s < satellites.length; s++) {
      const sat = satellites[s];
      if (!stationaryWells) {
        const fxArg = sat.baseX * FLOW_K + flowTime;
        const fyArg = sat.baseY * FLOW_K - flowTimeY;
        const flowVx = -Math.sin(fxArg) * Math.sin(fyArg) * flowGain * SAT_FLOW_GAIN;
        const flowVy = -Math.cos(fxArg) * Math.cos(fyArg) * flowGain * SAT_FLOW_GAIN;
        sat.baseX += flowVx;
        sat.baseY += flowVy;
        sat.targetX += flowVx;
        sat.targetY += flowVy;
        if (sat.baseX < xMin) sat.baseX = xMin; else if (sat.baseX > xMax) sat.baseX = xMax;
        if (sat.baseY < yMin) sat.baseY = yMin; else if (sat.baseY > yMax) sat.baseY = yMax;
        if (sat.targetX < xMin) sat.targetX = xMin; else if (sat.targetX > xMax) sat.targetX = xMax;
        if (sat.targetY < yMin) sat.targetY = yMin; else if (sat.targetY > yMax) sat.targetY = yMax;
        sat.baseX += (sat.targetX - sat.baseX) * satSlideRate;
        sat.baseY += (sat.targetY - sat.baseY) * satSlideRate;
        sat.x = sat.baseX + Math.sin(t * sat.freqX + sat.phaseX) * satDriftAmp;
        sat.y = sat.baseY + Math.cos(t * sat.freqY + sat.phaseY) * satDriftAmp;
      } else {
        sat.x = sat.baseX;
        sat.y = sat.baseY;
      }
      sat.strength = s0;
    }
    // (c) Mid stripe Y target — blend of pitch contour (when melody is
    //     detected) and slow curl-flow bob (when it isn't). Locked at
    //     canvas centre when stationaryWells is on.
    if (!stationaryWells) {
      const mxArg = midX * FLOW_K + flowTime;
      const myArg = midY * FLOW_K - flowTimeY;
      const midFlowDy = -Math.cos(mxArg) * Math.cos(myArg);
      const flowOffset = midFlowDy * MID_FLOW_AMP;

      // Pitch is conceptually a mid-band feature — when mid is disabled,
      // the stripe shouldn't track it either.
      const targetPitch = (rawPitch && bandEnabled[1]) ? rawPitch[0] : 0.5;
      const targetConf = (rawPitch && bandEnabled[1]) ? rawPitch[1] : 0;
      smoothedConf += (targetConf - smoothedConf) * PITCH_CONF_SMOOTH;

      // Big confident pitch jumps snap; everything else smooths. The
      // stripe moves to the new note instantly, particles catch up via
      // their normal force-driven lag.
      const pitchDiff = Math.abs(targetPitch - smoothedPitch);
      if (pitchDiff > PITCH_JUMP_THRESHOLD && targetConf > PITCH_JUMP_CONF) {
        smoothedPitch = targetPitch;
      } else {
        smoothedPitch += (targetPitch - smoothedPitch) * PITCH_SMOOTH;
      }

      // pitch=0 (low) → stripe drops below centre; pitch=1 (high) → above.
      const pitchOffset = (0.5 - smoothedPitch) * 2 * PITCH_RANGE_FRAC * height;
      midYNow = midY + flowOffset * (1 - smoothedConf) + pitchOffset * smoothedConf;
    } else {
      midYNow = midY;
    }

    rebuildGrid(grid, particles);
    const { cols, rows, cellSize, buckets } = grid;

    for (let i = 0; i < nParticles; i++) {
      const p = particles[i];
      // Snapshot before integration — the trace canvas draws segments from
      // (prevX, prevY) → (x, y) using these.
      p.prevX = p.x;
      p.prevY = p.y;
      let fx = 0;
      let fy = 0;

      // ── 1. Mid stripe: 2D well at (midX, midYNow) ──────────────────────
      // Vertical pull toward midYNow (= midY + flow-driven Y bob);
      // horizontal pull toward midX gated by stripe membership
      // (= sigmaY² / (dy² + sigmaY²)). Scaled by p.midW so orbit/shimmer
      // particles ignore the stripe more than flow.
      const dy = midYNow - p.y;
      const dyDenom = dy * dy + sigmaSqY;
      const stripe = sigmaSqY / dyDenom;
      fy += s1 * dy * stripe / sigmaY * attractGain * p.midW;
      const dx = midX - p.x;
      const xWell = s1 * stripe * dx * sigmaSqX / (dx * dx + sigmaSqX);
      fx += xWell / sigmaX * midHorizGain * p.midW;

      // ── 2. Mutual repulsion + velocity alignment via spatial grid ─────
      let cx = Math.floor(p.x / cellSize);
      let cy = Math.floor(p.y / cellSize);
      if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
      if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
      let alignVx = 0, alignVy = 0, alignN = 0;
      for (let dyG = -1; dyG <= 1; dyG++) {
        const ny = cy + dyG;
        if (ny < 0 || ny >= rows) continue;
        for (let dxG = -1; dxG <= 1; dxG++) {
          const nx = cx + dxG;
          if (nx < 0 || nx >= cols) continue;
          const cell = buckets[ny * cols + nx];
          for (let k = 0; k < cell.length; k++) {
            const j = cell[k];
            if (j === i) continue;
            const q = particles[j];
            const ddx = p.x - q.x;
            const ddy = p.y - q.y;
            const dist2 = ddx * ddx + ddy * ddy;
            if (dist2 < REPEL_RADIUS_SQ && dist2 > 0.0001) {
              const cutoff = 1 - dist2 / REPEL_RADIUS_SQ;
              const k_ = effectiveRepelGain * q.repelScale * cutoff / (dist2 + REPEL_SOFTENING_SQ);
              fx += ddx * k_;
              fy += ddy * k_;
            }
            if (dist2 < ALIGN_RADIUS_SQ) {
              alignVx += q.vx;
              alignVy += q.vy;
              alignN++;
            }
          }
        }
      }
      if (alignN > 0) {
        fx += (alignVx / alignN - p.vx) * ALIGN_GAIN;
        fy += (alignVy / alignN - p.vy) * ALIGN_GAIN;
      }

      // ── 3. Bass gravity well ───────────────────────────────────────────
      // Radius expands with bass level so louder passages cast a wider net.
      // Drag transfers the well's own frame velocity to nearby particles so
      // they get swept along as it roams rather than just pulled to its centre.
      for (let s = 0; s < satellites.length; s++) {
        const sat = satellites[s];
        if (sat.strength < 0.01) continue;
        const effectiveRadius = SAT_RADIUS * (1 + sat.strength * SAT_RADIUS_EXPAND);
        const effectiveRadiusSq = effectiveRadius * effectiveRadius;
        const sdx = sat.x - p.x;
        const sdy = sat.y - p.y;
        const sdist2 = sdx * sdx + sdy * sdy;
        if (sdist2 >= effectiveRadiusSq) continue;
        const sCutoff = 1 - sdist2 / effectiveRadiusSq;
        // Attraction toward well centre
        const sk = sat.strength * SAT_GAIN * sCutoff / (sdist2 + SAT_SOFTENING_SQ) * p.satW;
        fx += sdx * sk;
        fy += sdy * sk;
        // Drag: push particle in the direction the well moved this frame
        const wellVx = sat.x - sat.prevX;
        const wellVy = sat.y - sat.prevY;
        fx += wellVx * SAT_DRAG_GAIN * sCutoff * p.satW;
        fy += wellVy * SAT_DRAG_GAIN * sCutoff * p.satW;
      }

      // ── 4. Curl flow field ─────────────────────────────────────────────
      // Curl of ψ = sin(arg_x)·cos(arg_y), so v = (∂ψ/∂y, -∂ψ/∂x). Both
      // components are bounded in [-1, 1]; FLOW_AMP_* + p.flowW set the
      // per-particle magnitude. The time argument shifts arg_x and arg_y
      // at slightly different rates (×0.7) so the eddy pattern morphs
      // diagonally over time rather than just translating.
      // The per-particle flowPulse gate (max(0, sin(...))) means each
      // particle is "in the flow" for half its cycle and totally
      // disengaged for the other half — so the active subset rotates
      // through the population over time instead of every particle
      // riding the currents at once.
      const flowPulse = Math.max(0, Math.sin(t * p.flowFreq + p.flowPhase));
      if (flowPulse > 0) {
        const fxArg = p.x * FLOW_K + flowTime;
        const fyArg = p.y * FLOW_K - flowTimeY;
        const sxA = Math.sin(fxArg);
        const cxA = Math.cos(fxArg);
        const syA = Math.sin(fyArg);
        const cyA = Math.cos(fyArg);
        const flowMag = flowGain * p.flowW * flowPulse;
        fx += -sxA * syA * flowMag;
        fy += -cxA * cyA * flowMag;
      }

      // ── 5. Bouba rotational drift ──────────────────────────────────────
      if (boubaAmt > 0) {
        const dxC = p.x - cxCanvas;
        const dyC = p.y - cyCanvas;
        const dC = Math.sqrt(dxC * dxC + dyC * dyC) + 1;
        fx += -dyC / dC * BOUBA_ROT_GAIN * boubaAmt;
        fy +=  dxC / dC * BOUBA_ROT_GAIN * boubaAmt;
      }

      // ── 6. Mid kiki jerk ───────────────────────────────────────────────
      // One-frame lateral impulse for stripe particles only — weighted
      // by p.midW so the jerk mainly hits flow particles. Orbit/shimmer
      // barely react: the snap stays in the stripe, the rest of the
      // field stays composed.
      if (midJerk !== 0 && Math.abs(dy) < sigmaY * 1.4) {
        fx += midJerk * KIKI_JERK_MAG * kikiAmt * p.midW;
      }

      // ── 7. Per-particle deterministic noise ────────────────────────────
      // p.noiseW is the per-role amplifier — shimmer particles get 3×
      // the noise of flow, orbit gets 0.7×. Audio coupling for treble is
      // not here any more; it lives in the field-tension factor that
      // shapes damping and repulsion.
      const noiseAmp = NOISE_AMP_BASE * p.noiseW;
      const tA = t * p.freqA * noiseSpeedScale;
      const tB = t * p.freqB * noiseSpeedScale;
      fx += Math.sin(tA + p.phaseA) * noiseAmp;
      fy += Math.cos(tB + p.phaseB) * noiseAmp;

      // ── 8. Soft edge spring + hard bounce backup ───────────────────────
      // Both operate on the extended physics bounds (physX0/1, physY0/1)
      // so the spring accumulation line sits ~4 % off-canvas.
      if (p.x < physX0 + EDGE_MARGIN) fx += (physX0 + EDGE_MARGIN - p.x) * EDGE_FORCE;
      else if (p.x > physX1 - EDGE_MARGIN) fx -= (p.x - (physX1 - EDGE_MARGIN)) * EDGE_FORCE;
      if (p.y < physY0 + EDGE_MARGIN) fy += (physY0 + EDGE_MARGIN - p.y) * EDGE_FORCE;
      else if (p.y > physY1 - EDGE_MARGIN) fy -= (p.y - (physY1 - EDGE_MARGIN)) * EDGE_FORCE;

      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const velDamping = Math.min(DAMPING_MAX, dampingBase + spd * DAMPING_INERTIA);
      p.vx = (p.vx + fx) * velDamping;
      p.vy = (p.vy + fy) * velDamping;
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < physX0) { p.x = physX0; p.vx =  Math.abs(p.vx) * EDGE_BOUNCE; }
      else if (p.x > physX1) { p.x = physX1; p.vx = -Math.abs(p.vx) * EDGE_BOUNCE; }
      if (p.y < physY0) { p.y = physY0; p.vy =  Math.abs(p.vy) * EDGE_BOUNCE; }
      else if (p.y > physY1) { p.y = physY1; p.vy = -Math.abs(p.vy) * EDGE_BOUNCE; }
    }
  }

  // ── DEBUG ─────────────────────────────────────────────────────────────────
  // Self-contained block. Delete from here to "END DEBUG" plus the call in
  // draw() and the `setDebug` export to remove the overlay entirely.
  //
  // No warm/cool palette — just neutral whites at varying alpha. Each band
  // is identified by its readout label, not by hue. The treble effect has
  // no canvas-overlay structure (it lives in the noise term); a faint
  // full-canvas tint pulses with treble level so the "shimmer everywhere"
  // is at least readable.
  let debug = false;

  const BAND_LABELS = ['BASS', 'MID', 'TRBL'];

  function drawDebugWells(ctx) {
    // Mid stripe: faint horizontal band at midYNow (the flow-bobbed Y),
    // brighter centre line, vertical needle at the centroid X.
    const midStrength = smoothLevels[1] + onset[1] * 0.6;
    const stripeAlpha = Math.min(0.16, midStrength * 0.18);
    if (stripeAlpha > 0.005) {
      ctx.fillStyle = `rgba(255,255,255,${stripeAlpha.toFixed(3)})`;
      ctx.fillRect(0, midYNow - sigmaY, width, sigmaY * 2);
    }
    const lineW = 1 + smoothLevels[1] * 6 + onset[1] * 12;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(0, midYNow - lineW / 2, width, lineW);
    const needleAlpha = Math.min(0.95, smoothLevels[1] * 4);
    if (needleAlpha > 0.05) {
      const needleH = sigmaY * 0.85;
      ctx.fillStyle = `rgba(255,255,255,${needleAlpha.toFixed(3)})`;
      ctx.fillRect(midX - 1.5, midYNow - needleH, 3, needleH * 2);
    }

    // Treble shimmer indicator: full-canvas tint that pulses with treble.
    // Very faint so it doesn't fight with the dots.
    const trebleStrength = smoothLevels[2] + onset[2] * 0.7;
    const trebleAlpha = Math.min(0.07, trebleStrength * 0.10);
    if (trebleAlpha > 0.005) {
      ctx.fillStyle = `rgba(255,255,255,${trebleAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    }

    // Bass satellites.
    for (let s = 0; s < satellites.length; s++) {
      const sat = satellites[s];
      const strength = smoothLevels[0] + onset[0] * 0.6;
      // Influence halo
      const effectiveR = SAT_RADIUS * (1 + strength * SAT_RADIUS_EXPAND);
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sat.x, sat.y, effectiveR, 0, Math.PI * 2);
      ctx.stroke();
      const r = 6 + strength * 14;
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(sat.x, sat.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawDebugOverlay(ctx) {
    const x0 = 16;
    const y0 = 16;
    const barW = 140;
    const barH = 12;
    const gap = 6;
    ctx.font = '11px monospace';
    ctx.textBaseline = 'middle';
    for (let b = 0; b < 3; b++) {
      const y = y0 + b * (barH + gap);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x0 - 4, y - 2, barW + barH + 60, barH + 4);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x0, y, barW, barH);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(x0, y, barW * smoothLevels[b], barH);
      ctx.strokeStyle = 'rgba(255,255,255,0.30)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y + 0.5, barW, barH);
      if (onset[b] > 0.05) {
        ctx.fillStyle = `rgba(255,255,255,${onset[b]})`;
        ctx.fillRect(x0 + barW + 4, y, barH, barH);
      }
      ctx.fillStyle = '#fff';
      ctx.fillText(BAND_LABELS[b], x0 + barW + barH + 12, y + barH / 2);
    }
    // Role count readout below the bars. Counts are static for the
    // session but useful as a sanity check on the population mix.
    let cFlow = 0, cOrbit = 0, cShimmer = 0;
    for (let i = 0; i < nParticles; i++) {
      const r = particles[i].role;
      if (r === ROLE_FLOW) cFlow++;
      else if (r === ROLE_ORBIT) cOrbit++;
      else cShimmer++;
    }
    const ry = y0 + 3 * (barH + gap) + 4;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x0 - 4, ry - 2, 230, barH + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(
      `flow ${cFlow}  orbit ${cOrbit}  shimmer ${cShimmer}`,
      x0,
      ry + barH / 2,
    );
  }

  function setDebug(on) {
    debug = !!on;
  }

  function setStationaryWells(on) {
    stationaryWells = !!on;
  }

  // band: 0 = bass, 1 = mid, 2 = treble. Out-of-range silently ignored.
  function setBandEnabled(band, on) {
    if (band < 0 || band > 2) return;
    bandEnabled[band] = !!on;
  }
  // ── END DEBUG ─────────────────────────────────────────────────────────────

  // Draws one frame's worth of line segments — (prevX, prevY) → (x, y) for
  // each particle — onto an external context that is NOT cleared between
  // frames. Over the course of playback the segments accumulate into a
  // composite "result image" of the motion. Called by the page after every
  // session.update(); the page is responsible for clearing the trace canvas
  // on reset (new file, generator switch, backward seek).
  function drawTraces(ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // ── 1. Particles: velocity-width segments, faint, accumulate ────────
    // Speed → lineWidth: TRACE_WIDTH_MIN (still) … TRACE_WIDTH_MAX (fast).
    // Particles are sorted into TRACE_N_BUCKETS speed bands so we only need
    // that many ctx.stroke() calls instead of one per particle.
    if (traceModes.particles) {
      trCounts.fill(0);
      for (let i = 0; i < nParticles; i++) {
        const p = particles[i];
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed < TRACE_SPEED_THRESH) continue;
        // Only etch particles within range of a bass satellite.
        let nearWell = false;
        for (let s = 0; s < satellites.length; s++) {
          const sat = satellites[s];
          const dsx = p.x - sat.x, dsy = p.y - sat.y;
          if (dsx * dsx + dsy * dsy < TRACE_WELL_RADIUS_SQ) { nearWell = true; break; }
        }
        if (!nearWell) continue;
        const b = Math.min(TRACE_N_BUCKETS - 1, Math.floor(speed / TRACE_SPEED_MAX * TRACE_N_BUCKETS));
        trBuckets[b][trCounts[b]++] = i;
      }
      for (let b = 0; b < TRACE_N_BUCKETS; b++) {
        if (trCounts[b] === 0) continue;
        const t = (b + 0.5) / TRACE_N_BUCKETS;
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = TRACE_WIDTH_MIN + Math.pow(t, TRACE_WIDTH_CURVE) * (TRACE_WIDTH_MAX - TRACE_WIDTH_MIN);
        ctx.beginPath();
        for (let k = 0; k < trCounts[b]; k++) {
          const p = particles[trBuckets[b][k]];
          ctx.moveTo(p.prevX, p.prevY);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }

    // ── 2. Wells: continuous strokes following the audio-driven structures ─
    // Bass satellites draw lines from prev → current pos (so the trace
    // shows their roaming/jumping pattern); mid stripe centre likewise.
    // Alpha is gated by the band's activity so silence doesn't draw
    // "well sitting still" lines.
    if (traceModes.wells) {
      const bassActivity = smoothLevels[0] + onset[0] * 0.7;
      if (bandEnabled[0] && bassActivity > 0.04) {
        ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.6, bassActivity * 0.9).toFixed(3)})`;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        for (let s = 0; s < satellites.length; s++) {
          const sat = satellites[s];
          ctx.moveTo(sat.prevX, sat.prevY);
          ctx.lineTo(sat.x, sat.y);
        }
        ctx.stroke();
      }
      const midActivity = smoothLevels[1] + onset[1] * 0.7;
      if (bandEnabled[1] && midActivity > 0.04) {
        ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.7, midActivity * 1.1).toFixed(3)})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(prevMidXTrace, prevMidYTrace);
        ctx.lineTo(midX, midYNow);
        ctx.stroke();
      }
    }

    // ── 3. Events: discrete marks on onset firings ─────────────────────
    // bass:   filled disc at the *firing* satellite, sized by bass level.
    //         Marks the actual hit, not the surrounding drift.
    // mid:    short cross at (midX, midYNow). Reads as a punctuation mark
    //         on the stripe; rotated 45° at high angularity to look "kiki."
    // treble: 4–7 fine dots scattered across the canvas. No spatial logic
    //         (treble has no position in this system) — just sparkle.
    if (traceModes.events) {
      if (onsetFired[0] && lastBassSat >= 0 && bandEnabled[0]) {
        const sat = satellites[lastBassSat];
        const r = 4 + smoothLevels[0] * 18 + onset[0] * 6;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.arc(sat.x, sat.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (onsetFired[1] && bandEnabled[1]) {
        const arm = 6 + smoothLevels[1] * 10;
        const rot = angularity > 0.5 ? Math.PI / 4 : 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        const c = Math.cos(rot), s = Math.sin(rot);
        ctx.moveTo(midX - arm * c, midYNow - arm * s);
        ctx.lineTo(midX + arm * c, midYNow + arm * s);
        ctx.moveTo(midX + arm * s, midYNow - arm * c);
        ctx.lineTo(midX - arm * s, midYNow + arm * c);
        ctx.stroke();
      }
      if (onsetFired[2] && bandEnabled[2]) {
        const n = 4 + Math.floor(traceRng() * 4);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        for (let k = 0; k < n; k++) {
          const px = traceRng() * width;
          const py = traceRng() * height;
          const sz = 1 + traceRng() * 1.5;
          ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
        }
      }
    }
  }

  function setTraceMode(mode, on) {
    if (mode in traceModes) traceModes[mode] = !!on;
  }

  function draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    if (debug) drawDebugWells(ctx);
    ctx.fillStyle = '#fff';
    // Per-particle size derived from role. Round the origin so 1 px
    // shimmer dots land cleanly on the pixel grid (otherwise sub-pixel
    // positions get smeared by Canvas anti-aliasing into 2-px fuzz).
    for (let i = 0; i < nParticles; i++) {
      const p = particles[i];
      const s = p.size;
      const half = s / 2;
      ctx.fillRect(Math.round(p.x - half), Math.round(p.y - half), s, s);
    }
    if (debug) drawDebugOverlay(ctx);
  }

  // Pre-settle: run physics until particles reach equilibrium so the initial
  // repulsion burst doesn't etch. drawTraces is never called here, so nothing
  // is written to the trace canvas. 150 frames at DAMPING 0.82 reduces any
  // velocity to <0.1% of its starting value (0.82^150 ≈ 0.0003).
  const _silence = [0, 0, 0];
  const _silencePitch = [0.5, 0];
  for (let _i = 0; _i < 150; _i++) update(_silence, _silence, [0.5, 0.5, 0.5], _silencePitch);

  return { update, draw, drawTraces, reset, setDebug, setStationaryWells, setBandEnabled, setTraceMode };
}

// ── RGB Layer Session ────────────────────────────────────────────────────────
// Three separate particle layers driven by bass / mid / treble respectively.
// Each layer: one roaming satellite + ~90 orbit particles, rendered in a
// pure primary colour (R / G / B). The trace canvas accumulates with additive
// blending, so overlapping paths compose into yellow, cyan, magenta, and white.
//
// Bass   → red.   Slow large jumps. Big soft cloud.
// Mid    → green. Medium speed and radius.
// Treble → blue.  Fast small jitter. Tight darting cluster.

// Per-layer tuning knobs
const RGB_LAYER_N        = [90, 90, 90];         // particles per layer
const RGB_COLORS         = ['255,0,0', '0,255,0', '0,0,255'];
const RGB_DOT_SIZE       = [3, 2, 1];            // px — larger for slower bands
const RGB_TRACE_WIDTH    = [1.5, 1.0, 0.6];      // stroke width on trace canvas
const RGB_TRACE_ALPHA    = [0.18, 0.18, 0.22];
const RGB_SAT_GAIN       = [260, 195, 135];      // attraction magnitude
const RGB_SAT_RADIUS     = [118, 93, 62];        // base influence radius
const RGB_DRIFT_FREQ_SCL = [0.70, 1.00, 1.80];  // scale on SAT_DRIFT_FREQ_*
const RGB_DRIFT_AMP_FRAC = [0.12, 0.09, 0.05];  // fraction of minDim
const RGB_SLIDE_RATE     = [0.035, 0.07, 0.13]; // how fast sat slides to target
const RGB_STEP_FRAC      = [0.22, 0.14, 0.07];  // onset jump size (fraction of minDim)

export function createRGBLayerSession(features, seed, width, height) {
  const { angularity, complexity } = features;
  const minDim = Math.min(width, height);
  const cxCanvas = width / 2;
  const cyCanvas = height / 2;
  const fluxSensitivity = 1.2 + (1 - angularity) * 1.8;
  const noiseSpeedScale = 0.85 + complexity * 0.5;
  const boubaAmt = Math.max(0, 1 - angularity * 1.4);

  const xMin = width * 0.10, xMax = width * 0.90;
  const yMin = height * 0.10, yMax = height * 0.90;
  const overshoot = Math.round(minDim * 0.04);
  const physX0 = -overshoot, physX1 = width + overshoot;
  const physY0 = -overshoot, physY1 = height + overshoot;

  // Per-band audio state
  const smoothLevels  = [0, 0, 0];
  const fluxBaseline  = [0, 0, 0];
  const onset         = [0, 0, 0];
  const onsetCooldown = [0, 0, 0];

  const satellites  = new Array(3);
  const allParticles = [];
  const grid = makeGrid(width, height, REPEL_RADIUS);

  // Pre-allocated trace buckets — one set per layer
  const rgbBuckets = RGB_COLORS.map(() =>
    Array.from({ length: TRACE_N_BUCKETS }, () => new Int32Array(270))
  );
  const rgbCounts = RGB_COLORS.map(() => new Int32Array(TRACE_N_BUCKETS));

  let rng = null;
  let t   = 0;

  function reset() {
    rng = mulberry32(seed);
    t   = 0;
    for (let b = 0; b < 3; b++) {
      smoothLevels[b] = fluxBaseline[b] = onset[b] = onsetCooldown[b] = 0;
    }
    allParticles.length = 0;

    for (let layer = 0; layer < 3; layer++) {
      const bx = (0.2 + rng() * 0.6) * width;
      const by = (0.2 + rng() * 0.6) * height;
      satellites[layer] = {
        baseX: bx, baseY: by,
        targetX: bx, targetY: by,
        x: bx, y: by,
        prevX: bx, prevY: by,
        freqX: SAT_DRIFT_FREQ_X * RGB_DRIFT_FREQ_SCL[layer] * (0.7 + rng() * 0.6),
        freqY: SAT_DRIFT_FREQ_Y * RGB_DRIFT_FREQ_SCL[layer] * (0.7 + rng() * 0.6),
        phaseX: rng() * Math.PI * 2,
        phaseY: rng() * Math.PI * 2,
        driftAmp: RGB_DRIFT_AMP_FRAC[layer] * minDim,
        strength: 0,
      };

      const N = RGB_LAYER_N[layer];
      const offset = 1 + Math.floor(rng() * 97) + layer * 137;
      for (let i = 0; i < N; i++) {
        const px = (0.05 + halton(i + offset, 2) * 0.9) * width;
        const py = (0.05 + halton(i + offset, 3) * 0.9) * height;
        allParticles.push({
          layer,
          x: px, y: py,
          prevX: px, prevY: py,
          vx: 0, vy: 0,
          freqA: NOISE_FREQ_MIN + rng() * (NOISE_FREQ_MAX - NOISE_FREQ_MIN),
          freqB: NOISE_FREQ_MIN + rng() * (NOISE_FREQ_MAX - NOISE_FREQ_MIN),
          phaseA: rng() * Math.PI * 2,
          phaseB: rng() * Math.PI * 2,
          flowFreq:  FLOW_PULSE_FREQ_MIN + rng() * (FLOW_PULSE_FREQ_MAX - FLOW_PULSE_FREQ_MIN),
          flowPhase: rng() * Math.PI * 2,
          repelScale: Math.exp(rng() * Math.log(16) - Math.log(6.67)),
          size: RGB_DOT_SIZE[layer],
        });
      }
    }
  }

  function update(rawLevels, rawFlux) {
    t++;
    for (let s = 0; s < 3; s++) { satellites[s].prevX = satellites[s].x; satellites[s].prevY = satellites[s].y; }

    for (let b = 0; b < 3; b++) {
      smoothLevels[b] += (rawLevels[b] - smoothLevels[b]) * LEVEL_SMOOTH;
      fluxBaseline[b] += (rawFlux[b]   - fluxBaseline[b]) * FLUX_BASELINE_SMOOTH;
      onset[b] *= ONSET_DECAY;
      if (onsetCooldown[b] > 0) onsetCooldown[b]--;
      const threshold = fluxBaseline[b] * fluxSensitivity + 0.012;
      if (onsetCooldown[b] === 0 && rawFlux[b] > threshold) {
        onset[b] = 1;
        onsetCooldown[b] = ONSET_REFRACTORY;
        const sat = satellites[b];
        const stepFrac = RGB_STEP_FRAC[b];
        const ang  = rng() * Math.PI * 2;
        const step = (0.4 + rng() * 0.6) * minDim * stepFrac;
        sat.targetX = Math.max(xMin, Math.min(xMax, sat.targetX + Math.cos(ang) * step));
        sat.targetY = Math.max(yMin, Math.min(yMax, sat.targetY + Math.sin(ang) * step));
      }
    }

    const audioEnergy = (smoothLevels[0] + smoothLevels[1] + smoothLevels[2]) / 3;
    const flowGain  = FLOW_AMP_BASE + audioEnergy * FLOW_AMP_AUDIO;
    const flowTime  = t * FLOW_T;
    const flowTimeY = flowTime * 0.7;

    // Update satellites (flow drift + slide + Lissajous)
    for (let layer = 0; layer < 3; layer++) {
      const sat = satellites[layer];
      const fxArg = sat.baseX * FLOW_K + flowTime;
      const fyArg = sat.baseY * FLOW_K - flowTimeY;
      const flowVx = -Math.sin(fxArg) * Math.sin(fyArg) * flowGain * SAT_FLOW_GAIN;
      const flowVy = -Math.cos(fxArg) * Math.cos(fyArg) * flowGain * SAT_FLOW_GAIN;
      sat.baseX   = Math.max(xMin, Math.min(xMax, sat.baseX   + flowVx));
      sat.baseY   = Math.max(yMin, Math.min(yMax, sat.baseY   + flowVy));
      sat.targetX = Math.max(xMin, Math.min(xMax, sat.targetX + flowVx));
      sat.targetY = Math.max(yMin, Math.min(yMax, sat.targetY + flowVy));
      const sr = RGB_SLIDE_RATE[layer];
      sat.baseX += (sat.targetX - sat.baseX) * sr;
      sat.baseY += (sat.targetY - sat.baseY) * sr;
      sat.x = sat.baseX + Math.sin(t * sat.freqX + sat.phaseX) * sat.driftAmp;
      sat.y = sat.baseY + Math.cos(t * sat.freqY + sat.phaseY) * sat.driftAmp;
      sat.strength = smoothLevels[layer] + onset[layer] * ONSET_BOOST;
    }

    rebuildGrid(grid, allParticles);
    const { cols, rows, cellSize, buckets } = grid;

    for (let i = 0; i < allParticles.length; i++) {
      const p = allParticles[i];
      p.prevX = p.x;
      p.prevY = p.y;
      let fx = 0, fy = 0;

      // 1. Attraction toward own satellite
      const sat = satellites[p.layer];
      if (sat.strength >= 0.01) {
        const effectiveRadius = RGB_SAT_RADIUS[p.layer] * (1 + sat.strength * SAT_RADIUS_EXPAND);
        const effectiveRadiusSq = effectiveRadius * effectiveRadius;
        const sdx = sat.x - p.x, sdy = sat.y - p.y;
        const sdist2 = sdx * sdx + sdy * sdy;
        if (sdist2 < effectiveRadiusSq) {
          const sCutoff = 1 - sdist2 / effectiveRadiusSq;
          const sk = sat.strength * RGB_SAT_GAIN[p.layer] * sCutoff / (sdist2 + SAT_SOFTENING_SQ);
          fx += sdx * sk;
          fy += sdy * sk;
          fx += (sat.x - sat.prevX) * SAT_DRAG_GAIN * sCutoff;
          fy += (sat.y - sat.prevY) * SAT_DRAG_GAIN * sCutoff;
        }
      }

      // 2. Same-layer mutual repulsion via spatial grid
      let cx = Math.floor(p.x / cellSize); if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
      let cy = Math.floor(p.y / cellSize); if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
      for (let dyG = -1; dyG <= 1; dyG++) {
        const ny = cy + dyG; if (ny < 0 || ny >= rows) continue;
        for (let dxG = -1; dxG <= 1; dxG++) {
          const nx = cx + dxG; if (nx < 0 || nx >= cols) continue;
          const cell = buckets[ny * cols + nx];
          for (let k = 0; k < cell.length; k++) {
            const j = cell[k]; if (j === i) continue;
            const q = allParticles[j];
            if (q.layer !== p.layer) continue;
            const ddx = p.x - q.x, ddy = p.y - q.y;
            const dist2 = ddx * ddx + ddy * ddy;
            if (dist2 < REPEL_RADIUS_SQ && dist2 > 0.0001) {
              const cutoff = 1 - dist2 / REPEL_RADIUS_SQ;
              const k_ = REPEL_GAIN * q.repelScale * cutoff / (dist2 + REPEL_SOFTENING_SQ);
              fx += ddx * k_; fy += ddy * k_;
            }
          }
        }
      }

      // 3. Curl flow field (per-particle pulsed)
      const flowPulse = Math.max(0, Math.sin(t * p.flowFreq + p.flowPhase));
      if (flowPulse > 0) {
        const fxArg = p.x * FLOW_K + flowTime;
        const fyArg = p.y * FLOW_K - flowTimeY;
        const flowMag = flowGain * flowPulse;
        fx += -Math.sin(fxArg) * Math.sin(fyArg) * flowMag;
        fy += -Math.cos(fxArg) * Math.cos(fyArg) * flowMag;
      }

      // 4. Bouba rotational drift
      if (boubaAmt > 0) {
        const dxC = p.x - cxCanvas, dyC = p.y - cyCanvas;
        const dC = Math.sqrt(dxC * dxC + dyC * dyC) + 1;
        fx += -dyC / dC * BOUBA_ROT_GAIN * boubaAmt;
        fy +=  dxC / dC * BOUBA_ROT_GAIN * boubaAmt;
      }

      // 5. Per-particle organic noise
      fx += Math.sin(t * p.freqA * noiseSpeedScale + p.phaseA) * NOISE_AMP_BASE;
      fy += Math.cos(t * p.freqB * noiseSpeedScale + p.phaseB) * NOISE_AMP_BASE;

      // Scale all motion forces to produce ~4× slower particles
      fx *= 0.25;
      fy *= 0.25;

      // 6. Soft edge spring + hard bounce
      if (p.x < physX0 + EDGE_MARGIN) fx += (physX0 + EDGE_MARGIN - p.x) * EDGE_FORCE;
      else if (p.x > physX1 - EDGE_MARGIN) fx -= (p.x - (physX1 - EDGE_MARGIN)) * EDGE_FORCE;
      if (p.y < physY0 + EDGE_MARGIN) fy += (physY0 + EDGE_MARGIN - p.y) * EDGE_FORCE;
      else if (p.y > physY1 - EDGE_MARGIN) fy -= (p.y - (physY1 - EDGE_MARGIN)) * EDGE_FORCE;

      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const velDamping = Math.min(DAMPING_MAX, DAMPING_BASE + spd * DAMPING_INERTIA);
      p.vx = (p.vx + fx) * velDamping;
      p.vy = (p.vy + fy) * velDamping;
      p.x += p.vx; p.y += p.vy;

      if (p.x < physX0) { p.x = physX0; p.vx =  Math.abs(p.vx) * EDGE_BOUNCE; }
      else if (p.x > physX1) { p.x = physX1; p.vx = -Math.abs(p.vx) * EDGE_BOUNCE; }
      if (p.y < physY0) { p.y = physY0; p.vy =  Math.abs(p.vy) * EDGE_BOUNCE; }
      else if (p.y > physY1) { p.y = physY1; p.vy = -Math.abs(p.vy) * EDGE_BOUNCE; }
    }
  }

  function draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < allParticles.length; i++) {
      const p = allParticles[i];
      ctx.fillStyle = `rgb(${RGB_COLORS[p.layer]})`;
      const half = p.size / 2;
      ctx.fillRect(Math.round(p.x - half), Math.round(p.y - half), p.size, p.size);
    }
    // Satellite markers — pulsing rings at each well
    for (let layer = 0; layer < 3; layer++) {
      const sat = satellites[layer];
      const r = 5 + sat.strength * 12;
      ctx.strokeStyle = `rgba(${RGB_COLORS[layer]},0.70)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sat.x, sat.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawTraces(ctx) {
    // Additive blending: R+G→yellow, R+B→magenta, G+B→cyan, R+G+B→white
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    for (let layer = 0; layer < 3; layer++) {
      const counts = rgbCounts[layer];
      const bkts   = rgbBuckets[layer];
      counts.fill(0);

      for (let i = 0; i < allParticles.length; i++) {
        const p = allParticles[i];
        if (p.layer !== layer) continue;
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed < TRACE_SPEED_THRESH) continue;
        const b = Math.min(TRACE_N_BUCKETS - 1, Math.floor(speed / TRACE_SPEED_MAX * TRACE_N_BUCKETS));
        bkts[b][counts[b]++] = i;
      }

      const alpha = RGB_TRACE_ALPHA[layer];
      for (let b = 0; b < TRACE_N_BUCKETS; b++) {
        if (counts[b] === 0) continue;
        const tFrac = (b + 0.5) / TRACE_N_BUCKETS;
        const w = RGB_TRACE_WIDTH[layer] * (TRACE_WIDTH_MIN + Math.pow(tFrac, TRACE_WIDTH_CURVE) * (TRACE_WIDTH_MAX - TRACE_WIDTH_MIN)) / TRACE_WIDTH_MAX;
        ctx.strokeStyle = `rgba(${RGB_COLORS[layer]},${alpha.toFixed(3)})`;
        ctx.lineWidth = Math.max(0.5, w * 1.8);
        ctx.beginPath();
        for (let k = 0; k < counts[b]; k++) {
          const p = allParticles[bkts[b][k]];
          ctx.moveTo(p.prevX, p.prevY);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = prevComp;
  }

  reset();

  // Pre-settle — let repulsion spread particles before audio starts
  const _silence = [0, 0, 0];
  for (let _i = 0; _i < 150; _i++) update(_silence, _silence);

  return { update, draw, drawTraces, reset };
}
