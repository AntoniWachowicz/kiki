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
const ATTRACT_GAIN = 1.0;            // base mid-well pull magnitude

const REPEL_GAIN = 320;
const REPEL_RADIUS = 100;
const REPEL_RADIUS_SQ = REPEL_RADIUS * REPEL_RADIUS;
const REPEL_SOFTENING = 30;
const REPEL_SOFTENING_SQ = REPEL_SOFTENING * REPEL_SOFTENING;

// Noise: base amplitude + treble-driven multiplier so loud treble makes
// the whole field shimmer. Frequencies are slow on purpose — period 8–25 s.
const NOISE_AMP_BASE = 0.09;
const NOISE_TREBLE_GAIN = 2.4;       // multiplier on noise at treble level=1
const NOISE_TREBLE_ONSET_GAIN = 3.5; // extra boost during a treble onset spike
const NOISE_FREQ_MIN = 0.0035;
const NOISE_FREQ_MAX = 0.012;

// ── Bass satellites ─────────────────────────────────────────────────────────
const BASS_SAT_COUNT = 2;
const SAT_DRIFT_FREQ_X = 0.0030;
const SAT_DRIFT_FREQ_Y = 0.0040;
const SAT_DRIFT_AMP_FRAC = 0.13;     // of minDim — wider Lissajous swing
const SAT_GAIN = 500;
const SAT_RADIUS = 280;
const SAT_RADIUS_SQ = SAT_RADIUS * SAT_RADIUS;
const SAT_SOFTENING = 50;
const SAT_SOFTENING_SQ = SAT_SOFTENING * SAT_SOFTENING;
const SAT_REPEL_FRAMES = 6;          // shorter repel window — was 8
const SAT_REPEL_GAIN = 1.2;
// Satellites are themselves pushed by other forces, so they don't just
// sit waiting for the next bass onset.
//   FLOW_GAIN — how strongly the curl flow field carries satellites.
//     0.5 means satellites drift at half the rate of an unweighted
//     particle in the same field. Treat them as "heavy."
//   MUTUAL_REPEL — satellites push each other apart. Keeps the two of
//     them from sitting near each other after random onset placements.
const SAT_FLOW_GAIN = 0.5;
const SAT_MUTUAL_REPEL_GAIN = 24000;
const SAT_MUTUAL_REPEL_SOFTENING = 90;
const SAT_MUTUAL_REPEL_SOFTENING_SQ = SAT_MUTUAL_REPEL_SOFTENING * SAT_MUTUAL_REPEL_SOFTENING;
// On a bass onset the satellite picks a new target position. With prob
// `teleportProb` (0 in pure bouba, ~0.5 at full kiki) it teleports there
// instantly — the "disappear and reappear" beat. Otherwise it smoothly
// slides toward the new target at `slideRate`. Slide rate scales with
// angularity so bouba slides are gentle (~0.5 s) and kiki slides snap
// (~0.25 s). Both styles travel further now thanks to `stepFrac` below.
const SAT_TELEPORT_PROB_GAIN = 0.7;  // multiplier on (angularity - 0.3)
const SAT_SLIDE_RATE_MIN = 0.04;
const SAT_SLIDE_RATE_MAX = 0.14;
const SAT_STEP_BASE = 0.06;          // step as fraction of minDim
const SAT_STEP_PER_ANGULARITY = 0.45;

// ── Bouba rotation / Kiki jerk ──────────────────────────────────────────────
const BOUBA_ROT_GAIN = 0.18;
const KIKI_JERK_MAG = 2.5;           // was 4 — kiki was too punchy

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
const FLOW_AMP_BASE = 0.30;
const FLOW_AMP_AUDIO = 0.45;

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
const DAMPING = 0.78;
const EDGE_MARGIN = 14;
const EDGE_FORCE = 0.35;
const EDGE_BOUNCE = 0.4;

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

export function createStippleSession(features, seed, width, height) {
  const { complexity, angularity } = features;

  const attractGain = ATTRACT_GAIN * (0.4 + angularity * 1.2);
  const fluxSensitivity = 1.2 + (1 - angularity) * 1.8;
  const noiseSpeedScale = 0.85 + complexity * 0.5;
  const boubaAmt = Math.max(0, 1 - angularity * 1.4);
  const kikiAmt = Math.max(0, angularity - 0.3) * 1.4;
  // Capped at ~0.6 instead of ~0.96 — the flip-to-repel was firing on
  // almost every kiki onset, which is what made kiki feel chaotic.
  const satFlipProb = Math.max(0, angularity - 0.4) * 1.0;
  // Bass-satellite onset behaviour: at angularity ≤ 0.3 the satellite
  // always smoothly slides; above that, with rising probability it
  // teleports instead. Slide rate also scales with angularity so kiki
  // slides finish quickly while bouba slides take ~half a second.
  const teleportProb = Math.max(0, angularity - 0.3) * SAT_TELEPORT_PROB_GAIN;
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

  const particles = new Array(N_PARTICLES);
  let rng = null;
  let t = 0;

  function reset() {
    rng = mulberry32(seed);
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
        freqX: SAT_DRIFT_FREQ_X * (0.7 + rng() * 0.6),
        freqY: SAT_DRIFT_FREQ_Y * (0.7 + rng() * 0.6),
        phaseX: rng() * Math.PI * 2,
        phaseY: rng() * Math.PI * 2,
        repelFrames: 0,
      };
    }

    const offset = 1 + Math.floor(rng() * 97);
    for (let i = 0; i < N_PARTICLES; i++) {
      const r = rng();
      let role = ROLE_FLOW;
      if (r >= ROLE_CUM_PROB[0]) role = (r < ROLE_CUM_PROB[1]) ? ROLE_ORBIT : ROLE_SHIMMER;
      const profile = ROLE_PROFILE[role];
      particles[i] = {
        x: (0.05 + halton(i + offset, 2) * 0.9) * width,
        y: (0.05 + halton(i + offset, 3) * 0.9) * height,
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
        role,
        midW: profile.midW,
        satW: profile.satW,
        noiseW: profile.noiseW,
        flowW: profile.flowW,
        size: profile.size,
      };
    }
  }

  reset();

  function detectOnsets(rawFlux) {
    midJerk = 0;
    for (let b = 0; b < 3; b++) {
      fluxBaseline[b] += (rawFlux[b] - fluxBaseline[b]) * FLUX_BASELINE_SMOOTH;
      onset[b] *= ONSET_DECAY;
      if (onsetCooldown[b] > 0) onsetCooldown[b]--;
      const threshold = fluxBaseline[b] * fluxSensitivity + 0.012;
      if (onsetCooldown[b] === 0 && rawFlux[b] > threshold) {
        onset[b] = 1;
        onsetCooldown[b] = ONSET_REFRACTORY;

        if (b === 0) {
          // BASS: pick one satellite, compute a new target position, then
          // either teleport (instant snap) or shift (smooth slide). Step
          // size grows with angularity so kiki swings travel further.
          // Sliding from `targetX,Y` (not `baseX,Y`) so successive shifts
          // chain — a flurry of onsets sends the satellite further each
          // time instead of bouncing around the previous anchor.
          const sIdx = Math.floor(rng() * satellites.length);
          const sat = satellites[sIdx];
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
          if (rng() < teleportProb) {
            // Instant — the "disappear and reappear" beat.
            sat.baseX = nx;
            sat.baseY = ny;
          }
          // Flip to repel only on teleporting kicks; smooth-slide onsets
          // don't get the explosive push, which calms kiki considerably.
          if (satFlipProb > 0 && rng() < satFlipProb) {
            sat.repelFrames = SAT_REPEL_FRAMES;
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
    for (let b = 0; b < 3; b++) {
      smoothLevels[b] += (rawLevels[b] - smoothLevels[b]) * LEVEL_SMOOTH;
    }
    // Mid horizontal target tracks the mid centroid, gated by mid level
    // (silent mid → centred target, no jitter).
    const midAudible = Math.min(1, Math.max(0, (smoothLevels[1] - MIDX_AUDIBLE_THRESH) * 6));
    const midC = rawCentroid ? rawCentroid[1] : 0.5;
    const midTarget = cxCanvas + (midC - 0.5) * 2 * midXSpan * midAudible;
    midX += (midTarget - midX) * MIDX_SMOOTH;

    detectOnsets(rawFlux);

    // Effective per-band strengths. Only s1 (mid) and s0 (bass) drive
    // forces; s2 (treble) drives the noise multiplier below.
    const s0 = smoothLevels[0] + onset[0] * ONSET_BOOST;
    const s1 = smoothLevels[1] + onset[1] * ONSET_BOOST;
    const trebleNoiseMul =
      1 + smoothLevels[2] * NOISE_TREBLE_GAIN + onset[2] * NOISE_TREBLE_ONSET_GAIN;

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
    // (a) Mutual repulsion between satellite anchors.
    for (let i = 0; i < satellites.length; i++) {
      const a = satellites[i];
      for (let j = 0; j < satellites.length; j++) {
        if (i === j) continue;
        const b = satellites[j];
        const ddx = a.baseX - b.baseX;
        const ddy = a.baseY - b.baseY;
        const dist2soft = ddx * ddx + ddy * ddy + SAT_MUTUAL_REPEL_SOFTENING_SQ;
        const distSoft = Math.sqrt(dist2soft);
        const f = SAT_MUTUAL_REPEL_GAIN / dist2soft;
        const px = (ddx / distSoft) * f;
        const py = (ddy / distSoft) * f;
        a.baseX += px;
        a.baseY += py;
        a.targetX += px;
        a.targetY += py;
      }
    }
    // (b) Curl-flow drift + (c) onset-driven slide + Lissajous around
    // the resulting anchor; cache signed strength for the particle loop.
    for (let s = 0; s < satellites.length; s++) {
      const sat = satellites[s];
      const fxArg = sat.baseX * FLOW_K + flowTime;
      const fyArg = sat.baseY * FLOW_K - flowTimeY;
      const flowVx = -Math.sin(fxArg) * Math.sin(fyArg) * flowGain * SAT_FLOW_GAIN;
      const flowVy = -Math.cos(fxArg) * Math.cos(fyArg) * flowGain * SAT_FLOW_GAIN;
      sat.baseX += flowVx;
      sat.baseY += flowVy;
      sat.targetX += flowVx;
      sat.targetY += flowVy;
      // Clamp to a 10–90 % margin so flow + repel can't park them on the
      // canvas edge where their gravity well would be half-cut.
      if (sat.baseX < xMin) sat.baseX = xMin; else if (sat.baseX > xMax) sat.baseX = xMax;
      if (sat.baseY < yMin) sat.baseY = yMin; else if (sat.baseY > yMax) sat.baseY = yMax;
      if (sat.targetX < xMin) sat.targetX = xMin; else if (sat.targetX > xMax) sat.targetX = xMax;
      if (sat.targetY < yMin) sat.targetY = yMin; else if (sat.targetY > yMax) sat.targetY = yMax;
      // Slide toward target then apply Lissajous drift on top.
      sat.baseX += (sat.targetX - sat.baseX) * satSlideRate;
      sat.baseY += (sat.targetY - sat.baseY) * satSlideRate;
      sat.x = sat.baseX + Math.sin(t * sat.freqX + sat.phaseX) * satDriftAmp;
      sat.y = sat.baseY + Math.cos(t * sat.freqY + sat.phaseY) * satDriftAmp;
      if (sat.repelFrames > 0) sat.repelFrames--;
      const sign = sat.repelFrames > 0 ? -SAT_REPEL_GAIN : 1;
      sat.signedStrength = sign * s0;
    }
    // (c) Mid stripe Y target — blend of pitch contour (when melody is
    //     detected) and slow curl-flow bob (when it isn't).
    {
      const mxArg = midX * FLOW_K + flowTime;
      const myArg = midY * FLOW_K - flowTimeY;
      const midFlowDy = -Math.cos(mxArg) * Math.cos(myArg);
      const flowOffset = midFlowDy * MID_FLOW_AMP;

      const targetPitch = rawPitch ? rawPitch[0] : 0.5;
      const targetConf = rawPitch ? rawPitch[1] : 0;
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
    }

    rebuildGrid(grid, particles);
    const { cols, rows, cellSize, buckets } = grid;

    for (let i = 0; i < N_PARTICLES; i++) {
      const p = particles[i];
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

      // ── 2. Mutual repulsion via spatial grid ───────────────────────────
      let cx = Math.floor(p.x / cellSize);
      let cy = Math.floor(p.y / cellSize);
      if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
      if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
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
            if (dist2 >= REPEL_RADIUS_SQ || dist2 < 0.0001) continue;
            const cutoff = 1 - dist2 / REPEL_RADIUS_SQ;
            const k_ = REPEL_GAIN * cutoff / (dist2 + REPEL_SOFTENING_SQ);
            fx += ddx * k_;
            fy += ddy * k_;
          }
        }
      }

      // ── 3. Bass satellites ─────────────────────────────────────────────
      // Scaled by p.satW so orbit particles get pulled ~2× harder and
      // shimmer particles ignore the satellites almost completely.
      for (let s = 0; s < satellites.length; s++) {
        const sat = satellites[s];
        if (Math.abs(sat.signedStrength) < 0.01) continue;
        const sdx = sat.x - p.x;
        const sdy = sat.y - p.y;
        const sdist2 = sdx * sdx + sdy * sdy;
        if (sdist2 >= SAT_RADIUS_SQ) continue;
        const sCutoff = 1 - sdist2 / SAT_RADIUS_SQ;
        const sk = sat.signedStrength * SAT_GAIN * sCutoff / (sdist2 + SAT_SOFTENING_SQ) * p.satW;
        fx += sdx * sk;
        fy += sdy * sk;
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

      // ── 7. Per-particle deterministic noise (treble-modulated) ─────────
      // p.noiseW is the per-role amplifier — shimmer particles get 3×
      // the noise of flow, orbit gets 0.7× (so they cluster more cleanly
      // around their satellite). Treble multiplier applies on top.
      const noiseAmp = NOISE_AMP_BASE * trebleNoiseMul * p.noiseW;
      const tA = t * p.freqA * noiseSpeedScale;
      const tB = t * p.freqB * noiseSpeedScale;
      fx += Math.sin(tA + p.phaseA) * noiseAmp;
      fy += Math.cos(tB + p.phaseB) * noiseAmp;

      // ── 8. Soft edge spring + hard bounce backup ───────────────────────
      if (p.x < EDGE_MARGIN) fx += (EDGE_MARGIN - p.x) * EDGE_FORCE;
      else if (p.x > width - EDGE_MARGIN) fx -= (p.x - (width - EDGE_MARGIN)) * EDGE_FORCE;
      if (p.y < EDGE_MARGIN) fy += (EDGE_MARGIN - p.y) * EDGE_FORCE;
      else if (p.y > height - EDGE_MARGIN) fy -= (p.y - (height - EDGE_MARGIN)) * EDGE_FORCE;

      p.vx = (p.vx + fx) * DAMPING;
      p.vy = (p.vy + fy) * DAMPING;
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) * EDGE_BOUNCE; }
      else if (p.x > width - 1) { p.x = width - 1; p.vx = -Math.abs(p.vx) * EDGE_BOUNCE; }
      if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) * EDGE_BOUNCE; }
      else if (p.y > height - 1) { p.y = height - 1; p.vy = -Math.abs(p.vy) * EDGE_BOUNCE; }
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
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sat.x, sat.y, SAT_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      // Centre marker: filled disc when attracting, hollow ring + slash
      // when in the post-onset repel state.
      const r = 6 + strength * 14;
      const isRepel = sat.repelFrames > 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(sat.x, sat.y, r, 0, Math.PI * 2);
      if (isRepel) {
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sat.x - r, sat.y - r);
        ctx.lineTo(sat.x + r, sat.y + r);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fill();
        ctx.stroke();
      }
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
    for (let i = 0; i < N_PARTICLES; i++) {
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
  // ── END DEBUG ─────────────────────────────────────────────────────────────

  function draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    if (debug) drawDebugWells(ctx);
    ctx.fillStyle = '#fff';
    // Per-particle size derived from role. Round the origin so 1 px
    // shimmer dots land cleanly on the pixel grid (otherwise sub-pixel
    // positions get smeared by Canvas anti-aliasing into 2-px fuzz).
    for (let i = 0; i < N_PARTICLES; i++) {
      const p = particles[i];
      const s = p.size;
      const half = s / 2;
      ctx.fillRect(Math.round(p.x - half), Math.round(p.y - half), s, s);
    }
    if (debug) drawDebugOverlay(ctx);
  }

  return { update, draw, reset, setDebug };
}
