import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Download, AlertCircle, Play } from 'lucide-react';
import { analyzeAudioFile } from '../audioAnalysis';
import { deriveStaticState, deriveFrameState, draw, hashString } from '../voronoiGenerator';

const CANVAS_SIZE = 1024;

const DEFAULT_FEATURES = {
  angularity: 0.5,
  brightness: 0.5,
  warmth: 0.5,
  complexity: 0.5,
  rhythm: 0,
  saturation: 0.5,
  texture: 0.3,
};

const ReversePage = () => {
  const [status, setStatus] = useState('idle');
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [seed, setSeed] = useState(() => hashString('manual'));
  const [error, setError] = useState(null);
  const [sourceLabel, setSourceLabel] = useState('manual');
  const [audioUrl, setAudioUrl] = useState(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioUrlRef = useRef(null);

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  // Re-render whenever features or seed change — single render path for
  // both slider edits and audio-driven updates.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const staticState = deriveStaticState(features, seed, CANVAS_SIZE, CANVAS_SIZE);
      const frameState = deriveFrameState(staticState, 0);
      const ctx = canvas.getContext('2d');
      draw(ctx, frameState);
    } catch (err) {
      console.error('Render failed:', err);
    }
  }, [features, seed]);

  const setAudioBlob = (blob) => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(blob);
    audioUrlRef.current = url;
    setAudioUrl(url);
  };

  const runPipeline = async (arrayBuffer, label, mimeType) => {
    setError(null);
    setStatus('decoding');
    try {
      setAudioBlob(new Blob([arrayBuffer], { type: mimeType || 'audio/wav' }));

      setStatus('analyzing');
      const feat = await analyzeAudioFile(arrayBuffer);
      setFeatures(feat);
      setSourceLabel(label);
      setSeed(hashString(label));
      setStatus('done');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Something went wrong');
      setStatus('idle');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(wav|mp3|ogg|m4a|flac)$/i)) {
      setError('Please upload an audio file.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('Audio file is too large (max 50MB).');
      return;
    }
    try {
      const arrayBuffer = await file.arrayBuffer();
      await runPipeline(arrayBuffer, file.name, file.type);
    } catch (err) {
      setError(err.message || 'Failed to read file');
    }
  };

  const loadExample = async (name) => {
    setError(null);
    try {
      const res = await fetch(`/audio/${name}.wav`);
      if (!res.ok) throw new Error(`Failed to load ${name}.wav`);
      const arrayBuffer = await res.arrayBuffer();
      await runPipeline(arrayBuffer, `${name}-example`, 'audio/wav');
    } catch (err) {
      setError(err.message || 'Failed to load example');
    }
  };

  const updateFeature = (key, value) => {
    setFeatures((prev) => ({ ...prev, [key]: value }));
  };

  const randomizeSeed = () => {
    setSeed(Math.floor(Math.random() * 0xffffffff) >>> 0);
  };

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reverse-${sourceLabel || 'image'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const isBusy = status === 'decoding' || status === 'analyzing';

  return (
    <div className="min-h-screen bg-black p-8 lg:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-2">Sound → Image</h1>
            <p className="text-white/50">Voronoi generator driven by audio features</p>
          </div>
          <Link
            to="/"
            className="px-6 py-3 border border-white/30 text-white/70 font-semibold hover:bg-white/10 hover:text-white transition-colors"
          >
            home
          </Link>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-200">{error}</p>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          <div className="lg:w-2/3 flex flex-col">
            <div className="flex flex-wrap gap-3 mb-6">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
                className={`px-6 py-3 font-semibold flex items-center gap-2 transition-colors ${
                  isBusy
                    ? 'bg-white/20 text-white/50 cursor-not-allowed'
                    : 'bg-white text-black hover:bg-white/90'
                }`}
              >
                <Upload size={18} />
                Upload Audio
              </button>
              <button
                onClick={() => loadExample('bouba')}
                disabled={isBusy}
                className="px-6 py-3 border border-white/30 text-white/70 font-semibold hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Play size={16} />
                Bouba example
              </button>
              <button
                onClick={() => loadExample('kiki')}
                disabled={isBusy}
                className="px-6 py-3 border border-white/30 text-white/70 font-semibold hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Play size={16} />
                Kiki example
              </button>
              <button
                onClick={randomizeSeed}
                disabled={isBusy}
                className="px-6 py-3 border border-white/30 text-white/70 font-semibold hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                Re-seed
              </button>
              <button
                onClick={downloadPng}
                className="px-6 py-3 border border-white/30 text-white/70 font-semibold hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
              >
                <Download size={16} />
                Download PNG
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className="border border-white/20 bg-black aspect-square w-full">
              <canvas
                ref={canvasRef}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                className="w-full h-full object-contain"
              />
            </div>

            {audioUrl && (
              <audio
                src={audioUrl}
                controls
                className="w-full mt-4"
              />
            )}

            {isBusy && (
              <p className="mt-4 text-white/50 font-mono text-sm animate-pulse">
                {status === 'decoding' && 'Decoding audio...'}
                {status === 'analyzing' && 'Extracting features...'}
              </p>
            )}
          </div>

          <div className="lg:w-1/3 flex flex-col">
            <h2 className="text-sm uppercase tracking-wider text-white/40 font-semibold mb-4">
              Features
            </h2>
            <div className="space-y-4">
              <FeatureSlider
                label="Angularity"
                value={features.angularity}
                onChange={(v) => updateFeature('angularity', v)}
                gradient="from-blue-500 to-red-500"
                hint="Bouba ← → Kiki"
              />
              <FeatureSlider
                label="Brightness"
                value={features.brightness}
                onChange={(v) => updateFeature('brightness', v)}
                color="bg-white"
              />
              <FeatureSlider
                label="Warmth"
                value={features.warmth}
                onChange={(v) => updateFeature('warmth', v)}
                gradient="from-blue-500 to-orange-500"
                hint="Cool ← → Warm"
              />
              <FeatureSlider
                label="Complexity"
                value={features.complexity}
                onChange={(v) => updateFeature('complexity', v)}
                color="bg-white/70"
              />
              <FeatureSlider
                label="Rhythm"
                value={features.rhythm}
                onChange={(v) => updateFeature('rhythm', v)}
                color="bg-white/70"
                hint="Drives symmetry axes"
              />
              <FeatureSlider
                label="Saturation"
                value={features.saturation}
                onChange={(v) => updateFeature('saturation', v)}
                color="bg-white/70"
              />
              <FeatureSlider
                label="Texture"
                value={features.texture}
                onChange={(v) => updateFeature('texture', v)}
                color="bg-white/70"
                hint="Domain warp amount"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const FeatureSlider = ({ label, value, onChange, color, gradient, hint }) => (
  <div>
    <div className="flex justify-between items-center mb-1">
      <span className="text-sm font-semibold text-white/70">{label}</span>
      <span className="text-lg font-bold text-white">{(value * 100).toFixed(0)}%</span>
    </div>
    <div className="relative w-full bg-white/10 h-2">
      <div
        className={`h-2 pointer-events-none ${gradient ? `bg-gradient-to-r ${gradient}` : color}`}
        style={{ width: `${value * 100}%` }}
      />
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </div>
    {hint && <p className="text-xs text-white/40 mt-1">{hint}</p>}
  </div>
);

export default ReversePage;
