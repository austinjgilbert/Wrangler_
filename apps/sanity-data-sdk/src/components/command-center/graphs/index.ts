// Barrel export for graph components.
// Each graph: adapter (data → props) + canvas (render) + React wrapper.

// ── Shared ──────────────────────────────────────────────────────────
export { GRAPH_TOKENS, hexToRgba, drawRoundedRect } from './types';

// ── Competitor Map (graph 4) ────────────────────────────────────────
export { CompetitorMap } from './CompetitorMap';
export type { CompetitorMapProps } from './CompetitorMap';
export { deriveCompetitorMap } from './competitor-map-adapter';
export type { MapCompetitor } from './competitor-map-adapter';

// ── Signal Timeline (graph 5) ───────────────────────────────────────
export { SignalTimeline } from './SignalTimeline';
export type { SignalTimelineProps } from './SignalTimeline';
export { deriveSignalTimeline, findSpikes, computeDensity, SIGNAL_TYPE_COLORS } from './signal-timeline-adapter';
export type { TimelineSignal, SignalType, SpikeCallout } from './signal-timeline-adapter';

// NOTE: Heat Map (graph 1), Tech Radar (graph 2), Pipeline Flow (graph 3)
// were built in an earlier session. Their files need to be ported to this
// graphs/ directory when the branch is consolidated. The adapters and
// canvas renderers follow the same pattern as Competitor Map and Signal Timeline.
