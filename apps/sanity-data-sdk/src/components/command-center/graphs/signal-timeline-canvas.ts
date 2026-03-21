/**
 * signal-timeline-canvas.ts — Pure Canvas 2D signal timeline renderer.
 *
 * Two modes:
 *   Rich (Phase 2): density area chart + typed dots spread across timeline
 *   Degraded (current): dots cluster at day 0, no density curve, honest banner
 *
 * Features: bezier-smoothed density area, sequential dot animation, expired
 * signal decay rings, high-strength glow, hover tooltips with actionable lines.
 *
 * Performance: <50ms draw, <5KB bundle, zero dependencies.
 */

import type { TimelineSignal, SignalType } from './signal-timeline-adapter';
import { computeDensity, SIGNAL_TYPE_COLORS } from './signal-timeline-adapter';
import { GRAPH_TOKENS as T, hexToRgba, drawRoundedRect } from './types';

// ── Layout ──────────────────────────────────────────────────────────

const PAD = { top: 50, right: 30, bottom: 60, left: 50 };

interface DotLayout {
  x: number;
  y: number;
  r: number;
  sig: TimelineSignal;
  index: number;
}

interface AreaPoint {
  x: number;
  y: number;
  density: number;
}

function layoutSignals(
  signals: TimelineSignal[],
  days: number,
  W: number,
  H: number,
): { areaPoints: AreaPoint[]; dots: DotLayout[] } {
  const gW = W - PAD.left - PAD.right;
  const gH = H - PAD.top - PAD.bottom;
  const density = computeDensity(signals, days);
  const maxDensity = Math.max(1, ...density);

  // Density area points
  const areaPoints: AreaPoint[] = [];
  for (let d = 0; d <= days; d++) {
    const x = PAD.left + (d / days) * gW;
    const y = PAD.top + gH - (density[d] / maxDensity) * gH * 0.6;
    areaPoints.push({ x, y, density: density[d] });
  }

  // Signal dot positions — jitter Y within the density band
  const daySlots: Record<number, number> = {};
  const dots: DotLayout[] = signals.map((sig, i) => {
    const dayKey = sig.day;
    if (daySlots[dayKey] === undefined) daySlots[dayKey] = 0;
    const slot = daySlots[dayKey]++;
    const x = PAD.left + (sig.day / days) * gW;
    const baseY = PAD.top + gH - (density[sig.day] / maxDensity) * gH * 0.6;
    const jitterY = baseY + 12 + slot * 22;
    const r = Math.max(5, Math.min(10, (sig.strength ?? sig.confidence ?? 0.5) * 12));
    return { x, y: Math.min(jitterY, PAD.top + gH - 10), r, sig, index: i };
  });

  return { areaPoints, dots };
}

// ── Hit Testing ─────────────────────────────────────────────────────

export function hitTestSignalTimeline(
  mx: number,
  my: number,
  signals: TimelineSignal[],
  days: number,
  W: number,
  H: number,
): number | null {
  const { dots } = layoutSignals(signals, days, W, H);
  for (let i = dots.length - 1; i >= 0; i--) {
    const d = dots[i];
    const dx = mx - d.x;
    const dy = my - d.y;
    if (Math.sqrt(dx * dx + dy * dy) < d.r + 4) {
      return i;
    }
  }
  return null;
}

// ── Easing ──────────────────────────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ── Render ───────────────────────────────────────────────────────────

export function drawSignalTimeline(
  canvas: HTMLCanvasElement,
  signals: TimelineSignal[],
  days: number,
  W: number,
  H: number,
  animProgress: number,
  hoveredIndex: number | null,
): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const c = canvas.getContext('2d');
  if (!c) return;

  c.setTransform(1, 0, 0, 1, 0, 0);
  c.scale(dpr, dpr);
  c.clearRect(0, 0, W, H);
  c.fillStyle = T.bg;
  c.fillRect(0, 0, W, H);

  const gW = W - PAD.left - PAD.right;
  const gH = H - PAD.top - PAD.bottom;

  // ── Title ─────────────────────────────────────────────────────────
  c.font = `bold 14px ${T.font}`;
  c.fillStyle = T.text;
  c.textAlign = 'left';
  c.fillText('SIGNAL TIMELINE', PAD.left, 20);

  // ── Empty State ───────────────────────────────────────────────────
  if (signals.length === 0) {
    c.font = `14px ${T.font}`;
    c.fillStyle = T.textDim;
    c.textAlign = 'center';
    c.fillText('No signals detected', W / 2, H / 2 - 10);
    c.font = `12px ${T.font}`;
    c.fillText('Signals appear as accounts are enriched and monitored', W / 2, H / 2 + 12);
    return;
  }

  // ── Degraded Mode Banner ──────────────────────────────────────────
  const allDay0 = signals.every((s) => s.day === 0);
  if (allDay0) {
    c.font = `11px ${T.font}`;
    c.fillStyle = T.textDim;
    c.fillText(
      '⚠ No timestamp data — signals shown as categorized list (Phase 2 enables timeline)',
      PAD.left,
      36,
    );
  } else {
    c.font = `12px ${T.font}`;
    c.fillStyle = T.textDim;
    c.fillText(`${days}-day window · dot size = signal strength`, PAD.left, 36);
  }

  const prog = easeOutCubic(Math.min(1, animProgress));
  const { areaPoints, dots } = layoutSignals(signals, days, W, H);

  // ── X Axis ────────────────────────────────────────────────────────
  c.strokeStyle = hexToRgba(T.border, 0.4);
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(PAD.left, PAD.top + gH);
  c.lineTo(PAD.left + gW, PAD.top + gH);
  c.stroke();

  // Day labels
  c.font = `10px ${T.font}`;
  c.fillStyle = T.textDim;
  c.textAlign = 'center';
  const dayStep = days <= 7 ? 1 : days <= 14 ? 2 : 5;
  for (let d = 0; d <= days; d += dayStep) {
    const x = PAD.left + (d / days) * gW;
    c.fillText(d === 0 ? 'Today' : `${d}d ago`, x, PAD.top + gH + 16);
    c.beginPath();
    c.moveTo(x, PAD.top + gH);
    c.lineTo(x, PAD.top + gH + 4);
    c.strokeStyle = hexToRgba(T.border, 0.3);
    c.stroke();
  }

  // Y axis label
  c.save();
  c.translate(PAD.left - 16, PAD.top + gH / 2);
  c.rotate(-Math.PI / 2);
  c.font = `10px ${T.font}`;
  c.fillStyle = T.textDim;
  c.textAlign = 'center';
  c.fillText('Signal Density', 0, 0);
  c.restore();

  // ── Density Area (only in rich mode — skip when all day 0) ────────
  if (!allDay0) {
    const visiblePoints = Math.ceil(areaPoints.length * prog);
    if (visiblePoints > 1) {
      // Filled area
      c.beginPath();
      c.moveTo(areaPoints[0].x, PAD.top + gH);
      for (let i = 0; i < visiblePoints; i++) {
        if (i === 0) {
          c.lineTo(areaPoints[i].x, areaPoints[i].y);
        } else {
          const prev = areaPoints[i - 1];
          const curr = areaPoints[i];
          const cpx = (prev.x + curr.x) / 2;
          c.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
        }
      }
      const lastPt = areaPoints[visiblePoints - 1];
      c.lineTo(lastPt.x, PAD.top + gH);
      c.closePath();

      const grad = c.createLinearGradient(0, PAD.top, 0, PAD.top + gH);
      grad.addColorStop(0, hexToRgba(T.accent, 0.15));
      grad.addColorStop(1, hexToRgba(T.accent, 0.02));
      c.fillStyle = grad;
      c.fill();

      // Density line
      c.beginPath();
      for (let i = 0; i < visiblePoints; i++) {
        if (i === 0) {
          c.moveTo(areaPoints[i].x, areaPoints[i].y);
        } else {
          const prev = areaPoints[i - 1];
          const curr = areaPoints[i];
          const cpx = (prev.x + curr.x) / 2;
          c.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
        }
      }
      c.strokeStyle = hexToRgba(T.accent, 0.6);
      c.lineWidth = 1.5;
      c.stroke();
    }
  }

  // ── Signal Dots ───────────────────────────────────────────────────
  const dotProg = Math.max(0, (prog - 0.3) / 0.7); // Dots appear after 30%
  for (let i = 0; i < dots.length; i++) {
    const dot = dots[i];
    const sig = dot.sig;
    const dotDelay = i / dots.length;
    const dp = Math.max(0, Math.min(1, (dotProg - dotDelay * 0.5) * 2));
    if (dp <= 0) continue;

    const r = dot.r * dp;
    const color = SIGNAL_TYPE_COLORS[sig.type] || '#94a3b8';
    const isHov = hoveredIndex === dot.index;
    const isExpired = !sig.isActive;
    const alpha = isExpired ? 0.3 : 1;

    // Glow on hover
    if (isHov) {
      c.shadowColor = color;
      c.shadowBlur = 14;
    }

    // Dot fill
    c.beginPath();
    c.arc(dot.x, dot.y, r, 0, Math.PI * 2);
    c.fillStyle = hexToRgba(color, (isHov ? 0.6 : 0.35) * alpha);
    c.fill();
    c.strokeStyle = isHov ? '#fff' : hexToRgba(color, alpha);
    c.lineWidth = isHov ? 2 : 1.5;
    c.stroke();

    // Expired: dashed ring
    if (isExpired) {
      c.beginPath();
      c.arc(dot.x, dot.y, r + 3, 0, Math.PI * 2);
      c.strokeStyle = hexToRgba(color, 0.25);
      c.lineWidth = 1;
      c.setLineDash([2, 2]);
      c.stroke();
      c.setLineDash([]);
    }

    // High-strength glow (> 0.85, active only)
    if ((sig.strength ?? 0) > 0.85 && sig.isActive) {
      c.beginPath();
      c.arc(dot.x, dot.y, r + 5, 0, Math.PI * 2);
      c.strokeStyle = hexToRgba(color, 0.2);
      c.lineWidth = 2;
      c.stroke();
    }

    c.shadowColor = 'transparent';
    c.shadowBlur = 0;
  }

  // ── Legend ─────────────────────────────────────────────────────────
  c.textBaseline = 'alphabetic';
  c.font = `10px ${T.font}`;
  c.textAlign = 'left';
  let lx = PAD.left;
  const types = Object.entries(SIGNAL_TYPE_COLORS) as [SignalType, string][];
  for (const [type, color] of types) {
    c.beginPath();
    c.arc(lx + 5, H - 16, 4, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
    const label = type.replace('-', ' ');
    c.fillStyle = T.textDim;
    c.fillText(label, lx + 13, H - 12);
    lx += c.measureText(label).width + 28;
    if (lx > W - 80) break; // Don't overflow
  }

  // ── Hover Tooltip ─────────────────────────────────────────────────
  if (hoveredIndex !== null && hoveredIndex < dots.length) {
    const dot = dots[hoveredIndex];
    if (dot) {
      const sig = dot.sig;
      const lines: string[] = [
        `${sig.account} — ${sig.type.replace('-', ' ')}`,
        sig.text,
        `Confidence: ${Math.round(sig.confidence * 100)}% · Strength: ${Math.round((sig.strength ?? sig.confidence) * 100)}%`,
      ];
      if (!sig.isActive && sig.expiresAt) {
        const detected = sig.detectedAt?.slice(0, 10) ?? '?';
        const expired = sig.expiresAt?.slice(0, 10) ?? '?';
        lines.push(`⏱ Detected ${detected} · Expired ${expired}`);
      }
      if (sig.confidence === 0.5 && sig.day === 0) {
        lines.push('⚠ Type inferred from text — no structured data');
      }
      lines.push(sig.isActive ? '→ Click to investigate' : '→ Expired — click for history');

      c.font = `11px ${T.font}`;
      const tw = Math.max(...lines.map((l) => c.measureText(l).width)) + 24;
      const tipH = lines.length * 16 + 14;
      let tipX = dot.x + dot.r + 12;
      let tipY = dot.y - tipH / 2;
      if (tipX + tw > W - 4) tipX = dot.x - dot.r - tw - 12;
      if (tipY < 4) tipY = 4;
      if (tipY + tipH > H - 4) tipY = H - tipH - 4;

      // Background
      c.shadowColor = 'rgba(0,0,0,0.4)';
      c.shadowBlur = 8;
      c.shadowOffsetY = 2;
      drawRoundedRect(c, tipX, tipY, tw, tipH, 6);
      c.fillStyle = T.surface;
      c.fill();
      c.shadowColor = 'transparent';
      c.shadowBlur = 0;
      c.shadowOffsetY = 0;

      // Border
      const borderColor = SIGNAL_TYPE_COLORS[sig.type] || T.border;
      c.strokeStyle = borderColor;
      c.lineWidth = 1;
      c.stroke();

      // Text
      c.textAlign = 'left';
      for (let li = 0; li < lines.length; li++) {
        c.font = li === 0 ? `bold 12px ${T.font}` : `11px ${T.font}`;
        c.fillStyle =
          li === lines.length - 1
            ? T.accent
            : li === 0
              ? T.text
              : lines[li].startsWith('⚠')
                ? '#f97316'
                : lines[li].startsWith('⏱')
                  ? T.textDim
                  : T.textMuted;
        c.fillText(lines[li], tipX + 10, tipY + 16 + li * 16);
      }
    }
  }
}
