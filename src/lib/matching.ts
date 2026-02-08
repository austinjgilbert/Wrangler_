/**
 * Matching utilities: signals -> people
 * Assumption: company match is by name or domain; keyword overlap uses tags + title.
 */

function normalize(text: string): string {
  return (text || '').toLowerCase();
}

export function keywordOverlapScore(keywords: string[], targetText: string): number {
  if (!keywords || keywords.length === 0) return 0;
  const hay = normalize(targetText);
  let hits = 0;
  for (const kw of keywords) {
    if (kw && hay.includes(normalize(kw))) hits += 1;
  }
  return Math.min(1, hits / Math.max(3, keywords.length));
}

export function matchSignalsToPeople({
  signals,
  people,
  companies,
}: {
  signals: any[];
  people: any[];
  companies: any[];
}) {
  const companyById = new Map<string, any>();
  const companyByName = new Map<string, any>();

  companies.forEach((company) => {
    if (company?._id) companyById.set(company._id, company);
    if (company?.name) companyByName.set(normalize(company.name), company);
  });

  const matches: Array<{
    signal: any;
    person: any;
    signalStrength: number;
    keywordScore: number;
  }> = [];

  for (const signal of signals) {
    const company = signal.companyRef ? companyById.get(signal.companyRef?._ref || signal.companyRef) : null;
    const companyName = normalize(company?.name || signal.companyName || '');

    for (const person of people) {
      const personCompany = normalize(person.company || '');
      if (!companyName || !personCompany || companyName !== personCompany) {
        continue;
      }

      const tagsText = Array.isArray(person.tags) ? person.tags.join(' ') : '';
      const keywordScore = keywordOverlapScore(signal.keywords || [], `${person.title || ''} ${tagsText}`);
      const signalStrength = Math.round((keywordScore * 50) + 50); // 50-100 based on overlap

      matches.push({
        signal,
        person,
        signalStrength,
        keywordScore,
      });
    }
  }

  return matches;
}
