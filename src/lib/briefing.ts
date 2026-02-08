/**
 * Briefing utilities for strategy briefs.
 */

export function buildStrategyBrief({
  dateIso,
  topAccounts,
  topPeople,
  topMessages,
  skillFocus,
}: {
  dateIso: string;
  topAccounts: string[];
  topPeople: string[];
  topMessages: string[];
  skillFocus: string;
}) {
  const markdown = [
    '# Weekly Strategy Brief',
    `Date: ${dateIso}`,
    '',
    '## Double Down',
    ...topAccounts.map((a) => `- ${a}`),
    '',
    '## Top People',
    ...topPeople.map((p) => `- ${p}`),
    '',
    '## Top Messages',
    ...topMessages.map((m) => `- ${m}`),
    '',
    `## Next Skill Focus`,
    skillFocus,
  ].join('\n');

  return {
    markdown,
    doubleDown: topAccounts,
    stopDoing: [],
    nextSkillFocus: skillFocus,
  };
}
