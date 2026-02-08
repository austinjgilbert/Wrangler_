/**
 * Data Quality rules for Accounts, People, Technology.
 * Assumptions (merge with existing schemas if present):
 * - account: { name, domain, industry, tags[], techStack[], lastEnrichedAt }
 * - person: { name, title, companyRef, linkedinUrl, roleCategory, lastEnrichedAt }
 * - technology: { name, category, detectionSignals[] }
 */

export type DqFinding = {
  ruleId: string;
  entityType: 'account' | 'person' | 'technology';
  entityId: string;
  severity: 'low' | 'med' | 'high';
  summary: string;
  details: Record<string, any>;
};

const STALE_DAYS = 90;

function isStale(dateIso?: string): boolean {
  if (!dateIso) return true;
  const ageDays = (Date.now() - new Date(dateIso).getTime()) / (1000 * 60 * 60 * 24);
  return ageDays > STALE_DAYS;
}

export const DQ_RULES = [
  {
    id: 'account.missingDomain',
    severity: 'high',
    check: (account: any) =>
      !account?.domain ? {
        ruleId: 'account.missingDomain',
        entityType: 'account',
        entityId: account?._id,
        severity: 'high',
        summary: 'Account missing domain',
        details: { field: 'domain' },
      } : null,
  },
  {
    id: 'account.missingName',
    severity: 'med',
    check: (account: any) =>
      !account?.name ? {
        ruleId: 'account.missingName',
        entityType: 'account',
        entityId: account?._id,
        severity: 'med',
        summary: 'Account missing name',
        details: { field: 'name' },
      } : null,
  },
  {
    id: 'account.missingIndustry',
    severity: 'low',
    check: (account: any) =>
      !account?.industry ? {
        ruleId: 'account.missingIndustry',
        entityType: 'account',
        entityId: account?._id,
        severity: 'low',
        summary: 'Account missing industry',
        details: { field: 'industry' },
      } : null,
  },
  {
    id: 'account.missingTechStack',
    severity: 'med',
    check: (account: any) =>
      !Array.isArray(account?.techStack) || account.techStack.length === 0 ? {
        ruleId: 'account.missingTechStack',
        entityType: 'account',
        entityId: account?._id,
        severity: 'med',
        summary: 'Account missing tech stack',
        details: { field: 'techStack' },
      } : null,
  },
  {
    id: 'account.staleEnrichment',
    severity: 'med',
    check: (account: any) =>
      isStale(account?.lastEnrichedAt) ? {
        ruleId: 'account.staleEnrichment',
        entityType: 'account',
        entityId: account?._id,
        severity: 'med',
        summary: 'Account enrichment is stale',
        details: { lastEnrichedAt: account?.lastEnrichedAt || null },
      } : null,
  },
  {
    id: 'person.missingLinkedin',
    severity: 'med',
    check: (person: any) =>
      !person?.linkedinUrl ? {
        ruleId: 'person.missingLinkedin',
        entityType: 'person',
        entityId: person?._id,
        severity: 'med',
        summary: 'Person missing LinkedIn URL',
        details: { field: 'linkedinUrl' },
      } : null,
  },
  {
    id: 'person.missingRoleCategory',
    severity: 'low',
    check: (person: any) =>
      !person?.roleCategory ? {
        ruleId: 'person.missingRoleCategory',
        entityType: 'person',
        entityId: person?._id,
        severity: 'low',
        summary: 'Person missing role category',
        details: { field: 'roleCategory' },
      } : null,
  },
  {
    id: 'person.missingCompanyRef',
    severity: 'med',
    check: (person: any) =>
      !person?.companyRef ? {
        ruleId: 'person.missingCompanyRef',
        entityType: 'person',
        entityId: person?._id,
        severity: 'med',
        summary: 'Person missing company reference',
        details: { field: 'companyRef' },
      } : null,
  },
  {
    id: 'person.staleEnrichment',
    severity: 'med',
    check: (person: any) =>
      isStale(person?.lastEnrichedAt) ? {
        ruleId: 'person.staleEnrichment',
        entityType: 'person',
        entityId: person?._id,
        severity: 'med',
        summary: 'Person enrichment is stale',
        details: { lastEnrichedAt: person?.lastEnrichedAt || null },
      } : null,
  },
  {
    id: 'technology.missingCategory',
    severity: 'low',
    check: (tech: any) =>
      !tech?.category ? {
        ruleId: 'technology.missingCategory',
        entityType: 'technology',
        entityId: tech?._id,
        severity: 'low',
        summary: 'Technology missing category',
        details: { field: 'category' },
      } : null,
  },
  {
    id: 'technology.missingSignals',
    severity: 'med',
    check: (tech: any) =>
      !Array.isArray(tech?.detectionSignals) || tech.detectionSignals.length === 0 ? {
        ruleId: 'technology.missingSignals',
        entityType: 'technology',
        entityId: tech?._id,
        severity: 'med',
        summary: 'Technology missing detection signals',
        details: { field: 'detectionSignals' },
      } : null,
  },
];

export function runDqRules(entities: {
  accounts: any[];
  people: any[];
  technologies: any[];
}): DqFinding[] {
  const findings: DqFinding[] = [];

  for (const account of entities.accounts) {
    for (const rule of DQ_RULES.filter((r) => r.id.startsWith('account.'))) {
      const result = rule.check(account);
      if (result) findings.push(result as DqFinding);
    }
  }

  for (const person of entities.people) {
    for (const rule of DQ_RULES.filter((r) => r.id.startsWith('person.'))) {
      const result = rule.check(person);
      if (result) findings.push(result as DqFinding);
    }
  }

  for (const tech of entities.technologies) {
    for (const rule of DQ_RULES.filter((r) => r.id.startsWith('technology.'))) {
      const result = rule.check(tech);
      if (result) findings.push(result as DqFinding);
    }
  }

  return findings;
}
