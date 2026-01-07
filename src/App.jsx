import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Trash2 } from 'lucide-react';

const ImageToSoundGenerator = () => {
  const [image, setImage] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [samplingMethod, setSamplingMethod] = useState('brightness');
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const analyzeImage = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    let totalBrightness = 0;
    let pixelCount = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3;
      totalBrightness += brightness;
      pixelCount++;
    }
    
    const brightness = totalBrightness / pixelCount / 255;
    
    // ADVANCED ANGULARITY DETECTION - Combination approach
    // Factor 1: Edge detection and direction analysis
    const edgeMap = [];
    const edgeDirections = [];
    let totalEdgeStrength = 0;
    
    for (let y = 1; y < canvas.height - 1; y++) {
      edgeMap[y] = [];
      for (let x = 1; x < canvas.width - 1; x++) {
        const idx = (y * canvas.width + x) * 4;
        const centerBrightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        const rightIdx = (y * canvas.width + (x + 1)) * 4;
        const rightBrightness = (data[rightIdx] + data[rightIdx + 1] + data[rightIdx + 2]) / 3;
        
        const bottomIdx = ((y + 1) * canvas.width + x) * 4;
        const bottomBrightness = (data[bottomIdx] + data[bottomIdx + 1] + data[bottomIdx + 2]) / 3;
        
        const gradientX = centerBrightness - rightBrightness;
        const gradientY = centerBrightness - bottomBrightness;
        const gradientMag = Math.sqrt(gradientX * gradientX + gradientY * gradientY);
        
        edgeMap[y][x] = gradientMag;
        totalEdgeStrength += gradientMag;
        
        // Calculate edge direction (angle) - INCREASED threshold
        if (gradientMag > 35) { // Was 20, now 35 - more selective
          const angle = Math.atan2(gradientY, gradientX);
          edgeDirections.push(angle);
        }
      }
    }
    
    // Factor 2: Edge Direction Alignment (geometric vs organic)
    // Quantize angles into 8 bins (0°, 45°, 90°, 135°, etc.)
    const angleBins = new Array(8).fill(0);
    edgeDirections.forEach(angle => {
      // Normalize angle to 0-2π
      const normalizedAngle = (angle + Math.PI) % (2 * Math.PI);
      // Which bin (0-7)?
      const bin = Math.floor((normalizedAngle / (2 * Math.PI)) * 8);
      angleBins[bin]++;
    });
    
    // Calculate variance - low variance = aligned edges (angular)
    const avgBinCount = angleBins.reduce((a, b) => a + b, 0) / 8;
    let angleVariance = 0;
    angleBins.forEach(count => {
      angleVariance += Math.pow(count - avgBinCount, 2);
    });
    angleVariance = Math.sqrt(angleVariance / 8);
    
    // Normalize: high variance = round (scattered directions), low variance = angular (aligned)
    const directionAlignment = 1 - Math.min(angleVariance / avgBinCount, 1);
    
    // Factor 3: Edge Coherence (long continuous vs short broken)
    // Trace connected edges
    let longEdgeCount = 0;
    let shortEdgeCount = 0;
    const visited = new Set();
    
    const traceEdge = (startX, startY) => {
      const stack = [[startX, startY]];
      let length = 0;
      
      while (stack.length > 0 && length < 100) { // Cap to prevent infinite loops
        const [x, y] = stack.pop();
        const key = `${x},${y}`;
        
        if (visited.has(key)) continue;
        if (x < 1 || x >= canvas.width - 1 || y < 1 || y >= canvas.height - 1) continue;
        if (edgeMap[y][x] < 35) continue; // Increased from 20 to 35
        
        visited.add(key);
        length++;
        
        // Check 8 neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            stack.push([x + dx, y + dy]);
          }
        }
      }
      
      return length;
    };
    
    // Sample edge tracing (check every 10th pixel to save computation)
    for (let y = 1; y < canvas.height - 1; y += 10) {
      for (let x = 1; x < canvas.width - 1; x += 10) {
        if (edgeMap[y][x] > 35 && !visited.has(`${x},${y}`)) { // Increased from 20 to 35
          const edgeLength = traceEdge(x, y);
          if (edgeLength > 15) {
            longEdgeCount++;
          } else if (edgeLength > 3) {
            shortEdgeCount++;
          }
        }
      }
    }
    
    const totalEdges = longEdgeCount + shortEdgeCount;
    const edgeCoherence = totalEdges > 0 ? longEdgeCount / totalEdges : 0;
    
    // Factor 4: Corner Detection (sharp corners)
    let sharpCornerCount = 0;
    let totalCorners = 0;
    
    for (let y = 2; y < canvas.height - 2; y += 3) {
      for (let x = 2; x < canvas.width - 2; x += 3) {
        // Simple corner detection: check if pixel is edge and neighbors form perpendicular edges
        if (edgeMap[y][x] > 35) { // Increased from 20 to 35
          const hasHorizontalEdge = edgeMap[y][x-1] > 35 || edgeMap[y][x+1] > 35; // Increased threshold
          const hasVerticalEdge = edgeMap[y-1][x] > 35 || edgeMap[y+1][x] > 35; // Increased threshold
          
          if (hasHorizontalEdge && hasVerticalEdge) {
            sharpCornerCount++;
          }
          totalCorners++;
        }
      }
    }
    
    const cornerSharpness = totalCorners > 0 ? sharpCornerCount / totalCorners : 0;
    
    // COMBINE ALL FACTORS with weights
    // Scale down and normalize to prevent stacking
    const rawAngularity = 
      directionAlignment * 0.3 +      // 30% - edge alignment (geometric vs organic)
      edgeCoherence * 0.25 +           // 25% - long continuous edges
      cornerSharpness * 0.2;           // 20% - sharp corners
    
    // Apply sigmoid-like curve to spread out the middle range
    // This prevents everything from clustering at extremes
    let angularity;
    if (edgeDirections.length < 50) {
      // Very few edges detected - default to middle (ambiguous)
      angularity = 0.5;
    } else {
      angularity = Math.min(Math.max(
        (rawAngularity - 0.3) * 1.8,  // Shift center point and scale
        0
      ), 1);
    }
    
    // COLOR EXTRACTION - for timbre
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
    
    // Calculate color properties
    const warmth = (avgR - avgB); // -1 (cool/blue) to +1 (warm/red)
    const saturation = Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB); // 0 (grayscale) to 1 (vibrant)
    
    // TEXTURE/GRAIN ANALYSIS - detect noise and high-frequency detail
    let highFreqDetail = 0;
    let detailCount = 0;
    
    // Look for rapid pixel-to-pixel changes (texture/grain)
    for (let y = 2; y < canvas.height - 2; y += 2) {
      for (let x = 2; x < canvas.width - 2; x += 2) {
        const idx = (y * canvas.width + x) * 4;
        const centerBright = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        // Check immediate neighbors for small-scale variation
        let localVariation = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nidx = ((y + dy) * canvas.width + (x + dx)) * 4;
            const nBright = (data[nidx] + data[nidx + 1] + data[nidx + 2]) / 3;
            localVariation += Math.abs(centerBright - nBright);
          }
        }
        
        highFreqDetail += localVariation / 8; // Average variation
        detailCount++;
      }
    }
    
    // Normalize - high values = grainy/textured, low = smooth
    const texture = Math.min(highFreqDetail / detailCount / 30, 1); // 0 (smooth) to 1 (grainy)
    
    // Sample points helper
    const samplePoint = (x, y) => {
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
    
    const numSamples = 16;
    let samples = [];
    
    // SAMPLING METHODS
    if (samplingMethod === 'brightness') {
      // Brightness pathfinding
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
      
      samples.push(samplePoint(startX, startY));
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
        
        samples.push(samplePoint(nextX, nextY));
        visited.add(`${nextX},${nextY}`);
      }
    } else if (samplingMethod === 'edges') {
      // Edge following
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
      
      const step = Math.max(1, Math.floor(edgePoints.length / numSamples));
      for (let i = 0; i < numSamples && i * step < edgePoints.length; i++) {
        const point = edgePoints[i * step];
        samples.push(samplePoint(point.x, point.y));
      }
      
      while (samples.length < numSamples) {
        samples.push(samplePoint(
          Math.floor(Math.random() * canvas.width),
          Math.floor(Math.random() * canvas.height)
        ));
      }
    } else if (samplingMethod === 'random') {
      // Scattered sampling
      const pattern = [
        [0.1, 0.1], [0.3, 0.2], [0.6, 0.15], [0.9, 0.25],
        [0.2, 0.4], [0.5, 0.35], [0.8, 0.45], [0.15, 0.6],
        [0.4, 0.55], [0.7, 0.65], [0.25, 0.75], [0.55, 0.8],
        [0.85, 0.75], [0.35, 0.9], [0.65, 0.95], [0.45, 0.5]
      ];
      
      pattern.forEach(([px, py]) => {
        const x = Math.floor(px * canvas.width);
        const y = Math.floor(py * canvas.height);
        samples.push(samplePoint(x, y));
      });
    } else {
      // Region detection (4x4 grid)
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
              const sample = samplePoint(x, y);
              sumBrightness += sample.brightness;
              sumEdge += sample.angularity;
              count++;
            }
          }
          
          samples.push({
            brightness: sumBrightness / count,
            angularity: sumEdge / count
          });
        }
      }
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
    
    return {
      brightness,
      angularity,
      complexity,
      rhythm,
      warmth,      // -1 to +1 (cool to warm)
      saturation,  // 0 to 1 (grayscale to vibrant)
      texture,     // 0 to 1 (smooth to grainy)
      segmentData
    };
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          
          // Max dimensions to keep UI reasonable
          const maxWidth = 800;
          const maxHeight = 600;
          
          let width = img.width;
          let height = img.height;
          
          // Scale down if too large, maintaining aspect ratio
          if (width > maxWidth || height > maxHeight) {
            const scale = Math.min(maxWidth / width, maxHeight / height);
            width = Math.floor(width * scale);
            height = Math.floor(height * scale);
          }
          
          // Set canvas size to match processed dimensions
          canvas.width = width;
          canvas.height = height;
          
          // Draw image at exact size
          ctx.drawImage(img, 0, 0, width, height);
          
          setImage(event.target.result);
          const analysisResult = analyzeImage();
          setAnalysis(analysisResult);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Reset to default size
    canvas.width = 600;
    canvas.height = 400;
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setImage(null);
    setAnalysis(null);
  };

  const generateSound = () => {
    if (!analysis || isPlaying) return;
    
    setIsPlaying(true);
    const audioContext = audioContextRef.current;
    const now = audioContext.currentTime;
    
    const { brightness, angularity, complexity, rhythm, warmth, saturation, texture, segmentData } = analysis;
    
    const masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(0.5, now);
    masterGain.connect(audioContext.destination);
    
    const totalDuration = 5;
    
    const baseFreq = 220 + (brightness * 220);
    const expandedMinorScale = [
      0, 2, 3, 5, 7, 8, 10, 12,
      14, 15, 17, 19, 20, 22, 24, 26
    ];
    
    // DYNAMIC TEMPO based on rhythm (60 BPM to 300 BPM)
    const bpm = 60 + (rhythm * 240);
    const beatLength = 60 / bpm / 4; // Quarter note duration
    
    // COLOR-BASED TIMBRE
    const filterCutoff = 500 + (warmth + 1) * 2000; // 500Hz (cool) to 4500Hz (warm)
    const harmonicRichness = saturation; // 0 (pure) to 1 (rich)
    
    // TEXTURE-BASED GRIT
    const noiseAmount = texture; // 0 (clean) to 1 (gritty)
    const distortionAmount = texture * 0.3; // Subtle distortion for grainy images
    
    // Helper: Add noise/grit to a gain node
    const addNoise = (gainNode, time, duration) => {
      if (noiseAmount < 0.05) return; // Lowered threshold - was 0.1, now 0.05
      
      const noiseBufferSize = audioContext.sampleRate * duration;
      const noiseBuffer = audioContext.createBuffer(1, noiseBufferSize, audioContext.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      
      for (let i = 0; i < noiseBufferSize; i++) {
        // Pink noise for analog warmth - INCREASED
        noiseData[i] = (Math.random() * 2 - 1) * noiseAmount * 0.5; // Was 0.15, now 0.5
      }
      
      const noise = audioContext.createBufferSource();
      noise.buffer = noiseBuffer;
      
      const noiseGain = audioContext.createGain();
      noiseGain.gain.setValueAtTime(noiseAmount * 0.6, time); // Was 0.2, now 0.6
      
      noise.connect(noiseGain);
      noiseGain.connect(gainNode);
      noise.start(time);
    };
    
    // Helper: Create FM synthesis oscillator (for complex images)
    const createFMOsc = (carrierFreq, time, duration) => {
      // Modulator frequency ratio based on complexity
      const modRatio = 1 + complexity * 3; // 1:1 to 4:1 ratio
      const modFreq = carrierFreq * modRatio;
      
      // Modulation index based on saturation
      const modIndex = saturation * 5; // 0 to 5
      
      const carrier = audioContext.createOscillator();
      carrier.frequency.setValueAtTime(carrierFreq, time);
      
      const modulator = audioContext.createOscillator();
      modulator.frequency.setValueAtTime(modFreq, time);
      
      const modGain = audioContext.createGain();
      modGain.gain.setValueAtTime(carrierFreq * modIndex, time);
      
      modulator.connect(modGain);
      modGain.connect(carrier.frequency);
      
      modulator.start(time);
      modulator.stop(time + duration);
      carrier.start(time);
      carrier.stop(time + duration);
      
      return { carrier, modulator };
    };
    
    if (angularity > 0.5) {
      // KIKI MODE - with FM synthesis for complex images
      const bassNotes = [0, 0, 5, 0, 3, 0, 5, 3];
      
      for (let i = 0; i < Math.floor(totalDuration / beatLength); i++) {
        const time = now + (i * beatLength);
        const noteIndex = bassNotes[i % bassNotes.length];
        const freq = (baseFreq * 0.5) * Math.pow(2, expandedMinorScale[noteIndex] / 12);
        
        const osc = audioContext.createOscillator();
        osc.type = warmth > 0 ? 'square' : 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);
        
        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterCutoff, time);
        filter.Q.setValueAtTime(1 + harmonicRichness * 10, time);
        
        const gain = audioContext.createGain();
        const noteDuration = beatLength * (0.3 + complexity * 0.4);
        gain.gain.setValueAtTime(0.25, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + noteDuration);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        
        // Add grit/noise for textured images
        addNoise(gain, time, noteDuration);
        
        osc.start(time);
        osc.stop(time + noteDuration);
      }
      
      // MELODY - Use FM synthesis for complex images
      segmentData.forEach((segment, index) => {
        const time = now + (index * (totalDuration / segmentData.length));
        const noteIndex = Math.floor(segment.brightness * 15);
        const freq = baseFreq * 2 * Math.pow(2, expandedMinorScale[noteIndex] / 12);
        
        const noteDuration = 0.05 + (1 - segment.angularity) * 0.15;
        
        // Use FM synthesis if complexity is high
        if (complexity > 0.6) {
          const fm = createFMOsc(freq, time, noteDuration);
          
          const filter = audioContext.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(filterCutoff * 1.5, time);
          
          const gain = audioContext.createGain();
          gain.gain.setValueAtTime(0.15, time);
          gain.gain.exponentialRampToValueAtTime(0.01, time + noteDuration);
          
          fm.carrier.connect(filter);
          filter.connect(gain);
          gain.connect(masterGain);
          
          addNoise(gain, time, noteDuration);
        } else {
          // Standard oscillator for simpler images
          const osc = audioContext.createOscillator();
          osc.type = saturation > 0.5 ? 'sawtooth' : 'triangle';
          osc.frequency.setValueAtTime(freq, time);
          
          const filter = audioContext.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(filterCutoff * 1.5, time);
          
          const gain = audioContext.createGain();
          gain.gain.setValueAtTime(0.18, time);
          gain.gain.exponentialRampToValueAtTime(0.01, time + noteDuration);
          
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(masterGain);
          
          addNoise(gain, time, noteDuration);
          
          osc.start(time);
          osc.stop(time + noteDuration);
        }
      });
      
      // Drums with texture-based grit
      for (let i = 0; i < totalDuration / beatLength; i++) {
        const time = now + (i * beatLength);
        
        const kick = audioContext.createOscillator();
        kick.frequency.setValueAtTime(150, time);
        kick.frequency.exponentialRampToValueAtTime(40, time + 0.05);
        
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0.35, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
        
        kick.connect(gain);
        gain.connect(masterGain);
        
        // Add vinyl crackle to textured images - LOWERED threshold
        if (texture > 0.3) { // Was 0.5, now 0.3
          addNoise(gain, time, 0.15);
        }
        
        kick.start(time);
        kick.stop(time + 0.15);
      }
      
      for (let i = 0; i < totalDuration / (beatLength / 2); i++) {
        const time = now + (i * beatLength / 2);
        
        const bufferSize = audioContext.sampleRate * 0.03;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let j = 0; j < bufferSize; j++) {
          data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufferSize * 0.05));
        }
        
        const noise = audioContext.createBufferSource();
        noise.buffer = buffer;
        
        const filter = audioContext.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(8000, time);
        
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0.08, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        noise.start(time);
      }
      
    } else {
      // BOUBA MODE - with FM synthesis for complex images
      const bassDrone = audioContext.createOscillator();
      bassDrone.type = 'sine';
      bassDrone.frequency.setValueAtTime(baseFreq * 0.5, now);
      
      const bassFilter = audioContext.createBiquadFilter();
      bassFilter.type = 'lowpass';
      bassFilter.frequency.setValueAtTime(filterCutoff * 0.8, now);
      bassFilter.Q.setValueAtTime(1 + harmonicRichness * 5, now);
      
      const bassGain = audioContext.createGain();
      bassGain.gain.setValueAtTime(0, now);
      bassGain.gain.linearRampToValueAtTime(0.2, now + 1);
      bassGain.gain.linearRampToValueAtTime(0.2, now + totalDuration - 1);
      bassGain.gain.linearRampToValueAtTime(0, now + totalDuration);
      
      bassDrone.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(masterGain);
      
      // Add subtle analog warmth to bass
      addNoise(bassGain, now, totalDuration);
      
      bassDrone.start(now);
      bassDrone.stop(now + totalDuration);
      
      const noteDuration = totalDuration / segmentData.length;
      
      // MELODY - Use FM for complex, standard for simple
      segmentData.forEach((segment, index) => {
        const time = now + (index * noteDuration);
        const noteIndex = Math.floor(segment.brightness * 15);
        const freq = baseFreq * Math.pow(2, expandedMinorScale[noteIndex] / 12);
        
        const attackTime = 0.2 + (1 - complexity) * 0.3;
        const decayTime = 0.2 + (1 - complexity) * 0.3;
        
        // Use FM synthesis for complex images
        if (complexity > 0.6) {
          const fm = createFMOsc(freq, time, noteDuration);
          
          if (index < segmentData.length - 1) {
            const nextNoteIndex = Math.floor(segmentData[index + 1].brightness * 15);
            const nextFreq = baseFreq * Math.pow(2, expandedMinorScale[nextNoteIndex] / 12);
            const glideTime = noteDuration * (0.5 + (1 - complexity) * 0.3);
            fm.carrier.frequency.exponentialRampToValueAtTime(nextFreq, time + glideTime);
          }
          
          const filter = audioContext.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(filterCutoff * 0.9, time);
          
          const gain = audioContext.createGain();
          gain.gain.setValueAtTime(0, time);
          gain.gain.linearRampToValueAtTime(0.12, time + attackTime);
          gain.gain.linearRampToValueAtTime(0.1, time + noteDuration - decayTime);
          gain.gain.linearRampToValueAtTime(0, time + noteDuration);
          
          fm.carrier.connect(filter);
          filter.connect(gain);
          gain.connect(masterGain);
          
          addNoise(gain, time, noteDuration);
        } else {
          // Standard oscillator
          const osc = audioContext.createOscillator();
          osc.type = warmth > 0 ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(freq, time);
          
          if (index < segmentData.length - 1) {
            const nextNoteIndex = Math.floor(segmentData[index + 1].brightness * 15);
            const nextFreq = baseFreq * Math.pow(2, expandedMinorScale[nextNoteIndex] / 12);
            const glideTime = noteDuration * (0.5 + (1 - complexity) * 0.3);
            osc.frequency.exponentialRampToValueAtTime(nextFreq, time + glideTime);
          }
          
          const filter = audioContext.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(filterCutoff, time);
          
          const gain = audioContext.createGain();
          gain.gain.setValueAtTime(0, time);
          gain.gain.linearRampToValueAtTime(0.15, time + attackTime);
          gain.gain.linearRampToValueAtTime(0.12, time + noteDuration - decayTime);
          gain.gain.linearRampToValueAtTime(0, time + noteDuration);
          
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(masterGain);
          
          addNoise(gain, time, noteDuration);
          
          osc.start(time);
          osc.stop(time + noteDuration);
        }
      });
      
      const chordNotes = [0, 3, 5, 7];
      
      chordNotes.forEach((noteOffset) => {
        const freq = baseFreq * Math.pow(2, expandedMinorScale[noteOffset] / 12);
        
        const osc = audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        
        const vibrato = audioContext.createOscillator();
        vibrato.frequency.setValueAtTime(5, now);
        const vibratoGain = audioContext.createGain();
        vibratoGain.gain.setValueAtTime(3 + saturation * 5, now);
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);
        
        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterCutoff * 1.2, now);
        
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.04, now + 1.5);
        gain.gain.linearRampToValueAtTime(0.04, now + totalDuration - 1.5);
        gain.gain.linearRampToValueAtTime(0, now + totalDuration);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        
        // Subtle texture on pads - LOWERED threshold
        if (texture > 0.2) { // Was 0.3, now 0.2
          addNoise(gain, now, totalDuration);
        }
        
        osc.start(now);
        osc.stop(now + totalDuration);
        vibrato.start(now);
        vibrato.stop(now + totalDuration);
      });
    }
    
    setTimeout(() => setIsPlaying(false), totalDuration * 1000);
  };

  return (
    <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-8">
      <div className="w-full max-w-7xl h-[90vh] bg-neutral-800 rounded-2xl border-2 border-neutral-700 overflow-hidden flex">
        
        {/* LEFT SIDE */}
        <div className="flex-1 p-8 flex flex-col border-r border-neutral-700">
          <div className="mb-6">
            <h1 className="text-4xl font-black text-white mb-2">Bouba/Kiki</h1>
            <p className="text-neutral-400">Visual to Sound Translation</p>
          </div>

          <div className="flex gap-3 mb-6">
            <button
              onClick={() => fileInputRef.current.click()}
              className="px-5 py-2.5 bg-white text-neutral-900 rounded-lg hover:bg-neutral-200 transition-colors font-bold flex items-center gap-2"
            >
              <Upload size={18} />
              Upload Image
            </button>
            <button
              onClick={clearCanvas}
              className="px-5 py-2.5 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors font-semibold flex items-center gap-2 border border-neutral-600"
            >
              <Trash2 size={18} />
              Clear
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />

          <div className="flex-1 border-2 border-neutral-700 rounded-xl overflow-hidden bg-black flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={600}
              height={400}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {analysis && (
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className={`p-4 rounded-xl border-2 transition-all ${
                analysis.angularity <= 0.5 
                  ? 'bg-blue-950/50 border-blue-500' 
                  : 'bg-neutral-900/30 border-neutral-700/30'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-sm font-bold text-blue-400">BOUBA</span>
                </div>
                <p className="text-xs text-neutral-400">Round / Smooth</p>
              </div>

              <div className={`p-4 rounded-xl border-2 transition-all ${
                analysis.angularity > 0.5 
                  ? 'bg-red-950/50 border-red-500' 
                  : 'bg-neutral-900/30 border-neutral-700/30'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 bg-red-500" style={{clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)'}}></div>
                  <span className="text-sm font-bold text-red-400">KIKI</span>
                </div>
                <p className="text-xs text-neutral-400">Angular / Sharp</p>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT SIDE */}
        <div className="flex-1 p-8 flex flex-col">
          {analysis ? (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-black text-white mb-2">Signal Analysis</h2>
                <p className="text-sm text-neutral-400">Visual properties mapped to sound</p>
              </div>

              {/* Sampling Method Selector */}
              <div className="mb-6 bg-neutral-900/50 p-4 rounded-xl border border-neutral-700">
                <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">Melody Sampling Method</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="sampling"
                      value="brightness"
                      checked={samplingMethod === 'brightness'}
                      onChange={(e) => {
                        setSamplingMethod(e.target.value);
                        const result = analyzeImage();
                        setAnalysis(result);
                      }}
                      className="w-4 h-4"
                    />
                    <div>
                      <span className="text-sm text-white">Brightness Pathfinding</span>
                      <p className="text-xs text-neutral-500">Follow the light</p>
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="sampling"
                      value="edges"
                      checked={samplingMethod === 'edges'}
                      onChange={(e) => {
                        setSamplingMethod(e.target.value);
                        const result = analyzeImage();
                        setAnalysis(result);
                      }}
                      className="w-4 h-4"
                    />
                    <div>
                      <span className="text-sm text-white">Edge Following</span>
                      <p className="text-xs text-neutral-500">Trace edges</p>
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="sampling"
                      value="random"
                      checked={samplingMethod === 'random'}
                      onChange={(e) => {
                        setSamplingMethod(e.target.value);
                        const result = analyzeImage();
                        setAnalysis(result);
                      }}
                      className="w-4 h-4"
                    />
                    <div>
                      <span className="text-sm text-white">Scattered</span>
                      <p className="text-xs text-neutral-500">Fixed pattern</p>
                    </div>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="sampling"
                      value="regions"
                      checked={samplingMethod === 'regions'}
                      onChange={(e) => {
                        setSamplingMethod(e.target.value);
                        const result = analyzeImage();
                        setAnalysis(result);
                      }}
                      className="w-4 h-4"
                    />
                    <div>
                      <span className="text-sm text-white">Regions</span>
                      <p className="text-xs text-neutral-500">4×4 grid</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex-1 space-y-8 overflow-y-auto pr-2">
                {/* Brightness */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <span className="text-sm font-bold text-yellow-400 uppercase tracking-wider">☼ Brightness</span>
                      <p className="text-xs text-neutral-500 mt-1">Dark ←→ Light</p>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-white">{(analysis.brightness * 100).toFixed(0)}</span>
                      <span className="text-sm text-neutral-500">%</span>
                    </div>
                  </div>
                  <div className="w-full bg-neutral-900 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-neutral-700 via-yellow-600 to-yellow-400 h-3 transition-all duration-500"
                      style={{ width: `${analysis.brightness * 100}%` }}
                    />
                  </div>
                </div>

                {/* Color Warmth (NEW) */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <span className="text-sm font-bold text-orange-400 uppercase tracking-wider">🎨 Color Warmth</span>
                      <p className="text-xs text-neutral-500 mt-1">Cool ←→ Warm</p>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-white">{((analysis.warmth + 1) * 50).toFixed(0)}</span>
                      <span className="text-sm text-neutral-500">%</span>
                    </div>
                  </div>
                  <div className="w-full bg-neutral-900 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 via-neutral-400 to-orange-500 h-3 transition-all duration-500"
                      style={{ width: `${(analysis.warmth + 1) * 50}%` }}
                    />
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">→ Affects timbre & tone color</p>
                </div>

                {/* Saturation (NEW) */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <span className="text-sm font-bold text-pink-400 uppercase tracking-wider">✨ Saturation</span>
                      <p className="text-xs text-neutral-500 mt-1">Grayscale ←→ Vibrant</p>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-white">{(analysis.saturation * 100).toFixed(0)}</span>
                      <span className="text-sm text-neutral-500">%</span>
                    </div>
                  </div>
                  <div className="w-full bg-neutral-900 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-neutral-500 to-pink-500 h-3 transition-all duration-500"
                      style={{ width: `${analysis.saturation * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">→ Harmonic richness</p>
                </div>

                <div className="bg-neutral-900/50 p-5 rounded-xl border-2 border-neutral-700">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <span className="text-sm font-bold text-white uppercase tracking-wider">
                        {analysis.angularity <= 0.5 ? '◯' : '◆'} Shape
                      </span>
                      <p className="text-xs text-neutral-500 mt-1">Round ←→ Angular</p>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-white">{(analysis.angularity * 100).toFixed(0)}</span>
                      <span className="text-sm text-neutral-500">%</span>
                    </div>
                  </div>
                  <div className="w-full bg-neutral-900 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-600 via-purple-500 to-red-600 h-3 transition-all duration-500"
                      style={{ width: `${analysis.angularity * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mt-3">
                    <span className={`${analysis.angularity <= 0.5 ? 'text-blue-400 font-bold' : 'text-neutral-600'}`}>
                      ← Bouba
                    </span>
                    <span className={`${analysis.angularity > 0.5 ? 'text-red-400 font-bold' : 'text-neutral-600'}`}>
                      Kiki →
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <span className="text-sm font-bold text-purple-400 uppercase tracking-wider">⬡ Complexity</span>
                      <p className="text-xs text-neutral-500 mt-1">Uniform ←→ Varied</p>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-white">{(analysis.complexity * 100).toFixed(0)}</span>
                      <span className="text-sm text-neutral-500">%</span>
                    </div>
                  </div>
                  <div className="w-full bg-neutral-900 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-purple-600 to-purple-400 h-3 transition-all duration-500"
                      style={{ width: `${analysis.complexity * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">→ FM synthesis threshold</p>
                </div>

                {/* Texture (NEW) */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <span className="text-sm font-bold text-amber-400 uppercase tracking-wider">◈ Texture</span>
                      <p className="text-xs text-neutral-500 mt-1">Smooth ←→ Grainy</p>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-white">{(analysis.texture * 100).toFixed(0)}</span>
                      <span className="text-sm text-neutral-500">%</span>
                    </div>
                  </div>
                  <div className="w-full bg-neutral-900 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-neutral-400 to-amber-600 h-3 transition-all duration-500"
                      style={{ width: `${analysis.texture * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">→ Analog noise & grit</p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <span className="text-sm font-bold text-green-400 uppercase tracking-wider">♪ Rhythm</span>
                      <p className="text-xs text-neutral-500 mt-1">Static ←→ Dynamic</p>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-white">{(analysis.rhythm * 100).toFixed(0)}</span>
                      <span className="text-sm text-neutral-500">%</span>
                    </div>
                  </div>
                  <div className="w-full bg-neutral-900 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-green-600 to-green-400 h-3 transition-all duration-500"
                      style={{ width: `${analysis.rhythm * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">→ Tempo: {(60 + analysis.rhythm * 240).toFixed(0)} BPM</p>
                </div>
              </div>

              <button
                onClick={generateSound}
                disabled={isPlaying}
                className={`w-full mt-6 flex items-center justify-center gap-3 px-8 py-5 rounded-xl font-bold text-xl transition-all ${
                  isPlaying
                    ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-red-600 text-white hover:from-blue-500 hover:to-red-500'
                }`}
              >
                <Play size={24} fill="currentColor" />
                {isPlaying ? 'Generating...' : 'Generate Sound'}
              </button>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-neutral-500">
                <Upload size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg font-semibold">Upload an image to begin</p>
                <p className="text-sm mt-2">Visual shapes will be translated into sound</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageToSoundGenerator;
