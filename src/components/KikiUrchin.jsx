import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

const KikiUrchin = () => {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    // Create visible canvas for final output
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = width;
    outputCanvas.height = height;
    outputCanvas.style.width = '100%';
    outputCanvas.style.height = '100%';
    container.appendChild(outputCanvas);
    const outputCtx = outputCanvas.getContext('2d');

    // Offscreen canvas for halftone
    const halftoneCanvas = document.createElement('canvas');
    halftoneCanvas.width = width;
    halftoneCanvas.height = height;
    const halftoneCtx = halftoneCanvas.getContext('2d');

    // Offscreen canvas for original render
    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = width;
    renderCanvas.height = height;
    const renderCtx = renderCanvas.getContext('2d');

    // Mouse tracking
    let mouseX = -1000;
    let mouseY = -1000;
    const maskRadius = 60;
    const grainSize = 3;

    const handleMouseMove = (e) => {
      const rect = outputCanvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouseX = -1000;
      mouseY = -1000;
    };

    outputCanvas.addEventListener('mousemove', handleMouseMove);
    outputCanvas.addEventListener('mouseleave', handleMouseLeave);

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Camera - slightly elevated view
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 1.5, 4);
    camera.lookAt(0, 0, 0);

    // Renderer (offscreen)
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);

    // Create urchin geometry
    const urchinGroup = new THREE.Group();

    // Parameters
    const spikeCount = 12;
    const totalRadius = 1.5;
    const coreRadius = totalRadius / 5;
    const spikeLength = totalRadius - coreRadius;

    // Core sphere
    const coreGeometry = new THREE.SphereGeometry(coreRadius, 16, 16);
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.5,
      metalness: 0.1
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    urchinGroup.add(core);

    // Gradient shader for spikes
    const spikeShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color(0x444444) },
        tipColor: { value: new THREE.Color(0xcccccc) }
      },
      vertexShader: `
        varying float vHeight;
        void main() {
          vHeight = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        uniform vec3 tipColor;
        varying float vHeight;
        void main() {
          float t = smoothstep(-0.5, 0.5, vHeight);
          vec3 color = mix(baseColor, tipColor, t);
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });

    const goldenRatio = (1 + Math.sqrt(5)) / 2;

    for (let i = 0; i < spikeCount; i++) {
      const theta = 2 * Math.PI * i / goldenRatio;
      const phi = Math.acos(1 - 2 * (i + 0.5) / spikeCount);

      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.sin(phi) * Math.sin(theta);
      const z = Math.cos(phi);

      const spikeGeometry = new THREE.ConeGeometry(coreRadius * 0.4, spikeLength, 8);
      const spike = new THREE.Mesh(spikeGeometry, spikeShaderMaterial);

      spike.position.set(
        x * (coreRadius + spikeLength / 2),
        y * (coreRadius + spikeLength / 2),
        z * (coreRadius + spikeLength / 2)
      );

      spike.lookAt(x * 10, y * 10, z * 10);
      spike.rotateX(Math.PI / 2);

      urchinGroup.add(spike);
    }

    scene.add(urchinGroup);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-5, -2, -5);
    scene.add(directionalLight2);

    // Halftone settings
    const cols = 40;
    const gridStep = width / cols;
    const cellSize = gridStep;

    // Pre-generate noise pattern for grainy mask edge
    const noiseSize = 256;
    const noiseData = new Float32Array(noiseSize * noiseSize);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = Math.random();
    }

    // Animation loop
    let animationId;
    const animate = () => {
      animationId = requestAnimationFrame(animate);

      // Rotate the urchin
      urchinGroup.rotation.y += 0.01;
      urchinGroup.rotation.x = 0.2;

      // Render 3D scene
      renderer.render(scene, camera);

      // Read pixels from WebGL renderer
      const gl = renderer.getContext();
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      // Draw original render to renderCanvas (flip Y)
      const imageData = renderCtx.createImageData(width, height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcIdx = ((height - 1 - y) * width + x) * 4;
          const dstIdx = (y * width + x) * 4;
          imageData.data[dstIdx] = pixels[srcIdx];
          imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
          imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
          imageData.data[dstIdx + 3] = 255;
        }
      }
      renderCtx.putImageData(imageData, 0, 0);

      // Draw halftone
      halftoneCtx.fillStyle = '#000';
      halftoneCtx.fillRect(0, 0, width, height);
      halftoneCtx.fillStyle = '#888';

      const visibleRows = Math.ceil(height / gridStep) + 1;
      const steps = 5;

      for (let row = 0; row < visibleRows; row++) {
        for (let col = 0; col < cols; col++) {
          const sampleX = Math.floor(col * gridStep + gridStep / 2);
          const sampleY = height - 1 - Math.floor(row * gridStep + gridStep / 2);

          if (sampleX >= 0 && sampleX < width && sampleY >= 0 && sampleY < height) {
            const pixelIndex = (sampleY * width + sampleX) * 4;
            const r = pixels[pixelIndex];
            const g = pixels[pixelIndex + 1];
            const b = pixels[pixelIndex + 2];

            const rawBrightness = (r + g + b) / (3 * 255);
            const brightness = Math.pow(rawBrightness, 0.7);

            const stepIndex = Math.min(steps, Math.floor(brightness * (steps + 1)));
            const squareSize = (stepIndex / steps) * cellSize;

            if (stepIndex > 0) {
              const x = col * gridStep + (cellSize - squareSize) / 2;
              const y = row * gridStep + (cellSize - squareSize) / 2;
              halftoneCtx.fillRect(x, y, squareSize, squareSize);
            }
          }
        }
      }

      // Composite: start with halftone
      outputCtx.drawImage(halftoneCanvas, 0, 0);

      // Apply grainy mask to reveal original render around cursor
      if (mouseX > -500 && mouseY > -500) {
        const outputData = outputCtx.getImageData(0, 0, width, height);
        const renderData = renderCtx.getImageData(0, 0, width, height);

        for (let py = 0; py < height; py += grainSize) {
          for (let px = 0; px < width; px += grainSize) {
            const dx = px - mouseX;
            const dy = py - mouseY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Grainy edge: use noise to vary the effective radius
            const noiseIdx = ((py % noiseSize) * noiseSize + (px % noiseSize));
            const noise = noiseData[noiseIdx];
            const effectiveRadius = maskRadius * (0.7 + noise * 0.6);

            if (dist < effectiveRadius) {
              // Make pixels transparent to reveal what's underneath
              for (let gy = 0; gy < grainSize && py + gy < height; gy++) {
                for (let gx = 0; gx < grainSize && px + gx < width; gx++) {
                  const idx = ((py + gy) * width + (px + gx)) * 4;
                  outputData.data[idx + 3] = 0; // Set alpha to 0
                }
              }
            }
          }
        }

        outputCtx.putImageData(outputData, 0, 0);
      }
    };

    animate();

    // Handle resize
    const handleResize = () => {
      const newWidth = container.offsetWidth;
      const newHeight = container.offsetHeight;

      outputCanvas.width = newWidth;
      outputCanvas.height = newHeight;
      halftoneCanvas.width = newWidth;
      halftoneCanvas.height = newHeight;
      renderCanvas.width = newWidth;
      renderCanvas.height = newHeight;

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      outputCanvas.removeEventListener('mousemove', handleMouseMove);
      outputCanvas.removeEventListener('mouseleave', handleMouseLeave);
      renderer.dispose();
      container.removeChild(outputCanvas);
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
};

export default KikiUrchin;
