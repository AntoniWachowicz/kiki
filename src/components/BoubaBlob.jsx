import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

const BoubaBlob = () => {
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

    // Create blob geometry
    const blobGroup = new THREE.Group();

    // Parameters
    const baseRadius = 0.6;
    const blobDetail = 64;

    // Create a sphere and displace vertices to make it blobby
    const blobGeometry = new THREE.SphereGeometry(baseRadius, blobDetail, blobDetail);
    const positions = blobGeometry.attributes.position;

    // Displace vertices with smooth noise for organic blob shape
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Normalize to get direction
      const length = Math.sqrt(x * x + y * y + z * z);
      const nx = x / length;
      const ny = y / length;
      const nz = z / length;

      // Multiple soft sine waves for organic displacement - very wavy
      const displacement =
        0.5 * Math.sin(nx * 2 + ny * 1.5) * Math.cos(nz * 1.5) +
        0.4 * Math.sin(ny * 2.5 + nz * 2) * Math.cos(nx * 1.5) +
        0.35 * Math.sin(nz * 2 + nx * 2.5) * Math.cos(ny * 2) +
        0.3 * Math.sin(nx * 1.5 - ny * 2 + nz * 2) +
        0.25 * Math.cos(nx * 3 + ny * 2 - nz * 1.5) +
        0.2 * Math.sin(ny * 2 - nz * 2.5) * Math.sin(nx * 1.5) +
        0.15 * Math.cos(nz * 3 - nx * 2 + ny * 2);

      const newRadius = baseRadius + displacement;
      positions.setXYZ(i, nx * newRadius, ny * newRadius, nz * newRadius);
    }

    blobGeometry.computeVertexNormals();

    // Gradient shader for blob (darker center, lighter edges)
    const blobShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        centerColor: { value: new THREE.Color(0x666666) },
        edgeColor: { value: new THREE.Color(0xcccccc) }
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 centerColor;
        uniform vec3 edgeColor;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          // Fresnel-like effect: lighter at edges
          vec3 viewDir = normalize(cameraPosition - vPosition);
          float fresnel = 1.0 - abs(dot(vNormal, viewDir));
          fresnel = pow(fresnel, 0.8);
          vec3 color = mix(centerColor, edgeColor, fresnel);
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });

    const blob = new THREE.Mesh(blobGeometry, blobShaderMaterial);
    blobGroup.add(blob);

    scene.add(blobGroup);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
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

      // Rotate the blob slowly
      blobGroup.rotation.y += 0.008;
      blobGroup.rotation.x = 0.15;

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

              // Bouba uses circles
              const cornerRadius = squareSize / 2;

              halftoneCtx.beginPath();
              halftoneCtx.roundRect(x, y, squareSize, squareSize, cornerRadius);
              halftoneCtx.fill();
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

export default BoubaBlob;
