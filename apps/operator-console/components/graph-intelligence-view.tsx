'use client';

import { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
  MiniMap,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { ConsoleSnapshot } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';

const NODE_COLORS: Record<string, string> = {
  account: '#3b82f6',
  person: '#a855f7',
  signal: '#eab308',
  pattern: '#ef4444',
  opportunity: '#22c55e',
  technology: '#06b6d4',
};

function buildGraphData(snapshot: ConsoleSnapshot): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const seen = new Set<string>();
  let y = 0;
  const rowH = 80;

  snapshot.entities.accounts.slice(0, 12).forEach((acc, i) => {
    const id = `acc-${acc.id}`;
    if (seen.has(id)) return;
    seen.add(id);
    nodes.push({
      id,
      type: 'default',
      data: { label: acc.name, nodeType: 'account' },
      position: { x: 20, y: y + i * rowH },
      style: { background: NODE_COLORS.account, color: '#fff', border: 'none', borderRadius: 8 },
    });
  });

  snapshot.entities.people.slice(0, 15).forEach((p, i) => {
    const id = `person-${p.id}`;
    if (seen.has(id)) return;
    seen.add(id);
    const accIdx = snapshot.entities.accounts.findIndex((a) => a.id === p.accountId);
    nodes.push({
      id,
      type: 'default',
      data: { label: p.name || p.id, nodeType: 'person' },
      position: { x: 220, y: accIdx >= 0 ? 20 + accIdx * rowH + i * 12 : 100 + i * 40 },
      style: { background: NODE_COLORS.person, color: '#fff', border: 'none', borderRadius: 8 },
    });
    if (p.accountId) {
      edges.push({ id: `e-${p.accountId}-${p.id}`, source: `acc-${p.accountId}`, target: id });
    }
  });

  snapshot.signals.recent.slice(0, 15).forEach((s, i) => {
    const id = `sig-${s.id}`;
    if (seen.has(id)) return;
    seen.add(id);
    nodes.push({
      id,
      type: 'default',
      data: { label: s.signalType || s.id, nodeType: 'signal' },
      position: { x: 420, y: 100 + i * 36 },
      style: { background: NODE_COLORS.signal, color: '#1f2937', border: 'none', borderRadius: 8 },
    });
    if (s.accountId) {
      edges.push({ id: `e-acc-${s.id}`, source: `acc-${s.accountId}`, target: id });
    }
  });

  snapshot.patterns.active.slice(0, 8).forEach((p, i) => {
    const id = `pat-${p.id}`;
    if (seen.has(id)) return;
    seen.add(id);
    nodes.push({
      id,
      type: 'default',
      data: { label: p.type || p.summary?.slice(0, 20) || p.id, nodeType: 'pattern' },
      position: { x: 620, y: 80 + i * 50 },
      style: { background: NODE_COLORS.pattern, color: '#fff', border: 'none', borderRadius: 8 },
    });
  });

  snapshot.overview.opportunityRadar.slice(0, 10).forEach((o, i) => {
    const id = `opp-${o.actionCandidateId}`;
    if (seen.has(id)) return;
    seen.add(id);
    nodes.push({
      id,
      type: 'default',
      data: {
        label: `${o.accountName} · ${o.confidence}%`,
        nodeType: 'opportunity',
        payload: o,
      },
      position: { x: 820, y: 60 + i * 70 },
      style: { background: NODE_COLORS.opportunity, color: '#fff', border: 'none', borderRadius: 8 },
    });
    if (o.accountId) {
      edges.push({ id: `e-opp-${o.actionCandidateId}`, source: `acc-${o.accountId}`, target: id });
    }
  });

  return { nodes, edges };
}

export function GraphIntelligenceView(props: {
  snapshot: ConsoleSnapshot;
  onOpenAccount: (accountId: string | null) => void;
  onCommand: (command: string) => Promise<void>;
}) {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => buildGraphData(props.snapshot), [props.snapshot]);
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);

  const onNodesChange: OnNodesChange = useCallback((chs) => setNodes((nds) => applyNodeChanges(chs, nds)), []);
  const onEdgesChange: OnEdgesChange = useCallback((chs) => setEdges((eds) => applyEdgeChanges(chs, eds)), []);

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const nodeTypes: NodeTypes = useMemo(() => ({}), []);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Graph"
        eyebrow="Intelligence"
        description="Relationships between accounts, people, signals, patterns, and opportunities."
      />
      <div className="mt-4 flex gap-4">
        <div className="card flex-1 overflow-hidden rounded-[var(--card-radius)]" style={{ minHeight: 480 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-[var(--background)]"
          >
            <Background gap={16} size={1} color="var(--border)" />
            <Controls className="!border-[var(--border)] !bg-[var(--panel)]" />
            <MiniMap
              nodeColor={(n) => (n.data?.nodeType ? NODE_COLORS[n.data.nodeType as string] : '#2a2a2e')}
              className="!bg-[var(--panel)]"
            />
            <Panel position="top-left" className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--muted)]">
              Node types: Account (blue) · Person (purple) · Signal (yellow) · Pattern (red) · Opportunity (green)
            </Panel>
          </ReactFlow>
        </div>
        {selectedNode && (
          <div className="card w-80 shrink-0 rounded-[var(--card-radius)] p-4">
            <div className="text-sm font-semibold text-[var(--text)]">{selectedNode.data?.label}</div>
            <div className="mt-2 text-xs text-[var(--muted)]">Type: {(selectedNode.data?.nodeType as string) || '—'}</div>
            {(selectedNode.data?.payload as { accountId?: string; accountName?: string })?.accountId && (
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    props.onOpenAccount((selectedNode.data?.payload as { accountId: string }).accountId);
                  }}
                  className="pill w-full text-left"
                >
                  Open account
                </button>
                <button
                  type="button"
                  onClick={() => props.onCommand('generate sdr actions')}
                  className="pill w-full text-left"
                >
                  Generate outreach
                </button>
                <button type="button" onClick={() => props.onCommand('run research')} className="pill w-full text-left">
                  Run research
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
