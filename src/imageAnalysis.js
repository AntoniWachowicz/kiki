/**
 * Image Analysis Module
 * Analyzes visual properties of images for sound generation
 */

import { computeAngularity } from './angularityAnalysis';

/**
 * Sample a point on the canvas and return brightness/angularity
 */
const samplePoint = (data, canvas, x, y) => {
  if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
    return { brightness: 0, angularity: 0 };
  }

  const idx = (y * canvas.width + x) * 4;
  const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3 / 255;

  let localEdge = 0;
  let edgeCount = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height) {
        const nidx = (ny * canvas.width + nx) * 4;
        const nbrightness = (data[nidx] + data[nidx + 1] + data[nidx + 2]) / 3;
        localEdge += Math.abs(brightness * 255 - nbrightness);
        edgeCount++;
      }
    }
  }
  const angularity = Math.min(localEdge / edgeCount / 30, 1);

  return { brightness, angularity };
};

/**
 * Sample using brightness pathfinding method
 */
const sampleBrightness = (data, canvas, numSamples) => {
  const visited = new Set();
  let maxBright = -1;
  let startX = 0, startY = 0;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4;
      const bright = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (bright > maxBright) {
        maxBright = bright;
        startX = x;
        startY = y;
      }
    }
  }

  const samples = [{ ...samplePoint(data, canvas, startX, startY), x: startX, y: startY }];
  visited.add(`${startX},${startY}`);

  for (let i = 1; i < numSamples; i++) {
    let nextBright = -1;
    let nextX = 0, nextY = 0;

    for (let y = 0; y < canvas.height; y += 4) {
      for (let x = 0; x < canvas.width; x += 4) {
        const key = `${x},${y}`;
        if (visited.has(key)) continue;

        let minDist = Infinity;
        for (const vkey of visited) {
          const [vx, vy] = vkey.split(',').map(Number);
          const dist = Math.sqrt((x - vx) ** 2 + (y - vy) ** 2);
          minDist = Math.min(minDist, dist);
        }

        if (minDist < 20) continue;

        const idx = (y * canvas.width + x) * 4;
        const bright = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        if (bright > nextBright) {
          nextBright = bright;
          nextX = x;
          nextY = y;
        }
      }
    }

    samples.push({ ...samplePoint(data, canvas, nextX, nextY), x: nextX, y: nextY });
    visited.add(`${nextX},${nextY}`);
  }

  return samples;
};

/**
 * Sample using edge following method
 */
const sampleEdges = (data, canvas, numSamples) => {
  const edgePoints = [];

  for (let y = 1; y < canvas.height - 1; y += 2) {
    for (let x = 1; x < canvas.width - 1; x += 2) {
      const idx = (y * canvas.width + x) * 4;
      const center = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

      const rightIdx = (y * canvas.width + (x + 1)) * 4;
      const right = (data[rightIdx] + data[rightIdx + 1] + data[rightIdx + 2]) / 3;

      const bottomIdx = ((y + 1) * canvas.width + x) * 4;
      const bottom = (data[bottomIdx] + data[bottomIdx + 1] + data[bottomIdx + 2]) / 3;

      const gradient = Math.abs(center - right) + Math.abs(center - bottom);

      if (gradient > 30) {
        edgePoints.push({ x, y, strength: gradient });
      }
    }
  }

  edgePoints.sort((a, b) => b.strength - a.strength);

  const samples = [];
  const step = Math.max(1, Math.floor(edgePoints.length / numSamples));
  for (let i = 0; i < numSamples && i * step < edgePoints.length; i++) {
    const point = edgePoints[i * step];
    samples.push({ ...samplePoint(data, canvas, point.x, point.y), x: point.x, y: point.y });
  }

  while (samples.length < numSamples) {
    const x = Math.floor(Math.random() * canvas.width);
    const y = Math.floor(Math.random() * canvas.height);
    samples.push({ ...samplePoint(data, canvas, x, y), x, y });
  }

  return samples;
};

/**
 * Sample using scattered pattern method
 */
const sampleScattered = (data, canvas, numSamples) => {
  const pattern = [
    [0.1, 0.1], [0.3, 0.2], [0.6, 0.15], [0.9, 0.25],
    [0.2, 0.4], [0.5, 0.35], [0.8, 0.45], [0.15, 0.6],
    [0.4, 0.55], [0.7, 0.65], [0.25, 0.75], [0.55, 0.8],
    [0.85, 0.75], [0.35, 0.9], [0.65, 0.95], [0.45, 0.5]
  ];

  const samples = [];
  pattern.forEach(([px, py]) => {
    const x = Math.floor(px * canvas.width);
    const y = Math.floor(py * canvas.height);
    samples.push({ ...samplePoint(data, canvas, x, y), x, y });
  });

  return samples;
};

/**
 * Sample using region-based method (4x4 grid)
 */
const sampleRegions = (data, canvas) => {
  const samples = [];
  const gridSize = 4;
  const cellWidth = Math.floor(canvas.width / gridSize);
  const cellHeight = Math.floor(canvas.height / gridSize);

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      let sumBrightness = 0;
      let sumEdge = 0;
      let count = 0;

      const startX = gx * cellWidth;
      const startY = gy * cellHeight;
      const endX = Math.min((gx + 1) * cellWidth, canvas.width);
      const endY = Math.min((gy + 1) * cellHeight, canvas.height);

      for (let y = startY; y < endY; y += 2) {
        for (let x = startX; x < endX; x += 2) {
          const sample = samplePoint(data, canvas, x, y);
          sumBrightness += sample.brightness;
          sumEdge += sample.angularity;
          count++;
        }
      }

      // Center of this grid cell
      const centerX = Math.floor(startX + (endX - startX) / 2);
      const centerY = Math.floor(startY + (endY - startY) / 2);

      samples.push({
        brightness: sumBrightness / count,
        angularity: sumEdge / count,
        x: centerX,
        y: centerY
      });
    }
  }

  return samples;
};

/**
 * Main image analysis function
 * @param {HTMLCanvasElement} canvas - Canvas containing the image
 * @param {string} samplingMethod - One of: 'brightness', 'edges', 'random', 'regions'
 * @returns {Object} Analysis results with all properties
 * @throws {Error} If canvas is invalid or analysis fails
 */
export const analyzeImage = (canvas, samplingMethod = 'brightness') => {
  try {
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Invalid canvas element provided');
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas 2D context');
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    if (data.length === 0) {
      throw new Error('Canvas contains no image data');
    }

    // Calculate overall brightness
    let totalBrightness = 0;
    let pixelCount = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const bright = (r + g + b) / 3;
      totalBrightness += bright;
      pixelCount++;
    }

    const brightness = totalBrightness / pixelCount / 255;

    // Compute angularity using the dedicated module
    const angularityResult = computeAngularity(data, canvas.width, canvas.height);
    const angularity = angularityResult.angularity;

    // Log sub-metrics for debugging
    console.log('Angularity breakdown:', {
      total: (angularity * 100).toFixed(1) + '%',
      directionClustering: (angularityResult.directionClustering * 100).toFixed(1) + '%',
      edgeContrast: (angularityResult.edgeContrast * 100).toFixed(1) + '%',
      directionChangeSharpness: (angularityResult.directionChangeSharpness * 100).toFixed(1) + '%'
    });

    // Color extraction
    let totalR = 0, totalG = 0, totalB = 0;
    let colorPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      totalR += data[i];
      totalG += data[i + 1];
      totalB += data[i + 2];
      colorPixels++;
    }

    const avgR = totalR / colorPixels / 255;
    const avgG = totalG / colorPixels / 255;
    const avgB = totalB / colorPixels / 255;

    const warmth = (avgR - avgB);
    const saturation = Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB);

    // Texture/grain analysis
    let highFreqDetail = 0;
    let detailCount = 0;

    for (let y = 2; y < canvas.height - 2; y += 2) {
      for (let x = 2; x < canvas.width - 2; x += 2) {
        const idx = (y * canvas.width + x) * 4;
        const centerBright = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

        let localVariation = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nidx = ((y + dy) * canvas.width + (x + dx)) * 4;
            const nBright = (data[nidx] + data[nidx + 1] + data[nidx + 2]) / 3;
            localVariation += Math.abs(centerBright - nBright);
          }
        }

        highFreqDetail += localVariation / 8;
        detailCount++;
      }
    }

    const texture = Math.min(highFreqDetail / detailCount / 30, 1);

    // Sample image based on method
    const numSamples = 16;
    let samples = [];

    switch (samplingMethod) {
      case 'brightness':
        samples = sampleBrightness(data, canvas, numSamples);
        break;
      case 'edges':
        samples = sampleEdges(data, canvas, numSamples);
        break;
      case 'random':
        samples = sampleScattered(data, canvas, numSamples);
        break;
      case 'regions':
        samples = sampleRegions(data, canvas);
        break;
      default:
        throw new Error(`Unknown sampling method: ${samplingMethod}`);
    }

    // Normalize brightness
    const brightnesses = samples.map(s => s.brightness);
    const minBright = Math.min(...brightnesses);
    const maxBright = Math.max(...brightnesses);
    const range = maxBright - minBright;

    let segmentData;
    if (range > 0.01) {
      segmentData = samples.map(s => ({
        brightness: (s.brightness - minBright) / range,
        angularity: s.angularity
      }));
    } else {
      segmentData = samples;
    }

    // Calculate rhythm and complexity
    let brightnessVariation = 0;
    for (let i = 1; i < segmentData.length; i++) {
      brightnessVariation += Math.abs(segmentData[i].brightness - segmentData[i-1].brightness);
    }
    const rhythm = brightnessVariation / (segmentData.length - 1);

    let brightnessStdDev = 0;
    let angularityStdDev = 0;
    const avgSegBrightness = segmentData.reduce((sum, s) => sum + s.brightness, 0) / segmentData.length;
    const avgSegAngularity = segmentData.reduce((sum, s) => sum + s.angularity, 0) / segmentData.length;

    for (let seg of segmentData) {
      brightnessStdDev += Math.pow(seg.brightness - avgSegBrightness, 2);
      angularityStdDev += Math.pow(seg.angularity - avgSegAngularity, 2);
    }
    brightnessStdDev = Math.sqrt(brightnessStdDev / segmentData.length);
    angularityStdDev = Math.sqrt(angularityStdDev / segmentData.length);

    const complexity = Math.min((brightnessStdDev + angularityStdDev) * 3, 1);

    // Extract sampling coordinates for visualization
    const samplingPoints = samples.map(s => ({ x: s.x, y: s.y }));

    // Calculate brightness histogram for visualization
    const histogram = [];
    const histogramBins = 32;
    for (let i = 0; i < histogramBins; i++) {
      histogram[i] = 0;
    }

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const bright = (r + g + b) / 3;
      const binIndex = Math.min(Math.floor((bright / 255) * histogramBins), histogramBins - 1);
      histogram[binIndex]++;
    }

    // Normalize histogram
    const maxHistogramValue = Math.max(...histogram);
    const normalizedHistogram = histogram.map(v => v / maxHistogramValue);

    return {
      brightness,
      angularity,
      complexity,
      rhythm,
      warmth,
      saturation,
      texture,
      segmentData,
      samplingPoints,
      histogram: normalizedHistogram,
      // Expose sub-metrics for potential UI display
      angularityMetrics: {
        directionClustering: angularityResult.directionClustering,
        edgeContrast: angularityResult.edgeContrast,
        directionChangeSharpness: angularityResult.directionChangeSharpness
      }
    };
  } catch (error) {
    console.error('Image analysis failed:', error);
    throw new Error(`Image analysis failed: ${error.message}`);
  }
};
