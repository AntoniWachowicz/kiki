import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Play, Square, Trash2, AlertCircle, Volume2, Eye, EyeOff, Zap, Music, RotateCcw } from 'lucide-react';
import { analyzeImage } from '../imageAnalysis';
import { generateSoundLegacy } from '../soundGenerationLegacy';
import { generateSoundV2 } from '../soundGenerationV2';
import { drawSamplingPoints } from '../visualizationUtils';
import { transformImageToAngularity } from '../imageTransform';

const AppPage = () => {
  const [image, setImage] = useState(null);
  const [imageObj, setImageObj] = useState(null);
  const [originalImageObj, setOriginalImageObj] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [originalAnalysis, setOriginalAnalysis] = useState(null);
  const [targetAngularity, setTargetAngularity] = useState(null);
  const [isAngularityModified, setIsAngularityModified] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [samplingMethod, setSamplingMethod] = useState('brightness');
  const [volume, setVolume] = useState(0.5);
  const [showSamplingPoints, setShowSamplingPoints] = useState(true);
  const [soundEngine, setSoundEngine] = useState('legacy');
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioContextRef = useRef(null);
  const playbackTimeoutRef = useRef(null);
  const canvasImageDataRef = useRef(null);

  useEffect(() => {
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    } catch (err) {
      setError('Your browser does not support Web Audio API.');
      console.error('Failed to create AudioContext:', err);
    }

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const saveCanvasState = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvasImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  };

  const handleToggleSamplingPoints = () => {
    const newValue = !showSamplingPoints;
    setShowSamplingPoints(newValue);

    if (!canvasRef.current || !canvasImageDataRef.current || !analysis) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(canvasImageDataRef.current, 0, 0);

    if (newValue && analysis.samplingPoints) {
      drawSamplingPoints(canvas, analysis.samplingPoints);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image file is too large. Please upload an image smaller than 10MB.');
      return;
    }

    setError(null);
    setIsAnalyzing(true);

    const reader = new FileReader();

    reader.onerror = () => {
      setError('Failed to read the image file.');
      setIsAnalyzing(false);
    };

    reader.onload = (event) => {
      const img = new Image();

      img.onerror = () => {
        setError('Failed to load the image.');
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

          try {
            const analysisResult = analyzeImage(canvas, samplingMethod);
            saveCanvasState();

            if (showSamplingPoints && analysisResult.samplingPoints) {
              drawSamplingPoints(canvas, analysisResult.samplingPoints);
            }

            setAnalysis(analysisResult);
            setOriginalAnalysis(analysisResult);
            setTargetAngularity(analysisResult.angularity);
            setIsAngularityModified(false);
            setError(null);
          } catch (analysisError) {
            setError(`Analysis failed: ${analysisError.message}`);
          }
        } catch (err) {
          setError('Failed to process the image.');
        } finally {
          setIsAnalyzing(false);
        }
      };

      img.src = event.target.result;
    };

    reader.readAsDataURL(file);
  };

  const handleSamplingMethodChange = (method) => {
    setSamplingMethod(method);

    if (image && canvasRef.current && canvasImageDataRef.current) {
      try {
        setError(null);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(canvasImageDataRef.current, 0, 0);

        const analysisResult = analyzeImage(canvas, method);

        if (showSamplingPoints && analysisResult.samplingPoints) {
          drawSamplingPoints(canvas, analysisResult.samplingPoints);
        }

        setAnalysis(analysisResult);
      } catch (err) {
        setError(`Failed to re-analyze: ${err.message}`);
      }
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

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

  const PLAYBACK_DURATION = 15;

  const handleGenerateSound = async () => {
    if (!analysis || isPlaying) return;

    if (!audioContextRef.current) {
      setError('Audio context is not available.');
      return;
    }

    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
    }

    try {
      setError(null);
      setIsPlaying(true);

      const generateFn = soundEngine === 'v2' ? generateSoundV2 : generateSoundLegacy;
      generateFn(audioContextRef.current, analysis, PLAYBACK_DURATION, volume);

      playbackTimeoutRef.current = setTimeout(() => {
        setIsPlaying(false);
        playbackTimeoutRef.current = null;
      }, PLAYBACK_DURATION * 1000);

    } catch (err) {
      setError(`Sound generation failed: ${err.message}`);
      setIsPlaying(false);
    }
  };

  const handleStopSound = async () => {
    if (!isPlaying) return;

    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }

    try {
      if (audioContextRef.current) {
        await audioContextRef.current.close();
      }
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      setIsPlaying(false);
    } catch (err) {
      setIsPlaying(false);
    }
  };

  // Called during slider drag - just update the display value
  const handleAngularityDrag = (newAngularity) => {
    const newValue = parseFloat(newAngularity);
    setTargetAngularity(newValue);

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
      const currentCanvas = canvasRef.current;
      const transformedCanvas = await transformImageToAngularity(
        originalImageObj,
        originalAnalysis.angularity,
        newValue,
        currentCanvas.width,
        currentCanvas.height
      );

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(transformedCanvas, 0, 0);

      const newAnalysis = analyzeImage(canvas, samplingMethod);

      saveCanvasState();

      if (showSamplingPoints && newAnalysis.samplingPoints) {
        drawSamplingPoints(canvas, newAnalysis.samplingPoints);
      }

      setAnalysis(newAnalysis);

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

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImageObj, 0, 0, canvas.width, canvas.height);

    saveCanvasState();

    if (showSamplingPoints && originalAnalysis.samplingPoints) {
      drawSamplingPoints(canvas, originalAnalysis.samplingPoints);
    }
  };

  return (
    <div className="min-h-screen bg-black p-8 lg:p-12 xl:p-16">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-4xl lg:text-5xl font-bold text-white mb-2">KIBA</h1>
        </div>
        <Link
          to="/showcase"
          className="px-6 py-3 border border-white/30 text-white/70 font-semibold hover:bg-white/10 hover:text-white transition-colors"
        >
          back
        </Link>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 flex items-start gap-3">
          <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-200">{error}</p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
        {/* LEFT SIDE - Canvas */}
        <div className="lg:w-1/2 flex flex-col">
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => fileInputRef.current.click()}
              disabled={isAnalyzing}
              className={`px-6 py-3 font-semibold flex items-center gap-2 transition-colors ${
                isAnalyzing
                  ? 'bg-white/20 text-white/50 cursor-not-allowed'
                  : 'bg-white text-black hover:bg-white/90'
              }`}
            >
              <Upload size={18} />
              {isAnalyzing ? 'Processing...' : 'Upload Image'}
            </button>
            <button
              onClick={clearCanvas}
              disabled={isAnalyzing}
              className="px-6 py-3 border border-white/30 text-white/70 font-semibold hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50"
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

          <div className="flex-1 border border-white/20 bg-black flex items-center justify-center min-h-[400px]">
            <canvas
              ref={canvasRef}
              width={600}
              height={400}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {analysis && (
            <div className="mt-6 flex gap-4">
              <div className={`flex-1 p-4 border transition-all ${
                analysis.angularity <= 0.5
                  ? 'bg-blue-950/30 border-blue-500/50'
                  : 'border-black'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-sm font-bold text-blue-400">BOUBA</span>
                </div>
                <p className="text-xs text-white/50">Round / Smooth</p>
              </div>

              <div className={`flex-1 p-4 border transition-all ${
                analysis.angularity > 0.5
                  ? 'bg-red-950/30 border-red-500/50'
                  : 'border-black'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 bg-red-500" style={{clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)'}}></div>
                  <span className="text-sm font-bold text-red-400">KIKI</span>
                </div>
                <p className="text-xs text-white/50">Angular / Sharp</p>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT SIDE - Analysis */}
        <div className="lg:w-1/2 flex flex-col">
          {analysis ? (
            <>
              {/* Controls Row */}
              <div className="flex flex-wrap gap-4 mb-6">
                {/* Sampling Method */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/50 font-semibold uppercase">Sampling:</span>
                  <div className="flex border border-white/20">
                    {[
                      { value: 'brightness', label: 'Bright' },
                      { value: 'edges', label: 'Edges' },
                      { value: 'random', label: 'Scatter' },
                      { value: 'regions', label: 'Grid' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleSamplingMethodChange(option.value)}
                        className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                          samplingMethod === option.value
                            ? 'bg-white text-black'
                            : 'text-white/50 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sound Engine */}
                {/* <div className="flex items-center gap-3">
                  <span className="text-xs text-white/50 font-semibold uppercase">Engine:</span>
                  <div className="flex border border-white/20">
                    <button
                      onClick={() => setSoundEngine('legacy')}
                      className={`px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                        soundEngine === 'legacy'
                          ? 'bg-white text-black'
                          : 'text-white/50 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Music size={12} />
                      Legacy
                    </button>
                    <button
                      onClick={() => setSoundEngine('v2')}
                      className={`px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                        soundEngine === 'v2'
                          ? 'bg-white text-black'
                          : 'text-white/50 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Zap size={12} />
                      V2
                    </button>
                  </div>
                </div> */}

                {/* Sampling Points Toggle */}
                <button
                  onClick={handleToggleSamplingPoints}
                  className={`px-3 py-1.5 text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                    showSamplingPoints
                      ? 'bg-white/10 border-white/30 text-white'
                      : 'border-white/20 text-white/50 hover:text-white'
                  }`}
                >
                  {showSamplingPoints ? <Eye size={14} /> : <EyeOff size={14} />}
                  Points
                </button>
              </div>

              {/* Analysis Metrics */}
              <div className="flex-1 space-y-5 overflow-y-auto pr-2">
                {/* Shape/Angularity with Adjustment */}
                <div className="p-4 border border-white/20">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white/70">Shape (Angularity)</span>
                      {isAngularityModified && (
                        <span className="text-xs text-white/40">(Modified)</span>
                      )}
                    </div>
                    <span className="text-2xl font-bold text-white">{(analysis.angularity * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-white/10 h-2 mb-3">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-red-500 h-2 transition-all duration-500"
                      style={{ width: `${analysis.angularity * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-white/40 mb-4">
                    <span>← Bouba</span>
                    <span>Kiki →</span>
                  </div>

                  {/* Angularity Adjustment Slider */}
                  <div className="pt-4 border-t border-white/10">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs text-white/50 font-semibold uppercase">Adjust Angularity</span>
                      {isAngularityModified && (
                        <button
                          onClick={handleAngularityReset}
                          disabled={isTransforming}
                          className="text-xs text-white/50 hover:text-white font-semibold flex items-center gap-1 disabled:opacity-50"
                        >
                          <RotateCcw size={12} />
                          Reset
                        </button>
                      )}
                    </div>

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
                        className="w-full h-1 bg-white/20 appearance-none cursor-pointer accent-white disabled:opacity-50 disabled:cursor-not-allowed"
                      />

                      {/* Original value marker */}
                      {originalAnalysis && (
                        <div
                          className="absolute top-1/2 w-0.5 h-4 bg-white/60 pointer-events-none"
                          style={{
                            left: `${originalAnalysis.angularity * 100}%`,
                            transform: 'translate(-50%, -50%)'
                          }}
                        />
                      )}
                    </div>

                    <div className="flex justify-between text-xs">
                      <span className="text-white/40">
                        Original: {originalAnalysis ? (originalAnalysis.angularity * 100).toFixed(0) : '-'}%
                      </span>
                      <span className="text-white font-semibold">
                        Target: {targetAngularity ? (targetAngularity * 100).toFixed(0) : '-'}%
                      </span>
                    </div>

                    {isTransforming && (
                      <p className="text-xs text-white/50 mt-2 text-center animate-pulse">
                        Transforming...
                      </p>
                    )}
                  </div>
                </div>

                {/* Brightness */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-white/70">Brightness</span>
                    <span className="text-2xl font-bold text-white">{(analysis.brightness * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-white/10 h-2">
                    <div
                      className="bg-white h-2 transition-all duration-500"
                      style={{ width: `${analysis.brightness * 100}%` }}
                    />
                  </div>
                </div>

                {/* Color Warmth */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-white/70">Color Warmth</span>
                    <span className="text-2xl font-bold text-white">{((analysis.warmth + 1) * 50).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-white/10 h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-orange-500 h-2 transition-all duration-500"
                      style={{ width: `${(analysis.warmth + 1) * 50}%` }}
                    />
                  </div>
                </div>

                {/* Complexity */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-white/70">Complexity</span>
                    <span className="text-2xl font-bold text-white">{(analysis.complexity * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-white/10 h-2">
                    <div
                      className="bg-white/70 h-2 transition-all duration-500"
                      style={{ width: `${analysis.complexity * 100}%` }}
                    />
                  </div>
                </div>

                {/* Texture */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-white/70">Texture</span>
                    <span className="text-2xl font-bold text-white">{(analysis.texture * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-white/10 h-2">
                    <div
                      className="bg-white/70 h-2 transition-all duration-500"
                      style={{ width: `${analysis.texture * 100}%` }}
                    />
                  </div>
                </div>

                {/* Rhythm */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-white/70">Rhythm</span>
                    <span className="text-2xl font-bold text-white">{(analysis.rhythm * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-white/10 h-2">
                    <div
                      className="bg-white/70 h-2 transition-all duration-500"
                      style={{ width: `${analysis.rhythm * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-white/40 mt-1">Tempo: {(60 + analysis.rhythm * 240).toFixed(0)} BPM</p>
                </div>
              </div>

              {/* Volume */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Volume2 size={16} className="text-white/50" />
                    <span className="text-sm font-semibold text-white">Volume</span>
                  </div>
                  <span className="text-sm text-white font-bold">{Math.round(volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume * 100}
                  onChange={(e) => setVolume(e.target.value / 100)}
                  className="w-full h-1 bg-white/20 appearance-none cursor-pointer accent-white"
                />
              </div>

              {/* Play Button */}
              {isPlaying ? (
                <button
                  onClick={handleStopSound}
                  className="w-full mt-4 flex items-center justify-center gap-3 px-8 py-4 font-bold text-xl transition-colors bg-red-600 text-white hover:bg-red-500"
                >
                  <Square size={24} fill="currentColor" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleGenerateSound}
                  className="w-full mt-4 flex items-center justify-center gap-3 px-8 py-4 font-bold text-xl transition-colors bg-white/90 text-black hover:bg-white/80"
                >
                  <Play size={24} fill="currentColor" />
                  Generate Sound (15s)
                </button>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-white/40">
                <Upload size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-xl font-semibold">Upload an image to begin</p>
                <p className="text-sm mt-2">Visual shapes will be translated into sound</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppPage;
