/**
 * Angularity Analysis Module
 * Computes angularity score using multi-scale analysis to separate form from texture
 */

/**
 * Downsample image data by a factor
 */
const downsample = (data, width, height, factor) => {
  const newWidth = Math.floor(width / factor);
  const newHeight = Math.floor(height / factor);
  const newData = new Uint8ClampedArray(newWidth * newHeight * 4);

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
      let count = 0;

      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const srcX = x * factor + dx;
          const srcY = y * factor + dy;
          if (srcX < width && srcY < height) {
            const srcIdx = (srcY * width + srcX) * 4;
            sumR += data[srcIdx];
            sumG += data[srcIdx + 1];
            sumB += data[srcIdx + 2];
            sumA += data[srcIdx + 3];
            count++;
          }
        }
      }

      const dstIdx = (y * newWidth + x) * 4;
      newData[dstIdx] = sumR / count;
      newData[dstIdx + 1] = sumG / count;
      newData[dstIdx + 2] = sumB / count;
      newData[dstIdx + 3] = sumA / count;
    }
  }

  return { data: newData, width: newWidth, height: newHeight };
};

/**
 * Build edge map with gradient magnitude and direction
 */
const buildEdgeMap = (data, width, height) => {
  const edgeMap = new Float32Array(width * height);
  const edgeDir = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const center = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

      const rightIdx = (y * width + (x + 1)) * 4;
      const right = (data[rightIdx] + data[rightIdx + 1] + data[rightIdx + 2]) / 3;

      const bottomIdx = ((y + 1) * width + x) * 4;
      const bottom = (data[bottomIdx] + data[bottomIdx + 1] + data[bottomIdx + 2]) / 3;

      const gx = center - right;
      const gy = center - bottom;

      edgeMap[y * width + x] = Math.sqrt(gx * gx + gy * gy);
      edgeDir[y * width + x] = Math.atan2(gy, gx);
    }
  }

  return { edgeMap, edgeDir };
};

/**
 * METRIC 1: Direction Clustering
 * Measures how clustered edge directions are into few bins.
 * HIGH = angular (edges in few directions like a square)
 * LOW = organic (edges in all directions like a circle)
 */
const computeDirectionClustering = (edgeMap, edgeDir, width, height, threshold) => {
  const numBins = 8;
  const bins = new Array(numBins).fill(0);
  let totalEdges = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (edgeMap[y * width + x] > threshold) {
        const angle = edgeDir[y * width + x];
        const normalized = (angle + Math.PI) % (2 * Math.PI);
        const bin = Math.floor((normalized / (2 * Math.PI)) * numBins) % numBins;
        bins[bin]++;
        totalEdges++;
      }
    }
  }

  if (totalEdges < 30) {
    return 0.5;
  }

  // Top 2 bins concentration
  const sortedBins = [...bins].sort((a, b) => b - a);
  const topBinsSum = sortedBins[0] + sortedBins[1];
  const clusteringRatio = topBinsSum / totalEdges;

  // Scale: 0.25 (even spread) -> 0, 1.0 (all in 2 bins) -> 1
  return Math.min(Math.max((clusteringRatio - 0.25) / 0.75, 0), 1);
};

/**
 * METRIC 2: Edge Contrast (NEW - replaces Edge Discontinuity)
 * Measures the sharpness/crispness of edges.
 * HIGH = crisp, high-contrast edges = kiki
 * LOW = soft, gradual edges = bouba
 *
 * This directly responds to sharpening (increases contrast) and blurring (decreases contrast)
 */
const computeEdgeContrast = (edgeMap, width, height, threshold) => {
  let totalMagnitude = 0;
  let edgeCount = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const mag = edgeMap[y * width + x];
      if (mag > threshold) {
        totalMagnitude += mag;
        edgeCount++;
      }
    }
  }

  if (edgeCount < 30) {
    return 0.5;
  }

  // Average edge magnitude
  const avgMagnitude = totalMagnitude / edgeCount;

  // Normalize: typical range is 20-80, map to 0-1
  // Low magnitude (~20-30) = soft edges = bouba
  // High magnitude (~60-80+) = crisp edges = kiki
  return Math.min(Math.max((avgMagnitude - 20) / 60, 0), 1);
};

/**
 * METRIC 3: Direction Change Sharpness
 * Measures sharp direction changes along edges.
 * HIGH = sharp corners = kiki
 * LOW = smooth curves = bouba
 */
const computeDirectionChangeSharpness = (edgeMap, edgeDir, width, height, threshold) => {
  let totalChecked = 0;
  let sharpChanges = 0;
  const sharpThreshold = Math.PI / 4; // 45°

  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      if (edgeMap[y * width + x] <= threshold) continue;

      const currentDir = edgeDir[y * width + x];

      const neighbors = [
        { dy: -1, dx: 0 },
        { dy: 1, dx: 0 },
        { dy: 0, dx: -1 },
        { dy: 0, dx: 1 },
      ];

      for (const { dy, dx } of neighbors) {
        const ny = y + dy;
        const nx = x + dx;

        if (edgeMap[ny * width + nx] <= threshold) continue;

        const neighborDir = edgeDir[ny * width + nx];

        let diff = Math.abs(currentDir - neighborDir);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;

        totalChecked++;

        if (diff > sharpThreshold) {
          sharpChanges++;
        }
      }
    }
  }

  if (totalChecked < 30) {
    return 0.5;
  }

  const sharpRatio = sharpChanges / totalChecked;
  return Math.min(sharpRatio / 0.35, 1);
};

/**
 * Compute angularity metrics for a single scale
 */
const computeScaleMetrics = (data, width, height) => {
  const threshold = 15; // Lowered threshold for better sensitivity
  const { edgeMap, edgeDir } = buildEdgeMap(data, width, height);

  return {
    directionClustering: computeDirectionClustering(edgeMap, edgeDir, width, height, threshold),
    edgeContrast: computeEdgeContrast(edgeMap, width, height, threshold),
    directionChangeSharpness: computeDirectionChangeSharpness(edgeMap, edgeDir, width, height, threshold)
  };
};

/**
 * Compute overall angularity score using multi-scale analysis
 *
 * Analyzes at 3 scales:
 * - Scale 1 (original): Fine detail
 * - Scale 2 (1/2): Medium structure
 * - Scale 3 (1/4): Overall form/silhouette
 *
 * Coarser scales weighted more for form, but fine scale still contributes
 * to capture edge crispness which is important for kiki perception.
 */
export const computeAngularity = (data, width, height) => {
  // Skip multi-scale for very small images
  if (width < 100 || height < 100) {
    const metrics = computeScaleMetrics(data, width, height);
    const angularity =
      metrics.directionClustering * 0.30 +
      metrics.edgeContrast * 0.35 +
      metrics.directionChangeSharpness * 0.35;

    return {
      angularity: Math.min(Math.max(angularity, 0), 1),
      ...metrics,
      scaleWeights: { fine: 1, medium: 0, coarse: 0 }
    };
  }

  // Scale 1: Original (fine detail + edge crispness)
  const scale1 = computeScaleMetrics(data, width, height);

  // Scale 2: Half size (medium structure)
  const down2 = downsample(data, width, height, 2);
  const scale2 = computeScaleMetrics(down2.data, down2.width, down2.height);

  // Scale 3: Quarter size (overall form)
  const down4 = downsample(data, width, height, 4);
  const scale3 = computeScaleMetrics(down4.data, down4.width, down4.height);

  // Scale weights - balanced to capture both form and crispness
  // Edge Contrast heavily weighted to fine scale (where sharpness from filters is visible)
  // Direction metrics use more coarse scale (where form dominates)

  const directionClustering =
    scale1.directionClustering * 0.20 +
    scale2.directionClustering * 0.35 +
    scale3.directionClustering * 0.45;

  // Edge contrast heavily weighted toward fine scale - this is where crispness shows
  // and where sharpening/blurring filters have their primary effect
  const edgeContrast =
    scale1.edgeContrast * 0.80 +
    scale2.edgeContrast * 0.15 +
    scale3.edgeContrast * 0.05;

  const directionChangeSharpness =
    scale1.directionChangeSharpness * 0.20 +
    scale2.directionChangeSharpness * 0.35 +
    scale3.directionChangeSharpness * 0.45;

  // Combine metrics into final score
  // Edge contrast gets higher weight since it directly responds to sharpening/blurring
  const angularity =
    directionClustering * 0.25 +
    edgeContrast * 0.50 +
    directionChangeSharpness * 0.25;

  // Log scale breakdown for debugging
  console.log('Multi-scale analysis:', {
    fine: {
      clustering: (scale1.directionClustering * 100).toFixed(1) + '%',
      contrast: (scale1.edgeContrast * 100).toFixed(1) + '%',
      sharpness: (scale1.directionChangeSharpness * 100).toFixed(1) + '%'
    },
    medium: {
      clustering: (scale2.directionClustering * 100).toFixed(1) + '%',
      contrast: (scale2.edgeContrast * 100).toFixed(1) + '%',
      sharpness: (scale2.directionChangeSharpness * 100).toFixed(1) + '%'
    },
    coarse: {
      clustering: (scale3.directionClustering * 100).toFixed(1) + '%',
      contrast: (scale3.edgeContrast * 100).toFixed(1) + '%',
      sharpness: (scale3.directionChangeSharpness * 100).toFixed(1) + '%'
    },
    blended: {
      clustering: (directionClustering * 100).toFixed(1) + '%',
      contrast: (edgeContrast * 100).toFixed(1) + '%',
      sharpness: (directionChangeSharpness * 100).toFixed(1) + '%'
    }
  });

  return {
    angularity: Math.min(Math.max(angularity, 0), 1),
    directionClustering,
    edgeContrast,
    directionChangeSharpness,
    scales: {
      fine: scale1,
      medium: scale2,
      coarse: scale3
    }
  };
};
