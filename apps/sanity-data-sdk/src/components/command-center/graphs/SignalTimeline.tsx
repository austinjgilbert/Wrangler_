/**
 * SignalTimeline.tsx — React wrapper for the signal timeline chart.
 *
 * Phase B: rAF→ref refactor + layout caching + stable onSpikesDetected.
 * Zero React re-renders during animation. Layout computed once via useMemo,
 * shared between hit test and draw.
 *
 * Integration: rendered inside Signals module Detail state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TimelineSignal, SpikeCallout } from './signal-timeline-adapter';
import { findSpikes } from './signal-timeline-adapter';
import { drawSignalTimeline, hitTestSignalTimeline, layoutSignals } from './signal-timeline-canvas';

const ANIM_MS = 1400;

export interface SignalTimelineProps {
  signals: TimelineSignal[];
  days: number;
  onSignalClick: (signal: TimelineSignal) => void;
  onSpikesDetected?: (spikes: SpikeCallout[]) => void;
  width: number;
  height: number;
}

export function SignalTimeline({
  signals,
  days,
  onSignalClick,
  onSpikesDetected,
  width,
  height,
}: SignalTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const progressRef = useRef(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [animDone, setAnimDone] = useState(false);

  // Stable callback ref (prevents dep instability)
  const spikeCbRef = useRef(onSpikesDetected);
  spikeCbRef.current = onSpikesDetected;

  // Layout caching — computed once per data/dimension change
  const cachedLayout = useMemo(
    () => layoutSignals(signals, days, width, height),
    [signals, days, width, height],
  );

  // Spike detection
  useEffect(() => {
    if (spikeCbRef.current && signals.length > 0) {
      spikeCbRef.current(findSpikes(signals, days));
    }
  }, [signals, days]);

  // Animation loop (ref-based, no setState during animation)
  useEffect(() => {
    startRef.current = performance.now();
    progressRef.current = 0;
    setAnimDone(false);
    setHoveredIndex(null);

    function tick() {
      const elapsed = performance.now() - startRef.current;
      progressRef.current = Math.min(1, elapsed / ANIM_MS);
      const canvas = canvasRef.current;
      if (canvas) drawSignalTimeline(canvas, signals, days, width, height, progressRef.current, null, cachedLayout);
      if (progressRef.current < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        setAnimDone(true);
        animRef.current = null;
      }
    }

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [signals, days, width, height, cachedLayout]);

  useEffect(() => {
    if (animDone && canvasRef.current) {
      drawSignalTimeline(canvasRef.current, signals, days, width, height, 1, hoveredIndex, cachedLayout);
    }
  }, [hoveredIndex, animDone, signals, days, width, height, cachedLayout]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!animDone) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const hit = hitTestSignalTimeline(e.clientX - rect.left, e.clientY - rect.top, signals, days, width, height, cachedLayout);
      setHoveredIndex(hit);
      e.currentTarget.style.cursor = hit !== null ? 'pointer' : 'default';
    },
    [animDone, signals, days, width, height, cachedLayout],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!animDone) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const hit = hitTestSignalTimeline(e.clientX - rect.left, e.clientY - rect.top, signals, days, width, height, cachedLayout);
      if (hit !== null && signals[hit]) {
        onSignalClick(signals[hit]);
      }
    },
    [animDone, signals, days, width, height, cachedLayout, onSignalClick],
  );

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{ display: 'block', width, height }}
    />
  );
}
