// Three alternative particle systems for the comparison view.
// All export the same session API: { update, draw, drawTraces, reset }
// update(rawLevels, rawFlux, rawCentroid, rawPitch)
//   rawLevels/rawFlux: [bass, mid, treble]  rawCentroid: [b,m,t]  rawPitch: [norm, conf]
//
// Designed for smaller canvases (400x400) and fewer particles (~80).

// ── Shared utilities ─────────────────────────────────────────────────────────

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
  let f = 1, r = 0, i = index;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}

const SHARED_DAMPING      = 0.92;
const SHARED_DAMPING_MAX  = 0.96;
const SHARED_DAMPING_VEL  = 0.025;
const SHARED_NOISE_BASE   = 0.009;
const SHARED_NOISE_FQ_MIN = 0.0020;
const SHARED_NOISE_FQ_MAX = 0.0070;
const SHARED_EDGE_MARGIN  = 12;
const SHARED_EDGE_FORCE   = 0.35;
const SHARED_EDGE_BOUNCE  = 0.4;
const SHARED_REPEL_GAIN   = 28;
const SHARED_REPEL_R      = 80;
const SHARED_REPEL_RSQ    = SHARED_REPEL_R * SHARED_REPEL_R;
const SHARED_REPEL_SOFT   = 25;
const SHARED_REPEL_SOFTSQ = SHARED_REPEL_SOFT * SHARED_REPEL_SOFT;
const FLOW_K      = 0.010;
const FLOW_T      = 0.0015;
const FLOW_AMP    = 0.50;
const LEVEL_SMOOTH       = 0.30;
const FLUX_BASE_SMOOTH   = 0.04;
const ONSET_DECAY        = 0.85;
const ONSET_REFRACT      = 10;
const TRACE_SPD_THRESH   = 0.8;
const TRACE_ALPHA        = 'rgba(255,255,255,0.07)';

function makeGrid(w, h, cell) {
  const cols = Math.max(1, Math.ceil(w / cell));
  const rows = Math.max(1, Math.ceil(h / cell));
  const buckets = new Array(cols * rows);
  for (let i = 0; i < buckets.length; i++) buckets[i] = [];
  return { cols, rows, cell, buckets };
}

function rebuildGrid(grid, pts, n) {
  const { cols, rows, cell, buckets } = grid;
  for (let i = 0; i < buckets.length; i++) buckets[i].length = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    let cx = Math.floor(p.x / cell); if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
    let cy = Math.floor(p.y / cell); if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
    buckets[cy * cols + cx].push(i);
  }
}

function applyRepulsion(pts, i, grid, fx, fy) {
  const p = pts[i];
  const { cols, rows, cell, buckets } = grid;
  let cx = Math.floor(p.x / cell); if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
  let cy = Math.floor(p.y / cell); if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1;
  let ax = fx, ay = fy;
  for (let dy = -1; dy <= 1; dy++) {
    const ny = cy + dy; if (ny < 0 || ny >= rows) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx; if (nx < 0 || nx >= cols) continue;
      const cell2 = buckets[ny * cols + nx];
      for (let k = 0; k < cell2.length; k++) {
        const j = cell2[k]; if (j === i) continue;
        const q = pts[j];
        const ddx = p.x - q.x, ddy = p.y - q.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < SHARED_REPEL_RSQ && d2 > 0.0001) {
          const cut = 1 - d2 / SHARED_REPEL_RSQ;
          const kk = SHARED_REPEL_GAIN * (q.repelScale || 1) * cut / (d2 + SHARED_REPEL_SOFTSQ);
          ax += ddx * kk; ay += ddy * kk;
        }
      }
    }
  }
  return [ax, ay];
}

function integrateParticle(p, fx, fy, w, h, overshoot) {
  const x0 = -overshoot, x1 = w + overshoot, y0 = -overshoot, y1 = h + overshoot;
  if (p.x < x0 + SHARED_EDGE_MARGIN) fx += (x0 + SHARED_EDGE_MARGIN - p.x) * SHARED_EDGE_FORCE;
  else if (p.x > x1 - SHARED_EDGE_MARGIN) fx -= (p.x - (x1 - SHARED_EDGE_MARGIN)) * SHARED_EDGE_FORCE;
  if (p.y < y0 + SHARED_EDGE_MARGIN) fy += (y0 + SHARED_EDGE_MARGIN - p.y) * SHARED_EDGE_FORCE;
  else if (p.y > y1 - SHARED_EDGE_MARGIN) fy -= (p.y - (y1 - SHARED_EDGE_MARGIN)) * SHARED_EDGE_FORCE;
  const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  const damp = Math.min(SHARED_DAMPING_MAX, SHARED_DAMPING + spd * SHARED_DAMPING_VEL);
  p.vx = (p.vx + fx) * damp;
  p.vy = (p.vy + fy) * damp;
  p.x += p.vx; p.y += p.vy;
  if (p.x < x0) { p.x = x0; p.vx =  Math.abs(p.vx) * SHARED_EDGE_BOUNCE; }
  else if (p.x > x1) { p.x = x1; p.vx = -Math.abs(p.vx) * SHARED_EDGE_BOUNCE; }
  if (p.y < y0) { p.y = y0; p.vy =  Math.abs(p.vy) * SHARED_EDGE_BOUNCE; }
  else if (p.y > y1) { p.y = y1; p.vy = -Math.abs(p.vy) * SHARED_EDGE_BOUNCE; }
}

function detectOnsets(smoothLevels, fluxBaseline, onset, onsetCooldown, rawFlux, sensitivity) {
  const fired = [false, false, false];
  for (let b = 0; b < 3; b++) {
    fluxBaseline[b] += (rawFlux[b] - fluxBaseline[b]) * FLUX_BASE_SMOOTH;
    onset[b] *= ONSET_DECAY;
    if (onsetCooldown[b] > 0) onsetCooldown[b]--;
    const threshold = fluxBaseline[b] * sensitivity + 0.012;
    if (onsetCooldown[b] === 0 && rawFlux[b] > threshold) {
      onset[b] = 1; onsetCooldown[b] = ONSET_REFRACT; fired[b] = true;
    }
  }
  return fired;
}

// ── System B: Topology ───────────────────────────────────────────────────────
// Replaces fixed satellite+stripe with N attractor nodes whose spatial
// arrangement encodes bouba/kiki. The topology itself IS the composition.
//
// Bouba: 3 nodes clustered near canvas centre, equal weights → central mass
// Kiki:  6 nodes at spread geometric positions, unequal weights → constellation
//
// Bass onset: one randomly-chosen node steps to a new position.
// Mid onset: weight of the most-active node shifts by ±0.3 (clamped [0.2, 1.8]).
// Treble: modulates field repulsion strength (sharpness of the field).

const TOPO_N_PARTICLES = 80;
const TOPO_NODE_ATTRACT = 260;
const TOPO_NODE_RADIUS  = 120;
const TOPO_NODE_SOFT    = 40;
const TOPO_NODE_SOFTSQ  = TOPO_NODE_SOFT * TOPO_NODE_SOFT;
const TOPO_BOUBA_NODES  = 3;
const TOPO_KIKI_NODES   = 6;
const TOPO_SLIDE_RATE   = 0.05;
const TOPO_BOUBA_CLUSTER_R = 0.22; // nodes within this fraction of half-canvas from centre
const TOPO_STEP_FRAC    = 0.18;

export function createTopologySession(features, seed, width, height) {
  const { angularity, complexity } = features;
  const boubaAmt = Math.max(0, 1 - angularity * 1.4);
  const noiseSpeedScale = 0.85 + complexity * 0.5;
  const fluxSensitivity = 1.2 + (1 - angularity) * 1.8;
  const minDim = Math.min(width, height);
  const cx = width / 2, cy = height / 2;
  const overshoot = Math.round(minDim * 0.04);

  const nNodes = Math.round(TOPO_BOUBA_NODES + angularity * (TOPO_KIKI_NODES - TOPO_BOUBA_NODES));
  const nodes = [];
  const smoothLevels  = [0, 0, 0];
  const fluxBaseline  = [0, 0, 0];
  const onset         = [0, 0, 0];
  const onsetCooldown = [0, 0, 0];
  const particles = new Array(TOPO_N_PARTICLES);
  const grid = makeGrid(width, height, SHARED_REPEL_R);
  let rng, t = 0;

  function initNodes() {
    nodes.length = 0;
    for (let i = 0; i < nNodes; i++) {
      let nx, ny;
      if (angularity < 0.5) {
        // Cluster near centre
        const r = TOPO_BOUBA_CLUSTER_R * minDim * (0.5 + rng() * 0.5);
        const a = rng() * Math.PI * 2;
        nx = cx + Math.cos(a) * r;
        ny = cy + Math.sin(a) * r;
      } else {
        // Scatter to geometric positions (golden-angle spread, biased to edges)
        const goldenAngle = 2.399963229728653;
        const a = i * goldenAngle;
        const r = minDim * (0.25 + (i / nNodes) * 0.30);
        nx = cx + Math.cos(a) * r;
        ny = cy + Math.sin(a) * r;
      }
      nx = Math.max(width * 0.1, Math.min(width * 0.9, nx));
      ny = Math.max(height * 0.1, Math.min(height * 0.9, ny));
      nodes.push({
        x: nx, y: ny,
        targetX: nx, targetY: ny,
        weight: angularity < 0.5 ? 1.0 : 0.4 + rng() * 1.4,
      });
    }
  }

  function reset() {
    rng = mulberry32(seed);
    t = 0;
    for (let b = 0; b < 3; b++) smoothLevels[b] = fluxBaseline[b] = onset[b] = onsetCooldown[b] = 0;
    initNodes();
    const off = 1 + Math.floor(rng() * 97);
    for (let i = 0; i < TOPO_N_PARTICLES; i++) {
      const px = (0.05 + halton(i + off, 2) * 0.9) * width;
      const py = (0.05 + halton(i + off, 3) * 0.9) * height;
      particles[i] = {
        x: px, y: py, prevX: px, prevY: py, vx: 0, vy: 0,
        freqA: SHARED_NOISE_FQ_MIN + rng() * (SHARED_NOISE_FQ_MAX - SHARED_NOISE_FQ_MIN),
        freqB: SHARED_NOISE_FQ_MIN + rng() * (SHARED_NOISE_FQ_MAX - SHARED_NOISE_FQ_MIN),
        phaseA: rng() * Math.PI * 2, phaseB: rng() * Math.PI * 2,
        repelScale: Math.exp(rng() * Math.log(16) - Math.log(6.67)),
        flowFreq: 0.002 + rng() * 0.003, flowPhase: rng() * Math.PI * 2,
      };
    }
  }

  function update(rawLevels, rawFlux, rawCentroid) {
    t++;
    for (let b = 0; b < 3; b++) smoothLevels[b] += (rawLevels[b] - smoothLevels[b]) * LEVEL_SMOOTH;
    const fired = detectOnsets(smoothLevels, fluxBaseline, onset, onsetCooldown, rawFlux, fluxSensitivity);
    const audioEnergy = (smoothLevels[0] + smoothLevels[1] + smoothLevels[2]) / 3;
    const trebleTension = Math.min(1, smoothLevels[2] * 1.2 + onset[2] * 0.3);
    const effectiveRepel = SHARED_REPEL_GAIN * (1 + trebleTension * 0.20);

    if (fired[0]) {
      // Move a randomly-selected node to a new position
      const ni = Math.floor(rng() * nNodes);
      const nd = nodes[ni];
      const stepFrac = TOPO_STEP_FRAC * (0.5 + angularity * 0.5);
      const a = rng() * Math.PI * 2;
      const step = (0.4 + rng() * 0.6) * minDim * stepFrac;
      nd.targetX = Math.max(width * 0.1, Math.min(width * 0.9, nd.targetX + Math.cos(a) * step));
      nd.targetY = Math.max(height * 0.1, Math.min(height * 0.9, nd.targetY + Math.sin(a) * step));
    }
    if (fired[1]) {
      // Shift the weight of the loudest node
      let bestW = -1, bestI = 0;
      for (let ni = 0; ni < nNodes; ni++) if (nodes[ni].weight > bestW) { bestW = nodes[ni].weight; bestI = ni; }
      nodes[bestI].weight = Math.max(0.2, Math.min(1.8, nodes[bestI].weight + (rng() < 0.5 ? 0.3 : -0.3)));
    }

    const s0 = smoothLevels[0] + onset[0] * 0.6;
    const s1 = smoothLevels[1] + onset[1] * 0.6;
    const flowTime  = t * FLOW_T;
    const flowTimeY = flowTime * 0.7;

    for (let ni = 0; ni < nNodes; ni++) {
      const nd = nodes[ni];
      nd.x += (nd.targetX - nd.x) * TOPO_SLIDE_RATE;
      nd.y += (nd.targetY - nd.y) * TOPO_SLIDE_RATE;
    }

    rebuildGrid(grid, particles, TOPO_N_PARTICLES);
    for (let i = 0; i < TOPO_N_PARTICLES; i++) {
      const p = particles[i];
      p.prevX = p.x; p.prevY = p.y;
      let fx = 0, fy = 0;

      // Attract toward every node, weighted by node.weight and band levels
      let totalW = 0;
      for (let ni = 0; ni < nNodes; ni++) totalW += nodes[ni].weight;
      for (let ni = 0; ni < nNodes; ni++) {
        const nd = nodes[ni];
        const ndx = nd.x - p.x, ndy = nd.y - p.y;
        const ndist2 = ndx * ndx + ndy * ndy;
        const effectiveR = TOPO_NODE_RADIUS * (1 + (ni % 2 === 0 ? s0 : s1) * 0.4);
        const effectiveRSQ = effectiveR * effectiveR;
        if (ndist2 >= effectiveRSQ) continue;
        const cut = 1 - ndist2 / effectiveRSQ;
        const w = (nd.weight / Math.max(0.01, totalW)) * nNodes;
        const k = (s0 * 0.5 + s1 * 0.5 + 0.15) * TOPO_NODE_ATTRACT * w * cut / (ndist2 + TOPO_NODE_SOFTSQ);
        fx += ndx * k; fy += ndy * k;
      }

      // Mutual repulsion
      let [rx, ry] = applyRepulsion(particles, i, grid, 0, 0);
      // re-scale repulsion with treble tension
      rx *= effectiveRepel / SHARED_REPEL_GAIN;
      ry *= effectiveRepel / SHARED_REPEL_GAIN;
      fx += rx; fy += ry;

      // Curl flow
      const pulse = Math.max(0, Math.sin(t * p.flowFreq + p.flowPhase));
      if (pulse > 0) {
        const fxA = p.x * FLOW_K + flowTime, fyA = p.y * FLOW_K - flowTimeY;
        const flowMag = (FLOW_AMP * 0.6 + audioEnergy * 0.4) * pulse;
        fx += -Math.sin(fxA) * Math.sin(fyA) * flowMag;
        fy += -Math.cos(fxA) * Math.cos(fyA) * flowMag;
      }

      // Bouba rotational drift
      if (boubaAmt > 0) {
        const dxC = p.x - cx, dyC = p.y - cy;
        const dC = Math.sqrt(dxC * dxC + dyC * dyC) + 1;
        fx += -dyC / dC * 0.025 * boubaAmt;
        fy +=  dxC / dC * 0.025 * boubaAmt;
      }

      // Organic noise
      fx += Math.sin(t * p.freqA * noiseSpeedScale + p.phaseA) * SHARED_NOISE_BASE;
      fy += Math.cos(t * p.freqB * noiseSpeedScale + p.phaseB) * SHARED_NOISE_BASE;

      integrateParticle(p, fx, fy, width, height, overshoot);
    }
  }

  function draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    // Draw node markers (faint rings)
    for (let ni = 0; ni < nNodes; ni++) {
      const nd = nodes[ni];
      const r = 4 + nd.weight * 6 + smoothLevels[ni % 3] * 10;
      ctx.strokeStyle = `rgba(255,255,255,${(0.15 + nd.weight * 0.08).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    for (let i = 0; i < TOPO_N_PARTICLES; i++) {
      const p = particles[i];
      ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2);
    }
  }

  function drawTraces(ctx) {
    ctx.strokeStyle = TRACE_ALPHA;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < TOPO_N_PARTICLES; i++) {
      const p = particles[i];
      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (spd < TRACE_SPD_THRESH) continue;
      ctx.moveTo(p.prevX, p.prevY);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  reset();
  const _s = [0, 0, 0];
  for (let _i = 0; _i < 120; _i++) update(_s, _s, [0.5, 0.5, 0.5]);

  return { update, draw, drawTraces, reset };
}

// ── System C: Formations ─────────────────────────────────────────────────────
// Particles have states: free | forming | dissolving.
// Audio onsets create discrete structural events:
//   Bouba bass onset → gather ~12 free particles into a blob formation that
//     orbits a shared centroid for ~40 frames, then dissolves.
//   Kiki bass onset → pick a random axis spine, repel particles near it
//     outward sharply for 5 frames ("crack"), then let them re-attract.
//   Mid onset → weaken any active formation (particles leak back to free).
//   Treble → field tension (same as topology system).

const FORM_N_PARTICLES    = 80;
const FORM_BLOB_SIZE      = 12;
const FORM_BLOB_ORBIT_R   = 30;
const FORM_BLOB_LIFE      = 45;
const FORM_BLOB_COHESION  = 0.15;
const FORM_DISSOLVE_RATE  = 0.04;
const FORM_CRACK_LIFE     = 6;
const FORM_CRACK_IMPULSE  = 2.8;
const FORM_CRACK_WIDTH    = 25;
const FORM_ATTRACT_GAIN   = 180;
const FORM_ATTRACT_R      = 100;
const FORM_ATTRACT_SOFT   = 35;
const FORM_ATTRACT_SOFTSQ = FORM_ATTRACT_SOFT * FORM_ATTRACT_SOFT;

const ST_FREE     = 0;
const ST_FORMING  = 1;
const ST_DISSOLVE = 2;

export function createFormationsSession(features, seed, width, height) {
  const { angularity, complexity } = features;
  const boubaAmt = Math.max(0, 1 - angularity * 1.4);
  const kikiAmt  = Math.max(0, angularity - 0.3) * 1.4;
  const noiseSpeedScale = 0.85 + complexity * 0.5;
  const fluxSensitivity = 1.2 + (1 - angularity) * 1.8;
  const minDim = Math.min(width, height);
  const cx = width / 2, cy = height / 2;
  const overshoot = Math.round(minDim * 0.04);

  const smoothLevels  = [0, 0, 0];
  const fluxBaseline  = [0, 0, 0];
  const onset         = [0, 0, 0];
  const onsetCooldown = [0, 0, 0];
  const particles = new Array(FORM_N_PARTICLES);
  const grid = makeGrid(width, height, SHARED_REPEL_R);
  // Active blobs: { cx, cy, life, maxLife }
  const blobs = [];
  // Active cracks: { nx, ny, px, py (normal + point on spine), life }
  const cracks = [];
  let rng, t = 0;
  // Roaming attraction well driven by bass
  let wellX = cx, wellY = cy, wellTargetX = cx, wellTargetY = cy, wellStrength = 0;

  function reset() {
    rng = mulberry32(seed);
    t = 0;
    blobs.length = 0; cracks.length = 0;
    for (let b = 0; b < 3; b++) smoothLevels[b] = fluxBaseline[b] = onset[b] = onsetCooldown[b] = 0;
    wellX = wellTargetX = (0.3 + rng() * 0.4) * width;
    wellY = wellTargetY = (0.3 + rng() * 0.4) * height;
    wellStrength = 0;
    const off = 1 + Math.floor(rng() * 97);
    for (let i = 0; i < FORM_N_PARTICLES; i++) {
      const px = (0.05 + halton(i + off, 2) * 0.9) * width;
      const py = (0.05 + halton(i + off, 3) * 0.9) * height;
      particles[i] = {
        x: px, y: py, prevX: px, prevY: py, vx: 0, vy: 0,
        state: ST_FREE, blobIdx: -1,
        freqA: SHARED_NOISE_FQ_MIN + rng() * (SHARED_NOISE_FQ_MAX - SHARED_NOISE_FQ_MIN),
        freqB: SHARED_NOISE_FQ_MIN + rng() * (SHARED_NOISE_FQ_MAX - SHARED_NOISE_FQ_MIN),
        phaseA: rng() * Math.PI * 2, phaseB: rng() * Math.PI * 2,
        repelScale: Math.exp(rng() * Math.log(16) - Math.log(6.67)),
        flowFreq: 0.002 + rng() * 0.003, flowPhase: rng() * Math.PI * 2,
        orbitAngle: rng() * Math.PI * 2, orbitR: FORM_BLOB_ORBIT_R * (0.5 + rng() * 0.8),
      };
    }
  }

  function spawnBlob() {
    // Find free particles closest to the well
    const candidates = [];
    for (let i = 0; i < FORM_N_PARTICLES; i++) {
      if (particles[i].state !== ST_FREE) continue;
      const p = particles[i];
      const d2 = (p.x - wellX) * (p.x - wellX) + (p.y - wellY) * (p.y - wellY);
      candidates.push({ i, d2 });
    }
    candidates.sort((a, b) => a.d2 - b.d2);
    const n = Math.min(FORM_BLOB_SIZE, candidates.length);
    if (n < 4) return;
    let blobCx = 0, blobCy = 0;
    const members = [];
    for (let k = 0; k < n; k++) { blobCx += particles[candidates[k].i].x; blobCy += particles[candidates[k].i].y; members.push(candidates[k].i); }
    blobCx /= n; blobCy /= n;
    const blobIdx = blobs.length;
    blobs.push({ cx: blobCx, cy: blobCy, life: FORM_BLOB_LIFE, maxLife: FORM_BLOB_LIFE });
    for (const pi of members) {
      particles[pi].state = ST_FORMING;
      particles[pi].blobIdx = blobIdx;
      particles[pi].orbitAngle = rng() * Math.PI * 2;
      particles[pi].orbitR = FORM_BLOB_ORBIT_R * (0.4 + rng() * 0.9);
    }
  }

  function spawnCrack() {
    // Random axis through canvas centre
    const a = rng() * Math.PI;
    cracks.push({ nx: Math.cos(a + Math.PI / 2), ny: Math.sin(a + Math.PI / 2), px: cx, py: cy, life: FORM_CRACK_LIFE, maxLife: FORM_CRACK_LIFE });
  }

  function update(rawLevels, rawFlux, rawCentroid) {
    t++;
    for (let b = 0; b < 3; b++) smoothLevels[b] += (rawLevels[b] - smoothLevels[b]) * LEVEL_SMOOTH;
    const fired = detectOnsets(smoothLevels, fluxBaseline, onset, onsetCooldown, rawFlux, fluxSensitivity);
    const audioEnergy = (smoothLevels[0] + smoothLevels[1] + smoothLevels[2]) / 3;
    const trebleTension = Math.min(1, smoothLevels[2] * 1.2 + onset[2] * 0.3);
    const s0 = smoothLevels[0] + onset[0] * 0.6;
    const s1 = smoothLevels[1] + onset[1] * 0.6;
    const flowTime  = t * FLOW_T;
    const flowTimeY = flowTime * 0.7;

    // Update well
    if (fired[0]) {
      const a = rng() * Math.PI * 2;
      const step = minDim * 0.12 * (0.5 + angularity * 0.5);
      wellTargetX = Math.max(width * 0.15, Math.min(width * 0.85, wellTargetX + Math.cos(a) * step));
      wellTargetY = Math.max(height * 0.15, Math.min(height * 0.85, wellTargetY + Math.sin(a) * step));
      if (boubaAmt > 0.3) spawnBlob(); else spawnCrack();
    }
    if (fired[1]) {
      // Weaken all active blobs (leak rate)
      for (const b of blobs) b.life = Math.max(0, b.life - 12);
    }
    wellX += (wellTargetX - wellX) * 0.06;
    wellY += (wellTargetY - wellY) * 0.06;
    wellStrength = s0;

    // Age blobs
    for (let bi = blobs.length - 1; bi >= 0; bi--) {
      const bl = blobs[bi];
      bl.life--;
      if (bl.life <= 0) {
        for (let i = 0; i < FORM_N_PARTICLES; i++) {
          if (particles[i].blobIdx === bi) { particles[i].state = ST_DISSOLVE; }
        }
        blobs.splice(bi, 1);
        // Re-index blobIdx for particles assigned to later blobs
        for (let i = 0; i < FORM_N_PARTICLES; i++) {
          if (particles[i].blobIdx > bi) particles[i].blobIdx--;
        }
      }
    }
    // Age cracks
    for (let ci = cracks.length - 1; ci >= 0; ci--) {
      cracks[ci].life--;
      if (cracks[ci].life <= 0) cracks.splice(ci, 1);
    }
    // Dissolving → free
    for (let i = 0; i < FORM_N_PARTICLES; i++) {
      if (particles[i].state === ST_DISSOLVE && rng() < FORM_DISSOLVE_RATE) {
        particles[i].state = ST_FREE;
        particles[i].blobIdx = -1;
      }
    }

    rebuildGrid(grid, particles, FORM_N_PARTICLES);
    for (let i = 0; i < FORM_N_PARTICLES; i++) {
      const p = particles[i];
      p.prevX = p.x; p.prevY = p.y;
      let fx = 0, fy = 0;

      if (p.state === ST_FORMING && p.blobIdx >= 0 && p.blobIdx < blobs.length) {
        // Orbit the blob centroid
        const bl = blobs[p.blobIdx];
        const lifeRatio = bl.life / bl.maxLife;
        p.orbitAngle += 0.04 * (1 + kikiAmt * 0.5);
        const tx = bl.cx + Math.cos(p.orbitAngle) * p.orbitR;
        const ty = bl.cy + Math.sin(p.orbitAngle) * p.orbitR;
        fx += (tx - p.x) * FORM_BLOB_COHESION * lifeRatio;
        fy += (ty - p.y) * FORM_BLOB_COHESION * lifeRatio;
      } else {
        // Bass well attraction for free/dissolving particles
        if (wellStrength > 0.01) {
          const wdx = wellX - p.x, wdy = wellY - p.y;
          const wd2 = wdx * wdx + wdy * wdy;
          const effR = FORM_ATTRACT_R * (1 + wellStrength * 0.3);
          if (wd2 < effR * effR) {
            const cut = 1 - wd2 / (effR * effR);
            const k = wellStrength * FORM_ATTRACT_GAIN * cut / (wd2 + FORM_ATTRACT_SOFTSQ);
            fx += wdx * k; fy += wdy * k;
          }
        }
      }

      // Crack impulses (kiki)
      for (const crack of cracks) {
        const lifeRatio = crack.life / crack.maxLife;
        const dpx = p.x - crack.px, dpy = p.y - crack.py;
        const proj = dpx * crack.nx + dpy * crack.ny;
        if (Math.abs(proj) < FORM_CRACK_WIDTH) {
          const tang = dpx * (-crack.ny) + dpy * crack.nx;
          const impulse = FORM_CRACK_IMPULSE * kikiAmt * lifeRatio * (1 - Math.abs(proj) / FORM_CRACK_WIDTH);
          fx += crack.nx * impulse * Math.sign(proj + 0.001);
          fy += crack.ny * impulse * Math.sign(proj + 0.001);
        }
      }

      // Repulsion
      const [rx, ry] = applyRepulsion(particles, i, grid, 0, 0);
      fx += rx; fy += ry;

      // Curl flow
      const pulse = Math.max(0, Math.sin(t * p.flowFreq + p.flowPhase));
      if (pulse > 0) {
        const fxA = p.x * FLOW_K + flowTime, fyA = p.y * FLOW_K - flowTimeY;
        const flowMag = (FLOW_AMP * 0.5 + audioEnergy * 0.35) * pulse;
        fx += -Math.sin(fxA) * Math.sin(fyA) * flowMag;
        fy += -Math.cos(fxA) * Math.cos(fyA) * flowMag;
      }

      // Bouba rotation
      if (boubaAmt > 0) {
        const dxC = p.x - cx, dyC = p.y - cy;
        const dC = Math.sqrt(dxC * dxC + dyC * dyC) + 1;
        fx += -dyC / dC * 0.025 * boubaAmt;
        fy +=  dxC / dC * 0.025 * boubaAmt;
      }

      fx += Math.sin(t * p.freqA * noiseSpeedScale + p.phaseA) * SHARED_NOISE_BASE;
      fy += Math.cos(t * p.freqB * noiseSpeedScale + p.phaseB) * SHARED_NOISE_BASE;

      integrateParticle(p, fx, fy, width, height, overshoot);
    }

    // Update blob centroids to match actual particle positions
    for (let bi = 0; bi < blobs.length; bi++) {
      let bx = 0, by = 0, n = 0;
      for (let i = 0; i < FORM_N_PARTICLES; i++) {
        if (particles[i].blobIdx === bi) { bx += particles[i].x; by += particles[i].y; n++; }
      }
      if (n > 0) { blobs[bi].cx = bx / n; blobs[bi].cy = by / n; }
    }
  }

  function draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    // Draw blob centroids as faint rings
    for (const bl of blobs) {
      const alpha = (bl.life / bl.maxLife) * 0.18;
      ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bl.cx, bl.cy, FORM_BLOB_ORBIT_R, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    for (let i = 0; i < FORM_N_PARTICLES; i++) {
      const p = particles[i];
      const sz = p.state === ST_FORMING ? 2 : 1.5;
      ctx.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
    }
  }

  function drawTraces(ctx) {
    ctx.strokeStyle = TRACE_ALPHA;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < FORM_N_PARTICLES; i++) {
      const p = particles[i];
      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (spd < TRACE_SPD_THRESH) continue;
      ctx.moveTo(p.prevX, p.prevY);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  reset();
  const _s = [0, 0, 0];
  for (let _i = 0; _i < 120; _i++) update(_s, _s, [0.5, 0.5, 0.5]);

  return { update, draw, drawTraces, reset };
}

// ── System D: Memory ─────────────────────────────────────────────────────────
// A 24×24 heat grid decays each frame. Particles add heat to their cell.
//   Bouba: heat attracts — particles drift toward hot regions (blobs accumulate)
//   Kiki:  heat repels  — particles flee recently occupied cells (always dispersing)
//
// Treble: shortens heat decay time (higher turnover, fresher trails).
// Bass onset: sudden heat spike at the current well position.
// Mid onset: grid-wide heat decay spike (clears memory faster in kiki mode).

const MEM_N_PARTICLES  = 80;
const MEM_GRID_SIZE    = 24;
const MEM_HEAT_DECAY   = 0.985;
const MEM_HEAT_ADD     = 0.12;
const MEM_HEAT_GAIN_BOUBA = 140;
const MEM_HEAT_GAIN_KIKI  = 80;
const MEM_HEAT_SPIKE   = 0.6;
const MEM_ATTRACT_R    = 100;
const MEM_ATTRACT_SOFT = 35;
const MEM_ATTRACT_SOFTSQ = MEM_ATTRACT_SOFT * MEM_ATTRACT_SOFT;

export function createMemorySession(features, seed, width, height) {
  const { angularity, complexity } = features;
  const boubaAmt = Math.max(0, 1 - angularity * 1.4);
  const kikiSign = angularity > 0.5 ? -1 : 1; // +1 attracts, -1 repels
  const noiseSpeedScale = 0.85 + complexity * 0.5;
  const fluxSensitivity = 1.2 + (1 - angularity) * 1.8;
  const minDim = Math.min(width, height);
  const cx = width / 2, cy = height / 2;
  const overshoot = Math.round(minDim * 0.04);
  const cellW = width  / MEM_GRID_SIZE;
  const cellH = height / MEM_GRID_SIZE;

  const heat = new Float32Array(MEM_GRID_SIZE * MEM_GRID_SIZE);
  const smoothLevels  = [0, 0, 0];
  const fluxBaseline  = [0, 0, 0];
  const onset         = [0, 0, 0];
  const onsetCooldown = [0, 0, 0];
  const particles = new Array(MEM_N_PARTICLES);
  const grid = makeGrid(width, height, SHARED_REPEL_R);
  let wellX = cx, wellY = cy, wellTargetX = cx, wellTargetY = cy, wellStrength = 0;
  let rng, t = 0;

  function reset() {
    rng = mulberry32(seed);
    t = 0;
    heat.fill(0);
    for (let b = 0; b < 3; b++) smoothLevels[b] = fluxBaseline[b] = onset[b] = onsetCooldown[b] = 0;
    wellX = wellTargetX = (0.3 + rng() * 0.4) * width;
    wellY = wellTargetY = (0.3 + rng() * 0.4) * height;
    wellStrength = 0;
    const off = 1 + Math.floor(rng() * 97);
    for (let i = 0; i < MEM_N_PARTICLES; i++) {
      const px = (0.05 + halton(i + off, 2) * 0.9) * width;
      const py = (0.05 + halton(i + off, 3) * 0.9) * height;
      particles[i] = {
        x: px, y: py, prevX: px, prevY: py, vx: 0, vy: 0,
        freqA: SHARED_NOISE_FQ_MIN + rng() * (SHARED_NOISE_FQ_MAX - SHARED_NOISE_FQ_MIN),
        freqB: SHARED_NOISE_FQ_MIN + rng() * (SHARED_NOISE_FQ_MAX - SHARED_NOISE_FQ_MIN),
        phaseA: rng() * Math.PI * 2, phaseB: rng() * Math.PI * 2,
        repelScale: Math.exp(rng() * Math.log(16) - Math.log(6.67)),
        flowFreq: 0.002 + rng() * 0.003, flowPhase: rng() * Math.PI * 2,
      };
    }
  }

  function getHeat(gx, gy) {
    if (gx < 0 || gx >= MEM_GRID_SIZE || gy < 0 || gy >= MEM_GRID_SIZE) return 0;
    return heat[gy * MEM_GRID_SIZE + gx];
  }

  function update(rawLevels, rawFlux, rawCentroid) {
    t++;
    for (let b = 0; b < 3; b++) smoothLevels[b] += (rawLevels[b] - smoothLevels[b]) * LEVEL_SMOOTH;
    const fired = detectOnsets(smoothLevels, fluxBaseline, onset, onsetCooldown, rawFlux, fluxSensitivity);
    const audioEnergy = (smoothLevels[0] + smoothLevels[1] + smoothLevels[2]) / 3;
    const trebleTension = Math.min(1, smoothLevels[2] * 1.2 + onset[2] * 0.3);
    const s0 = smoothLevels[0] + onset[0] * 0.6;
    const flowTime  = t * FLOW_T;
    const flowTimeY = flowTime * 0.7;

    if (fired[0]) {
      // Move well + spike heat at current well position
      const a = rng() * Math.PI * 2;
      const step = minDim * 0.14;
      wellTargetX = Math.max(width * 0.12, Math.min(width * 0.88, wellTargetX + Math.cos(a) * step));
      wellTargetY = Math.max(height * 0.12, Math.min(height * 0.88, wellTargetY + Math.sin(a) * step));
      const gx = Math.floor(wellX / cellW), gy = Math.floor(wellY / cellH);
      if (gx >= 0 && gx < MEM_GRID_SIZE && gy >= 0 && gy < MEM_GRID_SIZE) {
        heat[gy * MEM_GRID_SIZE + gx] = Math.min(1, heat[gy * MEM_GRID_SIZE + gx] + MEM_HEAT_SPIKE);
        // Spread to neighbours
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = gx + dx, ny = gy + dy;
          if (nx >= 0 && nx < MEM_GRID_SIZE && ny >= 0 && ny < MEM_GRID_SIZE)
            heat[ny * MEM_GRID_SIZE + nx] = Math.min(1, heat[ny * MEM_GRID_SIZE + nx] + MEM_HEAT_SPIKE * 0.4);
        }
      }
    }
    if (fired[1]) {
      // Decay spike: clear memory faster
      for (let k = 0; k < heat.length; k++) heat[k] *= 0.6;
    }
    wellX += (wellTargetX - wellX) * 0.06;
    wellY += (wellTargetY - wellY) * 0.06;
    wellStrength = s0;

    // Decay heat (treble speeds it up slightly)
    const decay = MEM_HEAT_DECAY - trebleTension * 0.015;
    for (let k = 0; k < heat.length; k++) heat[k] *= decay;

    // Add heat at each particle's grid cell, proportional to its speed
    for (let i = 0; i < MEM_N_PARTICLES; i++) {
      const p = particles[i];
      const gx = Math.floor(p.x / cellW), gy = Math.floor(p.y / cellH);
      if (gx >= 0 && gx < MEM_GRID_SIZE && gy >= 0 && gy < MEM_GRID_SIZE) {
        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        heat[gy * MEM_GRID_SIZE + gx] = Math.min(1, heat[gy * MEM_GRID_SIZE + gx] + MEM_HEAT_ADD * (0.3 + spd * 0.5) * (0.5 + audioEnergy));
      }
    }

    rebuildGrid(grid, particles, MEM_N_PARTICLES);
    for (let i = 0; i < MEM_N_PARTICLES; i++) {
      const p = particles[i];
      p.prevX = p.x; p.prevY = p.y;
      let fx = 0, fy = 0;

      // Heat gradient force — bilinear sample the heat grid for smooth force
      const gxF = p.x / cellW - 0.5, gyF = p.y / cellH - 0.5;
      const gx0 = Math.floor(gxF), gy0 = Math.floor(gyF);
      const tx = gxF - gx0, ty = gyF - gy0;
      const h00 = getHeat(gx0,   gy0),   h10 = getHeat(gx0+1, gy0);
      const h01 = getHeat(gx0,   gy0+1), h11 = getHeat(gx0+1, gy0+1);
      const hx0 = h00 + (h10 - h00) * tx, hx1 = h01 + (h11 - h01) * tx;
      const gradX = ((getHeat(gx0+1, gy0) - getHeat(gx0-1, gy0)) * (1 - ty) +
                     (getHeat(gx0+1, gy0+1) - getHeat(gx0-1, gy0+1)) * ty) * 0.5;
      const gradY = ((getHeat(gx0, gy0+1) - getHeat(gx0, gy0-1)) * (1 - tx) +
                     (getHeat(gx0+1, gy0+1) - getHeat(gx0+1, gy0-1)) * tx) * 0.5;
      const localHeat = hx0 + (hx1 - hx0) * ty;
      const heatGain = angularity > 0.5 ? MEM_HEAT_GAIN_KIKI : MEM_HEAT_GAIN_BOUBA;
      fx += gradX * kikiSign * heatGain * (0.3 + audioEnergy * 0.7);
      fy += gradY * kikiSign * heatGain * (0.3 + audioEnergy * 0.7);

      // Bass well attraction (light — the heat does most of the work)
      if (wellStrength > 0.01) {
        const wdx = wellX - p.x, wdy = wellY - p.y;
        const wd2 = wdx * wdx + wdy * wdy;
        const effR = MEM_ATTRACT_R;
        if (wd2 < effR * effR) {
          const cut = 1 - wd2 / (effR * effR);
          const k = wellStrength * 120 * cut / (wd2 + MEM_ATTRACT_SOFTSQ);
          fx += wdx * k; fy += wdy * k;
        }
      }

      // Repulsion
      const [rx, ry] = applyRepulsion(particles, i, grid, 0, 0);
      fx += rx; fy += ry;

      // Curl flow
      const pulse = Math.max(0, Math.sin(t * p.flowFreq + p.flowPhase));
      if (pulse > 0) {
        const fxA = p.x * FLOW_K + flowTime, fyA = p.y * FLOW_K - flowTimeY;
        const flowMag = (FLOW_AMP * 0.5 + audioEnergy * 0.4) * pulse;
        fx += -Math.sin(fxA) * Math.sin(fyA) * flowMag;
        fy += -Math.cos(fxA) * Math.cos(fyA) * flowMag;
      }

      // Bouba rotation
      if (boubaAmt > 0) {
        const dxC = p.x - cx, dyC = p.y - cy;
        const dC = Math.sqrt(dxC * dxC + dyC * dyC) + 1;
        fx += -dyC / dC * 0.025 * boubaAmt;
        fy +=  dxC / dC * 0.025 * boubaAmt;
      }

      fx += Math.sin(t * p.freqA * noiseSpeedScale + p.phaseA) * SHARED_NOISE_BASE;
      fy += Math.cos(t * p.freqB * noiseSpeedScale + p.phaseB) * SHARED_NOISE_BASE;

      integrateParticle(p, fx, fy, width, height, overshoot);
    }
  }

  function draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    // Draw heat grid as faint overlay (helps understand what the field is doing)
    for (let gy = 0; gy < MEM_GRID_SIZE; gy++) {
      for (let gx = 0; gx < MEM_GRID_SIZE; gx++) {
        const h = heat[gy * MEM_GRID_SIZE + gx];
        if (h < 0.03) continue;
        const alpha = Math.min(0.18, h * 0.22);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.fillRect(gx * cellW, gy * cellH, cellW, cellH);
      }
    }
    ctx.fillStyle = '#fff';
    for (let i = 0; i < MEM_N_PARTICLES; i++) {
      const p = particles[i];
      ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2);
    }
  }

  function drawTraces(ctx) {
    ctx.strokeStyle = TRACE_ALPHA;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < MEM_N_PARTICLES; i++) {
      const p = particles[i];
      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (spd < TRACE_SPD_THRESH) continue;
      ctx.moveTo(p.prevX, p.prevY);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  reset();
  const _s = [0, 0, 0];
  for (let _i = 0; _i < 120; _i++) update(_s, _s, [0.5, 0.5, 0.5]);

  return { update, draw, drawTraces, reset };
}
