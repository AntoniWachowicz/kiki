// Barebones particle prototype. Each particle is assigned ONE audio band and
// ONE attractor; its pull is gated by that attractor's `active` state, which
// is driven differently by mode:
//   kiki  — beat-triggered: attractors teleport + ignite on band peaks, then
//           decay. Dying attractors give their particles a scatter kick so
//           nothing slumps on the point.
//   bouba — continuously drifting positions, smoothed band energy as strength,
//           plus a rest radius so particles orbit instead of collapsing.
// White 2px dots on black. No palette, no trails — all tuning at the top.

// ── Shared dials ────────────────────────────────────────────────────────────
const N_PARTICLES = 300;
const NUM_BANDS = 3;          // 0 = bass, 1 = mid, 2 = treble
const DAMPING = 0.92;
const DOT_SIZE = 2;

// ── Kiki (angularity > 0.5): beat-triggered, snappy ─────────────────────────
const KIKI_PULL_GAIN = 1.1;
const KIKI_BEAT_THRESHOLD = 0.28;   // band energy above this fires a beat
const KIKI_ACTIVE_DECAY = 0.05;     // per frame — how fast a pulse fades
const KIKI_REFRACTORY = 6;          // frames before same band can re-trigger
const KIKI_KICK = 2.5;              // scatter velocity when an attractor dies

// ── Bouba (angularity ≤ 0.5): drifting, orbital ─────────────────────────────
const BOUBA_PULL_GAIN = 0.8;
const BOUBA_DRIFT_AMP = 0.10;       // fraction of min(width, height)
const BOUBA_DRIFT_FREQ = 0.012;     // per frame — slower = lazier
const BOUBA_ACTIVE_SMOOTH = 0.10;   // energy lerp toward current band value
const BOUBA_REST_RADIUS = 80;       // px — orbit radius, prevents collapse
// ────────────────────────────────────────────────────────────────────────────

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

export function createStippleSession(features, seed, width, height) {
  const rng = mulberry32(seed);
  const { complexity, angularity } = features;
  const isKiki = angularity > 0.5;

  // "Simpler / quieter music → fewer, stronger centers" is still the plan;
  // for now complexity just picks count. Floor at NUM_BANDS so every band has
  // at least one attractor.
  const numAttractors = Math.max(NUM_BANDS, Math.floor(NUM_BANDS + complexity * 3));
  const attractors = new Array(numAttractors);
  const offset = 1 + Math.floor(rng() * 97);
  for (let i = 0; i < numAttractors; i++) {
    const baseX = (0.1 + halton(i + offset, 2) * 0.8) * width;
    const baseY = (0.1 + halton(i + offset, 3) * 0.8) * height;
    attractors[i] = {
      x: baseX,
      y: baseY,
      baseX,
      baseY,
      band: i % NUM_BANDS,
      active: 0,
      phaseX: rng() * Math.PI * 2,
      phaseY: rng() * Math.PI * 2,
      driftScale: 0.6 + rng() * 0.8,
    };
  }

  const particles = new Array(N_PARTICLES);
  for (let i = 0; i < N_PARTICLES; i++) {
    particles[i] = {
      x: rng() * width,
      y: rng() * height,
      vx: 0,
      vy: 0,
      attractorIdx: Math.floor(rng() * numAttractors),
    };
  }

  const bandCooldown = [0, 0, 0];
  const prevActive = new Array(numAttractors).fill(0);
  let t = 0;

  function updateKiki(bands) {
    // Snapshot previous active levels so we can detect deaths (1→0 this frame)
    // and scatter particles that lose their attractor.
    for (let i = 0; i < numAttractors; i++) {
      prevActive[i] = attractors[i].active;
      attractors[i].active = Math.max(0, attractors[i].active - KIKI_ACTIVE_DECAY);
    }

    // Trigger: when a band's energy crosses the threshold and its cooldown is
    // clear, pick one attractor from that band, teleport it, light it up.
    for (let b = 0; b < NUM_BANDS; b++) {
      if (bandCooldown[b] > 0) bandCooldown[b]--;
      if (bandCooldown[b] === 0 && bands[b] > KIKI_BEAT_THRESHOLD) {
        let found = -1;
        // Unbiased choice among this band's attractors (linear scan — cheap).
        let count = 0;
        for (let i = 0; i < numAttractors; i++) {
          if (attractors[i].band === b) {
            count++;
            if (rng() < 1 / count) found = i;
          }
        }
        if (found >= 0) {
          const at = attractors[found];
          at.x = (0.1 + rng() * 0.8) * width;
          at.y = (0.1 + rng() * 0.8) * height;
          at.active = 1;
          bandCooldown[b] = KIKI_REFRACTORY;
        }
      }
    }

    for (let i = 0; i < N_PARTICLES; i++) {
      const p = particles[i];
      const a = attractors[p.attractorIdx];
      const dx = a.x - p.x;
      const dy = a.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 1;

      if (a.active > 0) {
        const f = a.active * KIKI_PULL_GAIN;
        p.vx += (dx / dist) * f;
        p.vy += (dy / dist) * f;
      } else if (prevActive[p.attractorIdx] > 0) {
        // Attractor just died: scatter this particle in a random direction so
        // it flies off rather than slumping on the dead point.
        const ang = rng() * Math.PI * 2;
        p.vx += Math.cos(ang) * KIKI_KICK;
        p.vy += Math.sin(ang) * KIKI_KICK;
      }

      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  function updateBouba(bands) {
    const driftAmp = Math.min(width, height) * BOUBA_DRIFT_AMP;

    for (let i = 0; i < numAttractors; i++) {
      const a = attractors[i];
      a.active += (bands[a.band] - a.active) * BOUBA_ACTIVE_SMOOTH;
      a.x = a.baseX + Math.sin(t * BOUBA_DRIFT_FREQ + a.phaseX) * driftAmp * a.driftScale;
      a.y = a.baseY + Math.cos(t * BOUBA_DRIFT_FREQ * 1.3 + a.phaseY) * driftAmp * a.driftScale;
    }

    for (let i = 0; i < N_PARTICLES; i++) {
      const p = particles[i];
      const a = attractors[p.attractorIdx];
      const dx = a.x - p.x;
      const dy = a.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 1;

      // Rest radius: pull when far, push when too close. Creates an orbital
      // equilibrium at BOUBA_REST_RADIUS/2, so particles don't pile up on the
      // attractor point.
      const sign = dist > BOUBA_REST_RADIUS ? 1 : (dist / BOUBA_REST_RADIUS) * 2 - 1;
      const f = a.active * BOUBA_PULL_GAIN * sign;
      p.vx += (dx / dist) * f;
      p.vy += (dy / dist) * f;

      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  function update(bands) {
    t++;
    if (isKiki) updateKiki(bands);
    else updateBouba(bands);
  }

  function draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    const half = DOT_SIZE / 2;
    for (let i = 0; i < N_PARTICLES; i++) {
      const p = particles[i];
      ctx.fillRect(p.x - half, p.y - half, DOT_SIZE, DOT_SIZE);
    }
  }

  return { update, draw };
}
