import { Delaunay } from 'd3-delaunay';

export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

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

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x, y, seed, octaves = 4) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 131);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function hslToRgb(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return [
    Math.round(f(0) * 255),
    Math.round(f(8) * 255),
    Math.round(f(4) * 255),
  ];
}

function rgbStr(rgb) {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function polarize(x) {
  return 0.5 + 0.5 * Math.tanh((x - 0.5) * 10);
}

function buildPalette(features, rng, visualAngularity) {
  const { warmth, brightness, saturation } = features;
  const warmHue = 0.05;
  const coolHue = 0.60;
  const baseHue = coolHue + (warmHue - coolHue) * warmth;

  const baseL = 0.28 + brightness * 0.52;
  const chroma = 0.2 + saturation * 0.7;

  const bg = hslToRgb(baseHue, chroma * 0.35, Math.max(0.04, baseL * 0.18));

  // Kiki = high per-cell contrast, bouba = tight lightness band. This makes
  // angularity visible in the palette itself, not just in the geometry.
  const lSpread = 0.08 + visualAngularity * 0.55;
  const sSpread = 0.06 + visualAngularity * 0.3;
  const hSpread = 0.05 + visualAngularity * 0.25;

  const cells = [];
  for (let i = 0; i < 6; i++) {
    const hShift = (rng() - 0.5) * hSpread;
    const lShift = (rng() - 0.5) * lSpread;
    const sShift = (rng() - 0.5) * sSpread;
    cells.push(
      hslToRgb(
        baseHue + hShift,
        Math.max(0, Math.min(1, chroma + sShift)),
        Math.max(0.05, Math.min(0.95, baseL + lShift))
      )
    );
  }

  const accent = hslToRgb(
    baseHue,
    Math.min(1, chroma * 1.2),
    Math.min(0.95, baseL * 1.3 + 0.1)
  );

  return { bg, cells, accent };
}

function jitteredGrid(n, width, height, rng) {
  const aspect = width / height;
  const rows = Math.max(1, Math.round(Math.sqrt(n / aspect)));
  const cols = Math.max(1, Math.round(n / rows));
  const cellW = width / cols;
  const cellH = height / rows;
  const sites = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const jx = (rng() - 0.5) * cellW * 0.9;
      const jy = (rng() - 0.5) * cellH * 0.9;
      sites.push({
        x: (c + 0.5) * cellW + jx,
        y: (r + 0.5) * cellH + jy,
      });
    }
  }
  return sites;
}

function applySymmetry(points, axes, width, height) {
  if (axes <= 1) return points;
  const cx = width / 2;
  const cy = height / 2;
  const wedge = (Math.PI * 2) / axes;

  const wedgePoints = [];
  for (const p of points) {
    const ang = Math.atan2(p.y - cy, p.x - cx);
    const a = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (a < wedge) wedgePoints.push(p);
  }
  if (wedgePoints.length === 0) return points;

  const out = [];
  for (let k = 0; k < axes; k++) {
    const theta = wedge * k;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    for (const p of wedgePoints) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      out.push({
        x: cx + dx * cos - dy * sin,
        y: cy + dx * sin + dy * cos,
      });
    }
  }
  return out;
}

function applyDomainWarp(points, amp, scale, seed) {
  if (amp < 0.5) return points;
  const out = new Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const nx = fbm(p.x * scale, p.y * scale, seed);
    const ny = fbm(p.x * scale + 37.3, p.y * scale + 91.7, seed + 7);
    out[i] = { x: p.x + nx * amp, y: p.y + ny * amp };
  }
  return out;
}

function polygonCentroid(poly) {
  let x = 0;
  let y = 0;
  let area = 0;
  const n = poly.length - 1;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % n];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-9) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      sx += poly[i][0];
      sy += poly[i][1];
    }
    return [sx / n, sy / n];
  }
  return [x / (6 * area), y / (6 * area)];
}

function applyLloyd(points, width, height, iterations) {
  if (iterations <= 0) return points;
  let pts = points.slice();
  for (let iter = 0; iter < iterations; iter++) {
    const flat = new Float64Array(pts.length * 2);
    for (let i = 0; i < pts.length; i++) {
      flat[i * 2] = pts[i].x;
      flat[i * 2 + 1] = pts[i].y;
    }
    const delaunay = new Delaunay(flat);
    const voronoi = delaunay.voronoi([0, 0, width, height]);
    const next = new Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      const poly = voronoi.cellPolygon(i);
      if (!poly || poly.length < 3) {
        next[i] = pts[i];
        continue;
      }
      const c = polygonCentroid(poly);
      next[i] = { x: c[0], y: c[1] };
    }
    pts = next;
  }
  return pts;
}

export function deriveStaticState(features, seed, width = 1024, height = 1024) {
  const rng = mulberry32(seed);
  const { angularity, complexity, texture, rhythm } = features;

  // Steepen angularity around 0.5 so mid-range audio commits to one mode
  // visually. Small differences in the raw feature become large visual
  // differences.
  const a = polarize(angularity);

  // Cell count: angularity is the primary driver. Bouba sits around 80
  // large cells, kiki around 1000+ shards — roughly a 10:1 ratio at the
  // extremes. Complexity only modulates the kiki side so bouba stays sparse.
  const targetN = Math.floor(80 + a * 920 + a * complexity * 100);

  // Distribution: blend from jittered grid (bouba) to pure random (kiki).
  const gridSites = jitteredGrid(targetN, width, height, rng);
  let sites = gridSites.map((p) => {
    if (a <= 0) return p;
    const rx = rng() * width;
    const ry = rng() * height;
    return {
      x: p.x * (1 - a) + rx * a,
      y: p.y * (1 - a) + ry * a,
    };
  });

  // Twin sites: for angular inputs, place extra sites very close to existing
  // ones. Close pairs force long thin sliver cells between their neighbours,
  // reading as spikes/shards.
  if (a > 0.2) {
    const twinCount = Math.floor(sites.length * (a - 0.2) * 1.2);
    const spawn = [];
    for (let i = 0; i < twinCount; i++) {
      const parent = sites[Math.floor(rng() * sites.length)];
      const dx = (rng() - 0.5) * 6;
      const dy = (rng() - 0.5) * 6;
      spawn.push({ x: parent.x + dx, y: parent.y + dy });
    }
    sites = sites.concat(spawn);
  }

  const symmetryAxes = 1 + Math.floor(rhythm * 6);
  sites = applySymmetry(sites, symmetryAxes, width, height);

  const minDim = Math.min(width, height);
  const warpAmp = texture * minDim * 0.12;
  const warpScale = 1.5 / minDim;
  sites = applyDomainWarp(sites, warpAmp, warpScale, seed);

  // Lloyd regularizes the bouba side hard. Skip entirely on the kiki side.
  const lloydIters = a < 0.5 ? Math.max(2, Math.floor((1 - a * 2) * 6)) : 0;
  sites = applyLloyd(sites, width, height, lloydIters);

  sites = sites.filter(
    (p) => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height && Number.isFinite(p.x) && Number.isFinite(p.y)
  );
  if (sites.length < 4) {
    sites = jitteredGrid(50, width, height, rng);
  }

  const flat = new Float64Array(sites.length * 2);
  for (let i = 0; i < sites.length; i++) {
    flat[i * 2] = sites[i].x;
    flat[i * 2 + 1] = sites[i].y;
  }
  const delaunay = new Delaunay(flat);

  const palette = buildPalette(features, rng, a);

  const cellSize = Math.sqrt((width * height) / sites.length);
  // Stroke is the load-bearing bouba knob: thick round-joined strokes in bg
  // colour erode sharp corners into foam/pebble shapes. Kiki gets nothing.
  const strokeWidth = Math.pow(1 - a, 1.5) * cellSize * 0.38;

  const baseSites = new Array(sites.length);
  for (let i = 0; i < sites.length; i++) {
    baseSites[i] = {
      x: sites[i].x,
      y: sites[i].y,
      phaseX: rng() * Math.PI * 2,
      phaseY: rng() * Math.PI * 2,
      driftAmp: (0.3 + rng() * 0.7) * cellSize * 0.18,
    };
  }

  return {
    width,
    height,
    bounds: [0, 0, width, height],
    delaunay,
    baseSites,
    palette,
    style: {
      strokeWidth,
      lineJoin: a < 0.5 ? 'round' : 'miter',
      lineCap: a < 0.5 ? 'round' : 'butt',
    },
    noise: {
      scale: 1 / (cellSize * 5),
      seed: (seed + 42) >>> 0,
    },
    symmetryAxes,
  };
}

export function deriveFrameState(staticState, t = 0) {
  const { delaunay, baseSites } = staticState;
  const pts = delaunay.points;

  if (t !== 0) {
    for (let i = 0; i < baseSites.length; i++) {
      const b = baseSites[i];
      pts[i * 2] = b.x + Math.sin(t * 0.7 + b.phaseX) * b.driftAmp;
      pts[i * 2 + 1] = b.y + Math.cos(t * 0.6 + b.phaseY) * b.driftAmp;
    }
    delaunay.update();
  }

  const voronoi = delaunay.voronoi(staticState.bounds);
  return {
    ...staticState,
    voronoi,
    siteCount: baseSites.length,
  };
}

export function draw(ctx, frame) {
  const { width, height, voronoi, palette, style, noise, siteCount } = frame;
  const pts = voronoi.delaunay.points;

  ctx.fillStyle = rgbStr(palette.bg);
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < siteCount; i++) {
    const poly = voronoi.cellPolygon(i);
    if (!poly || poly.length < 3) continue;

    const sx = pts[i * 2];
    const sy = pts[i * 2 + 1];
    const nv = fbm(sx * noise.scale, sy * noise.scale, noise.seed);
    const t = (nv + 1) / 2;
    const idx = Math.max(0, Math.min(palette.cells.length - 1, Math.floor(t * palette.cells.length)));
    const color = palette.cells[idx];

    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let k = 1; k < poly.length; k++) {
      ctx.lineTo(poly[k][0], poly[k][1]);
    }
    ctx.closePath();
    ctx.fillStyle = rgbStr(color);
    ctx.fill();
  }
}
