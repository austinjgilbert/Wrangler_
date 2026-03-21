// Barrel export for graph components.
// Each graph: adapter (data → props) + canvas (render) + React wrapper.

// ── Shared ──────────────────────────────────────────────────────────
export { GRAPH_TOKENS, hexToRgba, drawRoundedRect } from './types';

// ── Portfolio Heat Map (graph 1) ────────────────────────────────────
export { PortfolioHeatMap } from './PortfolioHeatMap';
export type { PortfolioHeatMapProps } from './PortfolioHeatMap';
export { deriveHeatMapData, getCellValue, HEAT_MAP_COLUMNS } from './heat-map-adapter';
export type { HeatMapAccount } from './heat-map-adapter';

// ── Tech Stack Radar (graph 2) ──────────────────────────────────────
export { TechStackRadar } from './TechStackRadar';
export type { TechStackRadarProps } from './TechStackRadar';
export { deriveRadarCategories, radarSummary } from './tech-radar-adapter';
export type { RadarCategory } from './tech-radar-adapter';

// ── Pipeline Flow (graph 3) ─────────────────────────────────────────
export { PipelineFlow } from './PipelineFlow';
export type { PipelineFlowProps } from './PipelineFlow';
export { derivePipelineFlow, pipelineSummary } from './pipeline-flow-adapter';
export type { FlowStage } from './pipeline-flow-adapter';

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
