/**
 * Visualization Utilities Module
 * Helper functions for visualizing analysis data on canvas and in charts
 */

/**
 * Draw sampling points on a canvas overlay
 * @param {HTMLCanvasElement} canvas - Canvas to draw on
 * @param {Array<{x: number, y: number}>} points - Array of {x, y} coordinates
 */
export const drawSamplingPoints = (canvas, points) => {
  if (!canvas || !points || points.length === 0) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();

  points.forEach((point, index) => {
    const { x, y } = point;

    // White filled circle
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // 1px black border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Black number
    ctx.fillStyle = '#000';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), x, y);
  });

  ctx.restore();
};

/**
 * Clear sampling point overlays from canvas
 * Useful if you want to redraw the image without points
 * @param {HTMLCanvasElement} canvas - Canvas to clear
 * @param {HTMLImageElement} image - Original image to redraw
 */
export const clearSamplingPoints = (canvas, image) => {
  if (!canvas || !image) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
};

/**
 * Calculate histogram data for brightness distribution
 * @param {Uint8ClampedArray} imageData - Raw image data from canvas
 * @param {number} bins - Number of histogram bins (default: 32)
 * @returns {Array<number>} Histogram counts for each bin
 */
export const calculateBrightnessHistogram = (imageData, bins = 32) => {
  const histogram = new Array(bins).fill(0);

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const brightness = (r + g + b) / 3;

    // Map brightness (0-255) to bin index
    const binIndex = Math.min(Math.floor((brightness / 255) * bins), bins - 1);
    histogram[binIndex]++;
  }

  // Normalize to 0-1 range
  const maxCount = Math.max(...histogram);
  if (maxCount > 0) {
    return histogram.map(count => count / maxCount);
  }

  return histogram;
};

/**
 * Calculate RGB color histogram
 * @param {Uint8ClampedArray} imageData - Raw image data from canvas
 * @param {number} bins - Number of histogram bins per channel (default: 16)
 * @returns {Object} Histograms for r, g, b channels
 */
export const calculateColorHistogram = (imageData, bins = 16) => {
  const histR = new Array(bins).fill(0);
  const histG = new Array(bins).fill(0);
  const histB = new Array(bins).fill(0);

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];

    const binR = Math.min(Math.floor((r / 255) * bins), bins - 1);
    const binG = Math.min(Math.floor((g / 255) * bins), bins - 1);
    const binB = Math.min(Math.floor((b / 255) * bins), bins - 1);

    histR[binR]++;
    histG[binG]++;
    histB[binB]++;
  }

  // Normalize
  const maxR = Math.max(...histR);
  const maxG = Math.max(...histG);
  const maxB = Math.max(...histB);

  return {
    r: maxR > 0 ? histR.map(c => c / maxR) : histR,
    g: maxG > 0 ? histG.map(c => c / maxG) : histG,
    b: maxB > 0 ? histB.map(c => c / maxB) : histB
  };
};
