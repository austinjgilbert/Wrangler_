/**
 * PortfolioHeatMap.tsx — React wrapper for the portfolio heat map.
 *
 * Phase B: Two-layer canvas + rAF→ref + pre-sorted array.
 *   Base canvas: static grid, redraws only on data change.
 *   Overlay canvas: hover highlight + tooltip, redraws on mousemove (~0.5ms).
 *
 * Integration: rendered inside MorningBriefingLanding (no account selected).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HeatMapAccount } from './heat-map-adapter';
import {
  sortHeatMapAccounts,
  drawHeatMapBase,
  drawHeatMapOverlay,
  hitTestHeatMap,
} from './heat-map-canvas';

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
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const progressRef = useRef(0);
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null);
  const [animDone, setAnimDone] = useState(false);

  // Pre-sort once — shared by canvas and click handler (eliminates duplicate sort)
  const sorted = useMemo(() => sortHeatMapAccounts(accounts), [accounts]);

  // Animation loop (base layer only, ref-based)
  useEffect(() => {
    startRef.current = performance.now();
    progressRef.current = 0;
    setAnimDone(false);
    setHovered(null);

    // Clear overlay on data change
    if (overlayRef.current) {
      const oc = overlayRef.current.getContext('2d');
      if (oc) oc.clearRect(0, 0, width, height);
    }

    function tick() {
      const elapsed = performance.now() - startRef.current;
      progressRef.current = Math.min(1, elapsed / ANIM_MS);
      if (baseRef.current) drawHeatMapBase(baseRef.current, sorted, width, height, progressRef.current);
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
  }, [sorted, width, height]);

  // Overlay redraws on hover (cheap — just tooltip + highlight)
  useEffect(() => {
    if (animDone && overlayRef.current) {
      drawHeatMapOverlay(overlayRef.current, sorted, width, height, hovered);
    }
  }, [hovered, animDone, sorted, width, height]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!animDone) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const hit = hitTestHeatMap(e.clientX - rect.left, e.clientY - rect.top, sorted, width);
      setHovered(hit);
      e.currentTarget.style.cursor = hit !== null ? 'pointer' : 'default';
    },
    [animDone, sorted, width],
  );

  const handleMouseLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!animDone) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const hit = hitTestHeatMap(e.clientX - rect.left, e.clientY - rect.top, sorted, width);
      if (hit !== null && sorted[hit.row]) {
        onAccountClick(sorted[hit.row].accountKey);
      }
    },
    [animDone, sorted, width, onAccountClick],
  );

  return (
    <div style={{ position: 'relative', width, height }}>
      <canvas
        ref={baseRef}
        style={{ position: 'absolute', top: 0, left: 0, display: 'block', width, height }}
      />
      <canvas
        ref={overlayRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{ position: 'absolute', top: 0, left: 0, display: 'block', width, height }}
      />
    </div>
  );
}
