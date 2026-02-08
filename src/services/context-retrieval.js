/**
 * Context Retrieval Service
 * Retrieves past conversations, learnings, and context for GPT memory
 * Enables "we said this last time" functionality
 */

/**
 * Retrieve recent interactions about a topic/account
 */
export async function getRecentInteractions(
  groqQuery,
  client,
  filters = {},
  limit = 10
) {
  const {
    accountId = null,
    accountKey = null,
    domain = null,
    sessionId = null,
    contextTags = [],
    followUpNeeded = null,
    derivedInsight = null,
  } = filters;

  let query = '*[_type == "interaction"';

  // Filter by account reference
  let resolvedAccountId = null;
  if (accountId) {
    resolvedAccountId = accountId;
  } else if (accountKey) {
    // Find account by key first, then filter interactions (GROQ [0] returns single value or array)
    const accountQuery = `*[_type == "account" && accountKey == $accountKey][0]._id`;
    const raw = await groqQuery(client, accountQuery, { accountKey });
    const account = Array.isArray(raw) && raw.length ? raw[0] : raw;
    if (account) {
      resolvedAccountId = account;
    }
  } else if (domain) {
    // Find account by domain first
    const accountQuery = `*[_type == "account" && (domain == $domain || rootDomain == $domain)][0]._id`;
    const raw = await groqQuery(client, accountQuery, { domain });
    const account = Array.isArray(raw) && raw.length ? raw[0] : raw;
    if (account) {
      resolvedAccountId = account;
    }
  }
  
  if (resolvedAccountId) {
    query += ` && references($accountId)`;
    filters.accountId = resolvedAccountId;
  }

  // Filter by session
  if (sessionId) {
    query += ` && sessionId->sessionId == $sessionId`;
  }

  // Filter by context tags
  if (contextTags.length > 0) {
    const tagConditions = contextTags.map(tag => `"${tag}" in contextTags`).join(' || ');
    query += ` && (${tagConditions})`;
  }

  // Filter by follow-up needed
  if (followUpNeeded !== null) {
    query += ` && followUpNeeded == ${followUpNeeded}`;
  }

  // Filter by derived insight
  if (derivedInsight !== null) {
    query += ` && derivedInsight == ${derivedInsight}`;
  }

  query += ']';
  query += ' | order(timestamp desc)';
  query += `[0...${limit}]`;

  const interactions = await groqQuery(client, query, filters);
  return interactions || [];
}

/**
 * Get unresolved follow-ups
 */
export async function getUnresolvedFollowUps(
  groqQuery,
  client,
  filters = {},
  limit = 20
) {
  const {
    accountId = null,
    accountKey = null,
    domain = null,
  } = filters;

  return getRecentInteractions(
    groqQuery,
    client,
    { ...filters, followUpNeeded: true, accountId, accountKey, domain },
    limit
  );
}

/**
 * Retrieve learnings related to accounts/briefs
 */
export async function getRelevantLearnings(
  groqQuery,
  client,
  filters = {},
  limit = 10
) {
  const {
    accountId = null,
    accountKey = null,
    domain = null,
    briefId = null,
    contextTags = [],
    minRelevanceScore = 0.7,
  } = filters;

  let query = '*[_type == "learning"';

  // Filter by account reference
  let resolvedAccountId = null;
  if (accountId) {
    resolvedAccountId = accountId;
  } else if (accountKey) {
    const accountQuery = `*[_type == "account" && accountKey == $accountKey][0]._id`;
    const raw = await groqQuery(client, accountQuery, { accountKey });
    const account = Array.isArray(raw) && raw.length ? raw[0] : raw;
    if (account) {
      resolvedAccountId = account;
    }
  } else if (domain) {
    const accountQuery = `*[_type == "account" && (domain == $domain || rootDomain == $domain)][0]._id`;
    const raw = await groqQuery(client, accountQuery, { domain });
    const account = Array.isArray(raw) && raw.length ? raw[0] : raw;
    if (account) {
      resolvedAccountId = account;
    }
  }
  
  if (resolvedAccountId) {
    query += ` && references($accountId)`;
    filters.accountId = resolvedAccountId;
  }

  // Filter by brief reference
  if (briefId) {
    query += ` && references($briefId)`;
  }

  // Filter by context tags
  if (contextTags.length > 0) {
    const tagConditions = contextTags.map(tag => `"${tag}" in contextTags`).join(' || ');
    query += ` && (${tagConditions})`;
  }

  // Filter by relevance score
  query += ` && relevanceScore >= ${minRelevanceScore}`;

  query += ']';
  query += ' | order(relevanceScore desc, createdAt desc)';
  query += `[0...${limit}]`;

  const learnings = await groqQuery(client, query, filters);
  return learnings || [];
}

/**
 * Get most recent conversation about a brand/domain
 */
export async function getMostRecentConversation(
  groqQuery,
  client,
  domain
) {
  const interactions = await getRecentInteractions(
    groqQuery,
    client,
    { domain },
    1
  );

  return interactions.length > 0 ? interactions[0] : null;
}

/**
 * Get session with all interactions
 */
export async function getSessionWithInteractions(
  groqQuery,
  client,
  sessionId
) {
  const sessionQuery = `*[_type == "session" && sessionId == $sessionId][0]{
    ...,
    "interactions": *[_type == "interaction" && sessionId._ref == ^._id] | order(timestamp asc)
  }`;

  const raw = await groqQuery(client, sessionQuery, { sessionId });
  const session = Array.isArray(raw) && raw.length ? raw[0] : raw;
  return session || null;
}

/**
 * Get stored account intelligence (scan, research set, brief) for context
 * Used when user recalls/summarizes so they get full insights from Sanity, not just conversations
 */
export async function getAccountIntelligenceForContext(
  groqQuery,
  client,
  filters = {}
) {
  const { accountKey = null, domain = null } = filters;
  if (!accountKey && !domain) return null;

  const { quickGetAccountPack, quickGetAccount, quickAccountExists } = await import('./sanity-quick-query.js');
  let resolvedKey = accountKey;
  if (!resolvedKey && domain) {
    const account = await quickAccountExists(client, groqQuery, domain);
    resolvedKey = account?.accountKey || null;
  }
  if (!resolvedKey) return null;

  const [account, pack] = await Promise.all([
    quickGetAccount(client, groqQuery, resolvedKey),
    quickGetAccountPack(client, groqQuery, resolvedKey),
  ]);

  const parts = [];
  const name = account?.companyName || pack?.domain || resolvedKey;

  if (account) {
    if (account.opportunityScore != null) {
      parts.push(`Opportunity score: ${account.opportunityScore}`);
    }
    if (account.aiReadiness?.score != null) {
      parts.push(`AI readiness: ${account.aiReadiness.score}/100`);
    }
    if (account.technologyStack?.cms?.length) {
      parts.push(`CMS: ${account.technologyStack.cms.join(', ')}`);
    }
    if (account.technologyStack?.frameworks?.length) {
      parts.push(`Frameworks: ${account.technologyStack.frameworks.slice(0, 5).join(', ')}`);
    }
    if (account.signals?.length) {
      parts.push(`Signals: ${account.signals.slice(0, 5).join('; ')}`);
    }
    if (account.lastScannedAt) {
      parts.push(`Last scanned: ${new Date(account.lastScannedAt).toLocaleDateString()}`);
    }
  }

  const payload = pack?.payload || {};
  if (payload.scan?.summary) {
    parts.push(`Scan summary: ${payload.scan.summary}`);
  }
  const researchSet = payload.researchSet;
  if (researchSet) {
    const rs = researchSet.summary;
    if (rs && typeof rs === 'object') {
      parts.push(`Research: ${rs.pagesDiscovered ?? 0} pages discovered, ${rs.pagesCrawled ?? 0} crawled, brief: ${rs.hasBrief ? 'yes' : 'no'}`);
    }
    const briefFromResearch = researchSet.brief;
    if (briefFromResearch?.evidencePack?.keyFacts?.length) {
      parts.push(`Key facts: ${briefFromResearch.evidencePack.keyFacts.slice(0, 3).join('; ')}`);
    }
    if (briefFromResearch?.executiveSummary?.length) {
      const bullets = Array.isArray(briefFromResearch.executiveSummary)
        ? briefFromResearch.executiveSummary.slice(0, 4).join('. ')
        : String(briefFromResearch.executiveSummary).slice(0, 500);
      parts.push(`Brief: ${bullets}`);
    }
  }
  if (payload.brief?.executiveSummary?.length && !payload.researchSet?.brief) {
    const bullets = Array.isArray(payload.brief.executiveSummary)
      ? payload.brief.executiveSummary.slice(0, 4).join('. ')
      : String(payload.brief.executiveSummary).slice(0, 500);
    parts.push(`Brief: ${bullets}`);
  }

  if (parts.length === 0) return null;
  return `## Stored account intelligence (${name})\n${parts.join('\n')}`;
}

/**
 * Build context summary for GPT prompts
 * Combines recent interactions, learnings, and stored account intelligence into a formatted context string.
 * When fullInsights is true, returns full text (no truncation) and higher limits for recall/summarize.
 */
export async function buildContextSummary(
  groqQuery,
  client,
  filters = {}
) {
  const {
    accountKey = null,
    domain = null,
    contextTags = [],
    minRelevanceScore = 0.7,
    fullInsights = false,
    interactionLimit = 5,
    learningLimit = 3,
    followUpLimit = 3,
  } = filters;

  const limitInteractions = fullInsights ? Math.min(interactionLimit, 25) : Math.min(interactionLimit, 5);
  const limitLearnings = fullInsights ? Math.min(learningLimit, 15) : Math.min(learningLimit, 3);
  const limitFollowUps = fullInsights ? Math.min(followUpLimit, 10) : Math.min(followUpLimit, 3);
  const truncateUser = fullInsights ? 2000 : 150;
  const truncateResponse = fullInsights ? 3000 : 200;

  // Stored account intelligence (scan, research set, brief) when account/domain is known
  let accountIntelligence = null;
  if (accountKey || domain) {
    accountIntelligence = await getAccountIntelligenceForContext(groqQuery, client, { accountKey, domain });
  }

  const [interactions, learnings, followUps] = await Promise.all([
    getRecentInteractions(groqQuery, client, { accountKey, domain, contextTags }, limitInteractions),
    getRelevantLearnings(groqQuery, client, { accountKey, domain, contextTags, minRelevanceScore }, limitLearnings),
    getUnresolvedFollowUps(groqQuery, client, { accountKey, domain, contextTags }, limitFollowUps),
  ]);

  const contextParts = [];

  if (accountIntelligence) {
    contextParts.push(accountIntelligence);
  }

  if (learnings.length > 0) {
    contextParts.push('\n## Previous learnings (patterns to reuse)');
    learnings.forEach(learning => {
      contextParts.push(`- ${learning.title}: ${learning.summary}`);
      if (learning.memoryPhrase) {
        contextParts.push(`  (Recall: "${learning.memoryPhrase}")`);
      }
    });
  }

  if (followUps.length > 0) {
    contextParts.push('\n## Unresolved follow-ups');
    followUps.forEach(followUp => {
      const prompt = followUp.userPrompt?.length > (fullInsights ? 500 : 100)
        ? `${followUp.userPrompt.substring(0, fullInsights ? 500 : 100)}...`
        : (followUp.userPrompt || '');
      contextParts.push(`- ${prompt}`);
      if (followUp.followUpNotes) {
        contextParts.push(`  Note: ${followUp.followUpNotes}`);
      }
    });
  }

  if (interactions.length > 0) {
    contextParts.push('\n## Recent context (conversations)');
    interactions.forEach(interaction => {
      const date = new Date(interaction.timestamp).toLocaleDateString();
      const userText = interaction.userPrompt?.length > truncateUser
        ? `${interaction.userPrompt.substring(0, truncateUser)}...`
        : (interaction.userPrompt || '');
      const responseText = interaction.gptResponse?.length > truncateResponse
        ? `${interaction.gptResponse.substring(0, truncateResponse)}...`
        : (interaction.gptResponse || '');
      contextParts.push(`\n[${date}] User: ${userText}`);
      contextParts.push(`WRANGLER: ${responseText}`);
    });
  }

  return contextParts.join('\n') || 'No previous context found.';
}
