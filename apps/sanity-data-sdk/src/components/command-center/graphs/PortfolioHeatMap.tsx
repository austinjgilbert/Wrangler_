/**
 * PortfolioHeatMap.tsx — React wrapper for the portfolio heat map.
 *
 * Handles: canvas ref, 1.2s entry animation, mousemove hit testing,
 * click → onAccountClick(accountKey). Stops animation after completion.
 *
 * Integration: rendered inside MorningBriefingLanding (no account selected).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HeatMapAccount } from './heat-map-adapter';
import { drawHeatMap, hitTestHeatMap } from './heat-map-canvas';

const ANIM_MS = 1200;

export interface PortfolioHeatMapProps {
  accounts: HeatMapAccount[];
  onAccountClick: (accountKey: string) => void;
  width: number;
  height: number;
}

export function PortfolioHeatMap({
  accounts,
  onAccountClick,
  width,
  height,
}: PortfolioHeatMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const startRef = useRef(performance.now());
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null);
  const [animDone, setAnimDone] = useState(false);

  // Sort accounts same as canvas for consistent indexing
  const sorted = [...accounts].sort((a, b) => {
    if (a.hot !== b.hot) return a.hot ? -1 : 1;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  const draw = useCallback(
    (progress: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawHeatMap(canvas, accounts, width, height, progress, hovered);
    },
    [accounts, width, height, hovered],
  );

  useEffect(() => {
    startRef.current = performance.now();
    setAnimDone(false);
    setHovered(null);

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
  }, [accounts, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (animDone) draw(1);
  }, [hovered, animDone, draw]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!animDone) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const hit = hitTestHeatMap(e.clientX - rect.left, e.clientY - rect.top, accounts, width);
      setHovered(hit);
      e.currentTarget.style.cursor = hit !== null ? 'pointer' : 'default';
    },
    [animDone, accounts, width],
  );

  const handleMouseLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!animDone) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const hit = hitTestHeatMap(e.clientX - rect.left, e.clientY - rect.top, accounts, width);
      if (hit !== null && sorted[hit.row]) {
        onAccountClick(sorted[hit.row].accountKey);
      }
    },
    [animDone, accounts, width, sorted, onAccountClick],
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
