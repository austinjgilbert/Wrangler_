/**
 * CompetitorMap.tsx — React wrapper for the competitor bubble chart.
 *
 * Phase B: rAF→ref refactor + layout caching. Zero React re-renders during
 * animation. Layout computed once via useMemo, shared between hit test and draw.
 *
 * Integration: rendered inside CompetitorsDetail when competitor data exists.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapCompetitor } from './competitor-map-adapter';
import { drawCompetitorMap, hitTestCompetitorMap, layoutNodes } from './competitor-map-canvas';

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
  const startRef = useRef(0);
  const progressRef = useRef(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [animDone, setAnimDone] = useState(false);

  // Layout caching — computed once per data/dimension change
  const cachedLayout = useMemo(
    () => layoutNodes(competitors, width, height),
    [competitors, width, height],
  );

  useEffect(() => {
    startRef.current = performance.now();
    progressRef.current = 0;
    setAnimDone(false);
    setHoveredIndex(null);

    function tick() {
      const elapsed = performance.now() - startRef.current;
      progressRef.current = Math.min(1, elapsed / ANIM_MS);
      const canvas = canvasRef.current;
      if (canvas) drawCompetitorMap(canvas, competitors, width, height, progressRef.current, null, cachedLayout);
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
  }, [competitors, width, height, cachedLayout]);

  useEffect(() => {
    if (animDone && canvasRef.current) {
      drawCompetitorMap(canvasRef.current, competitors, width, height, 1, hoveredIndex, cachedLayout);
    }
  }, [hoveredIndex, animDone, competitors, width, height, cachedLayout]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!animDone) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const hit = hitTestCompetitorMap(e.clientX - rect.left, e.clientY - rect.top, competitors, width, height, cachedLayout);
      setHoveredIndex(hit);
      e.currentTarget.style.cursor = hit !== null ? 'pointer' : 'default';
    },
    [animDone, competitors, width, height, cachedLayout],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!animDone) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const hit = hitTestCompetitorMap(e.clientX - rect.left, e.clientY - rect.top, competitors, width, height, cachedLayout);
      if (hit !== null && competitors[hit]) {
        onCompetitorClick(competitors[hit].domain);
      }
    },
    [animDone, competitors, width, height, cachedLayout, onCompetitorClick],
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
