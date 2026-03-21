/**
 * PipelineFlow.tsx — React wrapper for the pipeline flow chart.
 *
 * Handles: canvas ref, 1.2s entry animation, mousemove hit testing,
 * click → onStageClick(stageName). Stops animation after completion.
 *
 * Integration: rendered inside ResearchDetail module below PipelineBar.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlowStage } from './pipeline-flow-adapter';
import { pipelineSummary } from './pipeline-flow-adapter';
import { drawPipelineFlow, hitTestPipelineFlow } from './pipeline-flow-canvas';
import type { PipelineStage } from '../../../lib/adapters/types';

const ANIM_MS = 1200;

export interface PipelineFlowProps {
  stages: FlowStage[];
  pipelineStages: PipelineStage[];
  onStageClick: (stageName: string) => void;
  width: number;
  height: number;
}

export function PipelineFlow({
  stages,
  pipelineStages,
  onStageClick,
  width,
  height,
}: PipelineFlowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const startRef = useRef(performance.now());
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [animDone, setAnimDone] = useState(false);

  const healthMessage = pipelineSummary(pipelineStages);

  const draw = useCallback(
    (progress: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawPipelineFlow(canvas, stages, healthMessage, width, height, progress, hoveredIndex);
    },
    [stages, healthMessage, width, height, hoveredIndex],
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
  }, [stages, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (animDone) draw(1);
  }, [hoveredIndex, animDone, draw]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!animDone) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const hit = hitTestPipelineFlow(e.clientX - rect.left, e.clientY - rect.top, stages, width, height);
      setHoveredIndex(hit);
      e.currentTarget.style.cursor = hit !== null ? 'pointer' : 'default';
    },
    [animDone, stages, width, height],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!animDone) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const hit = hitTestPipelineFlow(e.clientX - rect.left, e.clientY - rect.top, stages, width, height);
      if (hit !== null && stages[hit]) {
        onStageClick(stages[hit].name);
      }
    },
    [animDone, stages, width, height, onStageClick],
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
