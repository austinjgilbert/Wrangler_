'use client';

import type { ComponentType, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { CommandPalette } from '@/components/command-palette';
import { GraphIntelligenceView } from '@/components/graph-intelligence-view';
import { IntelligenceMapView } from '@/components/intelligence-map-view';
import { OutcomeAnalyticsView } from '@/components/outcome-analytics-view';
import { PatternDiscoveryView } from '@/components/pattern-discovery-view';
import { TerritoryPortfolioView } from '@/components/territory-portfolio-view';
import { TimelineExplorerView } from '@/components/timeline-explorer-view';
import { WorkspaceView } from '@/components/workspace-view';
import {
  Activity,
  Beaker,
  Bolt,
  Brain,
  Building2,
  ChevronRight,
  Clock,
  Cog,
  Command,
  Gauge,
  Layers,
  LayoutDashboard,
  Loader2,
  Map,
  Microscope,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { getDiscoveredPatternsFromSnapshot } from '@/lib/pattern-discovery-data';
import { getStrategicMapSnapshotFromSnapshot } from '@/lib/intelligence-map-data';
import {
  explainCopilot,
  fetchAgentRegistry,
  fetchAccountDetail,
  fetchCopilotState,
  fetchFunctionRegistry,
  fetchSnapshot,
  runCommand,
  runCopilotAction,
  runDiagnostic,
  runSimulation,
  streamCopilotQuery,
} from '@/lib/api';
import type {
  AccountDetail,
  AgentDefinition,
  ConsoleSnapshot,
  CopilotQueryResult,
  CopilotState,
  FunctionDefinition,
  StrategySimulationResult,
} from '@/lib/types';

type SectionId =
  | 'overview'
  | 'workspace'
  | 'accounts'
  | 'people'
  | 'signals'
  | 'patterns'
  | 'pattern-discovery'
  | 'graph'
  | 'timeline'
  | 'actions'
  | 'research'
  | 'jobs'
  | 'metrics'
  | 'territory'
  | 'outcomes'
  | 'intelligence-map'
  | 'system-lab'
  | 'capabilities'
  | 'settings';

const SIDEBAR_ITEMS: Array<{ id: SectionId; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'workspace', label: 'Workspace', icon: LayoutDashboard },
  { id: 'accounts', label: 'Accounts', icon: Building2 },
  { id: 'people', label: 'People', icon: UserRound },
  { id: 'signals', label: 'Signals', icon: Radio },
  { id: 'patterns', label: 'Patterns', icon: Brain },
  { id: 'pattern-discovery', label: 'Pattern Discovery', icon: Sparkles },
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'timeline', label: 'Timeline', icon: Clock },
  { id: 'actions', label: 'Actions', icon: Bolt },
  { id: 'research', label: 'Research', icon: Microscope },
  { id: 'jobs', label: 'Jobs', icon: Settings },
  { id: 'metrics', label: 'Metrics', icon: Activity },
  { id: 'territory', label: 'Territory', icon: Layers },
  { id: 'outcomes', label: 'Outcomes', icon: TrendingUp },
  { id: 'intelligence-map', label: 'Intelligence Map', icon: Map },
  { id: 'system-lab', label: 'System Lab', icon: Beaker },
  { id: 'capabilities', label: 'Capabilities', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: Cog },
];

const COMMAND_SUGGESTIONS = [
  'scan nike.com',
  'queue research fleetfeet.com',
  'generate sdr actions',
  'run nightly jobs',
  'refresh stale entities',
  'recalculate scores',
  'run autopilot',
  'preview strategy',
];

const COMMAND_PALETTE_ITEMS = [
  { id: 'scan', label: 'scan nike.com', description: 'Scan a website', keywords: ['scan', 'website'] },
  { id: 'queue-research', label: 'queue research fleetfeet.com', description: 'Queue research for a domain', keywords: ['queue', 'research'] },
  { id: 'generate-actions', label: 'generate sdr actions', description: 'Generate SDR action queue', keywords: ['generate', 'sdr', 'actions'] },
  { id: 'nightly', label: 'run nightly jobs', description: 'Run nightly intelligence pipeline', keywords: ['run', 'nightly', 'jobs'] },
  { id: 'refresh', label: 'refresh stale entities', description: 'Refresh stale entities', keywords: ['refresh', 'stale'] },
  { id: 'recalculate', label: 'recalculate scores', description: 'Recalculate opportunity scores', keywords: ['recalculate', 'scores'] },
  { id: 'autopilot', label: 'run autopilot', description: 'Run autopilot cycle', keywords: ['run', 'autopilot'] },
  { id: 'preview', label: 'preview strategy', description: 'Preview strategy updates', keywords: ['preview', 'strategy'] },
];

export function OperatorConsole() {
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot | null>(null);
  const [selectedSection, setSelectedSection] = useState<SectionId>('overview');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountDetail, setAccountDetail] = useState<AccountDetail | null>(null);
  const [commandInput, setCommandInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [commandResult, setCommandResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simDomain, setSimDomain] = useState('example.com');
  const [simSignals, setSimSignals] = useState('pricing page visit, docs engagement, hiring signal');
  const [simulationResult, setSimulationResult] = useState<Record<string, unknown> | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(true);
  const [copilotState, setCopilotState] = useState<CopilotState | null>(null);
  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotMessages, setCopilotMessages] = useState<Array<{ id: string; role: 'assistant' | 'user'; text: string }>>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'I can explain why things matter, suggest next steps, and safely trigger system capabilities.',
    },
  ]);
  const [pendingConfirmation, setPendingConfirmation] = useState<{ command: string; message: string; source: 'command' | 'copilot' } | null>(null);
  const [copilotQueryResult, setCopilotQueryResult] = useState<CopilotQueryResult | null>(null);
  const [functionRegistry, setFunctionRegistry] = useState<FunctionDefinition[]>([]);
  const [agentRegistry, setAgentRegistry] = useState<AgentDefinition[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [flexScope, setFlexScope] = useState<'single-account' | 'person' | 'filtered-list' | 'saved-segment'>('single-account');
  const [flexRunMode, setFlexRunMode] = useState<'now' | 'queue' | 'nightly'>('queue');
  const [flexOutputMode, setFlexOutputMode] = useState<'update entities' | 'create report' | 'create actions' | 'preview'>('preview');
  const [flexSelectedFunctions, setFlexSelectedFunctions] = useState<string[]>([]);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [opportunityStages, setOpportunityStages] = useState<Record<string, 'new' | 'researching' | 'outreach' | 'won'>>({});
  const [activityLog, setActivityLog] = useState<Array<{ id: string; type: string; label: string; at: string }>>([]);
  const [strategySimulationResult, setStrategySimulationResult] = useState<StrategySimulationResult | null>(null);
  const selectedAccountRef = useRef<string | null>(null);

  const appendActivity = useCallback((type: string, label: string) => {
    setActivityLog((prev) => [{ id: `act-${Date.now()}`, type, label, at: new Date().toISOString() }, ...prev.slice(0, 99)]);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const latestAccountLoadRef = useRef(0);

  useEffect(() => {
    void loadSnapshot();
    void loadRegistries();
    const interval = window.setInterval(() => {
      void loadSnapshot(false);
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedAccountId) {
      setAccountDetail(null);
      return;
    }
    selectedAccountRef.current = selectedAccountId;
    setAccountDetail(null);
    void loadAccount(selectedAccountId);
  }, [selectedAccountId]);

  useEffect(() => {
    if (!snapshot) return;
    void loadCopilot();
  }, [snapshot, selectedSection, selectedAccountId, accountDetail?.account.id]);

  const filteredAccounts = useMemo(() => {
    const accounts = snapshot?.entities.accounts || [];
    if (!searchQuery.trim()) return accounts;
    const query = searchQuery.toLowerCase();
    return accounts.filter((account) =>
      account.name.toLowerCase().includes(query)
      || String(account.domain || '').toLowerCase().includes(query)
      || account.technologies.some((item) => item.toLowerCase().includes(query)),
    );
  }, [searchQuery, snapshot]);

  async function loadSnapshot(showLoader: boolean = true) {
    if (showLoader) setLoading(true);
    try {
      const next = await fetchSnapshot();
      setSnapshot(next);
      setError(null);
      if (!selectedAccountId && next.entities.accounts.length > 0) {
        setSelectedAccountId(next.entities.accounts[0].id);
      }
    } catch (nextError: any) {
      setError(nextError.message || 'Failed to load console snapshot.');
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function loadAccount(accountId: string) {
    const requestId = latestAccountLoadRef.current + 1;
    latestAccountLoadRef.current = requestId;
    try {
      const next = await fetchAccountDetail(accountId);
      if (latestAccountLoadRef.current === requestId && selectedAccountRef.current === accountId) {
        setAccountDetail(next);
      }
    } catch {
      if (latestAccountLoadRef.current === requestId && selectedAccountRef.current === accountId) {
        setAccountDetail(null);
      }
    }
  }

  async function loadCopilot() {
    try {
      const next = await fetchCopilotState({
        section: selectedSection,
        accountId: selectedAccountId,
        accountName: accountDetail?.account.name || null,
      });
      setCopilotState(next);
    } catch {
      setCopilotState(null);
    }
  }

  async function loadRegistries() {
    try {
      const [functions, agents] = await Promise.all([
        fetchFunctionRegistry(),
        fetchAgentRegistry(),
      ]);
      setFunctionRegistry(functions.functions);
      setAgentRegistry(agents.agents);
    } catch {
      setFunctionRegistry([]);
      setAgentRegistry([]);
    }
  }

  async function submitCommand(raw: string, confirmed: boolean = false) {
    const command = raw.trim();
    if (!command) return;
    if (!confirmed && requiresCommandConfirmation(command)) {
      setCopilotOpen(true);
      setPendingConfirmation({
        command,
        message: `Are you sure you want to run "${command}"?`,
        source: 'command',
      });
      return;
    }
    setBusy(true);
    setStatusMessage(`Running: ${command}`);
    try {
      const result = await runCommand(command);
      setCommandResult(result);
      setStatusMessage(`Completed: ${command}`);
      if (command.startsWith('scan ') || command.startsWith('queue research ')) {
        setSelectedSection('jobs');
      }
      if (command.includes('action')) {
        setSelectedSection('actions');
      }
      await loadSnapshot(false);
    } catch (nextError: any) {
      setStatusMessage(nextError.message || `Command failed: ${command}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitFeedback(actionCandidateId: string, feedbackType: string, operatorEdit?: string) {
    setBusy(true);
    try {
      const response = await fetch('/api/molt/feedback', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          actionCandidateId,
          feedbackType,
          operatorEdit,
          timestamp: new Date().toISOString(),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || 'Feedback failed');
      }
      setStatusMessage(`Feedback recorded: ${feedbackType}`);
      await loadSnapshot(false);
    } catch (nextError: any) {
      setStatusMessage(nextError.message || 'Feedback failed');
    } finally {
      setBusy(false);
    }
  }

  async function triggerDiagnostic(diagnosticId: string) {
    setBusy(true);
    try {
      const result = await runDiagnostic(diagnosticId);
      setCommandResult(result);
      setStatusMessage(`Diagnostic completed: ${diagnosticId}`);
      await loadSnapshot(false);
    } catch (nextError: any) {
      setStatusMessage(nextError.message || 'Diagnostic failed');
    } finally {
      setBusy(false);
    }
  }

  async function triggerSimulation(fixtureId?: string) {
    setBusy(true);
    try {
      const result = fixtureId
        ? await runSimulation({ fixtureId })
        : await runSimulation({
            domain: simDomain,
            signals: simSignals.split(',').map((item) => item.trim()).filter(Boolean),
          });
      setSimulationResult(result);
      setStatusMessage('Scenario simulation completed.');
      setSelectedSection('system-lab');
    } catch (nextError: any) {
      setStatusMessage(nextError.message || 'Simulation failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitCopilotPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setCopilotBusy(true);
    const assistantMessageId = `assistant-${Date.now()}`;
    setCopilotMessages((current) => [...current, {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
    }, {
      id: assistantMessageId,
      role: 'assistant',
      text: '',
    }]);
    try {
      await streamCopilotQuery(trimmed, {
        section: selectedSection,
        accountId: selectedAccountId,
        accountName: accountDetail?.account.name || null,
      }, {
        onChunk: (chunk) => {
          setCopilotMessages((current) => current.map((message) =>
            message.id === assistantMessageId
              ? { ...message, text: `${message.text}${chunk}` }
              : message,
          ));
        },
        onResult: async (result) => {
          setCopilotQueryResult(result);
          if (result.action?.command) {
            if (result.action.requiresConfirmation) {
              setPendingConfirmation({
                command: result.action.command,
                message: `Confirm action: ${result.action.command}`,
                source: 'copilot',
              });
            } else {
              await executeCopilotAction(result.action.command, false);
            }
          }
          setCopilotMessages((current) => current.map((message) =>
            message.id === assistantMessageId
              ? { ...message, text: result.response }
              : message,
          ));
        },
      });
    } catch (nextError: any) {
      setCopilotMessages((current) => current.map((message) =>
        message.id === assistantMessageId
          ? { ...message, text: nextError.message || 'Co-Pilot could not complete that request.' }
          : message,
      ));
    } finally {
      setCopilotBusy(false);
      setCopilotPrompt('');
    }
  }

  async function executeCopilotAction(command: string, confirmed: boolean) {
    setCopilotBusy(true);
    try {
      const result = await runCopilotAction(command, confirmed);
      if (result.requiresConfirmation) {
        setPendingConfirmation({
          command: String(result.command || command),
          message: String(result.confirmationMessage || `Confirm action: ${command}`),
          source: 'copilot',
        });
      } else {
        const shouldDelegateToCommand = result.ok === true && result.command === command;
        if (shouldDelegateToCommand) {
          await submitCommand(command);
        } else {
          setCommandResult(result);
          setStatusMessage(`Co-Pilot executed: ${command}`);
        }
        setPendingConfirmation(null);
        await loadSnapshot(false);
        await loadCopilot();
      }
    } catch (nextError: any) {
      setStatusMessage(nextError.message || 'Co-Pilot action failed');
    } finally {
      setCopilotBusy(false);
    }
  }

  async function requestCopilotExplanation(input: Record<string, unknown>) {
    setCopilotBusy(true);
    try {
      const result = await explainCopilot(input);
      setCommandResult(result);
      setCopilotMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: 'I added the explanation output to the panel state so you can inspect the underlying reasoning.',
      }]);
    } catch (nextError: any) {
      setStatusMessage(nextError.message || 'Co-Pilot explanation failed');
    } finally {
      setCopilotBusy(false);
    }
  }

  function openAccount(accountId: string | null) {
    if (!accountId) return;
    selectedAccountRef.current = accountId;
    setSelectedAccountId(accountId);
    setSelectedSection('accounts');
  }

  const sidebarBadges = useMemo(() => {
    if (!snapshot) return undefined;
    return {
      signals: snapshot.overview.intelligenceStatus.signalsToday,
      jobs: snapshot.jobs.running + snapshot.jobs.queued || undefined,
      actions: snapshot.actions.queue.totalActions || undefined,
      overview: snapshot.overview.intelligenceStatus.activeOpportunities || undefined,
    } as Partial<Record<SectionId, number | string>>;
  }, [snapshot]);

  const mainContent = (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 p-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="card min-w-0 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Operator Layer</div>
            <div className="mt-1 text-sm font-semibold text-[var(--text)]">Workspace Index</div>
          </div>
          {snapshot ? (
            <span className="badge-success">{snapshot.overview.intelligenceStatus.activeOpportunities} live</span>
          ) : null}
        </div>
        <div className="space-y-1">
          {filteredAccounts.slice(0, 12).map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => openAccount(account.id)}
              className={`card w-full rounded-lg border p-3 text-left transition first:border-t-0 ${
                selectedAccountId === account.id
                  ? 'border-[var(--accent)]/40 bg-[var(--accent-muted)]'
                  : 'border-transparent hover:bg-[var(--card-hover)]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--text)]">{account.name}</div>
                  <div className="truncate text-xs text-[var(--muted)]">{account.domain || 'No domain'}</div>
                </div>
                <div className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                  {account.opportunityScore}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted)]">
                <span>Completion {account.completion}%</span>
                <span>{account.technologies[0] || 'Needs enrichment'}</span>
              </div>
            </button>
          ))}
        </div>
        {filteredAccounts.length > 12 && (
          <button type="button" className="mt-2 text-xs text-[var(--muted)] hover:text-[var(--text)]">
            View all →
          </button>
        )}
        <div className="card mt-4 p-3">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">System Pulse</div>
          <div className="mt-3 space-y-2 text-sm">
            <QuickStat label="Signals today" value={snapshot?.overview.intelligenceStatus.signalsToday || 0} />
            <QuickStat label="Actions queued" value={snapshot?.actions.queue.totalActions || 0} />
            <QuickStat label="Jobs running" value={snapshot?.jobs.running || 0} />
            <QuickStat label="Drift risk" value={snapshot?.systemLab.engineStatus.driftRisk || 'LOW'} />
          </div>
        </div>
      </div>
      <div className="card min-w-0 p-4">
        {loading ? (
          <div className="flex h-full min-h-[400px] items-center justify-center text-[var(--muted)]">
            <Loader2 className="mr-3 h-5 w-5 animate-spin" />
            Loading Intelligence OS…
          </div>
        ) : error ? (
          <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-[var(--error)]">
            {error}
          </div>
        ) : snapshot ? (
          <Workspace
            snapshot={snapshot}
            section={selectedSection}
            accountDetail={accountDetail}
            selectedAccountId={selectedAccountId}
            selectedPersonId={selectedPersonId}
            setSelectedPersonId={setSelectedPersonId}
            onOpenAccount={openAccount}
            onCommand={submitCommand}
            onFeedback={submitFeedback}
            onDiagnostic={triggerDiagnostic}
            onRunSimulation={triggerSimulation}
            simulationResult={simulationResult}
            simDomain={simDomain}
            setSimDomain={setSimDomain}
            simSignals={simSignals}
            setSimSignals={setSimSignals}
            commandResult={commandResult}
            functionRegistry={functionRegistry}
            agentRegistry={agentRegistry}
            flexScope={flexScope}
            setFlexScope={setFlexScope}
            flexRunMode={flexRunMode}
            setFlexRunMode={setFlexRunMode}
            flexOutputMode={flexOutputMode}
            setFlexOutputMode={setFlexOutputMode}
            flexSelectedFunctions={flexSelectedFunctions}
            setFlexSelectedFunctions={setFlexSelectedFunctions}
            opportunityStages={opportunityStages}
            setOpportunityStages={setOpportunityStages}
            activityLog={activityLog}
            appendActivity={appendActivity}
            strategySimulationResult={strategySimulationResult}
            setStrategySimulationResult={setStrategySimulationResult}
            setSelectedSection={setSelectedSection}
          />
        ) : null}
      </div>
    </div>
  );

  const assistantContent = (
    <CopilotPanel
      copilotState={copilotState}
      busy={copilotBusy}
      prompt={copilotPrompt}
      setPrompt={setCopilotPrompt}
      onSubmitPrompt={submitCopilotPrompt}
      onAction={executeCopilotAction}
      onExplain={requestCopilotExplanation}
      onClose={() => setCopilotOpen(false)}
      selectedAccountId={selectedAccountId}
      selectedSection={selectedSection}
      simulationResult={simulationResult}
      messages={copilotMessages}
      pendingConfirmation={pendingConfirmation}
      onConfirm={async () => {
        if (!pendingConfirmation) return;
        if (pendingConfirmation.source === 'command') {
          await submitCommand(pendingConfirmation.command, true);
        } else {
          await executeCopilotAction(pendingConfirmation.command, true);
        }
        setPendingConfirmation(null);
      }}
      onCancelConfirmation={() => setPendingConfirmation(null)}
      commandResult={commandResult}
      queryResult={copilotQueryResult}
    />
  );

  return (
    <>
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        commands={COMMAND_PALETTE_ITEMS}
        onSelect={(cmd) => {
          setCommandPaletteOpen(false);
          void submitCommand(cmd);
        }}
        placeholder="Run a command (scan, enrich, generate actions…)"
      />
      <AppShell
        sidebarItems={SIDEBAR_ITEMS}
        activeSection={selectedSection}
        onSectionChange={(id) => setSelectedSection(id as SectionId)}
        sidebarBadges={sidebarBadges}
        main={mainContent}
        assistant={assistantContent}
        assistantOpen={copilotOpen}
        onAssistantToggle={() => setCopilotOpen((o) => !o)}
        onCommandBarSearch={() => setCommandPaletteOpen(true)}
        statusMessage={statusMessage ?? undefined}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onRefresh={loadSnapshot}
        isLoading={loading}
      />
    </>
  );
}

function Workspace(props: {
  snapshot: ConsoleSnapshot;
  section: SectionId;
  accountDetail: AccountDetail | null;
  selectedAccountId: string | null;
  selectedPersonId: string | null;
  setSelectedPersonId: (value: string | null) => void;
  onOpenAccount: (accountId: string | null) => void;
  onCommand: (command: string) => Promise<void>;
  onFeedback: (actionCandidateId: string, feedbackType: string, operatorEdit?: string) => Promise<void>;
  onDiagnostic: (diagnosticId: string) => Promise<void>;
  onRunSimulation: (fixtureId?: string) => Promise<void>;
  simulationResult: Record<string, unknown> | null;
  simDomain: string;
  setSimDomain: (value: string) => void;
  simSignals: string;
  setSimSignals: (value: string) => void;
  commandResult: Record<string, unknown> | null;
  functionRegistry: FunctionDefinition[];
  agentRegistry: AgentDefinition[];
  flexScope: 'single-account' | 'person' | 'filtered-list' | 'saved-segment';
  setFlexScope: (value: 'single-account' | 'person' | 'filtered-list' | 'saved-segment') => void;
  flexRunMode: 'now' | 'queue' | 'nightly';
  setFlexRunMode: (value: 'now' | 'queue' | 'nightly') => void;
  flexOutputMode: 'update entities' | 'create report' | 'create actions' | 'preview';
  setFlexOutputMode: (value: 'update entities' | 'create report' | 'create actions' | 'preview') => void;
  flexSelectedFunctions: string[];
  setFlexSelectedFunctions: (value: string[]) => void;
  opportunityStages?: Record<string, 'new' | 'researching' | 'outreach' | 'won'>;
  setOpportunityStages?: (value: Record<string, 'new' | 'researching' | 'outreach' | 'won'> | ((prev: Record<string, 'new' | 'researching' | 'outreach' | 'won'>) => Record<string, 'new' | 'researching' | 'outreach' | 'won'>)) => void;
  activityLog?: Array<{ id: string; type: string; label: string; at: string }>;
  appendActivity?: (type: string, label: string) => void;
  strategySimulationResult?: StrategySimulationResult | null;
  setStrategySimulationResult?: (value: StrategySimulationResult | null) => void;
  setSelectedSection?: (id: SectionId) => void;
}) {
  const onStrategySimulate = useCallback(
    (patternId: string, patternName: string) => {
      const result: StrategySimulationResult = {
        id: `sim-${Date.now()}`,
        type: 'pattern-promotion',
        name: patternName,
        runAt: new Date().toISOString(),
        accountsAffected: Math.floor(Math.random() * 20) + 5,
        newActionsEstimated: Math.floor(Math.random() * 15) + 2,
        scoreChangeSummary: 'Opportunity scores would increase for matched accounts; 2–3 new action candidates per account estimated.',
        risks: ['High-confidence accounts may get duplicate outreach if not deduplicated.'],
        recommended: true,
        details: { patternId },
      };
      props.setStrategySimulationResult?.(result);
      props.setSelectedSection?.('system-lab');
    },
    [props.setStrategySimulationResult, props.setSelectedSection]
  );

  switch (props.section) {
    case 'overview':
      return <OverviewView {...props} />;
    case 'workspace':
      return (
        <WorkspaceView
          snapshot={props.snapshot}
          onOpenAccount={props.onOpenAccount}
          onCommand={props.onCommand}
          opportunityStages={props.opportunityStages ?? {}}
          setOpportunityStages={props.setOpportunityStages ?? (() => {})}
          activityLog={props.activityLog ?? []}
          appendActivity={props.appendActivity ?? (() => {})}
        />
      );
    case 'accounts':
      return <AccountsView {...props} />;
    case 'people':
      return <PeopleView snapshot={props.snapshot} onOpenAccount={props.onOpenAccount} selectedPersonId={props.selectedPersonId} setSelectedPersonId={props.setSelectedPersonId} />;
    case 'signals':
      return <SignalsView snapshot={props.snapshot} onOpenAccount={props.onOpenAccount} />;
    case 'patterns':
      return <PatternsView snapshot={props.snapshot} />;
    case 'pattern-discovery':
      return (
        <PatternDiscoveryView
          snapshot={props.snapshot}
          onOpenAccount={props.onOpenAccount}
          onCommand={props.onCommand}
          onStrategySimulate={onStrategySimulate}
        />
      );
    case 'graph':
      return <GraphIntelligenceView snapshot={props.snapshot} onOpenAccount={props.onOpenAccount} onCommand={props.onCommand} />;
    case 'timeline':
      return <TimelineExplorerView snapshot={props.snapshot} onOpenAccount={props.onOpenAccount} onCommand={props.onCommand} />;
    case 'intelligence-map':
      return <IntelligenceMapView snapshot={props.snapshot} onOpenAccount={props.onOpenAccount} onCommand={props.onCommand} />;
    case 'actions':
      return <ActionsView snapshot={props.snapshot} onFeedback={props.onFeedback} onCommand={props.onCommand} />;
    case 'research':
      return <ResearchView snapshot={props.snapshot} accountDetail={props.accountDetail} />;
    case 'jobs':
      return <JobsView snapshot={props.snapshot} onCommand={props.onCommand} />;
    case 'metrics':
      return <MetricsView snapshot={props.snapshot} activityLog={props.activityLog} />;
    case 'territory':
      return <TerritoryPortfolioView snapshot={props.snapshot} onOpenAccount={props.onOpenAccount} onCommand={props.onCommand} />;
    case 'outcomes':
      return <OutcomeAnalyticsView snapshot={props.snapshot} onOpenAccount={props.onOpenAccount} />;
    case 'system-lab':
      return (
        <SystemLabView
          snapshot={props.snapshot}
          onCommand={props.onCommand}
          onDiagnostic={props.onDiagnostic}
          onRunSimulation={props.onRunSimulation}
          simulationResult={props.simulationResult}
          strategySimulationResult={props.strategySimulationResult ?? null}
          setStrategySimulationResult={props.setStrategySimulationResult ?? (() => {})}
          simDomain={props.simDomain}
          setSimDomain={props.setSimDomain}
          simSignals={props.simSignals}
          setSimSignals={props.setSimSignals}
          commandResult={props.commandResult}
        />
      );
    case 'capabilities':
      return (
        <CapabilitiesView
          functionRegistry={props.functionRegistry}
          agentRegistry={props.agentRegistry}
          onCommand={props.onCommand}
          flexScope={props.flexScope}
          setFlexScope={props.setFlexScope}
          flexRunMode={props.flexRunMode}
          setFlexRunMode={props.setFlexRunMode}
          flexOutputMode={props.flexOutputMode}
          setFlexOutputMode={props.setFlexOutputMode}
          flexSelectedFunctions={props.flexSelectedFunctions}
          setFlexSelectedFunctions={props.setFlexSelectedFunctions}
        />
      );
    case 'settings':
      return (
        <div className="space-y-4 p-4">
          <div className="text-sm font-medium uppercase tracking-wider text-[var(--muted)]">Settings</div>
          <p className="text-sm text-[var(--text-secondary)]">Operator and system settings. (Placeholder.)</p>
        </div>
      );
    default:
      return null;
  }
}

function OverviewView(props: {
  snapshot: ConsoleSnapshot;
  onOpenAccount: (accountId: string | null) => void;
  commandResult: Record<string, unknown> | null;
}) {
  const status = props.snapshot.overview.intelligenceStatus;
  const emergingPatterns = useMemo(() => getDiscoveredPatternsFromSnapshot(props.snapshot).slice(0, 3), [props.snapshot]);
  const mapSnapshot = useMemo(() => getStrategicMapSnapshotFromSnapshot(props.snapshot), [props.snapshot]);
  const hotZones = useMemo(
    () =>
      [...mapSnapshot.clusters]
        .sort(
          (a, b) =>
            b.strategicFitScore * b.signalDensity * (b.whitespaceScore + 0.1) -
            a.strategicFitScore * a.signalDensity * (a.whitespaceScore + 0.1)
        )
        .slice(0, 3),
    [mapSnapshot]
  );
  const watchlist = useMemo(
    () => [
      ...emergingPatterns.filter((p) => p.status === 'suggested' || p.noveltyScore > 0.5).slice(0, 2),
      ...hotZones.filter((c) => c.whitespaceScore > 0.5).slice(0, 1),
    ],
    [emergingPatterns, hotZones]
  );
  return (
    <div className="space-y-4">
      <Header
        eyebrow="Mission Control"
        title="Intelligence Status"
        description="Single-page operating surface for accounts, signals, actions, and system state."
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Accounts indexed" value={status.accountsIndexed} />
        <MetricCard label="People indexed" value={status.peopleIndexed} />
        <MetricCard label="Signals today" value={status.signalsToday} />
        <MetricCard label="Active opportunities" value={status.activeOpportunities} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Opportunity Radar" subtitle={`System completion ${status.systemCompletion}% • Drift risk ${status.driftRisk}`}>
          <div className="space-y-3">
            {props.snapshot.overview.opportunityRadar.map((item) => (
              <button
                key={item.actionCandidateId}
                type="button"
                onClick={() => props.onOpenAccount(item.accountId)}
                className="card w-full rounded-xl p-4 text-left transition hover:border-[var(--accent)]/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{item.accountName}</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      Signal: {item.signal} • Pattern: {item.pattern}
                    </div>
                  </div>
                  <Badge tone={item.draftReady ? 'success' : 'neutral'}>{item.confidence}%</Badge>
                </div>
                <div className="mt-3 text-sm text-[var(--text)]">{item.action}</div>
                <div className="mt-2 text-xs text-[var(--muted)]">{item.whyNow}</div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Signals Timeline" subtitle="Fast context for what changed most recently">
          <div className="space-y-3">
            {props.snapshot.overview.signalTimeline.slice(0, 10).map((signal) => (
              <div key={signal.id} className="rounded-2xl border border-[var(--border)] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{signal.accountName}</div>
                    <div className="text-xs text-[var(--muted)]">{signal.signalType}</div>
                  </div>
                  <div className="text-xs text-[var(--muted)]">{formatTime(signal.timestamp)}</div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                  <Badge tone={signal.uncertaintyState === 'likely' ? 'warning' : 'neutral'}>{signal.uncertaintyState}</Badge>
                  <span>{signal.source}</span>
                  <span>{signal.strength}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="Completion / Enrichment" subtitle="Lowest-completion accounts first">
          <div className="space-y-3">
            {props.snapshot.overview.completionRows.slice(0, 8).map((row) => (
              <button
                key={row.accountId}
                type="button"
                onClick={() => props.onOpenAccount(row.accountId)}
                className="flex w-full items-center justify-between rounded-2xl border border-[var(--border)] px-4 py-3 text-left"
              >
                <div>
                  <div className="text-sm font-medium">{row.accountName}</div>
                  <div className="text-xs text-[var(--muted)]">
                    Missing: {(row.missing || []).slice(0, 3).join(', ') || 'None'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{row.completion}%</div>
                  <div className="text-xs text-[var(--muted)]">{row.nextStages[0] || 'ready'}</div>
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Command Output" subtitle="Latest command or background result">
          <pre className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs text-[var(--muted)]">
            {JSON.stringify(props.commandResult || props.snapshot.systemLab.codeIntelligence, null, 2)}
          </pre>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Emerging patterns" subtitle="Top discovered patterns this period">
          <div className="space-y-2">
            {emergingPatterns.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No emerging patterns yet.</p>
            ) : (
              emergingPatterns.map((p) => (
                <div key={p.id} className="rounded-xl border border-[var(--border)] px-3 py-2">
                  <div className="text-sm font-medium text-[var(--foreground)]">{p.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>{p.supportCount} accounts</span>
                    <span>·</span>
                    <span>{p.confidence}% confidence</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
        <Panel title="Strategic hot zones" subtitle="Top clusters by fit × signal heat × whitespace">
          <div className="space-y-2">
            {hotZones.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No clusters yet.</p>
            ) : (
              hotZones.map((c) => (
                <div key={c.id} className="rounded-xl border border-[var(--border)] px-3 py-2">
                  <div className="text-sm font-medium text-[var(--foreground)]">{c.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>{c.accountIds.length} accounts</span>
                    <span>·</span>
                    <span>{(c.strategicFitScore * 100).toFixed(0)}% fit</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
        <Panel title="Watchlist" subtitle="Patterns and clusters worth monitoring">
          <div className="space-y-2">
            {watchlist.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Nothing on watchlist. Promote or discover patterns to see recommendations.</p>
            ) : (
              watchlist.map((item, i) => (
                <div key={'watch-' + i} className="rounded-xl border border-[var(--border)] px-3 py-2">
                  <div className="text-sm font-medium text-[var(--foreground)]">{item.name}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {'supportCount' in item ? `Pattern · ${item.supportCount} accounts` : `Cluster · ${item.accountIds.length} accounts`}
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Recent work" subtitle="Generated pages for jobs, research, and drafts">
        <div className="grid gap-3 sm:grid-cols-3">
          {props.snapshot.jobs.recent[0] ? (
            <a href={`/job/${encodeURIComponent(props.snapshot.jobs.recent[0].id)}`} className="card rounded-xl p-4 transition hover:border-[var(--accent)]/40">
              <div className="text-sm font-semibold text-[var(--text)]">Latest job</div>
              <div className="mt-1 truncate text-xs text-[var(--muted)]">{props.snapshot.jobs.recent[0].jobType}</div>
              <div className="mt-2 text-xs text-[var(--accent)]">View job →</div>
            </a>
          ) : null}
          {props.snapshot.research.briefs[0] ? (
            <a href={`/research/${encodeURIComponent(props.snapshot.research.briefs[0].id)}`} className="card rounded-xl p-4 transition hover:border-[var(--accent)]/40">
              <div className="text-sm font-semibold text-[var(--text)]">Latest brief</div>
              <div className="mt-1 truncate text-xs text-[var(--muted)]">{props.snapshot.research.briefs[0].date || props.snapshot.research.briefs[0].id}</div>
              <div className="mt-2 text-xs text-[var(--accent)]">View brief →</div>
            </a>
          ) : null}
          {props.snapshot.research.drafts[0] ? (
            <a href={`/draft/${encodeURIComponent(props.snapshot.research.drafts[0].id)}`} className="card rounded-xl p-4 transition hover:border-[var(--accent)]/40">
              <div className="text-sm font-semibold text-[var(--text)]">Latest draft</div>
              <div className="mt-1 truncate text-xs text-[var(--muted)]">{props.snapshot.research.drafts[0].subject || props.snapshot.research.drafts[0].id}</div>
              <div className="mt-2 text-xs text-[var(--accent)]">View draft →</div>
            </a>
          ) : null}
          {!props.snapshot.jobs.recent[0] && !props.snapshot.research.briefs[0] && !props.snapshot.research.drafts[0] && (
            <p className="text-sm text-[var(--muted)]">No recent jobs, briefs, or drafts yet. Run jobs or generate actions to see work here.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}

function AccountsView(props: {
  snapshot: ConsoleSnapshot;
  accountDetail: AccountDetail | null;
  selectedAccountId: string | null;
  onCommand: (command: string) => Promise<void>;
}) {
  const detail = props.accountDetail;
  const account = props.snapshot.entities.accounts.find((item) => item.id === props.selectedAccountId);
  return (
    <div className="space-y-4">
      <Header
        eyebrow="Account Explorer"
        title={detail?.account.name || account?.name || 'Select an account'}
        description={detail?.account.domain || 'Entity view, signals, patterns, actions, and research in one workspace.'}
      />

      {!detail ? (
        <EmptyState message="Select an account from the left rail to inspect its full workspace." />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Completion" value={`${detail.account.completion}%`} />
            <MetricCard label="Opportunity Score" value={detail.account.opportunityScore} />
            <MetricCard label="Signals" value={detail.signalsTimeline.length} />
            <MetricCard label="Actions" value={detail.actions.length} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Panel title="Tech Stack" subtitle="Validated technologies and likely stack clues">
              <div className="flex flex-wrap gap-2">
                {detail.account.technologies.map((item) => (
                  <Badge key={item}>{item}</Badge>
                ))}
              </div>
              <div className="mt-4 text-sm text-[var(--muted)]">{detail.account.description || 'No account description yet.'}</div>
            </Panel>

            <Panel title="Right-side Triggers" subtitle="Fast operator actions">
              <div className="grid gap-2 md:grid-cols-2">
                {detail.controls.map((control) => (
                  <button
                    key={control.id}
                    type="button"
                    onClick={() => void props.onCommand(control.label.toLowerCase())}
                    className="card rounded-xl px-4 py-3 text-left text-sm transition hover:border-[var(--accent)]/40"
                  >
                    {control.label}
                  </button>
                ))}
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Panel title="Signals Timeline" subtitle="This dramatically improves decision quality">
              <div className="space-y-3">
                {detail.signalsTimeline.map((signal) => (
                  <div key={signal.id} className="rounded-2xl border border-[var(--border)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{signal.signalType}</div>
                        <div className="text-xs text-[var(--muted)]">{signal.summary}</div>
                      </div>
                      <div className="text-right text-xs text-[var(--muted)]">
                        <div>{formatTime(signal.timestamp)}</div>
                        <div>{signal.strength}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Actions + Research" subtitle="Evidence-backed next moves">
              <div className="space-y-3">
                {detail.actions.map((action) => (
                  <div key={action.id} className="rounded-2xl border border-[var(--border)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{action.actionType}</div>
                        <div className="mt-1 text-xs text-[var(--muted)]">{action.whyNow}</div>
                      </div>
                      <Badge tone={action.confidence >= 70 ? 'success' : 'warning'}>{action.confidence}%</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge>{action.draftStatus}</Badge>
                      <Badge>{action.uncertaintyState}</Badge>
                      <Badge>{action.recommendedNextStep}</Badge>
                    </div>
                  </div>
                ))}
                {detail.research.briefs.map((brief) => (
                  <div key={brief.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                    <div className="text-sm font-semibold">{brief.title}</div>
                    <div className="mt-2 text-xs text-[var(--muted)]">{brief.summary || 'No brief summary yet.'}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function PeopleView(props: {
  snapshot: ConsoleSnapshot;
  onOpenAccount: (accountId: string | null) => void;
  selectedPersonId: string | null;
  setSelectedPersonId: (value: string | null) => void;
}) {
  const selectedPerson = props.snapshot.entities.people.find((person) => person.id === props.selectedPersonId) || props.snapshot.entities.people[0] || null;
  return (
    <div className="space-y-4">
      <Header eyebrow="People" title="Person Layer" description="Decision makers and likely entry points across active accounts." />
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="People Explorer" subtitle="Fast scan of likely buyers and champions">
          <div className="grid gap-3 md:grid-cols-2">
            {props.snapshot.entities.people.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => props.setSelectedPersonId(person.id)}
                className={`rounded-xl border px-4 py-3 text-left ${
                  selectedPerson?.id === person.id
                    ? 'border-[var(--accent)]/40 bg-[var(--accent-muted)]'
                    : 'border-[var(--border)] bg-[var(--surface)]'
                }`}
              >
                <div className="text-sm font-semibold">{person.name}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">{person.title || 'Unknown title'}</div>
                <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted)]">
                  <span>{person.accountName || 'No account'}</span>
                  <span>{person.seniority || 'unknown'}</span>
                </div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Person Detail" subtitle="Responsibilities, account context, and likely outreach angle">
          {selectedPerson ? (
            <div className="space-y-4">
              <div>
                <div className="text-lg font-semibold">{selectedPerson.name}</div>
                <div className="mt-1 text-sm text-[var(--muted)]">{selectedPerson.title || 'Unknown title'}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{selectedPerson.seniority || 'unknown'}</Badge>
                <Badge>{selectedPerson.accountName || 'No linked account'}</Badge>
                <Badge>{selectedPerson.title?.toLowerCase().includes('vp') ? 'likely decision maker' : 'potential influencer'}</Badge>
              </div>
              <div className="rounded-2xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
                Likely role: {inferPersonRole(selectedPerson.title)}. Recommended angle: {inferOutreachAngle(selectedPerson.title)}.
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <ActionButton label="Open account" onClick={() => props.onOpenAccount(selectedPerson.accountId)} />
                <ActionButton label="Draft outreach" onClick={() => props.onOpenAccount(selectedPerson.accountId)} />
                <ActionButton label="Validate title" onClick={() => props.setSelectedPersonId(selectedPerson.id)} />
                <ActionButton label="Show why they matter" onClick={() => props.onOpenAccount(selectedPerson.accountId)} />
              </div>
            </div>
          ) : (
            <EmptyState message="Select a person to inspect title confidence, account alignment, and outreach angle." />
          )}
        </Panel>
      </div>
    </div>
  );
}

function SignalsView(props: { snapshot: ConsoleSnapshot; onOpenAccount: (accountId: string | null) => void }) {
  return (
    <div className="space-y-4">
      <Header eyebrow="Signals" title="Signal Monitoring" description="Compressed stream of timing, intent, and evidence changes." />
      <Panel title="Recent Signals" subtitle="Website, docs, pricing, hiring, and operator notes">
        <div className="space-y-3">
          {props.snapshot.signals.recent.map((signal) => (
            <button
              key={signal.id}
              type="button"
              onClick={() => props.onOpenAccount(signal.accountId)}
              className="flex w-full items-center justify-between rounded-2xl border border-[var(--border)] px-4 py-3 text-left"
            >
              <div>
                <div className="text-sm font-semibold">{signal.accountName}</div>
                <div className="text-xs text-[var(--muted)]">{signal.signalType} • {signal.source}</div>
              </div>
              <div className="text-right">
                <div className="text-sm">{signal.strength}</div>
                <div className="text-xs text-[var(--muted)]">{signal.uncertaintyState}</div>
              </div>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function PatternsView(props: { snapshot: ConsoleSnapshot }) {
  return (
    <div className="space-y-4">
      <Header eyebrow="Pattern Engine" title="Active Patterns" description="Pattern visibility, confidence, lifecycle state, and recommended moves." />
      <div className="grid gap-3 md:grid-cols-2">
        {props.snapshot.patterns.active.map((pattern) => (
          <Panel key={pattern.id} title={pattern.type} subtitle={pattern.lifecycleState}>
            <div className="space-y-3 text-sm">
              <div className="text-[var(--muted)]">{pattern.summary || 'No summary available.'}</div>
              <div className="flex flex-wrap gap-2">
                <Badge>{pattern.matchFrequency} matches</Badge>
                <Badge>{Math.round(pattern.conversionAssociation * 100) / 100} conversion assoc.</Badge>
                <Badge>{pattern.owner || 'unowned'}</Badge>
              </div>
              <div className="space-y-2">
                {(pattern.recommendedMoves || []).slice(0, 3).map((move) => (
                  <div key={move} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
                    {move}
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function ActionsView(props: {
  snapshot: ConsoleSnapshot;
  onFeedback: (actionCandidateId: string, feedbackType: string, operatorEdit?: string) => Promise<void>;
  onCommand: (command: string) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <Header eyebrow="Execution Queue" title="Today’s Actions" description="The most important page: evidence-backed actions ready for SDR execution." />
      <div className="space-y-3">
        {props.snapshot.actions.queue.actions.map((action) => (
          <Panel key={action.actionCandidateId} title={`${action.rank}. ${action.account}`} subtitle={`${action.action} • ${action.pattern}`}>
            <div className="space-y-3">
              <div className="text-sm text-[var(--muted)]">{action.whyNow}</div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={action.confidence >= 75 ? 'success' : 'warning'}>{action.confidence}% confidence</Badge>
                <Badge>{action.person || 'No persona'}</Badge>
                <Badge tone={action.draftReady ? 'success' : 'neutral'}>{action.draftReady ? 'Draft ready' : 'Draft pending'}</Badge>
              </div>
              {(() => {
                const draft = props.snapshot.research.drafts.find((d) => d.actionCandidateId === action.actionCandidateId);
                return draft ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
                    <a href={`/draft/${encodeURIComponent(draft.id)}`} className="text-[var(--accent)] hover:underline">
                      View draft: {draft.subject || draft.id}
                    </a>
                    <div className="mt-1 text-xs text-[var(--muted)]">Status: {draft.status} · Updated {formatTime(draft.updatedAt)}</div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--muted)]">
                    {action.draftReady ? 'Draft ready — generate or open from Gmail workflow.' : 'Draft pending.'}
                  </div>
                );
              })()}
              <div className="flex flex-wrap gap-2">
                <ActionButton label="Send" onClick={() => props.onFeedback(action.actionCandidateId, 'sent_draft')} />
                <ActionButton label="Edit" onClick={() => props.onFeedback(action.actionCandidateId, 'edited_draft', 'Edited from operator console.')} />
                <ActionButton label="Skip" onClick={() => props.onFeedback(action.actionCandidateId, 'ignored_action')} />
                <ActionButton label="Mark incorrect" onClick={() => props.onFeedback(action.actionCandidateId, 'marked_incorrect')} />
                <ActionButton label="Explain" onClick={() => props.onCommand(`explain action ${action.actionCandidateId}`)} />
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function ResearchView(props: { snapshot: ConsoleSnapshot; accountDetail: AccountDetail | null }) {
  return (
    <div className="space-y-4">
      <Header eyebrow="Research Console" title="Research Output" description="Scans, crawls, intelligence synthesis, evidence packs, and generated briefs." />
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Latest Briefings" subtitle="Operator-ready generated intelligence">
          <div className="space-y-3">
            {props.snapshot.research.briefs.map((brief) => (
              <a key={brief.id} href={`/research/${encodeURIComponent(brief.id)}`} className="block rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--accent)]/40">
                <div className="text-sm font-semibold text-[var(--text)]">{brief.date || brief.id}</div>
                <div className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-[var(--muted)] line-clamp-3">
                  {brief.summaryMarkdown}
                </div>
                <span className="mt-2 inline-block text-xs text-[var(--accent)]">View full brief →</span>
              </a>
            ))}
          </div>
        </Panel>
        <Panel title="Drafts" subtitle="Outreach drafts linked to actions">
          <div className="space-y-2">
            {props.snapshot.research.drafts.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No drafts yet.</p>
            ) : (
              props.snapshot.research.drafts.slice(0, 15).map((draft) => (
                <a key={draft.id} href={`/draft/${encodeURIComponent(draft.id)}`} className="card-list-item flex items-center justify-between rounded-lg px-3 py-2 transition hover:bg-[var(--surface-muted)]">
                  <span className="truncate text-sm font-medium text-[var(--text)]">{draft.subject || draft.id}</span>
                  <Badge>{draft.status}</Badge>
                </a>
              ))
            )}
            {props.snapshot.research.drafts.length > 15 && (
              <a href="/" className="text-xs text-[var(--muted)] hover:text-[var(--text)]">View all →</a>
            )}
          </div>
        </Panel>
        <Panel title="Account Research" subtitle="Evidence packs and briefs for the selected account">
          {props.accountDetail ? (
            <div className="space-y-3">
              {props.accountDetail.research.evidence.map((evidence) => (
                <div key={evidence.id} className="rounded-2xl border border-[var(--border)] px-4 py-3">
                  <div className="text-sm font-semibold">{evidence.summary}</div>
                  <div className="mt-2 flex gap-2 text-xs text-[var(--muted)]">
                    <Badge>{evidence.uncertaintyState}</Badge>
                    <span>{formatTime(evidence.observedAt)}</span>
                  </div>
                </div>
              ))}
              {props.accountDetail.research.briefs.map((brief) => (
                <a key={brief.id} href={`/research/${encodeURIComponent(brief.id)}`} className="block rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--accent)]/40">
                  <div className="text-sm font-semibold text-[var(--text)]">{brief.title}</div>
                  <div className="mt-2 line-clamp-2 text-xs text-[var(--muted)]">{brief.summary}</div>
                  <span className="mt-2 inline-block text-xs text-[var(--accent)]">View →</span>
                </a>
              ))}
            </div>
          ) : (
            <EmptyState message="Select an account to load its evidence packs and research briefs." />
          )}
        </Panel>
      </div>
    </div>
  );
}

function JobsView(props: { snapshot: ConsoleSnapshot; onCommand: (command: string) => Promise<void> }) {
  return (
    <div className="space-y-4">
      <Header eyebrow="Job Control Center" title="Jobs" description="Queue visibility, stale refresh, maintenance triggers, and recent failures." />
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Running" value={props.snapshot.jobs.running} />
        <MetricCard label="Queued" value={props.snapshot.jobs.queued} />
        <MetricCard label="Enrich queued" value={props.snapshot.jobs.enrichQueued} />
      </div>
      <Panel title="Batch Controls" subtitle="One-click job orchestration">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {['queue research fleetfeet.com', 'refresh stale entities', 'recalculate scores', 'run nightly jobs', 'generate sdr actions', 'run autopilot'].map((command) => (
            <ActionButton key={command} label={command} onClick={() => props.onCommand(command)} />
          ))}
        </div>
      </Panel>
      <Panel title="Recent Jobs" subtitle="Priority, retries, and failure visibility">
        <div className="space-y-2">
          {props.snapshot.jobs.recent.map((job) => (
            <a key={job.id} href={`/job/${encodeURIComponent(job.id)}`} className="grid grid-cols-[1.4fr_0.7fr_0.5fr] gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm transition hover:border-[var(--accent)]/40">
              <div className="min-w-0">
                <div className="truncate font-semibold text-[var(--text)]">{job.jobType}</div>
                <div className="truncate text-xs text-[var(--muted)]">{job.id}</div>
              </div>
              <div className="text-xs text-[var(--muted)]">
                <div>Status: {job.status}</div>
                <div>Priority: {job.priority}</div>
                <div>Attempts: {job.attempts}</div>
              </div>
              <div className="text-right text-xs text-[var(--muted)]">
                {job.error ? <div className="text-[var(--danger)]">{job.error}</div> : <div>{formatTime(job.updatedAt)}</div>}
              </div>
            </a>
          ))}
        </div>
        {props.snapshot.jobs.recent.length > 0 && (
          <p className="mt-2 text-xs text-[var(--muted)]">Click a job to open its detail page.</p>
        )}
      </Panel>
    </div>
  );
}

function MetricsView(props: {
  snapshot: ConsoleSnapshot;
  activityLog?: Array<{ id: string; type: string; label: string; at: string }>;
}) {
  const snap = props.snapshot;
  const activityLog = props.activityLog ?? [];
  return (
    <div className="space-y-4">
      <Header eyebrow="Drift Monitoring" title="Metrics" description="Confidence calibration, operator productivity, and reliability trends." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {snap.metrics.drift.map((metric) => (
          <MetricCard key={metric.metricType} label={metric.label} value={metric.value} tone={metric.severity === 'high' ? 'danger' : metric.severity === 'medium' ? 'warning' : 'neutral'} />
        ))}
      </div>
      <Panel title="Operator productivity" subtitle="Actions, research runs, opportunities progressed, drafts">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard label="Actions in queue" value={snap.actions.queue.totalActions} />
          <MetricCard label="Research drafts" value={snap.research.drafts.length} />
          <MetricCard label="Active opportunities" value={snap.overview.intelligenceStatus.activeOpportunities} />
          <MetricCard label="Jobs running" value={snap.jobs.running} tone={snap.jobs.running > 0 ? 'warning' : 'neutral'} />
          <MetricCard label="Signals today" value={snap.overview.intelligenceStatus.signalsToday} />
        </div>
      </Panel>
      <Panel title="Operator activity" subtitle="Recent operator actions in this session">
        {activityLog.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No activity recorded yet. Use Workspace or run commands to see activity.</p>
        ) : (
          <ul className="space-y-2">
            {activityLog.slice(0, 15).map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <span className="shrink-0 text-xs text-[var(--muted)]">{new Date(a.at).toLocaleTimeString()}</span>
                <span className="text-[var(--text)]">{a.label}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Drift detail" subtitle="The anti-drift contract, rendered as live metrics">
        <pre className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs text-[var(--muted)]">
          {JSON.stringify(snap.metrics.drift, null, 2)}
        </pre>
      </Panel>
    </div>
  );
}

function SystemLabView(props: {
  snapshot: ConsoleSnapshot;
  onCommand: (command: string) => Promise<void>;
  onDiagnostic: (diagnosticId: string) => Promise<void>;
  onRunSimulation: (fixtureId?: string) => Promise<void>;
  simulationResult: Record<string, unknown> | null;
  strategySimulationResult: StrategySimulationResult | null;
  setStrategySimulationResult: (value: StrategySimulationResult | null) => void;
  simDomain: string;
  setSimDomain: (value: string) => void;
  simSignals: string;
  setSimSignals: (value: string) => void;
  commandResult: Record<string, unknown> | null;
}) {
  const lab = props.snapshot.systemLab;
  const strat = props.strategySimulationResult;
  return (
    <div className="space-y-4">
      <Header eyebrow="System Layer" title="System Lab" description="Developer console + intelligence control panel for the platform." />

      {strat && (
        <Panel title="Strategy simulation" subtitle="Impact of promoting a pattern or changing strategy (run from Pattern Discovery → Simulate)">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--foreground)]">{strat.name}</div>
                <div className="text-xs text-[var(--muted)]">{strat.type} · Run at {new Date(strat.runAt).toLocaleString()}</div>
              </div>
              <button type="button" onClick={() => props.setStrategySimulationResult(null)} className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--card)]">
                Dismiss
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Accounts affected</div>
              <div className="font-medium">{strat.accountsAffected}</div>
              <div>New actions (est.)</div>
              <div className="font-medium">{strat.newActionsEstimated}</div>
              <div>Recommended</div>
              <div><Badge tone={strat.recommended ? 'success' : 'warning'}>{strat.recommended ? 'Yes' : 'Review'}</Badge></div>
            </div>
            <p className="text-sm text-[var(--muted)]">{strat.scoreChangeSummary}</p>
            {strat.risks.length > 0 && (
              <div>
                <div className="text-xs font-medium text-[var(--muted)]">Risks</div>
                <ul className="mt-1 list-inside list-disc text-sm text-[var(--muted)]">
                  {strat.risks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              <ActionButton label="Apply (promote pattern)" onClick={() => props.onCommand('promote-pattern')} />
              <ActionButton label="Run again" onClick={() => props.setStrategySimulationResult(null)} />
            </div>
          </div>
        </Panel>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Signals processed today" value={lab.engineStatus.signalsProcessedToday} />
        <MetricCard label="Patterns active" value={lab.engineStatus.patternsActive} />
        <MetricCard label="Drafts generated" value={lab.engineStatus.draftsGenerated} />
        <MetricCard label="Drift risk" value={lab.engineStatus.driftRisk} tone={lab.engineStatus.driftRisk === 'HIGH' ? 'danger' : lab.engineStatus.driftRisk === 'MEDIUM' ? 'warning' : 'success'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <Panel title="Capabilities" subtitle="What the engine can actually do">
          <div className="grid gap-2 md:grid-cols-2">
            {lab.capabilities.map((capability) => (
              <div key={capability.id} className="flex items-center justify-between rounded-2xl border border-[var(--border)] px-4 py-3 text-sm">
                <span>{capability.label}</span>
                <Badge tone={capability.enabled ? 'success' : 'danger'}>{capability.enabled ? 'enabled' : 'off'}</Badge>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Batch Operations" subtitle="Large-scale system actions with risk visibility">
          <div className="space-y-3">
            {lab.batchOperations.map((operation) => (
              <div key={operation.id} className="rounded-2xl border border-[var(--border)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{operation.label}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {operation.estimatedAccountsAffected} accounts • {operation.estimatedRuntime} • risk {operation.riskLevel}
                    </div>
                  </div>
                  <ActionButton label="Start" onClick={() => props.onCommand(mapBatchOperation(operation.id))} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="Learning Mode" subtitle="Safe learning guardrails and recent events">
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard label="Feedback captured" value={lab.learningMode.operatorFeedbackCaptured} />
            <MetricCard label="Signal weights updated" value={lab.learningMode.signalWeightsUpdated} />
            <MetricCard label="Patterns strengthened" value={lab.learningMode.patternsStrengthened} />
            <MetricCard label="Patterns weakened" value={lab.learningMode.patternsWeakened} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={lab.learningMode.enabled ? 'success' : 'danger'}>{lab.learningMode.enabled ? 'Learning enabled' : 'Learning off'}</Badge>
            <Badge tone={lab.learningMode.safeLearningGuardrails ? 'success' : 'warning'}>
              {lab.learningMode.safeLearningGuardrails ? 'Safe guardrails enabled' : 'Guardrails disabled'}
            </Badge>
          </div>
          <div className="mt-4 space-y-2">
            {lab.learningMode.recentEvents.map((event) => (
              <div key={event.id} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
                {event.type} • {formatTime(event.timestamp)} • {event.actionCandidateId}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Pattern Engine" subtitle="Pattern visibility, controls, and simulation">
          <div className="space-y-3">
            {lab.patternEngine.map((pattern) => (
              <div key={pattern.id} className="rounded-2xl border border-[var(--border)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{pattern.name}</div>
                    <div className="text-xs text-[var(--muted)]">
                      Matches {pattern.matches} • Success {pattern.successRate}% • Confidence {pattern.confidence}%
                    </div>
                  </div>
                  <Badge>{pattern.lifecycleState}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton label="View pattern" onClick={() => props.onCommand('preview strategy')} />
                  <ActionButton label="Edit pattern" onClick={() => props.onCommand('preview strategy')} />
                  <ActionButton label="Disable pattern" onClick={() => props.onCommand('queue anti drift maintenance')} />
                  <ActionButton label="Simulate pattern" onClick={() => props.onRunSimulation()} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Policy Management" subtitle="Versioned system policy surfaces">
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(lab.policyManagement).map(([key, policy]) => (
              <div key={key} className="rounded-2xl border border-[var(--border)] px-4 py-3">
                <div className="text-sm font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1')}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">{policy?.versionId || 'No version'}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton label="Preview changes" onClick={() => props.onCommand('preview strategy')} />
                  <ActionButton label="Run impact simulation" onClick={() => props.onRunSimulation()} />
                  <ActionButton label="Apply update" onClick={() => props.onCommand('generate sdr actions')} />
                  <ActionButton label="Rollback version" onClick={() => props.onCommand('preview strategy')} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Scenario Simulator" subtitle="Fixture simulations and ad hoc scenario testing">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <label className="block text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                Domain
                <input
                  value={props.simDomain}
                  onChange={(event) => props.setSimDomain(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="block text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                Signals
                <textarea
                  value={props.simSignals}
                  onChange={(event) => props.setSimSignals(event.target.value)}
                  rows={5}
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none"
                />
              </label>
              <ActionButton label="Run Simulation" onClick={() => props.onRunSimulation()} />
            </div>
            <div className="space-y-3">
              {lab.scenarioSimulator.fixtures.slice(0, 6).map((fixture) => (
                <button
                  key={fixture.id}
                  type="button"
                  onClick={() => props.onRunSimulation(fixture.id)}
                  className="w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-left"
                >
                  <div className="text-sm font-semibold">{fixture.name}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{fixture.description}</div>
                </button>
              ))}
            </div>
          </div>
          <pre className="mt-4 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs text-[var(--muted)]">
            {JSON.stringify(props.simulationResult || lab.scenarioSimulator.suiteSummary, null, 2)}
          </pre>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Code Intelligence" subtitle="What the codebase actively supports">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Active modules</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {lab.codeIntelligence.activeModules.map((module) => (
                  <Badge key={module}>{module}</Badge>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Services</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {lab.codeIntelligence.activeServices.map((service) => (
                  <Badge key={service}>{service}</Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton label="Reload system modules" onClick={() => props.onCommand('generate sdr actions')} />
            <ActionButton label="Run system diagnostics" onClick={() => props.onDiagnostic('test_opportunity_engine')} />
            <ActionButton label="View architecture map" onClick={() => props.onCommand('preview strategy')} />
          </div>
        </Panel>

        <Panel title="Drift Monitoring + Diagnostics" subtitle="Keep the engine explainable and non-generic">
          <div className="grid gap-3 md:grid-cols-2">
            {lab.driftMonitoring.map((metric) => (
              <div key={metric.metricType} className="rounded-2xl border border-[var(--border)] px-4 py-3">
                <div className="text-sm font-semibold">{metric.label}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">{metric.metricType}</div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-2xl font-semibold">{metric.value}</div>
                  <Badge tone={metric.severity === 'high' ? 'danger' : metric.severity === 'medium' ? 'warning' : 'success'}>
                    {metric.severity}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {lab.diagnostics.map((diagnostic) => (
              <ActionButton key={diagnostic.id} label={diagnostic.label} onClick={() => props.onDiagnostic(diagnostic.id)} />
            ))}
          </div>
          <pre className="mt-4 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs text-[var(--muted)]">
            {JSON.stringify(props.commandResult || lab.codeIntelligence, null, 2)}
          </pre>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="Autopilot" subtitle="Continuous autonomous validation, bounded repairs, and confidence learning">
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard label="Flows healthy" value={lab.autopilot.runtimeHealth.flowsHealthy} tone="success" />
            <MetricCard label="Flows degraded" value={lab.autopilot.runtimeHealth.flowsDegraded} tone={lab.autopilot.runtimeHealth.flowsDegraded > 0 ? 'warning' : 'neutral'} />
            <MetricCard label="Flows quarantined" value={lab.autopilot.runtimeHealth.flowsQuarantined} tone={lab.autopilot.runtimeHealth.flowsQuarantined > 0 ? 'danger' : 'neutral'} />
            <MetricCard label="Open incidents" value={lab.autopilot.runtimeHealth.openIncidents} tone={lab.autopilot.runtimeHealth.openIncidents > 0 ? 'warning' : 'neutral'} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton label="Run Autopilot" onClick={() => props.onCommand('run autopilot')} />
            <ActionButton label="Test Autopilot" onClick={() => props.onDiagnostic('test_autopilot')} />
          </div>
          <div className="mt-4 text-xs text-[var(--muted)]">
            Weakest areas: {lab.autopilot.runtimeHealth.weakestAreas.join(', ') || 'None currently detected'}
          </div>
        </Panel>

        <Panel title="Scenario Confidence" subtitle="Critical, reliability, stress, and chaos scenario health">
          <div className="space-y-3">
            {[...lab.autopilot.scenarioConfidence.top, ...lab.autopilot.scenarioConfidence.weakest].slice(0, 8).map((scenario) => (
              <div key={`${scenario.scenarioId}-${scenario.generatedAt}`} className="rounded-2xl border border-[var(--border)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{scenario.scenarioId}</div>
                    <div className="text-xs text-[var(--muted)]">{scenario.scenarioClass} • {formatTime(scenario.generatedAt)}</div>
                  </div>
                  <Badge tone={scenario.overallConfidence >= 80 ? 'success' : scenario.overallConfidence >= 60 ? 'warning' : 'danger'}>
                    {scenario.overallConfidence}%
                  </Badge>
                </div>
                {scenario.issues.length > 0 ? (
                  <div className="mt-2 text-xs text-[var(--muted)]">{scenario.issues.join(', ')}</div>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
        <Panel title="Repair Activity" subtitle="What was attempted and what actually worked">
          <div className="grid gap-3">
            <MetricCard label="Repairs attempted" value={lab.autopilot.repairActivity.attempted} />
            <MetricCard label="Repairs succeeded" value={lab.autopilot.repairActivity.succeeded} tone="success" />
            <MetricCard label="Approvals needed" value={lab.autopilot.repairActivity.approvalsNeeded} tone="warning" />
          </div>
          <div className="mt-4 space-y-2">
            {lab.autopilot.repairActivity.recent.map((attempt) => (
              <div key={attempt.attemptId} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
                {attempt.strategy} • {attempt.outcome} • {formatTime(attempt.completedAt)}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Best Path Learning" subtitle="Workflow paths the system currently trusts most">
          <div className="space-y-3">
            {lab.autopilot.bestPathLearning.map((path) => (
              <div key={path.scenarioId} className="rounded-2xl border border-[var(--border)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{path.scenarioId}</div>
                  <Badge tone={path.confidenceScore >= 80 ? 'success' : path.confidenceScore >= 60 ? 'warning' : 'danger'}>
                    {path.confidenceScore}%
                  </Badge>
                </div>
                <div className="mt-2 text-xs text-[var(--muted)]">{path.steps.join(' → ')}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Autonomy Policy" subtitle="Boundaries for detect, repair, and escalate behavior">
          {lab.autopilot.autonomyPolicy ? (
            <div className="space-y-3 text-xs text-[var(--muted)]">
              <div>Policy: {lab.autopilot.autonomyPolicy.policyId} • v{lab.autopilot.autonomyPolicy.version}</div>
              <div>Allowed repairs: {lab.autopilot.autonomyPolicy.allowedRepairs.join(', ')}</div>
              <div>Approval required: {lab.autopilot.autonomyPolicy.approvalRequiredActions.join(', ')}</div>
              <div>Monitor only: {lab.autopilot.autonomyPolicy.monitorOnlyActions.join(', ')}</div>
              <div>Updated: {formatTime(lab.autopilot.autonomyPolicy.updatedAt)}</div>
            </div>
          ) : (
            <EmptyState message="No autonomy policy stored yet." />
          )}
          {lab.autopilot.quarantinedFlows.length > 0 ? (
            <div className="mt-4 space-y-2">
              {lab.autopilot.quarantinedFlows.map((flow) => (
                <div key={flow.incidentId} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--danger)]">
                  {flow.category}: {flow.summary}
                </div>
              ))}
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

function CapabilitiesView(props: {
  functionRegistry: FunctionDefinition[];
  agentRegistry: AgentDefinition[];
  onCommand: (command: string) => Promise<void>;
  flexScope: 'single-account' | 'person' | 'filtered-list' | 'saved-segment';
  setFlexScope: (value: 'single-account' | 'person' | 'filtered-list' | 'saved-segment') => void;
  flexRunMode: 'now' | 'queue' | 'nightly';
  setFlexRunMode: (value: 'now' | 'queue' | 'nightly') => void;
  flexOutputMode: 'update entities' | 'create report' | 'create actions' | 'preview';
  setFlexOutputMode: (value: 'update entities' | 'create report' | 'create actions' | 'preview') => void;
  flexSelectedFunctions: string[];
  setFlexSelectedFunctions: (value: string[]) => void;
}) {
  const groupedFunctions = props.functionRegistry.reduce<Record<string, FunctionDefinition[]>>((acc, item) => {
    acc[item.category] = acc[item.category] || [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Header eyebrow="Capabilities" title="Function + Agent Registry" description="Human-readable catalog of what the system can do, where to use it, and how to run it." />

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Function Registry" subtitle="Grouped, operator-facing capability surface">
          <div className="space-y-4">
            {Object.entries(groupedFunctions).map(([category, items]) => (
              <div key={category} className="space-y-3">
                <div className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">{category}</div>
                {items.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[var(--border)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{item.name}</div>
                        <div className="mt-1 text-xs text-[var(--muted)]">{item.description}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge>{item.entityScope}</Badge>
                        <Badge>{item.outputType}</Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge>{item.canBatch ? 'batch' : 'single'}</Badge>
                      <Badge>{item.requiresConfirmation ? 'confirm' : 'direct'}</Badge>
                      <Badge>{item.explainabilitySupported ? 'explainable' : 'opaque'}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionButton label="Run" onClick={() => props.onCommand((item.actionCommand || item.name).replace('{domain}', 'fleetfeet.com'))} />
                      <ActionButton
                        label={props.flexSelectedFunctions.includes(item.id) ? 'Added to Flex Mode' : 'Add to Flex Mode'}
                        onClick={() => props.setFlexSelectedFunctions(
                          props.flexSelectedFunctions.includes(item.id)
                            ? props.flexSelectedFunctions.filter((value) => value !== item.id)
                            : [...props.flexSelectedFunctions, item.id],
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Agent Registry" subtitle="Named workflows that package multiple functions into reusable operator tools">
          <div className="space-y-3">
            {props.agentRegistry.map((agent) => (
              <div key={agent.id} className="rounded-2xl border border-[var(--border)] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{agent.name}</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">{agent.purpose}</div>
                  </div>
                  <Badge tone={agent.currentStatus === 'ready' ? 'success' : agent.currentStatus === 'experimental' ? 'warning' : 'neutral'}>
                    {agent.currentStatus}
                  </Badge>
                </div>
                <div className="mt-3 text-xs text-[var(--muted)]">
                  {agent.workflowSteps.join(' → ')}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge>{agent.estimatedRuntime}</Badge>
                  <Badge>{agent.mutationScope}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton label="Run" onClick={() => props.onCommand(agent.runCommand.replace('{domain}', 'fleetfeet.com'))} />
                  <ActionButton label="Explain" onClick={() => props.onCommand('preview strategy')} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Flex Mode" subtitle="Chain multiple functions without coding">
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            <SelectGroup
              label="Scope"
              value={props.flexScope}
              options={['single-account', 'person', 'filtered-list', 'saved-segment']}
              onChange={(value) => props.setFlexScope(value as 'single-account' | 'person' | 'filtered-list' | 'saved-segment')}
            />
            <SelectGroup
              label="Output"
              value={props.flexOutputMode}
              options={['update entities', 'create report', 'create actions', 'preview']}
              onChange={(value) => props.setFlexOutputMode(value as 'update entities' | 'create report' | 'create actions' | 'preview')}
            />
            <SelectGroup
              label="Run Mode"
              value={props.flexRunMode}
              options={['now', 'queue', 'nightly']}
              onChange={(value) => props.setFlexRunMode(value as 'now' | 'queue' | 'nightly')}
            />
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold">Selected Function Chain</div>
              <div className="mt-3 space-y-2">
                {props.flexSelectedFunctions.length > 0 ? props.flexSelectedFunctions.map((id, index) => {
                  const definition = props.functionRegistry.find((item) => item.id === id);
                  return (
                    <div key={id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
                      <span className="text-[var(--muted)]">{index + 1}</span>
                      <span>{definition?.name || id}</span>
                    </div>
                  );
                }) : <div className="text-sm text-[var(--muted)]">Add functions from the registry to build a workflow.</div>}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              <div className="text-sm font-semibold">Workflow Preview</div>
              <div className="mt-2 text-xs text-[var(--muted)]">
                Scope: {props.flexScope} • Output: {props.flexOutputMode} • Run mode: {props.flexRunMode}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton label="Run workflow" onClick={() => props.onCommand(resolveFlexCommand(props.flexSelectedFunctions, props.functionRegistry))} />
                <ActionButton label="Clear" onClick={() => props.setFlexSelectedFunctions([])} />
              </div>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Header(props: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="flex flex-col gap-2 border-b border-[var(--border)] pb-4">
      <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">{props.eyebrow}</div>
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">{props.title}</h1>
        <ChevronRight className="h-4 w-4 text-[var(--muted)]" />
      </div>
      <p className="max-w-3xl text-sm text-[var(--muted)]">{props.description}</p>
    </div>
  );
}

function Panel(props: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="card rounded-[var(--card-radius)] p-4">
      <div className="mb-4">
        <div className="text-base font-semibold text-[var(--text)]">{props.title}</div>
        {props.subtitle ? <div className="mt-1 text-sm text-[var(--muted)]">{props.subtitle}</div> : null}
      </div>
      {props.children}
    </section>
  );
}

function MetricCard(props: { label: string; value: string | number; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const toneClass = props.tone === 'success'
    ? 'text-[var(--success)]'
    : props.tone === 'warning'
      ? 'text-[var(--warning)]'
      : props.tone === 'danger'
        ? 'text-[var(--danger)]'
        : 'text-[var(--text)]';
  return (
    <div className="card rounded-[var(--card-radius)] p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">{props.label}</div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{props.value}</div>
    </div>
  );
}

function Badge(props: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const toneClass = props.tone === 'success'
    ? 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success)]/20'
    : props.tone === 'warning'
      ? 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning)]/20'
      : props.tone === 'danger'
        ? 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger)]/20'
        : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)]';
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>{props.children}</span>;
}

function ActionButton(props: { label: string; onClick: () => void | Promise<void> }) {
  return (
    <button
      type="button"
      onClick={() => void props.onClick()}
      className="pill text-xs font-medium"
    >
      {props.label}
    </button>
  );
}

function QuickStat(props: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--muted)]">{props.label}</span>
      <span className="font-mono text-xs text-[var(--text)]">{props.value}</span>
    </div>
  );
}

function EmptyState(props: { message: string }) {
  return (
    <div className="flex min-h-[300px] items-center justify-center rounded-[var(--card-radius)] border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
      {props.message}
    </div>
  );
}

function SelectGroup(props: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-[0.24em] text-[var(--muted)]">{props.label}</div>
      <div className="flex flex-wrap gap-2">
        {props.options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => props.onChange(option)}
            className={`pill ${props.value === option ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent-strong)]' : ''}`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function CopilotPanel(props: {
  copilotState: CopilotState | null;
  busy: boolean;
  prompt: string;
  setPrompt: (value: string) => void;
  onSubmitPrompt: (prompt: string) => Promise<void>;
  onAction: (command: string, confirmed: boolean) => Promise<void>;
  onExplain: (input: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  selectedAccountId: string | null;
  selectedSection: string;
  simulationResult: Record<string, unknown> | null;
  messages: Array<{ id: string; role: 'assistant' | 'user'; text: string }>;
  pendingConfirmation: { command: string; message: string; source: 'command' | 'copilot' } | null;
  onConfirm: () => Promise<void>;
  onCancelConfirmation: () => void;
  commandResult: Record<string, unknown> | null;
  queryResult: CopilotQueryResult | null;
}) {
  const state = props.copilotState;
  return (
    <aside className="card flex min-w-0 flex-col p-4">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">AI Co-Pilot</div>
          <div className="mt-1 text-lg font-semibold">Suggestions, Insights, Chat</div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            Context: {props.selectedSection}{props.selectedAccountId ? ` • ${props.selectedAccountId}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className="rounded-full border border-[var(--border)] p-2 text-[var(--muted)] transition hover:text-[var(--text)]"
          title="Collapse Co-Pilot"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 overflow-y-auto">
        <Panel title="Suggestions" subtitle="Ranked next steps based on system state and current context">
          <div className="space-y-3">
            {(state?.suggestions || []).map((suggestion) => (
              <div key={suggestion.id} className="rounded-2xl border border-[var(--border)] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{suggestion.title}</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">{suggestion.description}</div>
                  </div>
                  <Badge tone={suggestion.riskLevel === 'high' ? 'danger' : suggestion.riskLevel === 'medium' ? 'warning' : 'success'}>
                    {suggestion.priority}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge>{suggestion.category}</Badge>
                  {suggestion.estimatedCount != null ? <Badge>{suggestion.estimatedCount}</Badge> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton
                    label={suggestion.actionLabel}
                    onClick={() => props.onAction(suggestion.actionCommand, false)}
                  />
                  {props.selectedAccountId && state?.suggestionPreview.topCandidateId ? (
                    <ActionButton
                      label="Explain"
                      onClick={() => props.onExplain({ explainType: 'action', actionId: state.suggestionPreview.topCandidateId })}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Insights" subtitle="Real-time observations from signals, patterns, learning, and drift">
          <div className="space-y-3">
            {(state?.insights || []).map((insight) => (
              <div key={insight.id} className="rounded-2xl border border-[var(--border)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{insight.title}</div>
                  <Badge tone={insight.severity === 'critical' ? 'danger' : insight.severity === 'warning' ? 'warning' : 'neutral'}>
                    {insight.category}
                  </Badge>
                </div>
                <div className="mt-2 text-xs text-[var(--muted)]">{insight.summary}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Conversation" subtitle="Ask for explanation, search, jobs, diagnostics, or action generation">
          <div className="space-y-3">
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
              {props.messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    message.role === 'assistant'
                      ? 'bg-[var(--accent-muted)] text-[var(--text)]'
                      : 'bg-[var(--surface)] text-[var(--muted)]'
                  }`}
                >
                  {message.text}
                </div>
              ))}
            </div>
            <textarea
              value={props.prompt}
              onChange={(event) => props.setPrompt(event.target.value)}
              rows={4}
              placeholder="Ask: Why is this account high priority? Find ecommerce companies evaluating CMS. Run research on fleetfeet.com."
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none placeholder:text-[var(--muted)]"
            />
            <div className="flex flex-wrap gap-2">
              <ActionButton label={props.busy ? 'Thinking…' : 'Ask Co-Pilot'} onClick={() => props.onSubmitPrompt(props.prompt)} />
              {(state?.conversationStarters || []).slice(0, 3).map((starter) => (
                <ActionButton key={starter} label={starter} onClick={() => props.onSubmitPrompt(starter)} />
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Learning Updates" subtitle="What the system is learning and how policy is shifting">
          <div className="space-y-2">
            {(state?.learningUpdates || []).map((update) => (
              <div key={update.id} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
                <div className="font-semibold text-[var(--text)]">{update.title}</div>
                <div className="mt-1">{update.summary}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="System Alerts" subtitle="Guardrails and confirmation-sensitive operations">
          <div className="space-y-3">
            {(state?.systemAlerts || []).map((alert) => (
              <div key={alert.id} className="rounded-2xl border border-[var(--border)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{alert.summary}</div>
                  <Badge tone={alert.level === 'warning' ? 'warning' : 'neutral'}>{alert.level}</Badge>
                </div>
              </div>
            ))}
            {props.pendingConfirmation ? (
              <div className="rounded-xl border border-[var(--warning)]/40 bg-[var(--warning-bg)] px-4 py-3">
                <div className="text-sm font-semibold text-[var(--warning)]">Confirmation required</div>
                <div className="mt-2 text-xs text-[var(--muted)]">{props.pendingConfirmation.message}</div>
                <div className="mt-3 flex gap-2">
                  <ActionButton label="Confirm" onClick={props.onConfirm} />
                  <ActionButton label="Cancel" onClick={props.onCancelConfirmation} />
                </div>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Output" subtitle="Latest explanation, simulation, or query result">
          <pre className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs text-[var(--muted)]">
            {JSON.stringify(props.queryResult || props.simulationResult || props.commandResult || state?.suggestionPreview || {}, null, 2)}
          </pre>
        </Panel>
      </div>
    </aside>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

function inferPersonRole(title?: string | null) {
  const lower = String(title || '').toLowerCase();
  if (lower.includes('vp') || lower.includes('chief')) return 'economic buyer or strategic approver';
  if (lower.includes('director') || lower.includes('lead')) return 'day-to-day evaluator and influencer';
  if (lower.includes('engineer') || lower.includes('developer')) return 'technical validator';
  return 'potential stakeholder requiring validation';
}

function inferOutreachAngle(title?: string | null) {
  const lower = String(title || '').toLowerCase();
  if (lower.includes('marketing')) return 'connect performance, content velocity, and campaign agility';
  if (lower.includes('engineer') || lower.includes('platform')) return 'focus on architecture, workflow friction, and migration confidence';
  if (lower.includes('product')) return 'highlight team velocity and content iteration speed';
  return 'anchor on evidence-backed operational pain and concrete next steps';
}

function resolveFlexCommand(selectedFunctions: string[], registry: FunctionDefinition[]) {
  const definitions = selectedFunctions
    .map((id) => registry.find((item) => item.id === id))
    .filter(Boolean) as FunctionDefinition[];
  if (definitions.some((item) => item.id === 'run-nightly-jobs')) return 'run nightly jobs';
  if (definitions.some((item) => item.id === 'refresh-stale-entities')) return 'refresh stale entities';
  if (definitions.some((item) => item.id === 'recalculate-opportunity-scores')) return 'recalculate scores';
  if (definitions.some((item) => item.id === 'generate-sdr-actions')) return 'generate sdr actions';
  if (definitions.some((item) => item.id === 'scan-account')) return 'queue research fleetfeet.com';
  return 'preview strategy';
}

function requiresCommandConfirmation(command: string) {
  const lower = command.toLowerCase();
  return lower.includes('recalculate scores')
    || lower.includes('run nightly jobs')
    || lower.includes('refresh stale entities')
    || lower.includes('queue anti drift maintenance');
}

function mapBatchOperation(operationId: string) {
  switch (operationId) {
    case 'refresh_stale_entities':
      return 'refresh stale entities';
    case 'recalculate_opportunity_scores':
      return 'recalculate scores';
    case 'rerun_pattern_detection':
      return 'generate sdr actions';
    case 'generate_briefs_for_incomplete_accounts':
      return 'run nightly jobs';
    case 'run_crawl_across_accounts':
    default:
      return 'queue research fleetfeet.com';
  }
}
