/**
 * Proposal generation and risk classification.
 */

type PatchOp = { op: 'add' | 'replace'; path: string; value: any };

const SAFE_FIELDS = ['/domain', '/tags', '/techStack', '/lastEnrichedAt'];
const RISKY_FIELDS = ['/name', '/canonicalId', '/linkedinUrl', '/companyRef'];

export function generatePatchProposal({
  entityId,
  entityType,
  updates,
  evidence,
}: {
  entityId: string;
  entityType: string;
  updates: Record<string, any>;
  evidence: { url: string; snippet: string; fetchedAt: string }[];
}) {
  const patches: PatchOp[] = Object.entries(updates).map(([key, value]) => ({
    op: 'add',
    path: `/${key}`,
    value,
  }));

  const risk = classifyRisk(patches);
  const confidence = computeConfidence(evidence.length, risk);

  return {
    entityId,
    entityType,
    patches,
    risk,
    confidence,
    evidence,
  };
}

export function classifyRisk(patches: PatchOp[]) {
  for (const patch of patches) {
    if (RISKY_FIELDS.some((f) => patch.path.startsWith(f))) return 'risky';
  }
  const allSafe = patches.every((p) => SAFE_FIELDS.some((f) => p.path.startsWith(f)));
  return allSafe ? 'safe' : 'risky';
}

export function computeConfidence(evidenceCount: number, risk: 'safe' | 'risky') {
  const base = risk === 'safe' ? 70 : 50;
  return Math.min(95, base + evidenceCount * 5);
}

export function applyPatchesToDocument(doc: any, patches: PatchOp[]) {
  const updated = { ...doc };
  for (const patch of patches) {
    const key = patch.path.replace('/', '');
    updated[key] = patch.value;
  }
  return updated;
}
