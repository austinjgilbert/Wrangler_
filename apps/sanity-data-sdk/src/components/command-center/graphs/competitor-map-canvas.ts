/**
 * competitor-map-canvas.ts — Pure Canvas 2D bubble chart renderer.
 *
 * X = similarity (how close to us), Y = threat level, radius = team size.
 * Threat zone bands: green (low) / amber (medium) / red (high).
 * Overlap lines between competitors sharing categories.
 *
 * Performance: <50ms draw, <5KB bundle, zero dependencies.
 */

import type { MapCompetitor } from './competitor-map-adapter';
import { GRAPH_TOKENS as T, hexToRgba, drawRoundedRect } from './types';

// ── Node Layout ─────────────────────────────────────────────────────

interface NodeLayout {
  x: number;
  y: number;
  r: number;
  comp: MapCompetitor;
  index: number;
}

const PAD = { top: 50, right: 40, bottom: 50, left: 60 };

function layoutNodes(
  competitors: MapCompetitor[],
  W: number,
  H: number,
): NodeLayout[] {
  const gW = W - PAD.left - PAD.right;
  const gH = H - PAD.top - PAD.bottom;

  return competitors.map((comp, i) => ({
    x: PAD.left + comp.similarity * gW,
    y: PAD.top + gH - comp.threat * gH,
    r: Math.max(16, Math.min(40, Math.sqrt(comp.teamSize) * 1.8)),
    comp,
    index: i,
  }));
}

// ── Hit Testing ─────────────────────────────────────────────────────

export function hitTestCompetitorMap(
  mx: number,
  my: number,
  competitors: MapCompetitor[],
  W: number,
  H: number,
): number | null {
  const nodes = layoutNodes(competitors, W, H);
  // Reverse iterate — top-drawn nodes get priority
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const dx = mx - n.x;
    const dy = my - n.y;
    if (Math.sqrt(dx * dx + dy * dy) < n.r + 4) {
      return i;
    }
  }
  return null;
}

// ── Threat Color ────────────────────────────────────────────────────

function threatColor(threat: number): string {
  if (threat > 0.7) return T.red;
  if (threat > 0.4) return T.amber;
  return T.green;
}

function threatLabel(threat: number): string {
  if (threat > 0.7) return '🔴 High threat — prepare counter-positioning';
  if (threat > 0.4) return '🟡 Monitor — watch for expansion';
  return '🟢 Low threat — maintain awareness';
}

// ── Render ───────────────────────────────────────────────────────────

export function drawCompetitorMap(
  canvas: HTMLCanvasElement,
  competitors: MapCompetitor[],
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

  // ── Empty State ─────────────────────────────────────────────────
  if (competitors.length === 0) {
    c.font = `bold 14px ${T.font}`;
    c.fillStyle = T.text;
    c.textAlign = 'left';
    c.fillText('COMPETITOR MAP', 20, 24);
    c.font = `14px ${T.font}`;
    c.fillStyle = T.textDim;
    c.textAlign = 'center';
    c.fillText('No competitor data available', W / 2, H / 2 - 10);
    c.font = `12px ${T.font}`;
    c.fillText('Run competitive analysis to populate', W / 2, H / 2 + 12);
    return;
  }

  const prog = Math.min(1, animProgress * 1.5); // Slightly faster than linear
  const gW = W - PAD.left - PAD.right;
  const gH = H - PAD.top - PAD.bottom;
  const nodes = layoutNodes(competitors, W, H);

  // ── Title ───────────────────────────────────────────────────────
  c.font = `bold 14px ${T.font}`;
  c.fillStyle = T.text;
  c.textAlign = 'left';
  c.fillText('COMPETITOR MAP', PAD.left, 24);
  c.font = `12px ${T.font}`;
  c.fillStyle = T.textDim;
  c.fillText('X = similarity · Y = threat level · radius = scale', PAD.left, 40);

  // ── Axes ────────────────────────────────────────────────────────
  c.strokeStyle = hexToRgba(T.border, 0.4);
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(PAD.left, PAD.top + gH);
  c.lineTo(PAD.left + gW, PAD.top + gH);
  c.stroke();
  c.beginPath();
  c.moveTo(PAD.left, PAD.top);
  c.lineTo(PAD.left, PAD.top + gH);
  c.stroke();

  // Axis labels
  c.font = `10px ${T.font}`;
  c.fillStyle = T.textDim;
  c.textAlign = 'center';
  c.fillText('Low Similarity', PAD.left + gW * 0.15, PAD.top + gH + 18);
  c.fillText('High Similarity', PAD.left + gW * 0.85, PAD.top + gH + 18);
  c.save();
  c.translate(PAD.left - 14, PAD.top + gH / 2);
  c.rotate(-Math.PI / 2);
  c.fillText('Threat Level →', 0, 0);
  c.restore();

  // ── Threat Zone Bands ───────────────────────────────────────────
  const zones = [
    { y: 0, h: 0.33, color: T.green, label: 'Low' },
    { y: 0.33, h: 0.34, color: T.amber, label: 'Medium' },
    { y: 0.67, h: 0.33, color: T.red, label: 'High' },
  ];
  for (const zone of zones) {
    // Zones are horizontal bands on Y-axis (threat)
    const bandY = PAD.top + gH - (zone.y + zone.h) * gH;
    const bandH = zone.h * gH;
    c.fillStyle = hexToRgba(zone.color, 0.04);
    c.fillRect(PAD.left, bandY, gW, bandH);
    c.font = `bold 9px ${T.font}`;
    c.fillStyle = hexToRgba(zone.color, 0.3);
    c.textAlign = 'right';
    c.fillText(zone.label, PAD.left + gW - 6, bandY + 14);
  }

  // ── Overlap Lines ───────────────────────────────────────────────
  if (prog > 0.5) {
    const lineAlpha = Math.min(1, (prog - 0.5) * 2) * 0.15;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const shared = a.comp.overlap.filter((cat) =>
          b.comp.overlap.includes(cat),
        );
        if (shared.length > 0) {
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.strokeStyle = hexToRgba(T.borderLight, lineAlpha * shared.length);
          c.lineWidth = shared.length;
          c.setLineDash([4, 4]);
          c.stroke();
          c.setLineDash([]);
        }
      }
    }
  }

  // ── Bubbles ─────────────────────────────────────────────────────
  for (const node of nodes) {
    const isHov = hoveredIndex === node.index;
    const r = node.r * prog;
    const color = threatColor(node.comp.threat);

    if (isHov) {
      c.shadowColor = color;
      c.shadowBlur = 16;
    }

    // Fill
    c.beginPath();
    c.arc(node.x, node.y, r, 0, Math.PI * 2);
    c.fillStyle = hexToRgba(color, isHov ? 0.35 : 0.2);
    c.fill();

    // Border
    c.strokeStyle = isHov ? '#fff' : color;
    c.lineWidth = isHov ? 2.5 : 1.5;
    c.stroke();

    c.shadowColor = 'transparent';
    c.shadowBlur = 0;

    // Label inside bubble
    if (r > 14) {
      const maxChars = Math.floor(r / 4);
      const label = node.comp.name;
      const displayName =
        label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label;
      c.font = `bold ${Math.max(9, Math.min(12, r * 0.5))}px ${T.font}`;
      c.fillStyle = isHov ? '#fff' : T.text;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(displayName, node.x, node.y);
    }
  }

  // ── Legend ───────────────────────────────────────────────────────
  c.textBaseline = 'alphabetic';
  c.font = `11px ${T.font}`;
  c.textAlign = 'left';
  let lx = PAD.left;
  const legendItems = [
    { label: 'Low Threat', color: T.green },
    { label: 'Medium', color: T.amber },
    { label: 'High Threat', color: T.red },
  ];
  for (const item of legendItems) {
    c.beginPath();
    c.arc(lx + 6, H - 24, 5, 0, Math.PI * 2);
    c.fillStyle = item.color;
    c.fill();
    c.fillStyle = T.textMuted;
    c.fillText(item.label, lx + 16, H - 20);
    lx += c.measureText(item.label).width + 36;
  }

  // ── Hover Tooltip ───────────────────────────────────────────────
  if (hoveredIndex !== null) {
    const node = nodes[hoveredIndex];
    if (node) {
      const comp = node.comp;
      const lines = [
        comp.name,
        `Threat: ${Math.round(comp.threat * 100)}%`,
        `Similarity: ${Math.round(comp.similarity * 100)}%`,
        comp.overlap.length > 0
          ? `Overlap: ${comp.overlap.slice(0, 3).join(', ')}${comp.overlap.length > 3 ? '…' : ''}`
          : 'No category overlap',
        threatLabel(comp.threat),
      ];

      c.font = `11px ${T.font}`;
      const tw = Math.max(...lines.map((l) => c.measureText(l).width)) + 24;
      const tipH = lines.length * 16 + 14;
      let tipX = node.x + node.r + 12;
      let tipY = node.y - tipH / 2;
      if (tipX + tw > W - 4) tipX = node.x - node.r - tw - 12;
      if (tipY < 4) tipY = 4;
      if (tipY + tipH > H - 4) tipY = H - tipH - 4;

      // Tooltip background
      c.shadowColor = 'rgba(0,0,0,0.4)';
      c.shadowBlur = 8;
      c.shadowOffsetY = 2;
      drawRoundedRect(c, tipX, tipY, tw, tipH, 6);
      c.fillStyle = T.surface;
      c.fill();
      c.shadowColor = 'transparent';
      c.shadowBlur = 0;
      c.shadowOffsetY = 0;

      // Tooltip border
      c.strokeStyle = threatColor(comp.threat);
      c.lineWidth = 1;
      c.stroke();

      // Tooltip text
      c.textAlign = 'left';
      for (let li = 0; li < lines.length; li++) {
        c.font = li === 0 ? `bold 12px ${T.font}` : `11px ${T.font}`;
        c.fillStyle =
          li === lines.length - 1
            ? T.accent
            : li === 0
              ? T.text
              : T.textMuted;
        c.fillText(lines[li], tipX + 10, tipY + 16 + li * 16);
      }
    }
  }
}
