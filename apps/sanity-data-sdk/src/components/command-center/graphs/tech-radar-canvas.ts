/**
 * tech-radar-canvas.ts — Pure Canvas 2D spider/radar chart renderer.
 *
 * Two polygons: "Your Solution" (blue) and "Prospect Stack" (amber).
 * Grid rings at 25/50/75/100%. Gap callouts after animation.
 *
 * Performance: <50ms draw, zero dependencies.
 */

import type { RadarCategory } from './tech-radar-adapter';
import { GRAPH_TOKENS as T, hexToRgba, drawRoundedRect } from './types';

// ── Hit Testing ─────────────────────────────────────────────────────

export function hitTestRadar(
  mx: number,
  my: number,
  categories: RadarCategory[],
  W: number,
  H: number,
): number | null {
  if (categories.length === 0) return null;
  const cx = W / 2;
  const cy = H / 2 - 10;
  const radius = Math.min(cx, cy) - 60;
  const n = categories.length;

  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const vx = cx + Math.cos(angle) * radius;
    const vy = cy + Math.sin(angle) * radius;
    const dx = mx - vx;
    const dy = my - vy;
    if (Math.sqrt(dx * dx + dy * dy) < 20) return i;
  }
  return null;
}

// ── Easing ──────────────────────────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ── Render ───────────────────────────────────────────────────────────

export function drawTechRadar(
  canvas: HTMLCanvasElement,
  categories: RadarCategory[],
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

  // ── Title ─────────────────────────────────────────────────────────
  c.font = `bold 14px ${T.font}`;
  c.fillStyle = T.text;
  c.textAlign = 'left';
  c.fillText('TECH STACK RADAR', 20, 24);

  // ── Empty State ───────────────────────────────────────────────────
  if (categories.length === 0) {
    c.font = `14px ${T.font}`;
    c.fillStyle = T.textDim;
    c.textAlign = 'center';
    c.fillText('No technology data available', W / 2, H / 2 - 10);
    c.font = `12px ${T.font}`;
    c.fillText('Run tech stack analysis to populate', W / 2, H / 2 + 12);
    return;
  }

  const cx = W / 2;
  const cy = H / 2 - 10;
  const radius = Math.min(cx, cy) - 60;
  const n = categories.length;
  const prog = easeOutCubic(Math.min(1, animProgress));

  // ── Grid Rings ────────────────────────────────────────────────────
  for (const ring of [0.25, 0.5, 0.75, 1.0]) {
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const angle = (Math.PI * 2 * (i % n)) / n - Math.PI / 2;
      const x = cx + Math.cos(angle) * radius * ring;
      const y = cy + Math.sin(angle) * radius * ring;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.strokeStyle = hexToRgba(T.border, 0.3);
    c.lineWidth = 0.5;
    c.stroke();
  }

  // ── Axis Lines + Labels ───────────────────────────────────────────
  c.font = `10px ${T.font}`;
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const ax = cx + Math.cos(angle) * radius;
    const ay = cy + Math.sin(angle) * radius;

    // Axis line
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(ax, ay);
    c.strokeStyle = hexToRgba(T.border, 0.2);
    c.lineWidth = 0.5;
    c.stroke();

    // Label
    const lx = cx + Math.cos(angle) * (radius + 16);
    const ly = cy + Math.sin(angle) * (radius + 16);
    c.fillStyle = hoveredIndex === i ? T.text : T.textDim;
    c.textAlign = Math.abs(angle + Math.PI / 2) < 0.1 ? 'center'
      : Math.cos(angle) > 0.1 ? 'left' : Math.cos(angle) < -0.1 ? 'right' : 'center';
    c.textBaseline = 'middle';
    c.fillText(categories[i].name, lx, ly);
  }

  // ── Polygons (animated from center) ───────────────────────────────
  function drawPolygon(scores: number[], color: string, fillAlpha: number) {
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const angle = (Math.PI * 2 * (i % n)) / n - Math.PI / 2;
      const r = radius * scores[i % n] * prog;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.fillStyle = hexToRgba(color, fillAlpha);
    c.fill();
    c.strokeStyle = hexToRgba(color, 0.8);
    c.lineWidth = 2;
    c.stroke();
  }

  // "Your Solution" (blue)
  drawPolygon(categories.map((c) => c.ourScore), T.blue, 0.15);
  // "Prospect Stack" (amber)
  drawPolygon(categories.map((c) => c.prospectScore), T.amber, 0.15);

  // ── Vertex Dots ───────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const isHov = hoveredIndex === i;

    // Prospect dot
    const pr = radius * categories[i].prospectScore * prog;
    const px = cx + Math.cos(angle) * pr;
    const py = cy + Math.sin(angle) * pr;
    c.beginPath();
    c.arc(px, py, isHov ? 5 : 3, 0, Math.PI * 2);
    c.fillStyle = T.amber;
    c.fill();

    // Our dot
    const or = radius * categories[i].ourScore * prog;
    const ox = cx + Math.cos(angle) * or;
    const oy = cy + Math.sin(angle) * or;
    c.beginPath();
    c.arc(ox, oy, isHov ? 5 : 3, 0, Math.PI * 2);
    c.fillStyle = T.blue;
    c.fill();
  }

  // ── Legend ─────────────────────────────────────────────────────────
  c.textBaseline = 'alphabetic';
  c.font = `10px ${T.font}`;
  c.textAlign = 'left';
  const legendY = H - 16;
  // Blue = ours
  c.beginPath();
  c.arc(20, legendY - 4, 4, 0, Math.PI * 2);
  c.fillStyle = T.blue;
  c.fill();
  c.fillStyle = T.textDim;
  c.fillText('Your Solution', 30, legendY);
  // Amber = prospect
  c.beginPath();
  c.arc(120, legendY - 4, 4, 0, Math.PI * 2);
  c.fillStyle = T.amber;
  c.fill();
  c.fillStyle = T.textDim;
  c.fillText('Prospect Stack', 130, legendY);

  // ── Gap Callouts (after animation) ────────────────────────────────
  if (prog >= 1) {
    const gaps = categories.filter((cat) => cat.hasGap);
    if (gaps.length > 0) {
      c.font = `11px ${T.font}`;
      c.fillStyle = T.amber;
      c.textAlign = 'left';
      const gapText = `⚠ ${gaps.length} gap${gaps.length > 1 ? 's' : ''}: ${gaps.map((g) => g.name).join(', ')} — prospect stronger here`;
      c.fillText(gapText, 20, 40);
    }
  }

  // ── Hover Tooltip ─────────────────────────────────────────────────
  if (hoveredIndex !== null && hoveredIndex < categories.length) {
    const cat = categories[hoveredIndex];
    const angle = (Math.PI * 2 * hoveredIndex) / n - Math.PI / 2;
    const vx = cx + Math.cos(angle) * radius * cat.prospectScore;
    const vy = cy + Math.sin(angle) * radius * cat.prospectScore;

    const lines = [
      cat.name,
      `You: ${Math.round(cat.ourScore * 100)}% | Them: ${Math.round(cat.prospectScore * 100)}%`,
      cat.hasGap
        ? '⚠ Prospect stronger here — opportunity to differentiate'
        : cat.ourScore > cat.prospectScore + 0.2
          ? '✅ You lead here — selling point'
          : '→ Comparable coverage',
    ];

    c.font = `11px ${T.font}`;
    const tw = Math.max(...lines.map((l) => c.measureText(l).width)) + 24;
    const tipH = lines.length * 16 + 14;
    let tipX = vx + 12;
    let tipY = vy - tipH / 2;
    if (tipX + tw > W - 4) tipX = vx - tw - 12;
    if (tipY < 4) tipY = 4;
    if (tipY + tipH > H - 4) tipY = H - tipH - 4;

    c.shadowColor = 'rgba(0,0,0,0.4)';
    c.shadowBlur = 8;
    c.shadowOffsetY = 2;
    drawRoundedRect(c, tipX, tipY, tw, tipH, 6);
    c.fillStyle = T.surface;
    c.fill();
    c.shadowColor = 'transparent';
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;
    c.strokeStyle = cat.hasGap ? T.amber : T.blue;
    c.lineWidth = 1;
    c.stroke();

    c.textAlign = 'left';
    for (let li = 0; li < lines.length; li++) {
      c.font = li === 0 ? `bold 12px ${T.font}` : `11px ${T.font}`;
      c.fillStyle = li === lines.length - 1
        ? (cat.hasGap ? T.amber : T.accent)
        : li === 0 ? T.text : T.textMuted;
      c.fillText(lines[li], tipX + 10, tipY + 16 + li * 16);
    }
  }
}
