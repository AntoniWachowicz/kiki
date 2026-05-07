// Reinterpretation of Rowbyte's Stipple AE plugin for audio, layered with
// extra motion sources so the field has more compositional structure than
// pure repulsion + vertical wells.
//
// Forces per particle per frame:
//   1. Vertical band wells — three soft Lorentzians stacked in Y (bass
//      bottom, mid middle, treble top). Each well's depth = band level +
//      onset boost. Provides the "where the audio lives" gradient.
//   2. Mutual repulsion — every particle pushes neighbours within
//      REPEL_RADIUS apart. Spatial grid keeps it O(N·k). The piece that
//      stops everything from clumping at the wells.
//   3. Roaming satellites — three drifting point sources (one per band)
//      that orbit via Lissajous, jump to a new anchor on each onset, and
//      briefly flip from attract → repel during the onset spike. Adds
//      horizontal/diagonal flow missing from the vertical-only wells.
//      Flip probability and jerk magnitude scale with angularity, so kiki
//      gets explosive pushes while bouba stays gently attractive.
//   4. Bouba rotational drift — slow tangential current around canvas
//      centre, scaled by (1 - angularity). Off in the kiki regime.
//   5. Kiki onset jerks — one-frame lateral impulse to every particle in
//      the firing band's stripe, scaled by angularity. Damping carries it
//      ~7 frames so it reads as a sharp shove.
//   6. Per-particle noise — small sin-sum drift in both axes, organic life
//      during silence.
//
// What this gets us that the previous models missed:
//   - No fixed homes, no point attractors, no clusters. Particles flow with
//     audio (wells deepen → particles redistribute), but repulsion ensures
//     they remain spread across the active band(s).
//   - Bass-heavy section pulls particles to the bottom; treble-heavy to the
//     top; both at once flattens out across the whole canvas.
//
// Determinism: particles' positions are stateful, but seed-reset + bands
// timeline reproduces the exact same sequence — same as before.

// ── Population ──────────────────────────────────────────────────────────────
const N_PARTICLES = 320;
const DOT_SIZE = 2;

// ── Audio smoothing (matches old AnalyserNode behaviour) ────────────────────
const LEVEL_SMOOTH = 0.30;
const FLUX_BASELINE_SMOOTH = 0.04;
const ONSET_DECAY = 0.85;
// Refractory at 86 fps: 10 frames ≈ 116 ms minimum between onsets per
// band. Higher = fewer onset-triggered events (satellite jumps, jerks),
// less visual chatter. Drop back to 4–6 if onsets feel sluggish.
const ONSET_REFRACTORY = 10;
const ONSET_BOOST = 0.6;

// ── Audio "image" — three vertical wells ────────────────────────────────────
// Y positions of band well centres (fraction of canvas height). 0 = top.
// Treble on top, bass on bottom — same intuition as a spectrum analyser
// laid sideways and the canvas is the spectrum view.
const BAND_CENTERS_Y = [0.85, 0.5, 0.15];
// Width (sigma) of each well, fraction of canvas height. ~0.22 means a
// well's pull is meaningful within ~half a canvas-height of its centre.
const BAND_SIGMA_FRAC = 0.22;

// ── Force tunings ───────────────────────────────────────────────────────────
// All gains tuned together with DAMPING below — change one and the whole
// "feel" of the field shifts. Targeting gentle, legible motion: terminal
// velocities in the low single-digit px/frame for typical levels.
const ATTRACT_GAIN = 1.0;

// Repulsion: peak force at distance ~softening (~30 px). Smooth cutoff at
// REPEL_RADIUS so neighbours just past the radius don't snap. Tuned so
// average particle spacing settles around 50–60 px (≈√(canvas_area / N)).
const REPEL_GAIN = 320;
const REPEL_RADIUS = 100;
const REPEL_RADIUS_SQ = REPEL_RADIUS * REPEL_RADIUS;
const REPEL_SOFTENING = 30;
const REPEL_SOFTENING_SQ = REPEL_SOFTENING * REPEL_SOFTENING;

// Noise: small persistent jitter, gives the field "life" during silence.
// Frequencies are slow on purpose — period 8–25 s. Faster values feel
// like buzz, not breath.
const NOISE_AMP = 0.09;
const NOISE_FREQ_MIN = 0.0035;
const NOISE_FREQ_MAX = 0.012;

// ── Roaming satellites ──────────────────────────────────────────────────────
// One per band. Each drifts via Lissajous around an anchor that walks on
// onsets. During the onset spike for its band it briefly flips polarity
// (attract → repel) with a probability that scales with angularity.
const SAT_DRIFT_FREQ_X = 0.0030;
const SAT_DRIFT_FREQ_Y = 0.0040;
const SAT_DRIFT_AMP_FRAC = 0.10;     // of minDim
const SAT_GAIN = 500;
const SAT_RADIUS = 280;
const SAT_RADIUS_SQ = SAT_RADIUS * SAT_RADIUS;
const SAT_SOFTENING = 50;
const SAT_SOFTENING_SQ = SAT_SOFTENING * SAT_SOFTENING;
const SAT_REPEL_FRAMES = 8;          // duration of attract→repel flip
const SAT_REPEL_GAIN = 1.2;          // multiplier when repulsive

// ── Bouba rotation / Kiki jerks ─────────────────────────────────────────────
const BOUBA_ROT_GAIN = 0.18;         // tangential force in px/frame at full bouba
const KIKI_JERK_MAG = 4;             // one-frame impulse on stripe particles

// ── Integration ─────────────────────────────────────────────────────────────
// Damping is the biggest single "feel" knob. Lower = more friction, lower
// terminal velocities, calmer. Terminal velocity = damping/(1-damping) × force,
// so at 0.78 a 1 px/frame² force produces ~3.5 px/frame, vs ~6.1 at 0.86.
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

// Spatial hash grid: cell size = repulsion radius so a particle's relevant
// neighbours always lie in its cell or one of the 8 adjacent cells.
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

  // Angularity = audio responsiveness. High → strong vertical flows on band
  // changes. Low → repulsion dominates and the field stays evenly spread.
  const attractGain = ATTRACT_GAIN * (0.4 + angularity * 1.2);
  const fluxSensitivity = 1.2 + (1 - angularity) * 1.8;
  // Complexity slightly boosts noise frequency so a "complex" track
  // fidgets a little faster overall.
  const noiseSpeedScale = 0.85 + complexity * 0.5;
  // Bouba ↔ kiki crossfade for the new motion ingredients. boubaAmt fades
  // out by ~angularity 0.7; kikiAmt fades in past 0.3.
  const boubaAmt = Math.max(0, 1 - angularity * 1.4);
  const kikiAmt = Math.max(0, angularity - 0.3) * 1.4;
  const satFlipProb = Math.max(0, angularity - 0.4) * 1.6;

  const minDim = Math.min(width, height);
  const satDriftAmp = SAT_DRIFT_AMP_FRAC * minDim;
  const cxCanvas = width / 2;
  const cyCanvas = height / 2;

  const sigmaY = BAND_SIGMA_FRAC * height;
  const sigmaSqY = sigmaY * sigmaY;
  const bandY = [
    BAND_CENTERS_Y[0] * height,
    BAND_CENTERS_Y[1] * height,
    BAND_CENTERS_Y[2] * height,
  ];
  const grid = makeGrid(width, height, REPEL_RADIUS);

  const smoothLevels = [0, 0, 0];
  const fluxBaseline = [0, 0, 0];
  const onset = [0, 0, 0];
  const onsetCooldown = [0, 0, 0];
  // One satellite per band — see SAT_* constants and detectOnsets().
  const satellites = new Array(3);
  // Per-band one-frame lateral impulse direction for kiki jerks. -1 / +1
  // when an onset just fired and angularity is high; 0 otherwise. Cleared
  // at the end of update() each frame.
  const pendingJerks = [0, 0, 0];

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
      pendingJerks[b] = 0;
    }

    // Satellites — one per band, anchored near (but not on) the band's
    // well centre so the satellite force field complements the well rather
    // than duplicating it. Distinct per-axis Lissajous frequencies per
    // satellite so they don't all swing in sync.
    for (let b = 0; b < 3; b++) {
      const baseX = (0.25 + rng() * 0.5) * width;
      const baseY = (BAND_CENTERS_Y[b] + (rng() - 0.5) * 0.18) * height;
      satellites[b] = {
        band: b,
        baseX,
        baseY,
        x: baseX,
        y: baseY,
        freqX: SAT_DRIFT_FREQ_X * (0.7 + rng() * 0.6),
        freqY: SAT_DRIFT_FREQ_Y * (0.7 + rng() * 0.6),
        phaseX: rng() * Math.PI * 2,
        phaseY: rng() * Math.PI * 2,
        repelFrames: 0,  // remaining frames in attract→repel flip state
      };
    }

    // Halton-distributed initial positions (low-discrepancy quasi-random)
    // so the first frame already looks evenly spread instead of needing
    // many frames of repulsion to settle.
    const offset = 1 + Math.floor(rng() * 97);
    for (let i = 0; i < N_PARTICLES; i++) {
      particles[i] = {
        x: (0.05 + halton(i + offset, 2) * 0.9) * width,
        y: (0.05 + halton(i + offset, 3) * 0.9) * height,
        vx: 0,
        vy: 0,
        freqA: NOISE_FREQ_MIN + rng() * (NOISE_FREQ_MAX - NOISE_FREQ_MIN),
        freqB: NOISE_FREQ_MIN + rng() * (NOISE_FREQ_MAX - NOISE_FREQ_MIN),
        phaseA: rng() * Math.PI * 2,
        phaseB: rng() * Math.PI * 2,
      };
    }
  }

  reset();

  function detectOnsets(rawFlux) {
    for (let b = 0; b < 3; b++) {
      fluxBaseline[b] += (rawFlux[b] - fluxBaseline[b]) * FLUX_BASELINE_SMOOTH;
      onset[b] *= ONSET_DECAY;
      if (onsetCooldown[b] > 0) onsetCooldown[b]--;
      pendingJerks[b] = 0;
      const threshold = fluxBaseline[b] * fluxSensitivity + 0.012;
      if (onsetCooldown[b] === 0 && rawFlux[b] > threshold) {
        onset[b] = 1;
        onsetCooldown[b] = ONSET_REFRACTORY;
        // Jump this band's satellite anchor by a step that grows with
        // angularity. Walking the anchor (vs. teleporting) keeps spatial
        // continuity — a sequence of small onsets nudges it, a big one
        // jumps it far. Clamp inside a 15–85% margin so satellites don't
        // park on the canvas edge where their gravity well is half-cut.
        const sat = satellites[b];
        const stepFrac = 0.04 + angularity * 0.35;
        const ang = rng() * Math.PI * 2;
        const step = (0.4 + rng() * 0.6) * minDim * stepFrac;
        let nx = sat.baseX + Math.cos(ang) * step;
        let ny = sat.baseY + Math.sin(ang) * step;
        if (nx < width * 0.15) nx = width * 0.15;
        else if (nx > width * 0.85) nx = width * 0.85;
        if (ny < height * 0.15) ny = height * 0.15;
        else if (ny > height * 0.85) ny = height * 0.85;
        sat.baseX = nx;
        sat.baseY = ny;
        // Maybe flip to repulsive for SAT_REPEL_FRAMES — probability scales
        // with angularity so kiki gets explosive hits, bouba just pulls.
        if (satFlipProb > 0 && rng() < satFlipProb) {
          sat.repelFrames = SAT_REPEL_FRAMES;
        }
        // Kiki jerk: lateral impulse direction for particles in this
        // band's stripe, one frame only. Magnitude applied in update().
        if (kikiAmt > 0) pendingJerks[b] = rng() < 0.5 ? -1 : 1;
      }
    }
  }

  function update(rawLevels, rawFlux) {
    t++;
    for (let b = 0; b < 3; b++) {
      smoothLevels[b] += (rawLevels[b] - smoothLevels[b]) * LEVEL_SMOOTH;
    }
    detectOnsets(rawFlux);

    // Effective per-band well depths (sustained level + onset spike).
    const s0 = smoothLevels[0] + onset[0] * ONSET_BOOST;
    const s1 = smoothLevels[1] + onset[1] * ONSET_BOOST;
    const s2 = smoothLevels[2] + onset[2] * ONSET_BOOST;
    const bandStrength = [s0, s1, s2];

    // Satellites: drift around (walking) anchor; decay attract↔repel state.
    // Cache per-frame strengths (signed: + attract, − repel).
    for (let s = 0; s < satellites.length; s++) {
      const sat = satellites[s];
      sat.x = sat.baseX + Math.sin(t * sat.freqX + sat.phaseX) * satDriftAmp;
      sat.y = sat.baseY + Math.cos(t * sat.freqY + sat.phaseY) * satDriftAmp;
      if (sat.repelFrames > 0) sat.repelFrames--;
      const sign = sat.repelFrames > 0 ? -SAT_REPEL_GAIN : 1;
      sat.signedStrength = sign * bandStrength[sat.band];
    }

    rebuildGrid(grid, particles);
    const { cols, rows, cellSize, buckets } = grid;

    for (let i = 0; i < N_PARTICLES; i++) {
      const p = particles[i];
      let fx = 0;
      let fy = 0;

      // ── 1. Audio attraction toward each band's well ────────────────────
      // Soft Lorentzian: pull = dy * sigma² / (dy² + sigma²). Zero at the
      // centre (so a particle can settle there), peaks ~sigma/2 at one
      // sigma out, dies for distant particles.
      const dy0 = bandY[0] - p.y;
      const dy1 = bandY[1] - p.y;
      const dy2 = bandY[2] - p.y;
      let yWell = 0;
      yWell += s0 * dy0 * sigmaSqY / (dy0 * dy0 + sigmaSqY);
      yWell += s1 * dy1 * sigmaSqY / (dy1 * dy1 + sigmaSqY);
      yWell += s2 * dy2 * sigmaSqY / (dy2 * dy2 + sigmaSqY);
      // Normalise by sigmaY so attractGain stays roughly in px/frame
      // regardless of canvas height.
      fy += (yWell / sigmaY) * attractGain;

      // ── 2. Mutual repulsion via spatial grid ───────────────────────────
      // Check 3×3 cells around this particle's cell. Each pair contributes
      // a force ~1/(dist² + softening²) outward, with smooth cutoff at
      // REPEL_RADIUS so we don't snap when a neighbour crosses out.
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

      // ── 3. Roaming satellites ──────────────────────────────────────────
      // Each satellite contributes a 1/(dist² + softening²) force with a
      // smooth cutoff at SAT_RADIUS, signed by its current polarity (attract
      // when settled, repel during the post-onset flip).
      for (let s = 0; s < satellites.length; s++) {
        const sat = satellites[s];
        if (Math.abs(sat.signedStrength) < 0.01) continue;
        const sdx = sat.x - p.x;
        const sdy = sat.y - p.y;
        const sdist2 = sdx * sdx + sdy * sdy;
        if (sdist2 >= SAT_RADIUS_SQ) continue;
        const sCutoff = 1 - sdist2 / SAT_RADIUS_SQ;
        const sk = sat.signedStrength * SAT_GAIN * sCutoff / (sdist2 + SAT_SOFTENING_SQ);
        fx += sdx * sk;
        fy += sdy * sk;
      }

      // ── 4. Bouba rotational drift ──────────────────────────────────────
      // Tangential current around canvas centre. Active at low angularity,
      // off in the kiki regime. Rotation direction is fixed (CCW); could
      // be seeded if more variety is wanted later.
      if (boubaAmt > 0) {
        const dxC = p.x - cxCanvas;
        const dyC = p.y - cyCanvas;
        const dC = Math.sqrt(dxC * dxC + dyC * dyC) + 1;
        // Tangent = perpendicular to radial; magnitude doesn't grow with
        // radius so outer particles don't whip around faster than inner.
        fx += -dyC / dC * BOUBA_ROT_GAIN * boubaAmt;
        fy +=  dxC / dC * BOUBA_ROT_GAIN * boubaAmt;
      }

      // ── 5. Kiki onset jerk ─────────────────────────────────────────────
      // One-frame lateral impulse per band that just fired, applied to
      // particles inside that band's stripe. Damping carries it ~7 frames.
      if (kikiAmt > 0) {
        for (let b = 0; b < 3; b++) {
          if (pendingJerks[b] === 0) continue;
          if (Math.abs(bandY[b] - p.y) < sigmaY * 1.4) {
            fx += pendingJerks[b] * KIKI_JERK_MAG * kikiAmt;
          }
        }
      }

      // ── 6. Per-particle deterministic noise ────────────────────────────
      const tA = t * p.freqA * noiseSpeedScale;
      const tB = t * p.freqB * noiseSpeedScale;
      fx += Math.sin(tA + p.phaseA) * NOISE_AMP;
      fy += Math.cos(tB + p.phaseB) * NOISE_AMP;

      // ── 7. Soft edge spring + hard bounce backup ───────────────────────
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
  let debug = false;

  const BAND_COLORS = ['rgba(255,90,90,0.95)', 'rgba(90,170,255,0.95)', 'rgba(255,220,90,0.95)'];
  const BAND_LABELS = ['BASS', 'MID', 'TRBL'];

  // Drawn before the dots — the band stripes/lines + satellite halos are
  // background context and shouldn't obscure the particle layer.
  function drawDebugWells(ctx) {
    for (let b = 0; b < 3; b++) {
      const cy = bandY[b];
      const strength = smoothLevels[b] + onset[b] * 0.6;
      const stripeAlpha = Math.min(0.18, strength * 0.18);
      if (stripeAlpha > 0.005) {
        ctx.fillStyle = BAND_COLORS[b].replace('0.95', stripeAlpha.toFixed(3));
        ctx.fillRect(0, cy - sigmaY, width, sigmaY * 2);
      }
      const lineW = 1 + smoothLevels[b] * 8 + onset[b] * 14;
      ctx.fillStyle = BAND_COLORS[b];
      ctx.fillRect(0, cy - lineW / 2, width, lineW);
    }

    // Satellites: faint influence circle (full SAT_RADIUS) + a marker at
    // the centre. Filled circle = attract, hollow + diagonal slash = repel
    // (during the post-onset flip). Size pulses with band strength.
    for (let s = 0; s < satellites.length; s++) {
      const sat = satellites[s];
      const strength = smoothLevels[sat.band] + onset[sat.band] * 0.6;
      // Influence halo
      ctx.strokeStyle = BAND_COLORS[sat.band].replace('0.95', '0.10');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sat.x, sat.y, SAT_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      // Centre marker
      const r = 6 + strength * 14;
      const isRepel = sat.repelFrames > 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = BAND_COLORS[sat.band];
      ctx.beginPath();
      ctx.arc(sat.x, sat.y, r, 0, Math.PI * 2);
      if (isRepel) {
        // Hollow ring with a slash for repel
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sat.x - r, sat.y - r);
        ctx.lineTo(sat.x + r, sat.y + r);
        ctx.stroke();
      } else {
        // Filled disc for attract
        ctx.fillStyle = BAND_COLORS[sat.band].replace('0.95', '0.55');
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  // Drawn after the dots — sits on top so the readouts stay legible.
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
      ctx.fillStyle = BAND_COLORS[b];
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
    const half = DOT_SIZE / 2;
    for (let i = 0; i < N_PARTICLES; i++) {
      const p = particles[i];
      ctx.fillRect(p.x - half, p.y - half, DOT_SIZE, DOT_SIZE);
    }
    if (debug) drawDebugOverlay(ctx);
  }

  return { update, draw, reset, setDebug };
}
