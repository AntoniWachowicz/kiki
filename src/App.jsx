import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Square, Trash2, AlertCircle, Volume2, Eye, EyeOff, Zap, Music } from 'lucide-react';
import { analyzeImage } from './imageAnalysis';
import { generateSound } from './soundGeneration';
import { generateSoundLegacy } from './soundGenerationLegacy';
import { generateSoundV2 } from './soundGenerationV2';
import { drawSamplingPoints } from './visualizationUtils';
import { transformImageToAngularity } from './imageTransform';

// Example images available in public/examples/
const EXAMPLE_IMAGES = [
  { name: 'Bouba', file: 'bouba.jpg', description: 'Round, smooth shape' },
  { name: 'Kiki', file: 'kiki.jpg', description: 'Angular, spiky shape' },
  { name: 'Nature', file: 'nature.jpg', description: 'Organic patterns' },
];

const ImageToSoundGenerator = () => {
  const [image, setImage] = useState(null);
  const [imageObj, setImageObj] = useState(null);  // Store image object for redrawing
  const [originalImageObj, setOriginalImageObj] = useState(null);  // Store original for reset
  const [analysis, setAnalysis] = useState(null);
  const [originalAnalysis, setOriginalAnalysis] = useState(null);  // Store original analysis
  const [targetAngularity, setTargetAngularity] = useState(null);  // Slider value (0-1)
  const [isAngularityModified, setIsAngularityModified] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);  // Loading state during transform
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [samplingMethod, setSamplingMethod] = useState('brightness');
  const [volume, setVolume] = useState(0.5);  // 0-1 range
  const [showSamplingPoints, setShowSamplingPoints] = useState(true);
  const [soundEngine, setSoundEngine] = useState('legacy');  // 'legacy' or 'v2'
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioContextRef = useRef(null);
  const playbackTimeoutRef = useRef(null);  // Track the playback timeout

  useEffect(() => {
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    } catch (err) {
      setError('Your browser does not support Web Audio API. Please use a modern browser.');
      console.error('Failed to create AudioContext:', err);
    }

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Store canvas image data to prevent unwanted redraws
  const canvasImageDataRef = useRef(null);

  // Save current canvas state
  const saveCanvasState = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvasImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  };

  // Restore canvas state (used when toggling sampling points)
  const restoreCanvasState = () => {
    if (!canvasRef.current || !canvasImageDataRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(canvasImageDataRef.current, 0, 0);
  };

  // Toggle sampling points visibility
  const handleToggleSamplingPoints = () => {
    const newValue = !showSamplingPoints;
    setShowSamplingPoints(newValue);

    // Restore canvas from saved state (pure image without points)
    if (!canvasRef.current || !canvasImageDataRef.current || !analysis) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Restore the saved image (without sampling points)
    ctx.putImageData(canvasImageDataRef.current, 0, 0);

    // Draw sampling points if now enabled
    if (newValue && analysis.samplingPoints) {
      drawSamplingPoints(canvas, analysis.samplingPoints);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file.');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image file is too large. Please upload an image smaller than 10MB.');
      return;
    }

    setError(null);
    setIsAnalyzing(true);

    const reader = new FileReader();

    reader.onerror = () => {
      setError('Failed to read the image file. Please try again.');
      setIsAnalyzing(false);
    };

    reader.onload = (event) => {
      const img = new Image();

      img.onerror = () => {
        setError('Failed to load the image. The file may be corrupted.');
        setIsAnalyzing(false);
      };

      img.onload = () => {
        try {
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
          setImageObj(img);  // Store image object for redrawing
          setOriginalImageObj(img);  // Store original for reset

          // Analyze the image
          try {
            const analysisResult = analyzeImage(canvas, samplingMethod);

            // Save canvas state BEFORE drawing points (pure image)
            saveCanvasState();

            // Draw sampling points if enabled
            if (showSamplingPoints && analysisResult.samplingPoints) {
              drawSamplingPoints(canvas, analysisResult.samplingPoints);
            }

            setAnalysis(analysisResult);
            setOriginalAnalysis(analysisResult);  // Store original analysis
            setTargetAngularity(analysisResult.angularity);  // Initialize slider
            setIsAngularityModified(false);  // Reset modification state
            setError(null);
          } catch (analysisError) {
            setError(`Analysis failed: ${analysisError.message}`);
            console.error(analysisError);
          }
        } catch (err) {
          setError('Failed to process the image. Please try a different image.');
          console.error('Image processing error:', err);
        } finally {
          setIsAnalyzing(false);
        }
      };

      img.src = event.target.result;
    };

    reader.readAsDataURL(file);
  };

  const loadExampleImage = async (filename) => {
    setError(null);
    setIsAnalyzing(true);

    try {
      const response = await fetch(`/examples/${filename}`);
      if (!response.ok) {
        throw new Error('Example image not found');
      }

      const blob = await response.blob();
      const reader = new FileReader();

      reader.onload = (event) => {
        const img = new Image();

        img.onerror = () => {
          setError('Failed to load the example image.');
          setIsAnalyzing(false);
        };

        img.onload = () => {
          try {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');

            const maxWidth = 800;
            const maxHeight = 600;

            let width = img.width;
            let height = img.height;

            if (width > maxWidth || height > maxHeight) {
              const scale = Math.min(maxWidth / width, maxHeight / height);
              width = Math.floor(width * scale);
              height = Math.floor(height * scale);
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            setImage(event.target.result);
            setImageObj(img);
            setOriginalImageObj(img);

            const analysisResult = analyzeImage(canvas, samplingMethod);

            // Save canvas state BEFORE drawing points (pure image)
            saveCanvasState();

            // Draw sampling points if enabled
            if (showSamplingPoints && analysisResult.samplingPoints) {
              drawSamplingPoints(canvas, analysisResult.samplingPoints);
            }

            setAnalysis(analysisResult);
            setOriginalAnalysis(analysisResult);
            setTargetAngularity(analysisResult.angularity);
            setIsAngularityModified(false);
            setError(null);
          } catch (err) {
            setError('Failed to process the example image.');
            console.error('Image processing error:', err);
          } finally {
            setIsAnalyzing(false);
          }
        };

        img.src = event.target.result;
      };

      reader.onerror = () => {
        setError('Failed to read the example image.');
        setIsAnalyzing(false);
      };

      reader.readAsDataURL(blob);
    } catch (err) {
      setError(`Failed to load example: ${err.message}`);
      setIsAnalyzing(false);
    }
  };

  const handleSamplingMethodChange = (method) => {
    setSamplingMethod(method);

    if (image && canvasRef.current && canvasImageDataRef.current) {
      try {
        setError(null);

        // Restore clean canvas state (without sampling points) before re-analyzing
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(canvasImageDataRef.current, 0, 0);

        // Re-analyze with the clean canvas
        const analysisResult = analyzeImage(canvas, method);

        // Draw new sampling points if enabled
        if (showSamplingPoints && analysisResult.samplingPoints) {
          drawSamplingPoints(canvas, analysisResult.samplingPoints);
        }

        setAnalysis(analysisResult);
      } catch (err) {
        setError(`Failed to re-analyze with new method: ${err.message}`);
        console.error(err);
      }
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
    setImageObj(null);
    setOriginalImageObj(null);
    setAnalysis(null);
    setOriginalAnalysis(null);
    setTargetAngularity(null);
    setIsAngularityModified(false);
    setError(null);
  };

  const PLAYBACK_DURATION = 15;  // seconds

  const handleGenerateSound = async () => {
    if (!analysis || isPlaying) return;

    if (!audioContextRef.current) {
      setError('Audio context is not available. Please refresh the page.');
      return;
    }

    // Clear any existing timeout
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
    }

    try {
      setError(null);
      setIsPlaying(true);

      // Select sound generation function based on engine choice
      const generateFn = soundEngine === 'v2' ? generateSoundV2 : generateSoundLegacy;

      // Don't await - let it run, we'll manage timing ourselves
      generateFn(audioContextRef.current, analysis, PLAYBACK_DURATION, volume);

      // Set our own timeout to track when playback ends
      playbackTimeoutRef.current = setTimeout(() => {
        setIsPlaying(false);
        playbackTimeoutRef.current = null;
      }, PLAYBACK_DURATION * 1000);

    } catch (err) {
      setError(`Sound generation failed: ${err.message}`);
      console.error(err);
      setIsPlaying(false);
    }
  };

  const handleStopSound = async () => {
    if (!isPlaying) return;

    // Clear the playback timeout
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }

    try {
      // Close current audio context to stop all scheduled sounds
      if (audioContextRef.current) {
        await audioContextRef.current.close();
      }

      // Create a new audio context for future use
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      setIsPlaying(false);
    } catch (err) {
      console.error('Failed to stop audio:', err);
      setIsPlaying(false);
    }
  };

  // Called during slider drag - just update the display value
  const handleAngularityDrag = (newAngularity) => {
    const newValue = parseFloat(newAngularity);
    setTargetAngularity(newValue);

    // Show as modified if different from original
    if (originalAnalysis) {
      setIsAngularityModified(Math.abs(newValue - originalAnalysis.angularity) >= 0.01);
    }
  };

  // Called when slider is released - do the actual transformation
  const handleAngularityCommit = async () => {
    if (!originalAnalysis || !originalImageObj || targetAngularity === null) return;

    const newValue = targetAngularity;

    // Check if we're back to original (within small threshold)
    if (Math.abs(newValue - originalAnalysis.angularity) < 0.01) {
      // Reset to original
      setIsAngularityModified(false);
      setAnalysis(originalAnalysis);

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(originalImageObj, 0, 0, canvas.width, canvas.height);

      saveCanvasState();

      if (showSamplingPoints && originalAnalysis.samplingPoints) {
        drawSamplingPoints(canvas, originalAnalysis.samplingPoints);
      }
      return;
    }

    // Do the transformation
    setIsTransforming(true);

    try {
      console.log(`Transforming to ${(newValue * 100).toFixed(1)}%...`);

      const currentCanvas = canvasRef.current;
      const transformedCanvas = await transformImageToAngularity(
        originalImageObj,
        originalAnalysis.angularity,
        newValue,
        currentCanvas.width,
        currentCanvas.height
      );

      // Draw transformed canvas to main canvas
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(transformedCanvas, 0, 0);

      // Re-analyze the transformed image
      const newAnalysis = analyzeImage(canvas, samplingMethod);

      console.log(`Target: ${(newValue * 100).toFixed(1)}%, Actual: ${(newAnalysis.angularity * 100).toFixed(1)}%`);

      // Save state and draw points
      saveCanvasState();

      if (showSamplingPoints && newAnalysis.samplingPoints) {
        drawSamplingPoints(canvas, newAnalysis.samplingPoints);
      }

      setAnalysis(newAnalysis);
      console.log(`Transformation complete.`);

    } catch (err) {
      setError(`Transformation failed: ${err.message}`);
      console.error('Transformation error:', err);
    } finally {
      setIsTransforming(false);
    }
  };

  const handleAngularityReset = () => {
    if (!originalAnalysis || !originalImageObj) return;

    setTargetAngularity(originalAnalysis.angularity);
    setIsAngularityModified(false);
    setAnalysis(originalAnalysis);
    setImageObj(originalImageObj);

    // Redraw original image
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImageObj, 0, 0, canvas.width, canvas.height);

    // Save state BEFORE drawing points
    saveCanvasState();

    // Redraw sampling points if enabled
    if (showSamplingPoints && originalAnalysis.samplingPoints) {
      drawSamplingPoints(canvas, originalAnalysis.samplingPoints);
    }
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

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-4 bg-red-900/30 border border-red-500 rounded-lg flex items-start gap-3">
              <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-200">{error}</p>
              </div>
            </div>
          )}

          <div className="flex gap-3 mb-6">
            <button
              onClick={() => fileInputRef.current.click()}
              disabled={isAnalyzing}
              className={`px-5 py-2.5 rounded-lg transition-colors font-bold flex items-center gap-2 ${
                isAnalyzing
                  ? 'bg-neutral-600 text-neutral-400 cursor-not-allowed'
                  : 'bg-white text-neutral-900 hover:bg-neutral-200'
              }`}
            >
              <Upload size={18} />
              {isAnalyzing ? 'Processing...' : 'Upload Image'}
            </button>
            <button
              onClick={clearCanvas}
              disabled={isAnalyzing}
              className="px-5 py-2.5 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors font-semibold flex items-center gap-2 border border-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* Example Images Row */}
          <div className="mb-6">
            <p className="text-xs text-neutral-500 mb-2 uppercase tracking-wider font-semibold">Try an example:</p>
            <div className="flex gap-3">
              {EXAMPLE_IMAGES.map((example) => (
                <button
                  key={example.file}
                  onClick={() => loadExampleImage(example.file)}
                  disabled={isAnalyzing}
                  className="group relative flex-1 aspect-square max-w-[100px] rounded-lg overflow-hidden border-2 border-neutral-700 hover:border-neutral-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-neutral-800"
                >
                  <img
                    src={`/examples/${example.file}`}
                    alt={example.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                  <div className="hidden w-full h-full items-center justify-center text-neutral-600">
                    <span className="text-xs">{example.name}</span>
                  </div>
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs text-white font-semibold">{example.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

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

              {/* Sampling Method Selector - Compact */}
              <div className="mb-4 flex items-center gap-3">
                <span className="text-xs text-neutral-400 font-semibold uppercase whitespace-nowrap">Sampling:</span>
                <div className="flex flex-1 rounded-lg overflow-hidden border border-neutral-600">
                  {[
                    { value: 'brightness', label: 'Bright' },
                    { value: 'edges', label: 'Edges' },
                    { value: 'random', label: 'Scatter' },
                    { value: 'regions', label: 'Grid' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleSamplingMethodChange(option.value)}
                      className={`flex-1 px-2 py-1.5 text-xs font-semibold transition-colors ${
                        samplingMethod === option.value
                          ? 'bg-yellow-500 text-black'
                          : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Volume Control */}
              <div className="mb-4 bg-neutral-900/50 p-4 rounded-xl border border-neutral-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Volume2 size={16} className="text-blue-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Volume</h3>
                  </div>
                  <span className="text-sm text-white font-bold">{Math.round(volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume * 100}
                  onChange={(e) => setVolume(e.target.value / 100)}
                  className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* Sound Engine Selector */}
              <div className="mb-4 flex items-center gap-3">
                <span className="text-xs text-neutral-400 font-semibold uppercase whitespace-nowrap">Engine:</span>
                <div className="flex flex-1 rounded-lg overflow-hidden border border-neutral-600">
                  <button
                    onClick={() => setSoundEngine('legacy')}
                    className={`flex-1 px-3 py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                      soundEngine === 'legacy'
                        ? 'bg-blue-500 text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                    }`}
                  >
                    <Music size={12} />
                    Legacy
                  </button>
                  <button
                    onClick={() => setSoundEngine('v2')}
                    className={`flex-1 px-3 py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                      soundEngine === 'v2'
                        ? 'bg-purple-500 text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                    }`}
                  >
                    <Zap size={12} />
                    V2 (Experimental)
                  </button>
                </div>
              </div>

              {/* Sampling Points Toggle & Histogram */}
              <div className="mb-4 flex gap-3">
                {/* Sampling Points Toggle */}
                <button
                  onClick={handleToggleSamplingPoints}
                  className={`flex-1 px-4 py-2.5 rounded-lg border-2 transition-all font-semibold text-sm flex items-center justify-center gap-2 ${
                    showSamplingPoints
                      ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                      : 'bg-neutral-800 border-neutral-600 text-neutral-400 hover:border-neutral-500'
                  }`}
                >
                  {showSamplingPoints ? <Eye size={16} /> : <EyeOff size={16} />}
                  {showSamplingPoints ? 'Hide Points' : 'Show Points'}
                </button>

                {/* Histogram Display - Inline miniature */}
                <div className="flex-1 px-4 py-2.5 rounded-lg border-2 border-neutral-600 bg-neutral-800 flex items-center gap-3">
                  <span className="text-xs text-neutral-400 font-semibold whitespace-nowrap">Histogram:</span>
                  <div className="flex-1 flex items-end gap-0.5 h-8">
                    {analysis.histogram && analysis.histogram.map((value, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-gradient-to-t from-yellow-600 to-yellow-400 rounded-t-sm"
                        style={{ height: `${value * 100}%`, minHeight: '2px' }}
                      />
                    ))}
                  </div>
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

                {/* Color Warmth */}
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

                {/* Saturation */}
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

                {/* Shape/Angularity */}
                <div className="bg-neutral-900/50 p-5 rounded-xl border-2 border-neutral-700">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <span className="text-sm font-bold text-white uppercase tracking-wider">
                        {analysis.angularity <= 0.5 ? '◯' : '◆'} Shape
                        {isAngularityModified && (
                          <span className="ml-2 text-xs text-yellow-400 font-normal">(Modified)</span>
                        )}
                      </span>
                      <p className="text-xs text-neutral-500 mt-1">Round ←→ Angular</p>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-white">{(analysis.angularity * 100).toFixed(0)}</span>
                      <span className="text-sm text-neutral-500">%</span>
                    </div>
                  </div>

                  {/* Current angularity bar */}
                  <div className="w-full bg-neutral-900 rounded-full h-3 overflow-hidden mb-4">
                    <div
                      className="bg-gradient-to-r from-blue-600 via-purple-500 to-red-600 h-3 transition-all duration-500"
                      style={{ width: `${analysis.angularity * 100}%` }}
                    />
                  </div>

                  {/* Angularity manipulation slider */}
                  <div className="mt-4 pt-4 border-t border-neutral-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-neutral-400 font-semibold uppercase">
                        Adjust Angularity
                      </span>
                      {isAngularityModified && (
                        <button
                          onClick={handleAngularityReset}
                          disabled={isTransforming}
                          className="text-xs text-yellow-400 hover:text-yellow-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Reset to Original
                        </button>
                      )}
                    </div>

                    {/* Slider with original marker */}
                    <div className="relative mb-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={targetAngularity ? targetAngularity * 100 : 0}
                        onChange={(e) => handleAngularityDrag(e.target.value / 100)}
                        onMouseUp={handleAngularityCommit}
                        onTouchEnd={handleAngularityCommit}
                        disabled={isTransforming || !originalAnalysis}
                        className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />

                      {/* Original value marker */}
                      {originalAnalysis && (
                        <div
                          className="absolute top-0 w-1 h-6 bg-yellow-400 rounded pointer-events-none shadow-lg"
                          style={{
                            left: `calc(${originalAnalysis.angularity * 100}% - 2px)`,
                            transform: 'translateY(-50%)'
                          }}
                          title={`Original: ${(originalAnalysis.angularity * 100).toFixed(0)}%`}
                        />
                      )}
                    </div>

                    {/* Value display */}
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-500">
                        Original: {originalAnalysis ? (originalAnalysis.angularity * 100).toFixed(0) : '-'}%
                      </span>
                      <span className="text-white font-semibold">
                        Target: {targetAngularity ? (targetAngularity * 100).toFixed(0) : '-'}%
                      </span>
                    </div>

                    {isTransforming && (
                      <p className="text-xs text-yellow-400 mt-2 text-center animate-pulse">
                        Transforming and re-analyzing...
                      </p>
                    )}
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

                {/* Complexity */}
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

                {/* Texture */}
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

                {/* Rhythm */}
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

              {isPlaying ? (
                <button
                  onClick={handleStopSound}
                  className="w-full mt-6 flex items-center justify-center gap-3 px-8 py-5 rounded-xl font-bold text-xl transition-all bg-red-600 text-white hover:bg-red-500"
                >
                  <Square size={24} fill="currentColor" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleGenerateSound}
                  className="w-full mt-6 flex items-center justify-center gap-3 px-8 py-5 rounded-xl font-bold text-xl transition-all bg-gradient-to-r from-blue-600 to-red-600 text-white hover:from-blue-500 hover:to-red-500"
                >
                  <Play size={24} fill="currentColor" />
                  Generate Sound (15s)
                </button>
              )}
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
