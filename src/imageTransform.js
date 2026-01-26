/**
 * Image Transformation Module
 * Transforms images to change their angularity characteristics
 */

/**
 * Apply Gaussian blur using separable convolution
 * Reduces edge sharpness and direction changes (makes image more "bouba")
 */
const applyBlur = (imageData, radius) => {
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data.length);

  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  const sigma = radius / 2;
  let sum = 0;

  for (let i = 0; i < size; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < size; i++) {
    kernel[i] /= sum;
  }

  // Horizontal pass
  const temp = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < size; k++) {
        const nx = Math.min(width - 1, Math.max(0, x + k - radius));
        const idx = (y * width + nx) * 4;
        r += data[idx] * kernel[k];
        g += data[idx + 1] * kernel[k];
        b += data[idx + 2] * kernel[k];
      }
      const outIdx = (y * width + x) * 4;
      temp[outIdx] = r;
      temp[outIdx + 1] = g;
      temp[outIdx + 2] = b;
      temp[outIdx + 3] = data[outIdx + 3];
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < size; k++) {
        const ny = Math.min(height - 1, Math.max(0, y + k - radius));
        const idx = (ny * width + x) * 4;
        r += temp[idx] * kernel[k];
        g += temp[idx + 1] * kernel[k];
        b += temp[idx + 2] * kernel[k];
      }
      const outIdx = (y * width + x) * 4;
      output[outIdx] = r;
      output[outIdx + 1] = g;
      output[outIdx + 2] = b;
      output[outIdx + 3] = temp[outIdx + 3];
    }
  }

  return new ImageData(output, width, height);
};

/**
 * Apply unsharp mask sharpening
 * Enhances edges and direction changes (makes image more "kiki")
 */
const applySharpen = (imageData, amount) => {
  const { width, height, data } = imageData;
  const blurred = applyBlur(imageData, 2);
  const blurData = blurred.data;
  const output = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const original = data[i + c];
      const blur = blurData[i + c];
      const sharpened = original + (original - blur) * amount;
      output[i + c] = Math.max(0, Math.min(255, sharpened));
    }
    output[i + 3] = data[i + 3];
  }

  return new ImageData(output, width, height);
};

/**
 * Apply local contrast enhancement
 * Increases local edge strength which affects direction change detection
 */
const applyLocalContrast = (imageData, strength) => {
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data.length);
  output.set(data);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      // Calculate local average
      let sumR = 0, sumG = 0, sumB = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nidx = ((y + dy) * width + (x + dx)) * 4;
          sumR += data[nidx];
          sumG += data[nidx + 1];
          sumB += data[nidx + 2];
          count++;
        }
      }

      const avgR = sumR / count;
      const avgG = sumG / count;
      const avgB = sumB / count;

      // Push away from local average
      output[idx] = Math.max(0, Math.min(255, data[idx] + (data[idx] - avgR) * strength));
      output[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + (data[idx + 1] - avgG) * strength));
      output[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + (data[idx + 2] - avgB) * strength));
    }
  }

  return new ImageData(output, width, height);
};

/**
 * Apply edge-aware smoothing (simplified bilateral-like filter)
 * Smooths while somewhat preserving strong edges
 */
const applyEdgeAwareSmooth = (imageData, intensity) => {
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data.length);

  const radius = Math.ceil(2 + intensity * 3);
  const colorThreshold = 30 + intensity * 30;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const centerR = data[idx];
      const centerG = data[idx + 1];
      const centerB = data[idx + 2];

      let sumR = 0, sumG = 0, sumB = 0;
      let weight = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;

        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;

          const nidx = (ny * width + nx) * 4;
          const nR = data[nidx];
          const nG = data[nidx + 1];
          const nB = data[nidx + 2];

          // Color similarity weight
          const colorDiff = Math.abs(centerR - nR) + Math.abs(centerG - nG) + Math.abs(centerB - nB);
          const w = colorDiff < colorThreshold ? 1 : 0.2;

          sumR += nR * w;
          sumG += nG * w;
          sumB += nB * w;
          weight += w;
        }
      }

      output[idx] = sumR / weight;
      output[idx + 1] = sumG / weight;
      output[idx + 2] = sumB / weight;
      output[idx + 3] = data[idx + 3];
    }
  }

  return new ImageData(output, width, height);
};

/**
 * Add noise/grain to create edge discontinuities
 * This increases edge fragmentation and direction variation
 */
const applyNoise = (imageData, intensity) => {
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data.length);

  const noiseAmount = intensity * 25;

  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * noiseAmount;
    output[i] = Math.max(0, Math.min(255, data[i] + noise));
    output[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    output[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    output[i + 3] = data[i + 3];
  }

  return new ImageData(output, width, height);
};

/**
 * Transform an image's angularity
 *
 * The new analysis measures:
 * 1. Direction Clustering - edges concentrated in few vs many directions
 * 2. Edge Discontinuity - edge endpoints (fragmentation)
 * 3. Direction Change Sharpness - sharp vs gradual direction changes
 *
 * @param {HTMLImageElement|HTMLCanvasElement} imageSource - Source image
 * @param {number} currentAngularity - Current angularity (0-1)
 * @param {number} targetAngularity - Target angularity (0-1)
 * @param {number} width - Output width
 * @param {number} height - Output height
 * @returns {Promise<HTMLCanvasElement>} Transformed canvas
 */
export const transformImageToAngularity = async (imageSource, currentAngularity, targetAngularity, width, height) => {
  const delta = targetAngularity - currentAngularity;
  const intensity = Math.abs(delta);

  const outputWidth = width || imageSource.width;
  const outputHeight = height || imageSource.height;

  // Create working canvas
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');

  // Draw source image
  ctx.drawImage(imageSource, 0, 0, outputWidth, outputHeight);

  // If minimal change, return as-is
  if (Math.abs(delta) < 0.01) {
    return canvas;
  }

  let imageData = ctx.getImageData(0, 0, outputWidth, outputHeight);

  if (delta < 0) {
    // Transform toward BOUBA (smoother, rounder)
    // - Blur reduces edge strength and direction changes
    // - Edge-aware smoothing reduces fragmentation while keeping some structure
    console.log(`BOUBA transformation: intensity ${intensity.toFixed(2)}`);

    const blurRadius = Math.ceil(1 + intensity * 4); // 1-5 pixel blur
    imageData = applyBlur(imageData, blurRadius);

    // Additional edge-aware smooth for stronger effect
    if (intensity > 0.3) {
      imageData = applyEdgeAwareSmooth(imageData, intensity);
    }

  } else {
    // Transform toward KIKI (sharper, more angular)
    // - Sharpening increases edge contrast and direction changes
    // - Local contrast creates more edge variation
    // - Noise adds discontinuities
    console.log(`KIKI transformation: intensity ${intensity.toFixed(2)}`);

    const sharpenAmount = 1 + intensity * 2.5; // 1-3.5x sharpening
    imageData = applySharpen(imageData, sharpenAmount);

    // Local contrast enhancement
    if (intensity > 0.2) {
      imageData = applyLocalContrast(imageData, intensity * 0.8);
    }

    // Light noise for fragmentation at high intensity
    if (intensity > 0.5) {
      imageData = applyNoise(imageData, (intensity - 0.5) * 0.5);
    }
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas;
};
