export type AgentDefinition = {
  id: string;
  name: string;
  purpose: string;
  workflowSteps: string[];
  inputSchema: string[];
  outputSchema: string[];
  supportsBatch: boolean;
  confirmationRequired: boolean;
  currentStatus: 'ready' | 'experimental' | 'maintenance';
  estimatedRuntime: string;
  expectedImpact: string;
  mutationScope: string;
  confidenceNotes: string;
  runCommand: string;
};

export const agentRegistry: AgentDefinition[] = [
  {
    id: 'account-research-agent',
    name: 'Account Research Agent',
    purpose: 'Run multi-step account research to synthesize evidence, technology, and opportunity framing.',
    workflowSteps: ['scan account', 'discover pages', 'extract evidence', 'summarize opportunity'],
    inputSchema: ['domain', 'account id'],
    outputSchema: ['research run', 'evidence pack', 'brief'],
    supportsBatch: true,
    confirmationRequired: false,
    currentStatus: 'ready',
    estimatedRuntime: '2-8m',
    expectedImpact: 'Higher context density for account-level action quality.',
    mutationScope: 'account, evidence, research artifacts',
    confidenceNotes: 'Best on accounts with accessible public web surface.',
    runCommand: 'queue research {domain}',
  },
  {
    id: 'account-enrichment-agent',
    name: 'Account Enrichment Agent',
    purpose: 'Refresh stale account entities and fill missing structured fields needed by the ranking engine.',
    workflowSteps: ['identify stale entities', 'queue enrich jobs', 'apply updates', 'recompute freshness'],
    inputSchema: ['account id', 'saved segment'],
    outputSchema: ['entity updates', 'enrich jobs'],
    supportsBatch: true,
    confirmationRequired: true,
    currentStatus: 'ready',
    estimatedRuntime: '5-20m',
    expectedImpact: 'Improves completeness and reduces stale assumptions.',
    mutationScope: 'account and related entities',
    confidenceNotes: 'Guardrails prevent silent mutation without explicit queueing.',
    runCommand: 'refresh stale entities',
  },
  {
    id: 'person-discovery-agent',
    name: 'Person Discovery Agent',
    purpose: 'Identify likely stakeholders and enrich role confidence for a target account.',
    workflowSteps: ['discover people', 'infer role relevance', 'attach to account motion'],
    inputSchema: ['account id'],
    outputSchema: ['people', 'role hypotheses'],
    supportsBatch: true,
    confirmationRequired: false,
    currentStatus: 'experimental',
    estimatedRuntime: '3-10m',
    expectedImpact: 'Reduces operator effort in finding the right entry point.',
    mutationScope: 'person entities',
    confidenceNotes: 'Confidence is best when supported by multiple public sources.',
    runCommand: 'queue research {domain}',
  },
  {
    id: 'opportunity-agent',
    name: 'Opportunity Agent',
    purpose: 'Re-score and rank accounts into concrete action candidates for execution.',
    workflowSteps: ['fuse signals', 'score opportunities', 'emit action candidates', 'prepare queue'],
    inputSchema: ['accounts', 'signals', 'people'],
    outputSchema: ['action queue', 'score explanations'],
    supportsBatch: true,
    confirmationRequired: true,
    currentStatus: 'ready',
    estimatedRuntime: '1-5m',
    expectedImpact: 'Turns intelligence into prioritized operator work.',
    mutationScope: 'action candidates and queue artifacts',
    confidenceNotes: 'Policy-versioned outputs preserve explainability and drift analysis.',
    runCommand: 'generate sdr actions',
  },
  {
    id: 'batch-recovery-agent',
    name: 'Batch Recovery Agent',
    purpose: 'Recover from stale queue, drift alerts, or failed maintenance by orchestrating repair workflows.',
    workflowSteps: ['inspect drift and queue state', 'queue maintenance', 'revalidate outputs'],
    inputSchema: ['system state', 'drift metrics'],
    outputSchema: ['maintenance jobs', 'diagnostic results'],
    supportsBatch: false,
    confirmationRequired: true,
    currentStatus: 'maintenance',
    estimatedRuntime: '5-15m',
    expectedImpact: 'Restores system freshness and trust after degradation.',
    mutationScope: 'system-wide maintenance jobs',
    confidenceNotes: 'Should be used deliberately because it can trigger broad repair flows.',
    runCommand: 'queue anti drift maintenance',
  },
];
