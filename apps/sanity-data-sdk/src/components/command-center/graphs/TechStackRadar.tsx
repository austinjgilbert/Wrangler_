/**
 * TechStackRadar.tsx — React wrapper for the tech stack radar chart.
 *
 * Phase B: rAF→ref refactor — zero React re-renders during animation.
 *
 * Integration: rendered inside TechStackDetail module.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RadarCategory } from './tech-radar-adapter';
import { drawTechRadar, hitTestRadar } from './tech-radar-canvas';

const ANIM_MS = 1200;

export interface TechStackRadarProps {
  categories: RadarCategory[];
  onCategoryClick: (category: string) => void;
  width: number;
  height: number;
}

export function TechStackRadar({
  categories,
  onCategoryClick,
  width,
  height,
}: TechStackRadarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const progressRef = useRef(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [animDone, setAnimDone] = useState(false);

  useEffect(() => {
    startRef.current = performance.now();
    progressRef.current = 0;
    setAnimDone(false);
    setHoveredIndex(null);

    function tick() {
      const elapsed = performance.now() - startRef.current;
      progressRef.current = Math.min(1, elapsed / ANIM_MS);
      const canvas = canvasRef.current;
      if (canvas) drawTechRadar(canvas, categories, width, height, progressRef.current, null);
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
  }, [categories, width, height]);

  useEffect(() => {
    if (animDone && canvasRef.current) {
      drawTechRadar(canvasRef.current, categories, width, height, 1, hoveredIndex);
    }
  }, [hoveredIndex, animDone, categories, width, height]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!animDone) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const hit = hitTestRadar(e.clientX - rect.left, e.clientY - rect.top, categories, width, height);
      setHoveredIndex(hit);
      e.currentTarget.style.cursor = hit !== null ? 'pointer' : 'default';
    },
    [animDone, categories, width, height],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!animDone) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const hit = hitTestRadar(e.clientX - rect.left, e.clientY - rect.top, categories, width, height);
      if (hit !== null && categories[hit]) {
        onCategoryClick(categories[hit].name);
      }
    },
    [animDone, categories, width, height, onCategoryClick],
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
