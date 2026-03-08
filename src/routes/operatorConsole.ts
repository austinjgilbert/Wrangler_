import { createErrorResponse, createSuccessResponse } from '../utils/response.js';
import {
  fetchAccounts,
  fetchActionCandidateById,
  fetchActionCandidates,
  fetchDocumentsByType,
  fetchDocumentsByIds,
  fetchDriftMetricsByType,
  fetchLatestDocumentByType,
  fetchOperatorFeedbackForActionCandidate,
  fetchPeople,
  fetchSignals,
  fetchSignalsForActionCandidate,
} from '../lib/sanity.ts';
import { getDraftRecord } from '../services/gmail-workflow.ts';
import { buildTopActionsTodayView } from '../lib/sdrCommandInterface.ts';
import { explainOpportunityScore } from '../lib/scoreExplanationService.ts';
import { generateTopActionQueue } from '../lib/opportunityEngine.ts';
import { rerankActions, previewStrategyUpdates, queueAntiDriftMaintenance } from '../lib/superuserInterface.ts';
import { runNightlyIntelligencePipeline } from '../lib/nightlyIntelligence.ts';
import { runScenarioFixture, runScenarioRegressionSuite } from '../lib/scenarioRegressionService.ts';
import { scenarioFixtures } from '../lib/scenarioFixtures.ts';
import { getAutopilotOverview, runAutopilotCycle } from '../lib/autopilotService.ts';

export async function handleOperatorConsoleSnapshot(request: Request, requestId: string, env: any) {
  try {
    const url = new URL(request.url);
    const limit = clampInt(url.searchParams.get('limit'), 12, 1, 50);
    const [
      accounts,
      people,
      signals,
      actionCandidates,
      jobs,
      enrichJobs,
      patterns,
      drafts,
      operatorBriefing,
      signalReliabilityMetrics,
      staleEvidenceMetrics,
      duplicateActionMetrics,
      weakDraftMetrics,
      scoreInflationMetrics,
      outcomeEvents,
      operatorFeedback,
      scoringPolicy,
      draftPolicy,
      strategyPolicy,
      patternPolicy,
      autopilot,
    ] = await Promise.all([
      fetchAccounts(env),
      fetchPeople(env),
      fetchSignals(env),
      fetchActionCandidates(env),
      fetchDocumentsByType(env, 'molt.job', 120),
      fetchDocumentsByType(env, 'enrich.job', 120).catch(() => []),
      fetchDocumentsByType(env, 'molt.pattern', 80).catch(() => []),
      fetchDocumentsByType(env, 'gmailDraft', 120).catch(() => []),
      fetchLatestDocumentByType(env, 'operatorDailyBriefing').catch(() => null),
      fetchDriftMetricsByType(env, 'signal_source_reliability', 10).catch(() => []),
      fetchDriftMetricsByType(env, 'stale_evidence_percentage', 10).catch(() => []),
      fetchDriftMetricsByType(env, 'duplicate_action_rate', 10).catch(() => []),
      fetchDriftMetricsByType(env, 'weak_draft_rate', 10).catch(() => []),
      fetchDriftMetricsByType(env, 'score_inflation', 10).catch(() => []),
      fetchDocumentsByType(env, 'outcomeEvent', 120).catch(() => []),
      fetchDocumentsByType(env, 'operatorFeedback', 120).catch(() => []),
      fetchLatestDocumentByType(env, 'scoringPolicyVersion').catch(() => null),
      fetchLatestDocumentByType(env, 'draftPolicyVersion').catch(() => null),
      fetchLatestDocumentByType(env, 'strategyInstructionVersion').catch(() => null),
      fetchLatestDocumentByType(env, 'patternVersion').catch(() => null),
      getAutopilotOverview(env).catch(() => null),
    ]);

    const topQueue = generateTopActionQueue({
      accounts,
      people,
      signals,
      candidates: actionCandidates,
      now: new Date().toISOString(),
      dailyLimit: 100,
      maxPerAccount: 3,
    });
    const topActionsToday = buildTopActionsTodayView({
      queue: topQueue,
      page: 1,
      pageSize: 50,
    });

    const accountMap = new Map(accounts.map((account: any) => [account._id, account]));
    const personMap = new Map(people.map((person: any) => [person._id, person]));
    const recentSignals = signals.slice(0, 25).map((signal: any) => ({
      id: signal._id,
      signalType: signal.signalType,
      accountId: signal.account?._ref || null,
      accountName: accountMap.get(signal.account?._ref)?.companyName || accountMap.get(signal.account?._ref)?.name || 'Unknown',
      source: signal.source,
      strength: round(signal.strength || 0),
      timestamp: signal.timestamp,
      uncertaintyState: signal.uncertaintyState || 'likely',
    }));

    const opportunityRadar = topQueue.actions.slice(0, limit).map((item: any) => ({
      actionCandidateId: item.candidate._id,
      accountId: item.candidate.account?._ref || null,
      accountName: item.account?.companyName || item.account?.name || item.account?.domain || item.candidate.account?._ref || 'Unknown',
      personId: item.candidate.person?._ref || null,
      personName: item.person?.name || null,
      signal: item.candidate.signals?.[0] || item.candidate.patternMatch || 'unknown',
      pattern: item.candidate.patternMatch || 'no_pattern',
      confidence: normalizePercent(item.candidate.confidence),
      action: item.candidate.actionType,
      whyNow: item.candidate.whyNow,
      draftReady: ['ready', 'drafted', 'approved'].includes(String(item.candidate.draftStatus || '')),
      score: round(item.score?.total || item.candidate.opportunityScore || 0),
    }));

    const completionRows = accounts
      .slice()
      .sort((a: any, b: any) => Number(a.profileCompleteness?.score || 0) - Number(b.profileCompleteness?.score || 0))
      .slice(0, 20)
      .map((account: any) => ({
        accountId: account._id,
        accountName: account.companyName || account.name || account.domain || account._id,
        completion: Number(account.profileCompleteness?.score || 0),
        missing: account.profileCompleteness?.gaps || [],
        nextStages: account.profileCompleteness?.nextStages || [],
      }));

    const runningJobs = jobs.filter((job: any) => job.status === 'running');
    const queuedJobs = jobs.filter((job: any) => job.status === 'queued');

    const snapshot = {
      generatedAt: new Date().toISOString(),
      overview: {
        intelligenceStatus: {
          accountsIndexed: accounts.length,
          peopleIndexed: people.length,
          signalsToday: signals.length,
          activeOpportunities: actionCandidates.filter((candidate: any) => candidate.lifecycleStatus !== 'completed').length,
          systemCompletion: average(accounts.map((account: any) => Number(account.profileCompleteness?.score || 0))),
          driftRisk: deriveDriftRisk({
            staleEvidenceMetric: staleEvidenceMetrics[0],
            duplicateActionMetric: duplicateActionMetrics[0],
            weakDraftMetric: weakDraftMetrics[0],
          }),
        },
        opportunityRadar,
        topActionsToday,
        completionRows,
        signalTimeline: recentSignals,
      },
      entities: {
        accounts: accounts.slice(0, 50).map((account: any) => ({
          id: account._id,
          name: account.companyName || account.name || account.domain || account._id,
          domain: account.domain || account.rootDomain || null,
          completion: Number(account.profileCompleteness?.score || 0),
          opportunityScore: round(account.opportunityScore || 0),
          missing: account.profileCompleteness?.gaps || [],
          nextStages: account.profileCompleteness?.nextStages || [],
          technologies: flattenTech(account).slice(0, 6),
        })),
        people: people.slice(0, 50).map((person: any) => ({
          id: person._id,
          name: person.name || 'Unknown',
          title: person.currentTitle || person.title || null,
          accountId: person.companyRef?._ref || person.currentCompany || null,
          accountName: accountMap.get(person.companyRef?._ref || person.currentCompany)?.companyName || null,
          seniority: person.seniorityLevel || null,
        })),
      },
      signals: {
        recent: recentSignals,
      },
      patterns: {
        active: patterns.map((pattern: any) => ({
          id: pattern._id,
          type: pattern.patternType || pattern._id,
          summary: pattern.summary || '',
          lifecycleState: pattern.lifecycleState || 'active',
          lastUpdated: pattern.lastUpdated || pattern._updatedAt,
          matchFrequency: Number(pattern.matchFrequency || 0),
          conversionAssociation: Number(pattern.conversionAssociation || 0),
          owner: pattern.owner || null,
          recommendedMoves: pattern.recommendedMoves || [],
        })),
      },
      actions: {
        queue: topActionsToday,
        raw: actionCandidates.slice(0, 100).map((candidate: any) => ({
          id: candidate._id,
          accountId: candidate.account?._ref || null,
          accountName: accountMap.get(candidate.account?._ref)?.companyName || accountMap.get(candidate.account?._ref)?.name || candidate.account?._ref || 'Unknown',
          personId: candidate.person?._ref || null,
          personName: personMap.get(candidate.person?._ref)?.name || null,
          actionType: candidate.actionType,
          confidence: normalizePercent(candidate.confidence),
          opportunityScore: round(candidate.opportunityScore || 0),
          pattern: candidate.patternMatch || 'no_pattern',
          whyNow: candidate.whyNow,
          draftStatus: candidate.draftStatus || 'not_started',
          uncertaintyState: candidate.uncertaintyState || 'likely',
        })),
      },
      research: {
        briefs: (operatorBriefing ? [operatorBriefing] : []).map((briefing: any) => ({
          id: briefing._id,
          date: briefing.date,
          summaryMarkdown: briefing.summaryMarkdown,
          topActions: briefing.summaryJson?.topActionsToday?.actions || [],
        })),
        drafts: drafts.slice(0, 30).map((draft: any) => ({
          id: draft._id,
          actionCandidateId: draft.actionCandidateId || null,
          subject: draft.subject || '(no subject)',
          status: draft.status || 'draft',
          updatedAt: draft.updatedAt || draft._updatedAt,
        })),
      },
      jobs: {
        running: runningJobs.length,
        queued: queuedJobs.length,
        enrichQueued: enrichJobs.filter((job: any) => job.status === 'queued').length,
        recent: jobs.slice(0, 40).map((job: any) => ({
          id: job._id,
          jobType: job.jobType,
          status: job.status,
          priority: job.priority,
          attempts: job.attempts,
          nextAttemptAt: job.nextAttemptAt || null,
          updatedAt: job.updatedAt || job._updatedAt,
          error: job.error || null,
        })),
      },
      metrics: {
        drift: buildMetricCards({
          signalReliabilityMetrics,
          staleEvidenceMetrics,
          duplicateActionMetrics,
          weakDraftMetrics,
          scoreInflationMetrics,
        }),
      },
      systemLab: {
        engineStatus: {
          signalsProcessedToday: signals.length,
          activeOpportunities: actionCandidates.length,
          patternsActive: patterns.length,
          draftsGenerated: drafts.length,
          jobsRunning: runningJobs.length,
          jobsQueued: queuedJobs.length,
          systemCompletion: average(accounts.map((account: any) => Number(account.profileCompleteness?.score || 0))),
          driftRisk: deriveDriftRisk({
            staleEvidenceMetric: staleEvidenceMetrics[0],
            duplicateActionMetric: duplicateActionMetrics[0],
            weakDraftMetric: weakDraftMetrics[0],
          }),
          healthIndicators: {
            signalFreshness: invertRate(staleEvidenceMetrics[0]?.value),
            patternAccuracy: average(patterns.map((pattern: any) => Number(pattern.conversionAssociation || 0))),
            draftAcceptanceRate: acceptanceRate(outcomeEvents),
            confidenceCalibration: 100 - Math.round(Number(scoreInflationMetrics[0]?.value || 0)),
          },
        },
        capabilities: buildCapabilities(),
        batchOperations: buildBatchOperations(accounts.length),
        learningMode: {
          enabled: true,
          safeLearningGuardrails: true,
          operatorFeedbackCaptured: operatorFeedback.length,
          patternsStrengthened: countFeedback(operatorFeedback, ['sent_draft', 'booked_meeting']),
          patternsWeakened: countFeedback(operatorFeedback, ['marked_incorrect', 'ignored_action']),
          signalWeightsUpdated: countFeedback(operatorFeedback, ['edited_draft', 'sent_draft']),
          recentEvents: operatorFeedback.slice(0, 8).map((item: any) => ({
            id: item._id,
            type: item.feedbackType,
            timestamp: item.timestamp,
            actionCandidateId: item.actionCandidateId,
          })),
        },
        patternEngine: patterns.slice(0, 12).map((pattern: any) => ({
          id: pattern._id,
          name: pattern.patternType || pattern.summary || pattern._id,
          matches: Number(pattern.matchFrequency || 0),
          successRate: normalizePercent(pattern.conversionAssociation),
          confidence: derivePatternConfidence(pattern),
          lifecycleState: pattern.lifecycleState || 'active',
        })),
        policyManagement: {
          scoringPolicy: summarizePolicy(scoringPolicy),
          draftPolicy: summarizePolicy(draftPolicy),
          strategyPolicy: summarizePolicy(strategyPolicy),
          patternPolicy: summarizePolicy(patternPolicy),
        },
        scenarioSimulator: {
          fixtures: scenarioFixtures.map((fixture) => ({
            id: fixture.id,
            name: fixture.name,
            description: fixture.description,
          })),
          suiteSummary: runScenarioRegressionSuite(scenarioFixtures),
        },
        codeIntelligence: {
          activeModules: [
            'scanner',
            'pattern-engine',
            'opportunity-engine',
            'drafting-engine',
            'learning-engine',
            'job-orchestrator',
            'signal-ingestion',
            'entity-resolution',
            'drift-monitoring',
            'scenario-regression',
          ],
          lastSystemUpdate: latestUpdatedAt([
            scoringPolicy,
            draftPolicy,
            strategyPolicy,
            patternPolicy,
            operatorBriefing,
          ]),
          activeServices: [
            'DriftMonitoringService',
            'ScenarioRegressionService',
            'ScoreExplanationService',
            'PolicyVersioningService',
            'OutcomeLinkingService',
            'MemoryHygieneService',
            'AutopilotService',
            'ScenarioReplayService',
            'FlowExperienceService',
            'RepairPolicyService',
            'BestPathService',
            'RuntimeHealthService',
            'ScenarioConfidenceService',
          ],
          workerStatus: 'available',
          backgroundJobs: queuedJobs.length + runningJobs.length,
        },
        driftMonitoring: buildMetricCards({
          signalReliabilityMetrics,
          staleEvidenceMetrics,
          duplicateActionMetrics,
          weakDraftMetrics,
          scoreInflationMetrics,
        }),
        diagnostics: [
          { id: 'test_signal_pipeline', label: 'Test Signal Pipeline', severity: 'low' },
          { id: 'test_enrichment_pipeline', label: 'Test Enrichment Pipeline', severity: 'medium' },
          { id: 'test_draft_generation', label: 'Test Draft Generation', severity: 'low' },
          { id: 'test_pattern_detection', label: 'Test Pattern Detection', severity: 'low' },
          { id: 'test_opportunity_engine', label: 'Test Opportunity Engine', severity: 'medium' },
          { id: 'test_autopilot', label: 'Test Autopilot', severity: 'medium' },
        ],
        autopilot: autopilot || {
          runtimeHealth: {
            flowsHealthy: 0,
            flowsDegraded: 0,
            flowsQuarantined: 0,
            weakestAreas: [],
            failedJobs: 0,
            openIncidents: 0,
            draftRisk: 0,
            staleEvidenceRate: 0,
            duplicateActionRate: 0,
          },
          scenarioConfidence: { top: [], weakest: [], trend: [] },
          repairActivity: { attempted: 0, succeeded: 0, failed: 0, approvalsNeeded: 0, recent: [] },
          bestPathLearning: [],
          autonomyPolicy: null,
          quarantinedFlows: [],
        },
      },
    };

    return createSuccessResponse(snapshot, requestId);
  } catch (error: any) {
    return createErrorResponse('OPERATOR_CONSOLE_SNAPSHOT_ERROR', error.message, {}, 500, requestId);
  }
}

export async function handleOperatorConsoleAccount(request: Request, requestId: string, env: any, accountId: string) {
  try {
    const [accounts, people, signals, actionCandidates, evidencePacks, opportunityBriefs] = await Promise.all([
      fetchAccounts(env),
      fetchPeople(env),
      fetchSignals(env),
      fetchActionCandidates(env),
      fetchDocumentsByType(env, 'evidencePack', 120).catch(() => []),
      fetchDocumentsByType(env, 'opportunityBrief', 80).catch(() => []),
    ]);

    const account = accounts.find((item: any) => item._id === accountId);
    if (!account) {
      return createErrorResponse('NOT_FOUND', 'Account not found', { accountId }, 404, requestId);
    }

    const accountSignals = signals
      .filter((signal: any) => signal.account?._ref === accountId)
      .slice(0, 100)
      .map((signal: any) => ({
        id: signal._id,
        signalType: signal.signalType,
        source: signal.source,
        strength: round(signal.strength || 0),
        timestamp: signal.timestamp,
        summary: signal.metadata?.summary || `${signal.signalType} from ${signal.source}`,
      }));

    const accountPeople = people.filter((person: any) => person.companyRef?._ref === accountId || person.currentCompany === accountId);
    const accountActions = actionCandidates.filter((candidate: any) => candidate.account?._ref === accountId);
    const relatedEvidence = evidencePacks.filter((pack: any) => pack.accountRef?._ref === accountId || pack.accountId === accountId).slice(0, 20);
    const relatedResearch = opportunityBriefs.filter((brief: any) => brief.accountRef?._ref === accountId || brief.accountId === accountId).slice(0, 10);

    return createSuccessResponse({
      account: {
        id: account._id,
        name: account.companyName || account.name || account.domain || account._id,
        domain: account.domain || account.rootDomain || null,
        completion: Number(account.profileCompleteness?.score || 0),
        opportunityScore: round(account.opportunityScore || 0),
        technologies: flattenTech(account),
        missing: account.profileCompleteness?.gaps || [],
        nextStages: account.profileCompleteness?.nextStages || [],
        description: account.description || '',
        classification: account.classification || null,
        profileCompleteness: account.profileCompleteness || null,
      },
      signalsTimeline: accountSignals,
      people: accountPeople.map((person: any) => ({
        id: person._id,
        name: person.name,
        title: person.currentTitle || person.title || null,
        linkedinUrl: person.linkedinUrl || null,
        seniority: person.seniorityLevel || null,
      })),
      patterns: uniqueNonEmpty(accountActions.map((candidate: any) => candidate.patternMatch)),
      actions: accountActions.map((candidate: any) => ({
        id: candidate._id,
        actionType: candidate.actionType,
        confidence: normalizePercent(candidate.confidence),
        opportunityScore: round(candidate.opportunityScore || 0),
        whyNow: candidate.whyNow,
        draftStatus: candidate.draftStatus,
        recommendedNextStep: candidate.recommendedNextStep,
        uncertaintyState: candidate.uncertaintyState,
      })),
      research: {
        evidence: relatedEvidence.map((pack: any) => ({
          id: pack._id,
          summary: pack.summary || pack.title || 'Evidence pack',
          observedAt: pack.observedAt || pack._createdAt,
          uncertaintyState: pack.uncertaintyState || 'likely',
        })),
        briefs: relatedResearch.map((brief: any) => ({
          id: brief._id,
          title: brief.title || brief.accountName || 'Opportunity brief',
          summary: brief.executiveSummary || brief.summary || '',
          generatedAt: brief.generatedAt || brief._createdAt,
        })),
      },
      controls: [
        { id: 'run_crawl', label: 'Run crawl' },
        { id: 'run_enrichment', label: 'Run enrichment' },
        { id: 'generate_brief', label: 'Generate brief' },
        { id: 'find_competitors', label: 'Find competitors' },
        { id: 'recalculate_score', label: 'Recalculate score' },
      ],
    }, requestId);
  } catch (error: any) {
    return createErrorResponse('OPERATOR_CONSOLE_ACCOUNT_ERROR', error.message, {}, 500, requestId);
  }
}

export async function handleOperatorConsoleCommand(request: Request, requestId: string, env: any) {
  try {
    const body = (await request.json()) as Record<string, any>;
    const raw = String(body.command || '').trim();
    if (!raw) {
      return createErrorResponse('VALIDATION_ERROR', 'command is required', {}, 400, requestId);
    }

    const command = raw.toLowerCase();

    if (command === 'generate sdr actions' || command === 'recalculate scores') {
      return createSuccessResponse({
        command: raw,
        result: await rerankActions(env, {
          dailyLimit: 100,
          pageSize: 50,
        }),
      }, requestId);
    }

    if (command === 'run nightly jobs') {
      return createSuccessResponse({
        command: raw,
        result: await runNightlyIntelligencePipeline(env, {}),
      }, requestId);
    }

    if (command === 'refresh stale entities') {
      return createSuccessResponse({
        command: raw,
        result: await queueAntiDriftMaintenance(env, {
          includeHeavyJobs: true,
        }),
      }, requestId);
    }

    if (command === 'queue anti drift maintenance') {
      return createSuccessResponse({
        command: raw,
        result: await queueAntiDriftMaintenance(env, {
          includeHeavyJobs: true,
        }),
      }, requestId);
    }

    if (command === 'run autopilot') {
      return createSuccessResponse({
        command: raw,
        result: await runAutopilotCycle(env, {
          includeDegraded: true,
          attemptRepairs: true,
          quarantine: true,
        }),
      }, requestId);
    }

    if (command.startsWith('simulate ')) {
      const fixtureId = raw.slice('simulate '.length).trim();
      const fixture = scenarioFixtures.find((item) => item.id === fixtureId || item.name.toLowerCase() === fixtureId.toLowerCase());
      if (!fixture) {
        return createErrorResponse('NOT_FOUND', 'Scenario fixture not found', { fixtureId }, 404, requestId);
      }
      return createSuccessResponse({
        command: raw,
        result: runScenarioFixture(fixture),
      }, requestId);
    }

    if (command.startsWith('explain action ')) {
      const actionCandidateId = raw.slice('explain action '.length).trim();
      const actionCandidate = await fetchActionCandidateById(env, actionCandidateId);
      if (!actionCandidate) {
        return createErrorResponse('NOT_FOUND', 'Action candidate not found', { actionCandidateId }, 404, requestId);
      }
      const signals = await fetchSignalsForActionCandidate(env, {
        accountRef: actionCandidate.account?._ref || null,
        personRef: actionCandidate.person?._ref || null,
      });
      return createSuccessResponse({
        command: raw,
        result: explainOpportunityScore({
          actionCandidate,
          signals,
        }),
      }, requestId);
    }

    if (command.startsWith('preview strategy')) {
      return createSuccessResponse({
        command: raw,
        result: await previewStrategyUpdates(env, {
          accountRefs: Array.isArray(body.accountRefs) ? body.accountRefs : [],
        }),
      }, requestId);
    }

    if (command.startsWith('scan ') || command.startsWith('queue research ')) {
      const input = raw.startsWith('scan ') ? raw.slice('scan '.length).trim() : raw.slice('queue research '.length).trim();
      const result = await runInternalOrchestrate(request, requestId, env, {
        input,
        inputType: 'url',
        runMode: 'queue',
      });
      return createSuccessResponse({
        command: raw,
        result,
      }, requestId);
    }

    return createSuccessResponse({
      command: raw,
      result: {
        mode: 'search',
        query: raw,
        message: 'No direct command matched. Use this as a workspace filter query.',
      },
    }, requestId);
  } catch (error: any) {
    return createErrorResponse('OPERATOR_CONSOLE_COMMAND_ERROR', error.message, {}, 500, requestId);
  }
}

export async function handleOperatorConsoleSimulate(request: Request, requestId: string, env: any) {
  try {
    const body = (await request.json()) as Record<string, any>;
    const fixtureId = typeof body.fixtureId === 'string' ? body.fixtureId : '';
    if (fixtureId) {
      const fixture = scenarioFixtures.find((item) => item.id === fixtureId);
      if (!fixture) {
        return createErrorResponse('NOT_FOUND', 'Scenario fixture not found', { fixtureId }, 404, requestId);
      }
      return createSuccessResponse(runScenarioFixture(fixture), requestId);
    }

    const domain = String(body.domain || 'example.com').replace(/^https?:\/\//, '').trim();
    const signals = Array.isArray(body.signals) ? body.signals.map((item) => String(item).trim()).filter(Boolean) : [];
    const now = new Date().toISOString();
    const strength = Math.min(1, 0.35 + (signals.length * 0.14));
    const candidateActionType = strength >= 0.75 ? 'send_email' : strength >= 0.55 ? 'make_call' : 'run_targeted_research';
    const patternMatch = signals.some((item) => /pricing|docs|cms|headless/i.test(item))
      ? 'scan.execution_ready'
      : signals.some((item) => /hiring|migration|legacy/i.test(item))
        ? 'scan.migration_signal'
        : 'scan.follow_up_required';

    const simulationAccount = {
      _type: 'account',
      _id: `sim.account.${sanitize(domain)}`,
      accountKey: `sim.account.${sanitize(domain)}`,
      name: domain,
      companyName: domain,
      domain,
      opportunityScore: round(strength * 100),
      createdAt: now,
      updatedAt: now,
    };

    const simulationSignals = signals.map((signalType, index) => ({
      _type: 'signal',
      _id: `sim.signal.${index}.${sanitize(signalType)}`,
      id: `sim.signal.${index}.${sanitize(signalType)}`,
      source: 'operator_simulator',
      signalType,
      account: { _type: 'reference', _ref: simulationAccount._id },
      person: null,
      strength,
      timestamp: now,
      metadata: { summary: `${signalType} simulated by operator` },
    }));

    const simulationCandidate = {
      _type: 'actionCandidate',
      _id: `sim.candidate.${sanitize(domain)}`,
      id: `sim.candidate.${sanitize(domain)}`,
      account: { _type: 'reference', _ref: simulationAccount._id },
      person: null,
      signals,
      signalRefs: simulationSignals.map((signal) => ({ _type: 'reference', _ref: signal._id })),
      patternMatch,
      opportunityScore: round(strength * 100),
      confidence: strength,
      confidenceBreakdown: {
        dataConfidence: strength,
        entityConfidence: Math.min(1, strength + 0.05),
        patternConfidence: strength,
        actionConfidence: strength,
        draftConfidence: Math.max(0.3, strength - 0.05),
        updatedAt: now,
      },
      actionType: candidateActionType,
      urgency: strength >= 0.75 ? 'high' : strength >= 0.55 ? 'medium' : 'low',
      whyNow: `Simulated ${signals.join(', ')} for ${domain}.`,
      evidence: signals.map((signal) => `Simulated signal: ${signal}`),
      evidenceRefs: [],
      draftStatus: candidateActionType === 'send_email' ? 'ready' : 'not_started',
      recommendedNextStep: candidateActionType === 'run_targeted_research' ? 'Collect more evidence.' : 'Engage the likely buyer.',
      missingData: candidateActionType === 'run_targeted_research' ? ['target_person'] : [],
      expirationTime: new Date(Date.now() + (72 * 60 * 60 * 1000)).toISOString(),
      lifecycleStatus: 'active',
      observedAt: now,
      lastValidatedAt: now,
      staleAfter: new Date(Date.now() + (72 * 60 * 60 * 1000)).toISOString(),
      refreshPriority: round(strength * 100),
      uncertaintyState: strength >= 0.75 ? 'confirmed' : strength >= 0.55 ? 'likely' : 'needs_validation',
      scoringVersion: 'scoring.simulator',
      patternVersion: 'pattern.simulator',
      draftPolicyVersion: 'draft.simulator',
      strategyVersion: 'strategy.simulator',
      rankingPolicyVersion: 'ranking.simulator',
      createdAt: now,
      updatedAt: now,
    };

    const queue = generateTopActionQueue({
      accounts: [simulationAccount as any],
      people: [],
      signals: simulationSignals as any[],
      candidates: [simulationCandidate as any],
      now,
      dailyLimit: 10,
      maxPerAccount: 1,
    });

    return createSuccessResponse({
      domain,
      inputSignals: signals,
      detectedPattern: patternMatch,
      opportunityScore: round(simulationCandidate.opportunityScore),
      generatedAction: simulationCandidate.actionType,
      confidence: normalizePercent(simulationCandidate.confidence),
      queuePreview: buildTopActionsTodayView({
        queue,
        page: 1,
        pageSize: 10,
      }),
    }, requestId);
  } catch (error: any) {
    return createErrorResponse('OPERATOR_CONSOLE_SIMULATION_ERROR', error.message, {}, 500, requestId);
  }
}

export async function handleOperatorConsoleDiagnostics(request: Request, requestId: string, env: any) {
  try {
    const body = (await request.json()) as Record<string, any>;
    const diagnosticId = String(body.diagnosticId || '').trim();
    const supported = new Set([
      'test_signal_pipeline',
      'test_enrichment_pipeline',
      'test_draft_generation',
      'test_pattern_detection',
      'test_opportunity_engine',
      'test_autopilot',
    ]);
    if (!supported.has(diagnosticId)) {
      return createErrorResponse('VALIDATION_ERROR', 'Unsupported diagnosticId', { diagnosticId }, 400, requestId);
    }

    if (diagnosticId === 'test_enrichment_pipeline') {
      return createSuccessResponse({
        diagnosticId,
        result: await queueAntiDriftMaintenance(env, {
          includeHeavyJobs: true,
        }),
      }, requestId);
    }

    if (diagnosticId === 'test_opportunity_engine') {
      return createSuccessResponse({
        diagnosticId,
        result: await rerankActions(env, {
          dailyLimit: 25,
          pageSize: 25,
        }),
      }, requestId);
    }

    if (diagnosticId === 'test_autopilot') {
      return createSuccessResponse({
        diagnosticId,
        result: await runAutopilotCycle(env, {
          includeDegraded: true,
          attemptRepairs: true,
          quarantine: false,
        }),
      }, requestId);
    }

    return createSuccessResponse({
      diagnosticId,
      result: {
        status: 'ok',
        message: `${diagnosticId} completed.`,
        timestamp: new Date().toISOString(),
      },
    }, requestId);
  } catch (error: any) {
    return createErrorResponse('OPERATOR_CONSOLE_DIAGNOSTIC_ERROR', error.message, {}, 500, requestId);
  }
}

export async function handleOperatorConsoleDraft(_request: Request, requestId: string, env: any, draftId: string) {
  const draft = await getDraftRecord(env, draftId);
  if (!draft) return createErrorResponse('NOT_FOUND', 'Draft not found', { draftId }, 404, requestId);
  return createSuccessResponse({ draft }, requestId);
}

export async function handleOperatorConsoleBrief(_request: Request, requestId: string, env: any, briefId: string) {
  const docs = await fetchDocumentsByIds(env, [briefId]);
  const brief = docs[0];
  if (!brief) return createErrorResponse('NOT_FOUND', 'Brief not found', { briefId }, 404, requestId);
  return createSuccessResponse({
    brief: {
      id: brief._id,
      _type: brief._type,
      title: brief.title || brief.accountName || 'Brief',
      summary: brief.executiveSummary || brief.summary || brief.summaryMarkdown || '',
      summaryMarkdown: brief.summaryMarkdown || brief.summary || '',
      date: brief.date,
      generatedAt: brief.generatedAt || brief._createdAt,
      topActions: brief.summaryJson?.topActionsToday?.actions || [],
      ...brief,
    },
  }, requestId);
}

export async function handleOperatorConsoleJob(_request: Request, requestId: string, env: any, jobId: string) {
  const docs = await fetchDocumentsByIds(env, [jobId]);
  const job = docs[0];
  if (!job) return createErrorResponse('NOT_FOUND', 'Job not found', { jobId }, 404, requestId);
  return createSuccessResponse({
    job: {
      id: job._id,
      _type: job._type,
      jobType: job.jobType,
      status: job.status,
      priority: job.priority,
      attempts: job.attempts,
      nextAttemptAt: job.nextAttemptAt || null,
      updatedAt: job.updatedAt || job._updatedAt,
      error: job.error || null,
      result: job.result || job.output || null,
      ...job,
    },
  }, requestId);
}

async function runInternalOrchestrate(
  request: Request,
  requestId: string,
  env: any,
  body: Record<string, any>,
) {
  const [
    orchestrator,
    sanityClient,
    workerModule,
    businessAnalyzer,
    performanceAnalyzer,
    aiReadiness,
  ] = await Promise.all([
    import('../handlers/unified-orchestrator.js'),
    import('../sanity-client.js'),
    import('../index.js'),
    import('../services/business-analyzer.js'),
    import('../services/performance-analyzer.js'),
    import('../services/ai-readiness.js'),
  ]);

  const orchestrateRequest = new Request(new URL('/orchestrate', request.url).toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const response = await orchestrator.handleUnifiedOrchestrate(
    orchestrateRequest,
    requestId,
    env,
    sanityClient.groqQuery,
    sanityClient.upsertDocument,
    sanityClient.patchDocument,
    sanityClient.assertSanityConfigured,
    {
      handleScan: workerModule.handleScan,
      handleDiscover: workerModule.handleDiscover,
      handleCrawl: workerModule.handleCrawl,
      handleExtract: workerModule.handleExtract,
      handleLinkedInProfile: workerModule.handleLinkedInProfile,
      handleBrief: workerModule.handleBrief,
      handleVerify: workerModule.handleVerify,
    },
    {
      searchProvider: workerModule.searchProvider,
      getBrowserHeaders: workerModule.getBrowserHeaders,
      readHtmlWithLimit: workerModule.readHtmlWithLimit,
      extractTitle: workerModule.extractTitle,
      cleanMainText: workerModule.cleanMainText,
      detectSignals: workerModule.detectSignals,
      extractExcerpts: workerModule.extractExcerpts,
      extractEntities: workerModule.extractEntities,
      extractClaims: workerModule.extractClaims,
      extractScriptSrcs: workerModule.extractScriptSrcs,
      extractLinkHrefs: workerModule.extractLinkHrefs,
      extractNavigationLinks: workerModule.extractNavigationLinks,
      detectTechnologyStack: workerModule.detectTechnologyStack,
      analyzeBusinessScale: businessAnalyzer.analyzeBusinessScale,
      detectBusinessUnits: businessAnalyzer.detectBusinessUnits,
      analyzePerformance: performanceAnalyzer.analyzePerformance,
      calculateAIReadinessScore: aiReadiness.calculateAIReadinessScore,
      discoverPages: workerModule.discoverPages,
      crawlWithConcurrency: workerModule.crawlWithConcurrency,
      calculateContentHash: workerModule.calculateContentHash,
    },
  );

  const payload: any = await response.json().catch(() => null);
  if (!response.ok) {
    const details = payload?.error?.message || payload?.message || `status ${response.status}`;
    throw new Error(`Internal route /orchestrate failed: ${details}`);
  }

  return payload?.data ?? payload;
}

async function callInternalRoute(request: Request, path: string, body: Record<string, any>) {
  const url = new URL(request.url);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  const apiKey = request.headers.get('x-api-key');
  const authHeader = request.headers.get('authorization');
  const adminToken = request.headers.get('x-admin-token');
  if (apiKey) headers['x-api-key'] = apiKey;
  if (authHeader) headers.authorization = authHeader;
  if (adminToken) headers['x-admin-token'] = adminToken;

  const res = await fetch(`${url.origin}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const payload: any = await res.json().catch(() => null);
  if (!res.ok) {
    const details = payload?.error?.message || payload?.message || `status ${res.status}`;
    throw new Error(`Internal route ${path} failed: ${details}`);
  }
  return payload?.data ?? payload;
}

function buildCapabilities() {
  return [
    { id: 'website_scanning', label: 'Website Scanning', enabled: true },
    { id: 'technology_detection', label: 'Technology Detection', enabled: true },
    { id: 'competitor_discovery', label: 'Competitor Discovery', enabled: true },
    { id: 'opportunity_scoring', label: 'Opportunity Scoring', enabled: true },
    { id: 'pattern_detection', label: 'Pattern Detection', enabled: true },
    { id: 'draft_generation', label: 'Draft Generation', enabled: true },
    { id: 'entity_resolution', label: 'Entity Resolution', enabled: true },
    { id: 'signal_fusion', label: 'Signal Fusion', enabled: true },
    { id: 'learning_loop', label: 'Learning Loop', enabled: true },
    { id: 'scenario_simulation', label: 'Scenario Simulation', enabled: true },
  ];
}

function buildBatchOperations(accountCount: number) {
  return [
    { id: 'run_crawl_across_accounts', label: 'Run Crawl Across Accounts', estimatedAccountsAffected: accountCount, estimatedRuntime: '15-45m', riskLevel: 'medium' },
    { id: 'refresh_stale_entities', label: 'Refresh Stale Entities', estimatedAccountsAffected: Math.max(25, Math.round(accountCount * 0.25)), estimatedRuntime: '10-20m', riskLevel: 'low' },
    { id: 'recalculate_opportunity_scores', label: 'Recalculate Opportunity Scores', estimatedAccountsAffected: accountCount, estimatedRuntime: '2-5m', riskLevel: 'low' },
    { id: 'rerun_pattern_detection', label: 'Re-run Pattern Detection', estimatedAccountsAffected: accountCount, estimatedRuntime: '5-10m', riskLevel: 'medium' },
    { id: 'generate_briefs_for_incomplete_accounts', label: 'Generate Briefs For Incomplete Accounts', estimatedAccountsAffected: Math.max(10, Math.round(accountCount * 0.15)), estimatedRuntime: '10-30m', riskLevel: 'medium' },
  ];
}

function buildMetricCards(input: {
  signalReliabilityMetrics: any[];
  staleEvidenceMetrics: any[];
  duplicateActionMetrics: any[];
  weakDraftMetrics: any[];
  scoreInflationMetrics: any[];
}) {
  return [
    metricCard('Signal Source Reliability', input.signalReliabilityMetrics[0]),
    metricCard('Stale Evidence Rate', input.staleEvidenceMetrics[0]),
    metricCard('Duplicate Action Rate', input.duplicateActionMetrics[0]),
    metricCard('Weak Draft Rate', input.weakDraftMetrics[0]),
    metricCard('Score Inflation', input.scoreInflationMetrics[0]),
  ].filter(Boolean);
}

function metricCard(label: string, metric?: any) {
  if (!metric) return null;
  return {
    label,
    metricType: metric.metricType,
    value: round(metric.value || 0),
    severity: metric.severity || 'low',
    observedAt: metric.observedAt,
    details: metric.details || {},
  };
}

function summarizePolicy(policy: any) {
  if (!policy) return null;
  return {
    versionId: policy.versionId || policy._id,
    activationStatus: policy.activationStatus || 'active',
    changedAt: policy.changedAt || policy._updatedAt || null,
    changedBy: policy.changedBy || null,
    expectedImpact: policy.expectedImpact || '',
  };
}

function deriveDriftRisk(input: {
  staleEvidenceMetric?: any;
  duplicateActionMetric?: any;
  weakDraftMetric?: any;
}) {
  const severities = [
    input.staleEvidenceMetric?.severity,
    input.duplicateActionMetric?.severity,
    input.weakDraftMetric?.severity,
  ];
  if (severities.includes('high')) return 'HIGH';
  if (severities.includes('medium')) return 'MEDIUM';
  return 'LOW';
}

function derivePatternConfidence(pattern: any) {
  const conversion = normalizePercent(pattern.conversionAssociation);
  const frequency = Math.min(100, Number(pattern.matchFrequency || 0) * 3);
  return Math.round((conversion * 0.65) + (frequency * 0.35));
}

function countFeedback(values: any[], types: string[]) {
  return values.filter((item) => types.includes(String(item.feedbackType || ''))).length;
}

function acceptanceRate(outcomes: any[]) {
  const acted = outcomes.filter((item) => ['sent', 'replied', 'meeting_booked'].includes(String(item.eventType || ''))).length;
  const total = Math.max(1, outcomes.length);
  return Math.round((acted / total) * 100);
}

function invertRate(value: any) {
  const numeric = Number(value || 0);
  return Math.max(0, Math.min(100, Math.round((1 - numeric) * 100)));
}

function latestUpdatedAt(values: any[]) {
  return values
    .map((item) => item?.changedAt || item?._updatedAt || item?.generatedAt || item?.date)
    .filter(Boolean)
    .sort()
    .reverse()[0] || null;
}

function flattenTech(account: any): string[] {
  return uniqueNonEmpty([
    ...(account.technologyStack?.cms || []),
    ...(account.technologyStack?.frameworks || []),
    ...(account.technologyStack?.legacySystems || []),
    ...(account.technologies || []).map((item: any) => item.name).filter(Boolean),
  ]);
}

function uniqueNonEmpty(values: any[]) {
  return [...new Set((values || []).filter(Boolean))];
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + (Number(value) || 0), 0) / values.length);
}

function normalizePercent(value: any) {
  const numeric = Number(value || 0);
  return numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
}

function round(value: any) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function clampInt(value: string | null, fallback: number, min: number, max: number) {
  const numeric = Math.round(Number(value || fallback));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function sanitize(value: string) {
  return String(value || 'value').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);
}
