import React, { useRef, useEffect, useCallback } from 'react';
import { createStippleSession } from '../stippleGenerator';
import { createTopologySession, createFormationsSession, createMemorySession } from '../stippleVariants';

const COMPARE_SIZE = 380;
const COMPARE_PARTICLES = 80;

const SYSTEM_LABELS = ['Standard', 'Topology', 'Formations', 'Memory'];
const SYSTEM_DESCS  = [
  'Existing system at reduced scale',
  'N attractor nodes — arrangement encodes bouba/kiki',
  'State machine — formations bloom and shatter',
  'Heat grid — memory attracts (bouba) or repels (kiki)',
];

function createSessions(features, seed) {
  return [
    createStippleSession(features, seed, COMPARE_SIZE, COMPARE_SIZE, COMPARE_PARTICLES),
    createTopologySession(features, seed, COMPARE_SIZE, COMPARE_SIZE),
    createFormationsSession(features, seed, COMPARE_SIZE, COMPARE_SIZE),
    createMemorySession(features, seed, COMPARE_SIZE, COMPARE_SIZE),
  ];
}

const CompareView = ({
  timelineRef,
  audioRef,
  features,
  seed,
  micActive,
  micAnalyserRef,
  micContextRef,
  status,
}) => {
  const liveRefs  = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const traceRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const sessionsRef    = useRef(null);
  const rafRef         = useRef(null);
  const micRafRef      = useRef(null);
  const lastFrameRef   = useRef(-1);
  const prevSpecRef    = useRef(null);

  const levelBuf    = useRef([0, 0, 0]);
  const fluxBuf     = useRef([0, 0, 0]);
  const centroidBuf = useRef([0.5, 0.5, 0.5]);
  const pitchBuf    = useRef([0.5, 0]);

  const clearTraces = useCallback(() => {
    for (let i = 0; i < 4; i++) {
      const tc = traceRefs[i].current;
      if (!tc) continue;
      const tctx = tc.getContext('2d');
      tctx.fillStyle = '#000';
      tctx.fillRect(0, 0, COMPARE_SIZE, COMPARE_SIZE);
    }
  }, []);

  // Build/rebuild sessions when features or seed change
  useEffect(() => {
    sessionsRef.current = createSessions(features, seed);
    lastFrameRef.current = -1;
    clearTraces();
    for (let i = 0; i < 4; i++) {
      const canvas = liveRefs[i].current;
      if (canvas) sessionsRef.current[i].draw(canvas.getContext('2d'));
    }
  }, [features, seed]);

  // ── File playback loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (micActive) return; // mic loop handles this case
    const audio = audioRef?.current;
    if (!audio) return;

    const tl = timelineRef?.current;

    const readFrame = (idx) => {
      if (!tl || tl.frameCount === 0) {
        levelBuf.current[0] = levelBuf.current[1] = levelBuf.current[2] = 0;
        fluxBuf.current[0]  = fluxBuf.current[1]  = fluxBuf.current[2]  = 0;
        centroidBuf.current[0] = centroidBuf.current[1] = centroidBuf.current[2] = 0.5;
        pitchBuf.current[0] = 0.5; pitchBuf.current[1] = 0;
        return;
      }
      const i = idx < 0 ? 0 : idx >= tl.frameCount ? tl.frameCount - 1 : idx;
      const off = i * 3;
      levelBuf.current[0] = tl.levels[off];
      levelBuf.current[1] = tl.levels[off + 1];
      levelBuf.current[2] = tl.levels[off + 2];
      fluxBuf.current[0]  = tl.flux[off];
      fluxBuf.current[1]  = tl.flux[off + 1];
      fluxBuf.current[2]  = tl.flux[off + 2];
      if (tl.centroids) {
        centroidBuf.current[0] = tl.centroids[off];
        centroidBuf.current[1] = tl.centroids[off + 1];
        centroidBuf.current[2] = tl.centroids[off + 2];
      } else {
        centroidBuf.current[0] = centroidBuf.current[1] = centroidBuf.current[2] = 0.5;
      }
      pitchBuf.current[0] = tl.pitches     ? tl.pitches[i]     : 0.5;
      pitchBuf.current[1] = tl.confidences ? tl.confidences[i] : 0;
    };

    const syncTo = (targetIdx) => {
      const sessions = sessionsRef.current;
      if (!sessions) return;
      let last = lastFrameRef.current;
      let stepped = false;
      if (targetIdx < last) {
        sessions.forEach(s => s.reset());
        last = -1; stepped = true;
        clearTraces();
      }
      while (last < targetIdx) {
        last++;
        readFrame(last);
        sessions.forEach(s => s.update(levelBuf.current, fluxBuf.current, centroidBuf.current, pitchBuf.current));
        for (let i = 0; i < 4; i++) {
          const tc = traceRefs[i].current;
          if (tc && sessions[i].drawTraces) sessions[i].drawTraces(tc.getContext('2d'));
        }
        stepped = true;
      }
      lastFrameRef.current = last;
      if (stepped) {
        for (let i = 0; i < 4; i++) {
          const canvas = liveRefs[i].current;
          if (canvas) sessions[i].draw(canvas.getContext('2d'));
        }
      }
    };

    const targetFrame = () => {
      const tl = timelineRef?.current;
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

    const onPlay   = () => { if (rafRef.current == null) rafRef.current = requestAnimationFrame(loop); };
    const onStop   = () => { if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } syncTo(targetFrame()); };
    const onSeeked = () => { syncTo(targetFrame()); if (!audio.paused && !audio.ended && rafRef.current == null) rafRef.current = requestAnimationFrame(loop); };

    audio.addEventListener('play',   onPlay);
    audio.addEventListener('pause',  onStop);
    audio.addEventListener('ended',  onStop);
    audio.addEventListener('seeked', onSeeked);

    syncTo(targetFrame());
    if (!audio.paused && !audio.ended) rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      audio.removeEventListener('play',   onPlay);
      audio.removeEventListener('pause',  onStop);
      audio.removeEventListener('ended',  onStop);
      audio.removeEventListener('seeked', onSeeked);
    };
  }, [status, micActive]);

  // ── Mic loop ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!micActive) return;
    const analyser = micAnalyserRef?.current;
    if (!analyser) return;

    const binCount  = analyser.frequencyBinCount;
    const sampleRate = micContextRef.current.sampleRate;
    const binHz  = sampleRate / analyser.fftSize;
    const bassEnd = Math.min(binCount - 1, Math.round(1500 / binHz));
    const midEnd  = Math.min(binCount - 1, Math.round(6000 / binHz));
    const pitchLo = Math.max(0, Math.round(80   / binHz));
    const pitchHi = Math.min(binCount - 1, Math.round(1300 / binHz));
    const spectrum = new Uint8Array(binCount);
    if (!prevSpecRef.current || prevSpecRef.current.length !== binCount) {
      prevSpecRef.current = new Uint8Array(binCount);
    }

    const computeBand = (start, end, idx) => {
      const prev = prevSpecRef.current;
      let energy = 0, flux = 0, centNum = 0, centDen = 0;
      const count = end - start;
      if (count <= 0) return;
      for (let i = start; i < end; i++) {
        const v = spectrum[i] / 255, p = prev[i] / 255;
        energy += v * v; flux += Math.max(0, v - p);
        centNum += v * (i - start); centDen += v;
      }
      levelBuf.current[idx]    = Math.sqrt(energy / count);
      fluxBuf.current[idx]     = flux / count;
      centroidBuf.current[idx] = centDen > 0 ? centNum / centDen / count : 0.5;
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
      pitchBuf.current[0] = Math.max(0, Math.min(1, Math.log(hz / 80) / Math.log(1300 / 80)));
      let mean = 0;
      for (let i = pitchLo; i <= pitchHi; i++) mean += spectrum[i] / 255;
      mean /= Math.max(1, pitchHi - pitchLo + 1);
      pitchBuf.current[1] = mean > 0.05 ? Math.min(1, bestVal / (mean * mean * mean + 0.001) * 0.1) : 0;
    };

    const loop = () => {
      const sessions = sessionsRef.current;
      if (sessions) {
        analyser.getByteFrequencyData(spectrum);
        computeBand(0, bassEnd, 0);
        computeBand(bassEnd, midEnd, 1);
        computeBand(midEnd, binCount, 2);
        computePitch();
        prevSpecRef.current.set(spectrum);
        sessions.forEach(s => s.update(levelBuf.current, fluxBuf.current, centroidBuf.current, pitchBuf.current));
        for (let i = 0; i < 4; i++) {
          const tc = traceRefs[i].current;
          if (tc && sessions[i].drawTraces) sessions[i].drawTraces(tc.getContext('2d'));
          const canvas = liveRefs[i].current;
          if (canvas) sessions[i].draw(canvas.getContext('2d'));
        }
      }
      micRafRef.current = requestAnimationFrame(loop);
    };

    micRafRef.current = requestAnimationFrame(loop);
    return () => { if (micRafRef.current) { cancelAnimationFrame(micRafRef.current); micRafRef.current = null; } };
  }, [micActive]);

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-6">
        {SYSTEM_LABELS.map((label, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="border border-white/20 bg-black flex-1 aspect-square">
                <canvas
                  ref={liveRefs[i]}
                  width={COMPARE_SIZE}
                  height={COMPARE_SIZE}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="border border-white/10 bg-black flex-1 aspect-square">
                <canvas
                  ref={traceRefs[i]}
                  width={COMPARE_SIZE}
                  height={COMPARE_SIZE}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">{label}</span>
              <span className="text-xs text-white/30 ml-2">{SYSTEM_DESCS[i]}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CompareView;
