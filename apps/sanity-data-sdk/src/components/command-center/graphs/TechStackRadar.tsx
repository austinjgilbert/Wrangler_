/**
 * TechStackRadar.tsx — React wrapper for the tech stack radar chart.
 *
 * Handles: canvas ref, 1.2s entry animation, mousemove hit testing,
 * click → onCategoryClick(category). Stops animation after completion.
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
  const startRef = useRef(performance.now());
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [animDone, setAnimDone] = useState(false);

  const draw = useCallback(
    (progress: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawTechRadar(canvas, categories, width, height, progress, hoveredIndex);
    },
    [categories, width, height, hoveredIndex],
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
  }, [categories, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (animDone) draw(1);
  }, [hoveredIndex, animDone, draw]);

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
