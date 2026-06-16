import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { createStippleSession } from '../stippleGenerator';

// Trace fade settings.
// Canvas stores 8-bit integers, so tiny per-frame rgba fills never actually
// decrement pixel values — they round back to the same value. Instead we use
// getImageData/putImageData every FADE_INTERVAL_FRAMES and scale each channel
// by FADE_SCALE, which uses real arithmetic and drives every pixel to 0.
//
// FADE_DURATION_S = how long (seconds) until the brightest possible trace (V=255)
// fully disappears. Lower-brightness traces fade proportionally faster.
const FADE_DURATION_S      = 900; // 15 minutes
const FADE_INTERVAL_FRAMES = 120; // apply the fade step every 2 seconds at 60 fps
// Per-interval multiplier: V=255 reaches 0 in exactly (FADE_DURATION_S / 2) applications.
const FADE_SCALE = Math.exp(-Math.log(255) / (FADE_DURATION_S / (FADE_INTERVAL_FRAMES / 60)));

// Auto-capture interval: silently capture + upload to imgBB every N ms.
const AUTO_CAPTURE_MS = 30_000;

// Upload the captured frame to imgBB and return the public URL.
// Requires VITE_IMGBB_API_KEY in .env.local / Vercel environment variables.
// Get a free key at https://imgbb.com — sign up, go to API, create key.
async function uploadToImgBB(blob) {
  const apiKey = import.meta.env.VITE_IMGBB_API_KEY;
  if (!apiKey) return null;
  try {
    const form = new FormData();
    form.append('key', apiKey);
    form.append('image', blob, 'exhibit.jpg');
    const res = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: form });
    const data = await res.json();
    return data.success ? data.data.url : null;
  } catch {
    return null;
  }
}

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Exhibitor config via URL params so there's no UI to stumble on during display.
// Example: /exhibit?angularity=0.8&complexity=0.7&seed=show1
function parseFeatures(searchParams) {
  const p = (key, def) => {
    const v = parseFloat(searchParams.get(key) ?? String(def));
    return isNaN(v) ? def : Math.max(0, Math.min(1, v));
  };
  return {
    angularity: p('angularity', 0.5),
    brightness: p('brightness', 0.5),
    warmth:     p('warmth',     0.5),
    complexity: p('complexity', 0.6),
    rhythm:     p('rhythm',     0),
    saturation: p('saturation', 0.5),
    texture:    p('texture',    0.3),
  };
}

const ExhibitionPage = () => {
  const [searchParams] = useSearchParams();

  // Two canvases: trace (bottom) + particle (top, mix-blend-mode: screen)
  // screen blend: canvas black areas → transparent, white particles → white.
  const traceCanvasRef = useRef(null);
  const canvasRef      = useRef(null);
  const stippleSessionRef = useRef(null);
  const rafRef = useRef(null);

  // Mic
  const micStreamRef   = useRef(null);
  const micContextRef  = useRef(null);
  const micAnalyserRef = useRef(null);
  const prevSpectrumRef = useRef(null);

  // Shared canvas dimensions — set once in init, read in the rAF loop.
  // cssW/cssH are logical pixels; the actual canvas buffer is physW/physH.
  const canvasSizeRef  = useRef({ dpr: 1, cssW: 0, cssH: 0, physW: 0, physH: 0 });
  // Counts frames since the last ImageData fade step.
  const fadeCounterRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [error, setError]     = useState(null);
  const [syncing, setSyncing] = useState(false);

  // Init canvases and particle session on mount
  useEffect(() => {
    const particleCanvas = canvasRef.current;
    const traceCanvas    = traceCanvasRef.current;
    if (!particleCanvas || !traceCanvas) return;

    // Use physical pixel dimensions so the canvas is sharp at every DPR.
    // The stipple session is created in CSS pixel space; the context transform
    // maps CSS pixel drawing commands onto the higher-res buffer.
    const dpr  = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const physW = Math.round(cssW * dpr);
    const physH = Math.round(cssH * dpr);
    canvasSizeRef.current = { dpr, cssW, cssH, physW, physH };

    particleCanvas.width  = physW;
    particleCanvas.height = physH;
    traceCanvas.width     = physW;
    traceCanvas.height    = physH;

    // Scale both contexts once so all subsequent drawing is in CSS pixels.
    const pCtx = particleCanvas.getContext('2d');
    const tCtx = traceCanvas.getContext('2d');
    pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Trace canvas starts as solid black (CSS pixel coords after transform)
    tCtx.fillStyle = '#000';
    tCtx.fillRect(0, 0, cssW, cssH);

    const features = parseFeatures(searchParams);
    const seed     = hashString(searchParams.get('seed') ?? 'exhibition');
    // Session is created in CSS pixel space — positions, radii, etc. all match.
    const session  = createStippleSession(features, seed, cssW, cssH);
    stippleSessionRef.current = session;

    // Initial draw — shows settled particle field before mic starts
    session.draw(pCtx);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
      if (micContextRef.current) micContextRef.current.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Request mic access + fullscreen, then start the rAF loop
  const startExhibition = async () => {
    setError(null);
    try {
      const stream    = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const audioCtx  = new AudioContext();
      const source    = audioCtx.createMediaStreamSource(stream);
      const analyser  = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      micStreamRef.current   = stream;
      micContextRef.current  = audioCtx;
      micAnalyserRef.current = analyser;
      prevSpectrumRef.current = new Uint8Array(analyser.frequencyBinCount);
      document.documentElement.requestFullscreen?.().catch(() => {});
      setStarted(true);
    } catch {
      setError('Microphone access was denied. Allow access and click to try again.');
    }
  };

  // Mic-driven rAF loop
  useEffect(() => {
    if (!started) return;
    const analyser       = micAnalyserRef.current;
    const particleCanvas = canvasRef.current;
    const traceCanvas    = traceCanvasRef.current;
    if (!analyser || !particleCanvas || !traceCanvas) return;

    const ctx  = particleCanvas.getContext('2d');
    const tctx = traceCanvas.getContext('2d');
    const { dpr, physW, physH } = canvasSizeRef.current;

    const binCount   = analyser.frequencyBinCount;
    const spectrum   = new Uint8Array(binCount);
    const sampleRate = micContextRef.current.sampleRate;
    const binHz  = sampleRate / analyser.fftSize;
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
        const p = prev[i]    / 255;
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

        // Re-apply DPR transform each frame (guards against any internal reset).
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        tctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Fade existing traces every FADE_INTERVAL_FRAMES using ImageData.
        // Per-frame rgba fills don't work — 8-bit rounding means tiny alpha
        // values never actually decrement pixel brightness. ImageData lets us
        // multiply with real arithmetic so every pixel eventually reaches 0.
        fadeCounterRef.current++;
        if (fadeCounterRef.current >= FADE_INTERVAL_FRAMES) {
          fadeCounterRef.current = 0;
          // Identity transform to access physical pixels directly.
          tctx.setTransform(1, 0, 0, 1, 0, 0);
          const imgData = tctx.getImageData(0, 0, physW, physH);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            d[i]   = (d[i]   * FADE_SCALE) | 0;
            d[i+1] = (d[i+1] * FADE_SCALE) | 0;
            d[i+2] = (d[i+2] * FADE_SCALE) | 0;
            // d[i+3] is alpha — leave at 255 (canvas is fully opaque)
          }
          tctx.putImageData(imgData, 0, 0);
          // Restore DPR transform for drawTraces below.
          tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        // Add new trace segments on top of the (now slightly faded) history.
        session.drawTraces(tctx);

        // Particle canvas: normal draw (black bg + white particles)
        session.draw(ctx);
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [started]);

  // Auto-capture: composite both canvases → JPEG → imgBB → relay to Redis
  useEffect(() => {
    if (!started) return;
    if (!import.meta.env.VITE_IMGBB_API_KEY) return;

    const captureAndUpload = async () => {
      const particleCanvas = canvasRef.current;
      const traceCanvas    = traceCanvasRef.current;
      if (!particleCanvas || !traceCanvas) return;

      // Composite trace + particles on an offscreen canvas for export.
      const { dpr } = canvasSizeRef.current;
      const stripeH  = Math.round(72 * dpr);
      const fontSize = Math.round(17 * dpr);

      const offscreen = document.createElement('canvas');
      offscreen.width  = particleCanvas.width;
      offscreen.height = particleCanvas.height + stripeH;
      const octx = offscreen.getContext('2d');

      octx.drawImage(traceCanvas, 0, 0);
      octx.globalCompositeOperation = 'screen';
      octx.drawImage(particleCanvas, 0, 0);
      octx.globalCompositeOperation = 'source-over';

      // Black stripe appended below the image
      octx.fillStyle = '#000000';
      octx.fillRect(0, particleCanvas.height, particleCanvas.width, stripeH);

      octx.fillStyle = '#ffffff';
      octx.font = `${fontSize}px Consolas, monospace`;
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';
      octx.fillText(
        'Instagram  @olqwznm  @anthony_80808',
        particleCanvas.width / 2,
        particleCanvas.height + stripeH / 2
      );

      const blob = await new Promise(res => offscreen.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) return;

      const url = await uploadToImgBB(blob);
      if (!url) return;

      setSyncing(true);
      try {
        await fetch('/api/set-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
      } catch {
        // silently ignore — next capture will retry
      }
      setTimeout(() => setSyncing(false), 1500);
    };

    // First capture after 5 s (let animation settle), then every 30 s
    const initialTimer = setTimeout(captureAndUpload, 5000);
    const interval     = setInterval(captureAndUpload, AUTO_CAPTURE_MS);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [started]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">

      {/* Trace canvas — bottom layer, accumulates particle path history */}
      <canvas
        ref={traceCanvasRef}
        className="absolute inset-0 block w-full h-full"
      />

      {/* Particle canvas — top layer.
          mix-blend-mode: screen makes the black fill transparent so the
          trace canvas shows through, while white particles stay bright. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block w-full h-full"
        style={{ mixBlendMode: 'screen' }}
      />

      {/* Click-to-start overlay — covers everything until mic is granted */}
      {!started && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer select-none"
          onClick={startExhibition}
        >
          <div className="text-center">
            <p className="text-white/20 text-xs uppercase tracking-[0.3em] mb-10 font-mono">
              Bouba / Kiki
            </p>
            <p className="text-white/60 text-3xl font-thin mb-3">Click to begin</p>
            <p className="text-white/20 text-sm">Microphone access required</p>
            {error && (
              <p className="text-red-400/50 text-sm mt-8 max-w-xs leading-relaxed">
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      {started && syncing && (
        <div className="absolute bottom-6 left-6 w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
      )}

      {/* QR code — bottom-right, with Polish label stacked to its left */}
      {started && (
        <div className="absolute bottom-6 right-6 flex items-center gap-4">
          <div className="text-right text-white/45 text-[13px] uppercase tracking-widest leading-[1.6] font-mono">
            <p>Zeskanuj</p>
            <p>swój</p>
            <p>obraz</p>
          </div>
          <div className="p-2 bg-black">
            <QRCodeSVG
              value={`${window.location.origin}/current`}
              size={101}
              bgColor="#000000"
              fgColor="#ffffff"
              level="M"
            />
          </div>
        </div>
      )}

    </div>
  );
};

export default ExhibitionPage;
