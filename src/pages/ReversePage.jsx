import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Download, AlertCircle, Play, Mic, MicOff } from 'lucide-react';
import { analyzeAudioFile } from '../audioAnalysis';
import { createStippleSession, createRGBLayerSession } from '../stippleGenerator';

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

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
  const [urlInput, setUrlInput] = useState('');
  // DEBUG: temp overlay showing band levels / onsets / centroid crosses on
  // top of the particle field. Remove this state + the toggle button + the
  // setDebug effect when we're done diagnosing motion.
  const [showDebug, setShowDebug] = useState(true);
  // Lock the bass satellites + mid stripe at their seed positions so the
  // trace canvas isn't dominated by streaks from moving wells.
  const [stationaryWells, setStationaryWells] = useState(false);
  // Per-band on/off — disable any band's audio→force coupling entirely.
  // [bass, mid, treble].
  const [bandsEnabled, setBandsEnabled] = useState([true, true, true]);
  const toggleBand = (b) =>
    setBandsEnabled((prev) => prev.map((v, i) => (i === b ? !v : v)));
  // Trace channels — compose freely. Particles default on (preserves
  // existing trace), wells/events default off so the user can layer them
  // in deliberately.
  const [traceModes, setTraceModes] = useState({
    particles: true,
    wells: false,
    events: false,
  });
  const toggleTraceMode = (mode) =>
    setTraceModes((prev) => ({ ...prev, [mode]: !prev[mode] }));
  const canvasRef = useRef(null);
  // Companion canvas. Accumulates line segments from each particle's
  // previous → current position every frame, never clearing between
  // frames. Cleared only on reset (new file / backward
  // seek). The animation canvas shows live motion; this one shows the
  // composite "result image" the motion produces.
  const traceCanvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioUrlRef = useRef(null);
  const audioRef = useRef(null);
  const stippleSessionRef = useRef(null);
  const rafRef = useRef(null);
  // Per-hop [bass, mid, treble] for the whole file, plus its frame rate.
  // Lookup table that drives the sim instead of a live AnalyserNode.
  const timelineRef = useRef(null);
  // The last sim frame index applied to the session. -1 means "session is at
  // its initial reset state, no frames stepped yet."
  const lastFrameIdxRef = useRef(-1);

  const [showDevTools, setShowDevTools] = useState(false);
  const [rgbLayerMode, setRgbLayerMode] = useState(false);

  // Live mic state
  const [micActive, setMicActive] = useState(false);
  const micStreamRef = useRef(null);
  const micContextRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const micRafRef = useRef(null);
  const prevSpectrumRef = useRef(null);

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
      if (micContextRef.current) micContextRef.current.close();
    };
  }, []);

  // Helper: paint the trace canvas solid black. Called whenever the sim is
  // reset so the accumulated traces don't persist across files / seeks.
  const clearTraceCanvas = () => {
    const tc = traceCanvasRef.current;
    if (!tc) return;
    const tctx = tc.getContext('2d');
    tctx.fillStyle = '#000';
    tctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  };

  const stopMic = () => {
    if (micRafRef.current) { cancelAnimationFrame(micRafRef.current); micRafRef.current = null; }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
    if (micContextRef.current) { micContextRef.current.close(); micContextRef.current = null; }
    micAnalyserRef.current = null;
    prevSpectrumRef.current = null;
    setMicActive(false);
  };

  const startMic = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      micStreamRef.current = stream;
      micContextRef.current = audioCtx;
      micAnalyserRef.current = analyser;
      prevSpectrumRef.current = new Uint8Array(analyser.frequencyBinCount);
      if (audioRef.current && !audioRef.current.paused) audioRef.current.pause();
      setMicActive(true);
    } catch (err) {
      setError('Microphone access denied: ' + (err.message || String(err)));
    }
  };

  // Live mic rAF loop — runs while micActive, reads from the live AnalyserNode
  // and drives the stipple session in real time. Trace canvas accumulates
  // indefinitely (cleared only on session reset via feature/seed change).
  useEffect(() => {
    if (!micActive) return;
    const analyser = micAnalyserRef.current;
    const canvas = canvasRef.current;
    const traceCanvas = traceCanvasRef.current;
    if (!analyser || !canvas) return;

    const ctx = canvas.getContext('2d');
    const traceCtx = traceCanvas ? traceCanvas.getContext('2d') : null;
    const binCount = analyser.frequencyBinCount; // 1024
    const spectrum = new Uint8Array(binCount);

    const sampleRate = micContextRef.current.sampleRate;
    const binHz = sampleRate / analyser.fftSize;
    const bassEnd = Math.min(binCount - 1, Math.round(1500 / binHz));
    const midEnd  = Math.min(binCount - 1, Math.round(6000 / binHz));
    const pitchLo = Math.max(0, Math.round(80   / binHz));
    const pitchHi = Math.min(binCount - 1, Math.round(1300 / binHz));

    const levelBuf    = [0, 0, 0];
    const fluxBuf     = [0, 0, 0];
    const centroidBuf = [0.5, 0.5, 0.5];
    const pitchBuf    = [0.5, 0];

    const computeBand = (start, end, idx) => {
      const prev = prevSpectrumRef.current;
      let energy = 0, flux = 0, centNum = 0, centDen = 0;
      const count = end - start;
      if (count <= 0) return;
      for (let i = start; i < end; i++) {
        const v = spectrum[i] / 255;
        const p = prev[i] / 255;
        energy  += v * v;
        flux    += Math.max(0, v - p);
        centNum += v * (i - start);
        centDen += v;
      }
      levelBuf[idx]    = Math.sqrt(energy / count);
      fluxBuf[idx]     = flux / count;
      centroidBuf[idx] = centDen > 0 ? centNum / centDen / count : 0.5;
    };

    const computePitch = () => {
      let bestVal = -1, bestBin = pitchLo;
      for (let bin = pitchLo; bin <= pitchHi; bin++) {
        const v = (spectrum[bin] / 255) *
                  (spectrum[Math.min(bin * 2, binCount - 1)] / 255) *
                  (spectrum[Math.min(bin * 3, binCount - 1)] / 255);
        if (v > bestVal) { bestVal = v; bestBin = bin; }
      }
      const hz = bestBin * binHz;
      pitchBuf[0] = Math.max(0, Math.min(1, Math.log(hz / 80) / Math.log(1300 / 80)));
      let mean = 0;
      for (let i = pitchLo; i <= pitchHi; i++) mean += spectrum[i] / 255;
      mean /= Math.max(1, pitchHi - pitchLo + 1);
      pitchBuf[1] = mean > 0.05 ? Math.min(1, bestVal / (mean * mean * mean + 0.001) * 0.1) : 0;
    };

    const loop = () => {
      const session = stippleSessionRef.current;
      if (session) {
        analyser.getByteFrequencyData(spectrum);
        computeBand(0, bassEnd, 0);
        computeBand(bassEnd, midEnd, 1);
        computeBand(midEnd, binCount, 2);
        computePitch();
        prevSpectrumRef.current.set(spectrum);
        session.update(levelBuf, fluxBuf, centroidBuf, pitchBuf);
        if (traceCtx && session.drawTraces) session.drawTraces(traceCtx);
        session.draw(ctx);
      }
      micRafRef.current = requestAnimationFrame(loop);
    };

    micRafRef.current = requestAnimationFrame(loop);
    return () => { if (micRafRef.current) { cancelAnimationFrame(micRafRef.current); micRafRef.current = null; } };
  }, [micActive]);

  // (Re)build a stipple session on feature/seed/mode change and show the initial state.
  // Playback then drives sim progress from audio.currentTime (see effect below).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    try {
      const session = rgbLayerMode
        ? createRGBLayerSession(features, seed, CANVAS_SIZE, CANVAS_SIZE)
        : createStippleSession(features, seed, CANVAS_SIZE, CANVAS_SIZE);
      stippleSessionRef.current = session;
      if (session.setDebug) session.setDebug(showDebug);
      if (session.setStationaryWells) session.setStationaryWells(stationaryWells);
      if (session.setBandEnabled) {
        for (let b = 0; b < 3; b++) session.setBandEnabled(b, bandsEnabled[b]);
      }
      if (session.setTraceMode) {
        for (const m of ['particles', 'wells', 'events']) {
          session.setTraceMode(m, traceModes[m]);
        }
      }
      lastFrameIdxRef.current = -1;
      clearTraceCanvas();
      session.draw(ctx);
    } catch (err) {
      console.error('Stipple session failed:', err);
    }
  }, [features, seed, rgbLayerMode]);

  // DEBUG: when the toggle changes, reflect it on the current session and
  // force a redraw so it's visible even while audio is paused.
  useEffect(() => {
    const session = stippleSessionRef.current;
    const canvas = canvasRef.current;
    if (!session || !canvas || !session.setDebug) return;
    session.setDebug(showDebug);
    session.draw(canvas.getContext('2d'));
  }, [showDebug]);

  // When the stationary-wells toggle flips, push it to the session.
  // No reset/redraw — the change takes effect from the next sim frame.
  useEffect(() => {
    const session = stippleSessionRef.current;
    if (!session || !session.setStationaryWells) return;
    session.setStationaryWells(stationaryWells);
  }, [stationaryWells]);

  // Push per-band enable flags to the session whenever they toggle.
  useEffect(() => {
    const session = stippleSessionRef.current;
    if (!session || !session.setBandEnabled) return;
    for (let b = 0; b < 3; b++) session.setBandEnabled(b, bandsEnabled[b]);
  }, [bandsEnabled]);

  // Push trace-mode flags whenever they toggle.
  useEffect(() => {
    const session = stippleSessionRef.current;
    if (!session || !session.setTraceMode) return;
    for (const m of ['particles', 'wells', 'events']) {
      session.setTraceMode(m, traceModes[m]);
    }
  }, [traceModes]);

  // Drive the stipple simulation from a pre-computed bands timeline so playback
  // is fully deterministic w.r.t. audio.currentTime. Seeking backward resets
  // the session and replays from frame 0 to the target; seeking forward steps
  // through the bands it skipped over. End-of-track replay works for free —
  // a fresh play starts at currentTime ≈ 0, which triggers a reset.
  useEffect(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;
    const ctx = canvas.getContext('2d');
    const traceCanvas = traceCanvasRef.current;
    const traceCtx = traceCanvas ? traceCanvas.getContext('2d') : null;

    // Scratch buffers reused every frame to avoid per-step allocation when
    // we replay thousands of frames in one go on a long backward seek.
    const levelBuf = [0, 0, 0];
    const fluxBuf = [0, 0, 0];
    const centroidBuf = [0.5, 0.5, 0.5];
    // [normalized pitch in [0, 1], confidence in [0, 1]] — drives mid
    // stripe Y in the stipple sim.
    const pitchBuf = [0.5, 0];
    const readFrameAt = (idx) => {
      const tl = timelineRef.current;
      if (!tl || tl.frameCount === 0) {
        levelBuf[0] = levelBuf[1] = levelBuf[2] = 0;
        fluxBuf[0] = fluxBuf[1] = fluxBuf[2] = 0;
        centroidBuf[0] = centroidBuf[1] = centroidBuf[2] = 0.5;
        pitchBuf[0] = 0.5;
        pitchBuf[1] = 0;
        return;
      }
      // Clamp to the valid range so the very last bands hold steady when
      // currentTime runs slightly past the last analysed hop.
      const i = idx < 0 ? 0 : idx >= tl.frameCount ? tl.frameCount - 1 : idx;
      const off = i * 3;
      levelBuf[0] = tl.levels[off];
      levelBuf[1] = tl.levels[off + 1];
      levelBuf[2] = tl.levels[off + 2];
      fluxBuf[0] = tl.flux[off];
      fluxBuf[1] = tl.flux[off + 1];
      fluxBuf[2] = tl.flux[off + 2];
      // Older sessions may not have centroids; default to band centre.
      const c = tl.centroids;
      if (c) {
        centroidBuf[0] = c[off];
        centroidBuf[1] = c[off + 1];
        centroidBuf[2] = c[off + 2];
      } else {
        centroidBuf[0] = centroidBuf[1] = centroidBuf[2] = 0.5;
      }
      pitchBuf[0] = tl.pitches ? tl.pitches[i] : 0.5;
      pitchBuf[1] = tl.confidences ? tl.confidences[i] : 0;
    };

    const syncTo = (targetIdx) => {
      const session = stippleSessionRef.current;
      if (!session) return;
      let last = lastFrameIdxRef.current;
      let stepped = false;
      // Backward jump: only way to land at an earlier frame is to replay from
      // the start. The sim is forward-only and stateful. Trace canvas resets
      // too — replay from frame 0 will rebuild it as we step forward.
      if (targetIdx < last) {
        session.reset();
        last = -1;
        stepped = true;
        if (traceCtx) {
          traceCtx.fillStyle = '#000';
          traceCtx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        }
      }
      while (last < targetIdx) {
        last++;
        readFrameAt(last);
        session.update(levelBuf, fluxBuf, centroidBuf, pitchBuf);
        if (traceCtx && session.drawTraces) session.drawTraces(traceCtx);
        stepped = true;
      }
      lastFrameIdxRef.current = last;
      if (stepped) session.draw(ctx);
    };

    const targetFrame = () => {
      const tl = timelineRef.current;
      if (!tl) return -1;
      return Math.floor(audio.currentTime * tl.frameRate);
    };

    const loop = () => {
      syncTo(targetFrame());
      if (!audio.paused && !audio.ended) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null;
      }
    };

    const onPlay = () => {
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    const onStop = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Snap the visuals to wherever the player ended up (matters for the
      // pause that fires alongside a scrub-while-playing).
      syncTo(targetFrame());
    };
    const onSeeked = () => {
      syncTo(targetFrame());
      if (!audio.paused && !audio.ended && rafRef.current == null) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onStop);
    audio.addEventListener('ended', onStop);
    audio.addEventListener('seeked', onSeeked);

    // Initial sync for the case where this effect mounts after the user is
    // already partway through (e.g. audio loaded before effect mounts).
    syncTo(targetFrame());
    if (!audio.paused && !audio.ended) {
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onStop);
      audio.removeEventListener('ended', onStop);
      audio.removeEventListener('seeked', onSeeked);
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
      const { features: feat, timeline } = await analyzeAudioFile(arrayBuffer);
      timelineRef.current = timeline;
      // New file → new session will be built by the session-creation effect
      // when features change. Reset the cursor so the playback effect knows
      // there's nothing to step from yet.
      lastFrameIdxRef.current = -1;
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

  // Fetch any direct audio URL and run it through the pipeline. Browsers
  const loadFromUrl = async () => {
    const raw = urlInput.trim();
    if (!raw) return;
    setError(null);

    if (/youtu\.?be|spotify|soundcloud|apple\.com\/.*music/i.test(raw)) {
      setError(
        "Streaming services don't expose audio to browsers. Paste a direct .mp3/.wav URL (try archive.org, Pixabay, ccMixter)."
      );
      return;
    }
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      setError("That doesn't look like a valid URL.");
      return;
    }

    setStatus('fetching');
    try {
      // Try a direct fetch first. If CORS blocks it (TypeError), retry via
      // the server-side proxy at /api/proxy which has no CORS restrictions.
      let res;
      try {
        res = await fetch(raw);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      } catch (directErr) {
        if (!(directErr instanceof TypeError)) throw directErr;
        res = await fetch(`/api/proxy?url=${encodeURIComponent(raw)}`);
        if (!res.ok) throw new Error(res.status === 413
          ? await res.text()
          : `HTTP ${res.status} ${res.statusText}`
        );
      }

      const lenHeader = res.headers.get('content-length');
      if (lenHeader && parseInt(lenHeader, 10) > 50 * 1024 * 1024) {
        throw new Error('Audio is larger than 50 MB.');
      }
      const arrayBuffer = await res.arrayBuffer();
      const filename = parsed.pathname.split('/').pop() || parsed.hostname;
      const label = filename.split('?')[0].replace(/\.[a-z0-9]+$/i, '') || 'remote-audio';
      await runPipeline(arrayBuffer, label, res.headers.get('content-type'));
    } catch (err) {
      setError(err.message || 'Failed to load URL');
      setStatus('idle');
    }
  };

  const updateFeature = (key, value) => {
    setFeatures((prev) => ({ ...prev, [key]: value }));
  };

  const randomizeSeed = () => {
    setSeed(Math.floor(Math.random() * 0xffffffff) >>> 0);
  };

  const downloadPng = () => {
    const canvas = traceCanvasRef.current;
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

  const isBusy = status === 'fetching' || status === 'decoding' || status === 'analyzing';

  return (
    <div className="min-h-screen bg-black p-8 lg:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-2">Sound → Image</h1>
            <p className="text-white/50">Particles pulled by live bass / mid / treble energy</p>
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

        <div className="flex flex-col gap-8">
          <div className="flex flex-col">
            {/* User controls */}
            <div className="flex flex-wrap gap-3 mb-4">
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
                onClick={() => setRgbLayerMode((v) => !v)}
                disabled={isBusy}
                className={`px-6 py-3 border font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 ${
                  rgbLayerMode
                    ? 'border-fuchsia-400/60 text-fuchsia-300 hover:bg-fuchsia-400/10'
                    : 'border-white/30 text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                {rgbLayerMode ? 'RGB layers' : 'Standard'}
              </button>
              <button
                onClick={micActive ? stopMic : startMic}
                disabled={isBusy}
                className={`px-6 py-3 border font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 ${
                  micActive
                    ? 'border-red-400/60 text-red-300 hover:bg-red-400/10'
                    : 'border-white/30 text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                {micActive ? <MicOff size={16} /> : <Mic size={16} />}
                {micActive ? 'Stop Mic' : 'Use Mic'}
              </button>
              <button
                onClick={downloadPng}
                className="px-6 py-3 border border-white/30 text-white/70 font-semibold hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
              >
                <Download size={16} />
                Save etching
              </button>
            </div>

            {/* Dev tools — collapsible */}
            <div className="mb-6">
              <button
                onClick={() => setShowDevTools((v) => !v)}
                className="text-xs uppercase tracking-wider text-white/30 hover:text-white/60 transition-colors flex items-center gap-2 mb-3"
              >
                <span>{showDevTools ? '▾' : '▸'}</span>
                Dev tools
              </button>
              {showDevTools && (
                <div className="flex flex-wrap gap-3 pl-4 border-l border-white/10">
                  <button
                    onClick={() => setShowDebug((v) => !v)}
                    className={`px-4 py-2 text-sm border font-semibold flex items-center gap-2 transition-colors ${
                      showDebug
                        ? 'border-yellow-400/60 text-yellow-300 hover:bg-yellow-400/10'
                        : 'border-white/20 text-white/40 hover:bg-white/5 hover:text-white/70'
                    }`}
                  >
                    Debug overlay: {showDebug ? 'on' : 'off'}
                  </button>
                  <button
                    onClick={() => setStationaryWells((v) => !v)}
                    className={`px-4 py-2 text-sm border font-semibold flex items-center gap-2 transition-colors ${
                      stationaryWells
                        ? 'border-cyan-400/60 text-cyan-300 hover:bg-cyan-400/10'
                        : 'border-white/20 text-white/40 hover:bg-white/5 hover:text-white/70'
                    }`}
                  >
                    Wells: {stationaryWells ? 'static' : 'moving'}
                  </button>
                  {['Bass', 'Mid', 'Treble'].map((label, b) => (
                    <button
                      key={label}
                      onClick={() => toggleBand(b)}
                      className={`px-4 py-2 text-sm border font-semibold flex items-center gap-2 transition-colors ${
                        bandsEnabled[b]
                          ? 'border-white/40 text-white/70 hover:bg-white/10'
                          : 'border-white/10 text-white/20 hover:bg-white/5'
                      }`}
                    >
                      {label}: {bandsEnabled[b] ? 'on' : 'off'}
                    </button>
                  ))}
                  {['particles', 'wells', 'events'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => toggleTraceMode(mode)}
                      className={`px-4 py-2 text-sm border font-semibold flex items-center gap-2 transition-colors ${
                        traceModes[mode]
                          ? 'border-fuchsia-400/60 text-fuchsia-300 hover:bg-fuchsia-400/10'
                          : 'border-white/10 text-white/20 hover:bg-white/5'
                      }`}
                    >
                      Trace {mode}: {traceModes[mode] ? 'on' : 'off'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 mb-6">
              <input
                type="text"
                placeholder="Paste a direct audio URL (.mp3, .wav, .ogg, ...)"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') loadFromUrl(); }}
                disabled={isBusy}
                className="flex-1 px-4 py-3 bg-black border border-white/30 text-white placeholder-white/30 focus:outline-none focus:border-white/60 disabled:opacity-50"
              />
              <button
                onClick={loadFromUrl}
                disabled={isBusy || !urlInput.trim()}
                className="px-6 py-3 border border-white/30 text-white/70 font-semibold hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
              >
                Load URL
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className="flex gap-4">
              <div className="border border-white/20 bg-black aspect-square flex-1 min-w-0">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="border border-white/20 bg-black aspect-square flex-1 min-w-0">
                <canvas
                  ref={traceCanvasRef}
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {audioUrl && status === 'done' && (
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
                {status === 'fetching' && 'Fetching audio...'}
                {status === 'decoding' && 'Decoding audio...'}
                {status === 'analyzing' && 'Extracting features...'}
              </p>
            )}

            {audioUrl && status === 'done' && (
              <p className="mt-2 text-white/40 text-xs">
                Press play — particles are pulled by live bass / mid / treble energy.
              </p>
            )}
          </div>

          <div className="flex flex-col">
            <h2 className="text-sm uppercase tracking-wider text-white/40 font-semibold mb-4">
              Features
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
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
