import type { RuntimeIncident } from './autopilotTypes.ts';
import { fetchActionCandidates, fetchDocumentsByType, fetchDriftMetricsByType, fetchQueuedMoltJobs } from './sanity.ts';

export async function computeRuntimeHealth(env: any) {
  const [queuedJobs, actionCandidates, staleEvidenceMetrics, duplicateActionMetrics, weakDraftMetrics, incidents] = await Promise.all([
    fetchQueuedMoltJobs(env).catch(() => []),
    fetchActionCandidates(env).catch(() => []),
    fetchDriftMetricsByType(env, 'stale_evidence_percentage').catch(() => []),
    fetchDriftMetricsByType(env, 'duplicate_action_rate').catch(() => []),
    fetchDriftMetricsByType(env, 'weak_draft_rate').catch(() => []),
    fetchDocumentsByType(env, 'runtimeIncident', 50).catch(() => []),
  ]);

  const failedJobs = queuedJobs.filter((job: any) => job.status === 'failed');
  const openIncidents = incidents.filter((incident: any) => incident.status === 'open' || incident.status === 'monitoring');
  const weakQueueCount = actionCandidates.filter((candidate: any) => Number(candidate.confidence || 0) < 0.45).length;
  const degradedFlows = [
    failedJobs.length > 0 ? 'job_orchestration' : null,
    Number(staleEvidenceMetrics[0]?.value || 0) > 25 ? 'stale_evidence' : null,
    Number(duplicateActionMetrics[0]?.value || 0) > 10 ? 'duplicate_actions' : null,
    weakQueueCount > Math.max(3, Math.round(actionCandidates.length * 0.4)) ? 'weak_action_queue' : null,
  ].filter(Boolean);

  return {
    flowsHealthy: Math.max(0, 6 - degradedFlows.length),
    flowsDegraded: degradedFlows.length,
    flowsQuarantined: openIncidents.filter((incident: any) => incident.status === 'quarantined').length,
    weakestAreas: degradedFlows,
    failedJobs: failedJobs.length,
    openIncidents: openIncidents.length,
    draftRisk: Number(weakDraftMetrics[0]?.value || 0),
    staleEvidenceRate: Number(staleEvidenceMetrics[0]?.value || 0),
    duplicateActionRate: Number(duplicateActionMetrics[0]?.value || 0),
  };
}

export function detectRuntimeIncidents(input: {
  runtimeHealth: Awaited<ReturnType<typeof computeRuntimeHealth>>;
  now?: string;
}) {
  const now = input.now || new Date().toISOString();
  const incidents: RuntimeIncident[] = [];
  if (input.runtimeHealth.failedJobs > 0) {
    incidents.push(buildIncident('job_failures', 'high', 'Failed jobs detected in the queue.', now, {
      failedJobs: input.runtimeHealth.failedJobs,
    }));
  }
  if (input.runtimeHealth.staleEvidenceRate > 25) {
    incidents.push(buildIncident('stale_evidence', 'medium', 'Stale evidence rate is above threshold.', now, {
      staleEvidenceRate: input.runtimeHealth.staleEvidenceRate,
    }));
  }
  if (input.runtimeHealth.duplicateActionRate > 10) {
    incidents.push(buildIncident('duplicate_actions', 'medium', 'Duplicate action rate is elevated.', now, {
      duplicateActionRate: input.runtimeHealth.duplicateActionRate,
    }));
  }
  if (input.runtimeHealth.draftRisk > 20) {
    incidents.push(buildIncident('weak_drafts', 'medium', 'Weak draft rate is elevated.', now, {
      weakDraftRate: input.runtimeHealth.draftRisk,
    }));
  }
  return incidents;
}

function buildIncident(category: string, severity: RuntimeIncident['severity'], summary: string, detectedAt: string, details: Record<string, unknown>) {
  return {
    _type: 'runtimeIncident',
    _id: `runtimeIncident.${sanitizeId(category)}.${sanitizeId(detectedAt)}`,
    incidentId: `runtimeIncident.${sanitizeId(category)}.${sanitizeId(detectedAt)}`,
    category,
    severity,
    status: 'open',
    summary,
    detectedAt,
    details,
  } satisfies RuntimeIncident;
}

function sanitizeId(value: string) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
}
