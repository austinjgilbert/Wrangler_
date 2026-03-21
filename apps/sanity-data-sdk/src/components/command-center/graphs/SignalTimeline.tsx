/**
 * SignalTimeline.tsx — React wrapper for the signal timeline chart.
 *
 * Handles: canvas ref, animation loop (1.4s entry with eased dots),
 * mousemove hit testing, click → onSignalClick(signal).
 * Stops animation after completion. Exposes spike callouts via callback.
 *
 * Integration: rendered inside Signals module Detail state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimelineSignal, SpikeCallout } from './signal-timeline-adapter';
import { findSpikes } from './signal-timeline-adapter';
import { drawSignalTimeline, hitTestSignalTimeline } from './signal-timeline-canvas';

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
  const startRef = useRef(performance.now());
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [animDone, setAnimDone] = useState(false);

  // ── Spike Detection ─────────────────────────────────────────────
  useEffect(() => {
    if (onSpikesDetected && signals.length > 0) {
      const spikes = findSpikes(signals, days);
      onSpikesDetected(spikes);
    }
  }, [signals, days, onSpikesDetected]);

  // ── Draw ────────────────────────────────────────────────────────
  const draw = useCallback(
    (progress: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawSignalTimeline(canvas, signals, days, width, height, progress, hoveredIndex);
    },
    [signals, days, width, height, hoveredIndex],
  );

  // ── Animation Loop ──────────────────────────────────────────────
  useEffect(() => {
    startRef.current = performance.now();
    setAnimDone(false);
    setHoveredIndex(null);

    function tick() {
      const elapsed = performance.now() - startRef.current;
      const progress = Math.min(1, elapsed / ANIM_MS);
      draw(progress);
      if (progress < 1) {
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
  }, [signals, days, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw on hover change (only after animation completes)
  useEffect(() => {
    if (animDone) draw(1);
  }, [hoveredIndex, animDone, draw]);

  // ── Mouse Events ────────────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!animDone) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hit = hitTestSignalTimeline(mx, my, signals, days, width, height);
      setHoveredIndex(hit);
      e.currentTarget.style.cursor = hit !== null ? 'pointer' : 'default';
    },
    [animDone, signals, days, width, height],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!animDone) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hit = hitTestSignalTimeline(mx, my, signals, days, width, height);
      if (hit !== null && signals[hit]) {
        onSignalClick(signals[hit]);
      }
    },
    [animDone, signals, days, width, height, onSignalClick],
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
