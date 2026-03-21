/**
 * heat-map-canvas.ts — Pure Canvas 2D heat map renderer.
 *
 * Two-layer architecture (Phase B):
 *   Base layer: static grid (accounts × dimensions). Redraws on data change.
 *   Overlay layer: hover highlight + tooltip. Redraws on mousemove — cheap.
 *
 * Also supports single-canvas mode via drawHeatMap() for backward compat.
 *
 * Performance: <50ms draw, O(1) hit testing via grid math.
 */

import type { HeatMapAccount } from './heat-map-adapter';
import { HEAT_MAP_COLUMNS, getCellValue } from './heat-map-adapter';
import { GRAPH_TOKENS as T, hexToRgba, drawRoundedRect } from './types';

const ROW_H = 36;
const COL_W_MIN = 100;
const HEADER_H = 40;
const LEFT_PAD = 140;
const CELL_PAD = 3;
const CELL_R = 4;

function heatColor(value: number): string {
  if (value <= 0) return T.surface;
  if (value <= 0.5) return lerpColor(T.surface, T.amber, value / 0.5);
  return lerpColor(T.amber, T.red, (value - 0.5) / 0.5);
}

function lerpColor(a: string, b: string, t: number): string {
  const ha = parseInt(a.slice(1), 16);
  const hb = parseInt(b.slice(1), 16);
  const r = Math.round(((ha >> 16) & 0xff) * (1 - t) + ((hb >> 16) & 0xff) * t);
  const g = Math.round(((ha >> 8) & 0xff) * (1 - t) + ((hb >> 8) & 0xff) * t);
  const bl = Math.round((ha & 0xff) * (1 - t) + (hb & 0xff) * t);
  return `rgb(${r},${g},${bl})`;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Sort accounts: hot first, then by score descending, nulls last. */
export function sortHeatMapAccounts(accounts: HeatMapAccount[]): HeatMapAccount[] {
  return [...accounts].sort((a, b) => {
    if (a.hot !== b.hot) return a.hot ? -1 : 1;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}

function getColW(W: number): number {
  return Math.max(COL_W_MIN, (W - LEFT_PAD - 20) / HEAT_MAP_COLUMNS.length);
}

// ── Hit Testing ─────────────────────────────────────────────────────

export function hitTestHeatMap(
  mx: number,
  my: number,
  accounts: HeatMapAccount[],
  W: number,
): { row: number; col: number } | null {
  if (accounts.length === 0) return null;
  const colW = getColW(W);
  const col = Math.floor((mx - LEFT_PAD) / colW);
  const row = Math.floor((my - HEADER_H) / ROW_H);
  if (col < 0 || col >= HEAT_MAP_COLUMNS.length) return null;
  if (row < 0 || row >= accounts.length) return null;
  return { row, col };
}

// ── Setup Canvas ────────────────────────────────────────────────────

function setupCanvas(canvas: HTMLCanvasElement, W: number, H: number): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const c = canvas.getContext('2d');
  if (!c) return null;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.scale(dpr, dpr);
  return c;
}

// ── Base Layer (static grid — redraws on data change only) ──────────

export function drawHeatMapBase(
  canvas: HTMLCanvasElement,
  sorted: HeatMapAccount[],
  W: number,
  H: number,
  animProgress: number,
): void {
  const c = setupCanvas(canvas, W, H);
  if (!c) return;

  c.clearRect(0, 0, W, H);
  c.fillStyle = T.bg;
  c.fillRect(0, 0, W, H);

  const colW = getColW(W);

  // Title
  c.font = `bold 14px ${T.font}`;
  c.fillStyle = T.text;
  c.textAlign = 'left';
  c.fillText('PORTFOLIO HEAT MAP', 12, 18);

  // Empty state
  if (sorted.length === 0) {
    c.font = `14px ${T.font}`;
    c.fillStyle = T.textDim;
    c.textAlign = 'center';
    c.fillText('No account data available', W / 2, H / 2 - 10);
    c.font = `12px ${T.font}`;
    c.fillText('Run Good Morning briefing to populate', W / 2, H / 2 + 12);
    return;
  }

  // Column headers
  c.font = `bold 11px ${T.font}`;
  c.fillStyle = T.textMuted;
  c.textAlign = 'center';
  for (let ci = 0; ci < HEAT_MAP_COLUMNS.length; ci++) {
    c.fillText(HEAT_MAP_COLUMNS[ci], LEFT_PAD + ci * colW + colW / 2, HEADER_H - 10);
  }

  const prog = easeOutCubic(Math.min(1, animProgress));

  // Rows
  for (let ri = 0; ri < sorted.length; ri++) {
    const acct = sorted[ri];
    const y = HEADER_H + ri * ROW_H;

    // Account name
    c.font = `12px ${T.font}`;
    c.fillStyle = T.text;
    c.textAlign = 'left';
    const label = acct.hot ? `🔥 ${acct.name}` : acct.name;
    const maxLabelW = LEFT_PAD - 16;
    let displayLabel = label;
    if (c.measureText(label).width > maxLabelW) {
      while (c.measureText(displayLabel + '…').width > maxLabelW && displayLabel.length > 0) {
        displayLabel = displayLabel.slice(0, -1);
      }
      displayLabel += '…';
    }
    c.fillText(displayLabel, 12, y + ROW_H / 2 + 4);

    // Cells
    for (let ci = 0; ci < HEAT_MAP_COLUMNS.length; ci++) {
      const value = getCellValue(acct, ci);
      const cellX = LEFT_PAD + ci * colW + CELL_PAD;
      const cellY = y + CELL_PAD;
      const cellW = colW - CELL_PAD * 2;
      const cellH = ROW_H - CELL_PAD * 2;

      const colDelay = ci / HEAT_MAP_COLUMNS.length;
      const cellProg = Math.max(0, Math.min(1, (prog - colDelay * 0.3) / 0.7));
      if (cellProg <= 0) continue;

      const color = heatColor(value * cellProg);
      drawRoundedRect(c, cellX, cellY, cellW, cellH, CELL_R);
      c.fillStyle = color;
      c.fill();
      c.strokeStyle = hexToRgba(T.border, 0.3);
      c.lineWidth = 0.5;
      c.stroke();

      if (cellProg > 0.5) {
        c.font = `bold 11px ${T.font}`;
        c.fillStyle = value > 0.6 ? '#0f172a' : T.textMuted;
        c.textAlign = 'center';
        const displayVal = ci === 3 ? `${acct.score}` : `${Math.round(value * 100)}%`;
        c.fillText(displayVal, cellX + cellW / 2, cellY + cellH / 2 + 4);
      }
    }
  }

  // Legend
  const legendY = HEADER_H + sorted.length * ROW_H + 12;
  const gradW = 120;
  const gradX = W - gradW - 20;
  const grad = c.createLinearGradient(gradX, 0, gradX + gradW, 0);
  grad.addColorStop(0, T.surface);
  grad.addColorStop(0.5, T.amber);
  grad.addColorStop(1, T.red);
  drawRoundedRect(c, gradX, legendY, gradW, 8, 4);
  c.fillStyle = grad;
  c.fill();
  c.font = `10px ${T.font}`;
  c.fillStyle = T.textDim;
  c.textAlign = 'left';
  c.fillText('Cold', gradX, legendY + 20);
  c.textAlign = 'right';
  c.fillText('Hot', gradX + gradW, legendY + 20);
}

// ── Overlay Layer (hover + tooltip — redraws on mousemove) ──────────

export function drawHeatMapOverlay(
  canvas: HTMLCanvasElement,
  sorted: HeatMapAccount[],
  W: number,
  H: number,
  hovered: { row: number; col: number } | null,
): void {
  const c = setupCanvas(canvas, W, H);
  if (!c) return;

  c.clearRect(0, 0, W, H);

  if (!hovered || hovered.row >= sorted.length) return;

  const colW = getColW(W);
  const acct = sorted[hovered.row];
  const value = getCellValue(acct, hovered.col);

  // Hover highlight on cell
  const cellX = LEFT_PAD + hovered.col * colW + CELL_PAD;
  const cellY = HEADER_H + hovered.row * ROW_H + CELL_PAD;
  const cellW = colW - CELL_PAD * 2;
  const cellH = ROW_H - CELL_PAD * 2;

  drawRoundedRect(c, cellX, cellY, cellW, cellH, CELL_R);
  c.fillStyle = hexToRgba(T.surfaceHover, 0.5);
  c.fill();
  c.strokeStyle = T.accent;
  c.lineWidth = 1.5;
  c.stroke();

  // Tooltip
  const col = HEAT_MAP_COLUMNS[hovered.col];
  const lines = [
    `${acct.name} — ${col}`,
    `Value: ${hovered.col === 3 ? acct.score : Math.round(value * 100) + '%'}`,
    acct.hot ? '🔥 Hot account — prioritize outreach' : '→ Click to select this account',
  ];

  c.font = `11px ${T.font}`;
  const tw = Math.max(...lines.map((l) => c.measureText(l).width)) + 24;
  const tipH = lines.length * 16 + 14;
  const tipAnchorX = LEFT_PAD + hovered.col * colW + colW / 2;
  const tipAnchorY = HEADER_H + hovered.row * ROW_H;
  let tipX = tipAnchorX + 12;
  let tipY = tipAnchorY - tipH / 2;
  if (tipX + tw > W - 4) tipX = tipAnchorX - tw - 12;
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
  c.strokeStyle = T.accent;
  c.lineWidth = 1;
  c.stroke();

  c.textAlign = 'left';
  for (let li = 0; li < lines.length; li++) {
    c.font = li === 0 ? `bold 12px ${T.font}` : `11px ${T.font}`;
    c.fillStyle = li === lines.length - 1 ? T.accent : li === 0 ? T.text : T.textMuted;
    c.fillText(lines[li], tipX + 10, tipY + 16 + li * 16);
  }
}

// ── Single-canvas mode (backward compat) ────────────────────────────

export function drawHeatMap(
  canvas: HTMLCanvasElement,
  accounts: HeatMapAccount[],
  W: number,
  H: number,
  animProgress: number,
  hovered: { row: number; col: number } | null,
): void {
  const sorted = sortHeatMapAccounts(accounts);
  drawHeatMapBase(canvas, sorted, W, H, animProgress);
  if (hovered) drawHeatMapOverlay(canvas, sorted, W, H, hovered);
}
