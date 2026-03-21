/**
 * CompetitorMap.tsx — React wrapper for the competitor bubble chart.
 *
 * Handles: canvas ref, animation loop (1.2s entry), mousemove hit testing,
 * click → onCompetitorClick(domain). Stops animation after completion.
 *
 * Integration: rendered inside CompetitorsDetail when competitor data exists.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapCompetitor } from './competitor-map-adapter';
import { drawCompetitorMap, hitTestCompetitorMap } from './competitor-map-canvas';

const ANIM_MS = 1200;

export interface CompetitorMapProps {
  competitors: MapCompetitor[];
  onCompetitorClick: (domain: string) => void;
  width: number;
  height: number;
}

export function CompetitorMap({
  competitors,
  onCompetitorClick,
  width,
  height,
}: CompetitorMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const startRef = useRef(performance.now());
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [animDone, setAnimDone] = useState(false);

  // ── Animation Loop ──────────────────────────────────────────────
  const draw = useCallback(
    (progress: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawCompetitorMap(canvas, competitors, width, height, progress, hoveredIndex);
    },
    [competitors, width, height, hoveredIndex],
  );

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
  }, [competitors, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const hit = hitTestCompetitorMap(mx, my, competitors, width, height);
      setHoveredIndex(hit);
      e.currentTarget.style.cursor = hit !== null ? 'pointer' : 'default';
    },
    [animDone, competitors, width, height],
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
      const hit = hitTestCompetitorMap(mx, my, competitors, width, height);
      if (hit !== null && competitors[hit]) {
        onCompetitorClick(competitors[hit].domain);
      }
    },
    [animDone, competitors, width, height, onCompetitorClick],
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
