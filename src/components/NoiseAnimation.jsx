import React, { useRef, useEffect } from 'react';

const NoiseAnimation = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationId;
    let noiseOffset = 0;

    // Grid settings
    const cols = 20;  // Number of columns
    const gapRatio = 0;  // Gap as ratio of cell size
    const noiseScale = 4;  // Each noise cell covers this many grid cells

    let cellSize, gap, gridStep;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;

      // Calculate cell size based on width
      gridStep = canvas.width / cols;
      gap = gridStep * gapRatio;
      cellSize = gridStep - gap;
    };

    resize();
    window.addEventListener('resize', resize);

    // Create noise data array
    const createNoiseData = (numCols, numRows) => {
      const data = new Float32Array(numCols * numRows);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random();
      }
      return data;
    };

    // Noise buffer (taller to allow scrolling)
    let noiseCols = 0;
    let noiseRows = 0;
    let noiseData = null;

    const initNoise = () => {
      noiseCols = Math.ceil(cols / noiseScale) + 2;
      noiseRows = Math.ceil(canvas.height / gridStep / noiseScale) * 3 + 2; // 3x height for scrolling
      noiseData = createNoiseData(noiseCols, noiseRows);
    };

    initNoise();

    const animate = (time) => {
      const { width, height } = canvas;

      // Clear canvas to black
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      // Calculate brightness pulse (slow sine wave, subtle)
      const pulsePeriod = 8000; // 8 seconds per cycle
      const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(time / pulsePeriod * Math.PI * 2));

      // Scroll offset for noise sampling (squares stay fixed)
      const scrollSpeed = 0.001;
      const scrollOffset = (time * scrollSpeed) % noiseRows;

      // Draw halftone squares
      ctx.fillStyle = '#888';

      const visibleRows = Math.ceil(height / gridStep) + 1;

      // Helper for bilinear interpolation
      const sampleNoise = (nx, ny) => {
        const x0 = Math.floor(nx);
        const y0 = Math.floor(ny);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const fx = nx - x0;
        const fy = ny - y0;

        const i00 = (y0 % noiseRows) * noiseCols + (x0 % noiseCols);
        const i10 = (y0 % noiseRows) * noiseCols + (x1 % noiseCols);
        const i01 = (y1 % noiseRows) * noiseCols + (x0 % noiseCols);
        const i11 = (y1 % noiseRows) * noiseCols + (x1 % noiseCols);

        const v00 = noiseData[i00];
        const v10 = noiseData[i10];
        const v01 = noiseData[i01];
        const v11 = noiseData[i11];

        // Bilinear interpolation
        const v0 = v00 * (1 - fx) + v10 * fx;
        const v1 = v01 * (1 - fx) + v11 * fx;
        return v0 * (1 - fy) + v1 * fy;
      };

      // Radial gradient overlay: black circle at right edge center
      const gradientCenterX = width;
      const gradientCenterY = height / 2;
      const gradientRadius = height / 2;

      for (let row = 0; row < visibleRows; row++) {
        for (let col = 0; col < cols; col++) {
          // Sample noise with scroll offset (noise moves, grid is fixed)
          const nx = col / noiseScale;
          const ny = (row / noiseScale) + scrollOffset / noiseScale;

          const noiseRaw = sampleNoise(nx, ny);

          // Remap noise so darker values disappear (threshold at ~40%)
          const noise = Math.max(0, (noiseRaw - 0.4) / 0.6);

          // Calculate cell center position
          const cellCenterX = col * gridStep + cellSize / 2;
          const cellCenterY = row * gridStep + cellSize / 2;

          // Distance from gradient center (right edge middle)
          const dx = cellCenterX - gradientCenterX;
          const dy = cellCenterY - gradientCenterY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Radial darkening: 0 at center, 1 at edge and beyond
          const gradientFactor = Math.min(1, dist / gradientRadius);

          // Apply pulse and gradient to brightness
          const brightness = noise * pulse * gradientFactor;

          // Calculate square size based on brightness (halftone effect)
          // Quantize to 5 discrete steps (0%, 20%, 40%, 60%, 80%, 100%)
          const maxSquareSize = cellSize;
          const steps = 5;
          const stepIndex = Math.floor(brightness * (steps + 1));
          const squareSize = (stepIndex / steps) * maxSquareSize;

          if (stepIndex > 0) {
            // Center the shape in its cell (fixed position)
            const x = col * gridStep + (cellSize - squareSize) / 2;
            const y = row * gridStep + (cellSize - squareSize) / 2;

            // Transition from square to circle as size decreases
            // At full size: radius = 0 (square), at small size: radius = size/2 (circle)
            const sizeRatio = squareSize / maxSquareSize;
            const cornerRadius = (1 - sizeRatio) * (squareSize / 2);

            ctx.beginPath();
            ctx.roundRect(x, y, squareSize, squareSize, cornerRadius);
            ctx.fill();
          }
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
    />
  );
};

export default NoiseAnimation;
