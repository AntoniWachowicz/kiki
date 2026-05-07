import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Download, AlertCircle, Play } from 'lucide-react';
import { analyzeAudioFile } from '../audioAnalysis';
import { deriveStaticState, deriveFrameState, draw, hashString } from '../voronoiGenerator';
import { createStippleSession } from '../stippleGenerator';

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
  const [generator, setGenerator] = useState('voronoi');
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioUrlRef = useRef(null);
  const audioRef = useRef(null);
  const stippleSessionRef = useRef(null);
  const rafRef = useRef(null);
  const audioCtxRef = useRef(null);
  const audioSourceRef = useRef(null);
  const analyserRef = useRef(null);
  const analyserDataRef = useRef(null);

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  // Voronoi: render on feature/seed change. Fast and stateless.
  // Stipple: (re)build a session and show its final trace as the default image.
  // Playback then drives sim progress from audio.currentTime (see effect below).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (generator === 'voronoi') {
      stippleSessionRef.current = null;
      try {
        const staticState = deriveStaticState(features, seed, CANVAS_SIZE, CANVAS_SIZE);
        const frameState = deriveFrameState(staticState, 0);
        draw(ctx, frameState);
      } catch (err) {
        console.error('Render failed:', err);
      }
      return;
    }

    try {
      const session = createStippleSession(features, seed, CANVAS_SIZE, CANVAS_SIZE);
      stippleSessionRef.current = session;
      // Cheap default: bg + initial dots. The sim only advances while audio
      // is playing; feature changes just reset particle positions.
      session.draw(ctx);
    } catch (err) {
      console.error('Stipple session failed:', err);
    }
  }, [features, seed, generator]);

  // Drive the stipple simulation from live audio bands while it's playing.
  useEffect(() => {
    if (generator !== 'stipple') return;
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;
    const ctx = canvas.getContext('2d');

    // Lazily build AudioContext → MediaElementSource → Analyser → destination.
    // Web Audio requires a user gesture (play), so we set this up on play.
    const ensureAudioGraph = () => {
      if (audioSourceRef.current) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const actx = new AudioCtx();
        const source = actx.createMediaElementSource(audio);
        const analyser = actx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);
        analyser.connect(actx.destination);
        audioCtxRef.current = actx;
        audioSourceRef.current = source;
        analyserRef.current = analyser;
        analyserDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      } catch (err) {
        console.error('AudioContext setup failed:', err);
      }
    };

    const readBands = () => {
      const analyser = analyserRef.current;
      const data = analyserDataRef.current;
      if (!analyser || !data) return [0, 0, 0];
      analyser.getByteFrequencyData(data);
      const n = data.length;
      // Rough splits for 3 bands. fftSize 256 → 128 bins spanning 0–22 kHz.
      // bass  ≈ 0–1.4 kHz, mid ≈ 1.4–6 kHz, treble ≈ 6+ kHz.
      const b1 = Math.floor(n * 0.08);
      const b2 = Math.floor(n * 0.35);
      const avg = (s, e) => {
        let sum = 0;
        for (let i = s; i < e; i++) sum += data[i];
        return sum / Math.max(1, e - s) / 255;
      };
      return [avg(0, b1), avg(b1, b2), avg(b2, n)];
    };

    const tick = () => {
      const session = stippleSessionRef.current;
      if (!session) return;
      session.update(readBands());
      session.draw(ctx);
      if (!audio.paused && !audio.ended) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    const startLoop = () => {
      ensureAudioGraph();
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    const stopLoop = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };

    audio.addEventListener('play', startLoop);
    audio.addEventListener('pause', stopLoop);
    audio.addEventListener('ended', stopLoop);

    if (!audio.paused) startLoop();

    return () => {
      stopLoop();
      audio.removeEventListener('play', startLoop);
      audio.removeEventListener('pause', stopLoop);
      audio.removeEventListener('ended', stopLoop);
    };
  }, [generator, audioUrl]);

  // Tear down the AudioContext when the audio element is replaced so the
  // next upload can bind a fresh MediaElementSource.
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
      audioSourceRef.current = null;
      analyserRef.current = null;
      analyserDataRef.current = null;
    };
  }, [audioUrl]);

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
            <p className="text-white/50">
              {generator === 'voronoi'
                ? 'Voronoi generator driven by audio features'
                : 'Particles pulled by live bass / mid / treble energy'}
            </p>
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
            <div className="flex mb-4 border border-white/20 w-fit">
              <button
                onClick={() => setGenerator('voronoi')}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  generator === 'voronoi'
                    ? 'bg-white text-black'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Voronoi
              </button>
              <button
                onClick={() => setGenerator('stipple')}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  generator === 'stipple'
                    ? 'bg-white text-black'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Particle trails
              </button>
            </div>

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
                key={audioUrl}
                ref={audioRef}
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

            {generator === 'stipple' && audioUrl && (
              <p className="mt-2 text-white/40 text-xs">
                Press play — particles are pulled by live bass / mid / treble energy.
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
