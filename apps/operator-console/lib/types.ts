export type ConsoleSnapshot = {
  generatedAt: string;
  overview: {
    intelligenceStatus: {
      accountsIndexed: number;
      peopleIndexed: number;
      signalsToday: number;
      activeOpportunities: number;
      systemCompletion: number;
      driftRisk: string;
    };
    opportunityRadar: Array<{
      actionCandidateId: string;
      accountId: string | null;
      accountName: string;
      personId: string | null;
      personName: string | null;
      signal: string;
      pattern: string;
      confidence: number;
      action: string;
      whyNow: string;
      draftReady: boolean;
      score: number;
    }>;
    topActionsToday: {
      title: string;
      generatedAt: string;
      totalActions: number;
      page: number;
      pageSize: number;
      hasMore: boolean;
      policyContext?: Record<string, string | undefined>;
      actions: Array<{
        rank: number;
        actionCandidateId: string;
        account: string;
        person: string | null;
        action: string;
        whyNow: string;
        confidence: number;
        pattern: string;
        draftReady: boolean;
        allowedCommands: string[];
      }>;
    };
    completionRows: Array<{
      accountId: string;
      accountName: string;
      completion: number;
      missing: string[];
      nextStages: string[];
    }>;
    signalTimeline: Array<{
      id: string;
      signalType: string;
      accountId: string | null;
      accountName: string;
      source: string;
      strength: number;
      timestamp: string;
      uncertaintyState: string;
    }>;
  };
  entities: {
    accounts: Array<{
      id: string;
      name: string;
      domain: string | null;
      completion: number;
      opportunityScore: number;
      missing: string[];
      nextStages: string[];
      technologies: string[];
    }>;
    people: Array<{
      id: string;
      name: string;
      title: string | null;
      accountId: string | null;
      accountName: string | null;
      seniority: string | null;
    }>;
  };
  signals: {
    recent: Array<{
      id: string;
      signalType: string;
      accountId: string | null;
      accountName: string;
      source: string;
      strength: number;
      timestamp: string;
      uncertaintyState: string;
    }>;
  };
  patterns: {
    active: Array<{
      id: string;
      type: string;
      summary: string;
      lifecycleState: string;
      lastUpdated: string;
      matchFrequency: number;
      conversionAssociation: number;
      owner: string | null;
      recommendedMoves: string[];
    }>;
  };
  actions: {
    queue: ConsoleSnapshot["overview"]["topActionsToday"];
    raw: Array<{
      id: string;
      accountId: string | null;
      accountName: string;
      personId: string | null;
      personName: string | null;
      actionType: string;
      confidence: number;
      opportunityScore: number;
      pattern: string;
      whyNow: string;
      draftStatus: string;
      uncertaintyState: string;
    }>;
  };
  research: {
    briefs: Array<{
      id: string;
      date: string;
      summaryMarkdown: string;
      topActions: Array<Record<string, unknown>>;
    }>;
    drafts: Array<{
      id: string;
      actionCandidateId: string | null;
      subject: string;
      status: string;
      updatedAt: string;
    }>;
  };
  jobs: {
    running: number;
    queued: number;
    enrichQueued: number;
    recent: Array<{
      id: string;
      jobType: string;
      status: string;
      priority: number;
      attempts: number;
      nextAttemptAt: string | null;
      updatedAt: string;
      error: string | null;
      currentStage?: string | null;
    }>;
  };
  metrics: {
    drift: Array<{
      label: string;
      metricType: string;
      value: number;
      severity: string;
      observedAt: string;
      details: Record<string, unknown>;
    }>;
  };
  systemLab: {
    engineStatus: {
      signalsProcessedToday: number;
      activeOpportunities: number;
      patternsActive: number;
      draftsGenerated: number;
      jobsRunning: number;
      jobsQueued: number;
      systemCompletion: number;
      driftRisk: string;
      healthIndicators: Record<string, number>;
    };
    capabilities: Array<{ id: string; label: string; enabled: boolean }>;
    batchOperations: Array<{
      id: string;
      label: string;
      estimatedAccountsAffected: number;
      estimatedRuntime: string;
      riskLevel: string;
    }>;
    learningMode: {
      enabled: boolean;
      safeLearningGuardrails: boolean;
      operatorFeedbackCaptured: number;
      patternsStrengthened: number;
      patternsWeakened: number;
      signalWeightsUpdated: number;
      recentEvents: Array<{
        id: string;
        type: string;
        timestamp: string;
        actionCandidateId: string;
      }>;
    };
    patternEngine: Array<{
      id: string;
      name: string;
      matches: number;
      successRate: number;
      confidence: number;
      lifecycleState: string;
    }>;
    policyManagement: Record<string, {
      versionId: string;
      activationStatus: string;
      changedAt: string | null;
      changedBy: string | null;
      expectedImpact: string;
    } | null>;
    scenarioSimulator: {
      fixtures: Array<{ id: string; name: string; description: string }>;
      suiteSummary: {
        passed: boolean;
        total: number;
        failed: number;
      } & Record<string, unknown>;
    };
    codeIntelligence: {
      activeModules: string[];
      lastSystemUpdate: string | null;
      activeServices: string[];
      workerStatus: string;
      backgroundJobs: number;
    };
    driftMonitoring: Array<{
      label: string;
      metricType: string;
      value: number;
      severity: string;
      observedAt: string;
      details: Record<string, unknown>;
    }>;
    diagnostics: Array<{
      id: string;
      label: string;
      severity: string;
    }>;
    autopilot: {
      runtimeHealth: {
        flowsHealthy: number;
        flowsDegraded: number;
        flowsQuarantined: number;
        weakestAreas: string[];
        failedJobs: number;
        openIncidents: number;
        draftRisk: number;
        staleEvidenceRate: number;
        duplicateActionRate: number;
      };
      scenarioConfidence: {
        top: Array<{
          scenarioId: string;
          scenarioClass: string;
          overallConfidence: number;
          issues: string[];
          generatedAt: string;
        }>;
        weakest: Array<{
          scenarioId: string;
          scenarioClass: string;
          overallConfidence: number;
          issues: string[];
          generatedAt: string;
        }>;
        trend: Array<{
          scenarioId: string;
          overallConfidence: number;
          generatedAt: string;
        }>;
      };
      repairActivity: {
        attempted: number;
        succeeded: number;
        failed: number;
        approvalsNeeded: number;
        recent: Array<{
          attemptId: string;
          strategy: string;
          outcome: string;
          completedAt: string;
        }>;
      };
      bestPathLearning: Array<{
        scenarioId: string;
        confidenceScore: number;
        successRate: number;
        steps: string[];
      }>;
      autonomyPolicy: {
        policyId: string;
        version: string;
        allowedRepairs: string[];
        approvalRequiredActions: string[];
        monitorOnlyActions: string[];
        updatedAt: string;
      } | null;
      quarantinedFlows: Array<{
        incidentId: string;
        category: string;
        summary: string;
        severity: string;
      }>;
    };
  };
};

export type AccountDetail = {
  account: {
    id: string;
    name: string;
    domain: string | null;
    completion: number;
    opportunityScore: number;
    technologies: string[];
    missing: string[];
    nextStages: string[];
    description: string;
  };
  signalsTimeline: Array<{
    id: string;
    signalType: string;
    source: string;
    strength: number;
    timestamp: string;
    summary: string;
  }>;
  people: Array<{
    id: string;
    name: string;
    title: string | null;
    linkedinUrl: string | null;
    seniority: string | null;
  }>;
  patterns: string[];
  actions: Array<{
    id: string;
    actionType: string;
    confidence: number;
    opportunityScore: number;
    whyNow: string;
    draftStatus: string;
    recommendedNextStep: string;
    uncertaintyState: string;
  }>;
  research: {
    evidence: Array<{
      id: string;
      summary: string;
      observedAt: string;
      uncertaintyState: string;
    }>;
    briefs: Array<{
      id: string;
      title: string;
      summary: string;
      generatedAt: string;
    }>;
  };
  controls: Array<{ id: string; label: string }>;
};

export type CopilotState = {
  context: {
    section?: string;
    accountId?: string | null;
    accountName?: string | null;
  };
  suggestions: Array<{
    id: string;
    title: string;
    description: string;
    actionLabel: string;
    actionCommand: string;
    priority: number;
    category: string;
    riskLevel: string;
    estimatedCount?: number;
    requiresConfirmation?: boolean;
    context?: Record<string, unknown>;
  }>;
  insights: Array<{
    id: string;
    title: string;
    summary: string;
    severity: string;
    category: string;
    value?: string | number | null;
  }>;
  conversationStarters: string[];
  learningUpdates: Array<{
    id: string;
    title: string;
    summary: string;
  }>;
  systemAlerts: Array<{
    id: string;
    level: string;
    summary: string;
  }>;
  suggestionPreview: {
    totalActions: number;
    topCandidateId: string | null;
  };
};

export type CopilotQueryResult = {
  intent: string;
  response: string;
  action?: {
    type: string;
    command: string;
    requiresConfirmation?: boolean;
  };
  explanation?: Record<string, unknown>;
  results?: Record<string, unknown>;
};

export type FunctionDefinition = {
  id: string;
  name: string;
  category: string;
  description: string;
  entityScope: string;
  inputs: string[];
  outputType: string;
  canBatch: boolean;
  requiresConfirmation: boolean;
  jobType: string | null;
  uiPlacement: string[];
  explainabilitySupported: boolean;
  producesEntityMutations: boolean;
  producesActions: boolean;
  producesDrafts: boolean;
  actionCommand?: string | null;
};

export type AgentDefinition = {
  id: string;
  name: string;
  purpose: string;
  workflowSteps: string[];
  inputSchema: string[];
  outputSchema: string[];
  supportsBatch: boolean;
  confirmationRequired: boolean;
  currentStatus: string;
  estimatedRuntime: string;
  expectedImpact: string;
  mutationScope: string;
  confidenceNotes: string;
  runCommand: string;
};

// ─── Pattern Discovery Engine ───────────────────────────────────────────────

export type DiscoveredPattern = {
  id: string;
  name: string;
  description: string;
  patternType: 'emerging' | 'validated' | 'watchlist' | 'retired';
  sourceSignals: string[];
  sourceTechnologies: string[];
  sourcePersonas: string[];
  sourceIndustries: string[];
  matchedAccounts: string[];
  supportCount: number;
  conversionAssociation: number;
  confidence: number;
  noveltyScore: number;
  recencyScore: number;
  status: 'suggested' | 'approved' | 'rejected' | 'watching';
  createdAt: string;
  lastValidatedAt: string;
};

export type PatternInsight = {
  id: string;
  patternId: string;
  insightType: 'growth' | 'decay' | 'emerging-cluster' | 'high-conversion' | 'false-positive-risk';
  summary: string;
  evidence: string[];
  confidence: number;
  createdAt: string;
};

// ─── Strategic Intelligence Map ────────────────────────────────────────────

export type MarketCluster = {
  id: string;
  name: string;
  clusterType: 'industry' | 'technology' | 'segment' | 'signal-group' | 'pattern-group';
  accountIds: string[];
  averageOpportunityScore: number;
  averageCompletionScore: number;
  signalDensity: number;
  actionDensity: number;
  conversionRate?: number;
  whitespaceScore: number;
  strategicFitScore: number;
  topPatterns: string[];
  topTechnologies: string[];
  updatedAt: string;
};

export type StrategicMapSnapshot = {
  id: string;
  timeframe: string;
  generatedAt: string;
  clusters: MarketCluster[];
  insights: string[];
  heatmaps: {
    industryPattern: Record<string, number>;
    techSignal: Record<string, number>;
    sourceConversion: Record<string, number>;
  };
};

// ─── Territory / Portfolio ─────────────────────────────────────────────────

export type TerritorySegment = {
  id: string;
  name: string;
  description: string;
  accountIds: string[];
  ownerId: string | null;
  ownerName: string | null;
  source: 'cluster' | 'saved' | 'filter';
  opportunityScore: number;
  updatedAt: string;
};

export type TerritoryRep = {
  id: string;
  name: string;
  segmentIds: string[];
  accountCount: number;
};

// ─── Strategy simulation ───────────────────────────────────────────────────

export type StrategySimulationResult = {
  id: string;
  type: 'pattern-promotion' | 'policy-change' | 'segment-action';
  name: string;
  runAt: string;
  accountsAffected: number;
  newActionsEstimated: number;
  scoreChangeSummary: string;
  risks: string[];
  recommended: boolean;
  details: Record<string, unknown>;
};

// ─── Outcome analytics ─────────────────────────────────────────────────────

export type OutcomeRecord = {
  id: string;
  accountId: string | null;
  accountName: string;
  outcomeType: 'signal' | 'reply' | 'meeting' | 'pipeline';
  value?: number;
  sourceId?: string;
  at: string;
};

export type OutcomeFunnel = {
  period: string;
  signals: number;
  replies: number;
  meetings: number;
  pipelineValue: number;
  conversionSignalToReply: number;
  conversionReplyToMeeting: number;
  conversionMeetingToPipeline: number;
};
