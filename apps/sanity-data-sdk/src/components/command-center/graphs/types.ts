/**
 * Shared types for graph components.
 * Each graph has: adapter (data → props), canvas (render), React wrapper.
 */

// ── Design Tokens (locked palette) ─────────────────────────────────
export const GRAPH_TOKENS = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceHover: '#253349',
  border: '#334155',
  borderLight: '#475569',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  accent: '#f59e0b',
  accentLight: '#fbbf24',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  blue: '#3b82f6',
  orange: '#f97316',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;

// ── Shared Helpers ─────────────────────────────────────────────────

export function hexToRgba(hex: string, alpha: number): string {
  const h = parseInt(hex.slice(1), 16);
  return `rgba(${(h >> 16) & 0xff},${(h >> 8) & 0xff},${h & 0xff},${alpha})`;
}

export function drawRoundedRect(
  c: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + radius, y);
  c.lineTo(x + w - radius, y);
  c.quadraticCurveTo(x + w, y, x + w, y + radius);
  c.lineTo(x + w, y + h - radius);
  c.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  c.lineTo(x + radius, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - radius);
  c.lineTo(x, y + radius);
  c.quadraticCurveTo(x, y, x + radius, y);
  c.closePath();
}
