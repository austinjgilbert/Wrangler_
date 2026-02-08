/**
 * SDR Good Morning Routing Service
 * Orchestrates the daily prioritization and planning workflow
 */

import { calculatePriorityScore, rankAccounts, filterByMinScore, getWhyNowReasoning } from './sdr-scoring-service.js';

/**
 * Generate good morning routing plan
 * @param {object} context - Context with groqQuery, client, etc.
 * @param {object} options - Options for routing
 * @returns {Promise<object>} Routing plan
 */
export async function generateGoodMorningRouting(context, options = {}) {
  const {
    groqQuery,
    client,
    requestId,
  } = context;
  
  const {
    daysBack = 30, // Default to last 30 days
    minCallScore = 6,
    maxCalls = 25,
    maxLinkedIn = 15,
    maxEmails = 10,
    assumeRefresh = false, // Set to true to trigger assumption refresh
  } = options;
  
  const today = new Date().toISOString().split('T')[0];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffDateStr = cutoffDate.toISOString();
  
  // Step 1: Pull yesterday's activity (if we had activity logging)
  // For now, we'll infer from account updates
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  // Step 2: Get current account pool
  const accountPool = await getAccountPool(groqQuery, client, cutoffDateStr);
  
  // Step 3: Get intent/signals from accounts
  // (Already embedded in account data)
  
  // Step 4: Get persons linked to accounts
  const personsByAccount = await getPersonsByAccounts(groqQuery, client, accountPool);
  
  // Step 5: Score and rank accounts
  const scoredAccounts = accountPool.map(account => {
    const person = personsByAccount[account.accountKey]?.[0] || null; // Get first person for now
    return calculatePriorityScore(account, person, options);
  });
  
  const rankedAccounts = rankAccounts(scoredAccounts);
  const qualifiedAccounts = filterByMinScore(rankedAccounts, minCallScore);
  
  // Step 6: Generate Top 10 Accounts
  const top10Accounts = rankedAccounts.slice(0, 10).map(acc => ({
    account: acc.companyName || acc.rootDomain,
    accountKey: acc.accountKey,
    canonicalUrl: acc.canonicalUrl,
    score: acc.total,
    whyNow: getWhyNowReasoning(acc),
    bestNextAction: determineBestNextAction(acc, personsByAccount[acc.accountKey]?.[0]),
    owner: personsByAccount[acc.accountKey]?.[0]?.name || 'TBD',
    contact: personsByAccount[acc.accountKey]?.[0]?.linkedInUrl || null,
  }));
  
  // Step 7: Generate Call List
  const callList = generateCallList(qualifiedAccounts.slice(0, maxCalls), personsByAccount);
  
  // Step 8: Generate LinkedIn Queue
  const linkedInQueue = generateLinkedInQueue(top10Accounts, personsByAccount, maxLinkedIn);
  
  // Step 9: Generate Email Queue
  const emailQueue = generateEmailQueue(qualifiedAccounts.slice(0, 10), personsByAccount, maxEmails);
  
  // Step 10: Determine Win Condition
  const winCondition = determineWinCondition(top10Accounts, callList.length);
  
  // Step 11: Generate Schedule
  const schedule = generateSchedule(callList.length, linkedInQueue.length, emailQueue.length);
  
  // Step 12: Check for assumption refresh (every 3 workdays or if requested)
  let assumptionRefresh = null;
  if (assumeRefresh || shouldTriggerAssumptionRefresh()) {
    assumptionRefresh = await generateAssumptionRefresh(groqQuery, client, rankedAccounts.slice(0, 10));
  }
  
  return {
    date: today,
    winCondition,
    top10Accounts,
    callList,
    linkedInQueue,
    emailQueue,
    schedule,
    assumptionRefresh,
    stats: {
      totalAccounts: accountPool.length,
      qualifiedAccounts: qualifiedAccounts.length,
      callsQueued: callList.length,
      linkedInQueued: linkedInQueue.length,
      emailsQueued: emailQueue.length,
    },
  };
}

/**
 * Get account pool from Sanity
 */
async function getAccountPool(groqQuery, client, cutoffDate) {
  const query = `*[_type == "account" && (_updatedAt >= $cutoffDate || _createdAt >= $cutoffDate)]{
    _id,
    _createdAt,
    _updatedAt,
    accountKey,
    companyName,
    canonicalUrl,
    rootDomain,
    domain,
    opportunityScore,
    aiReadiness,
    businessScale,
    signals,
    lastScannedAt,
    latestBriefRef,
    latestOsintReportRef,
    technologyStack
  } | order(_updatedAt desc)`;
  
  try {
    const accounts = await groqQuery(client, query, { cutoffDate });
    return accounts || [];
  } catch (error) {
    console.error('Error fetching account pool:', error);
    return [];
  }
}

/**
 * Get persons linked to accounts
 */
async function getPersonsByAccounts(groqQuery, client, accounts) {
  if (!accounts || accounts.length === 0) return {};
  
  const accountKeys = accounts.map(acc => acc.accountKey).filter(Boolean);
  if (accountKeys.length === 0) return {};
  
  // Query persons by relatedAccountKey or rootDomain
  const query = `*[_type == "person" && (relatedAccountKey in $accountKeys || rootDomain in $domains)]{
    _id,
    name,
    currentTitle,
    title,
    linkedInUrl,
    profileUrl,
    companyName,
    currentCompany,
    relatedAccountKey,
    rootDomain,
    function,
    seniority,
    execClaimsUsed,
    teamMap
  }`;
  
  const domains = accounts.map(acc => acc.rootDomain || acc.domain).filter(Boolean);
  
  try {
    const persons = await groqQuery(client, query, { accountKeys, domains });
    const byAccount = {};
    
    persons.forEach(person => {
      const accountKey = person.relatedAccountKey || 
        accounts.find(acc => acc.rootDomain === person.rootDomain || acc.domain === person.rootDomain)?.accountKey;
      
      if (accountKey) {
        if (!byAccount[accountKey]) {
          byAccount[accountKey] = [];
        }
        byAccount[accountKey].push(person);
      }
    });
    
    return byAccount;
  } catch (error) {
    console.error('Error fetching persons:', error);
    return {};
  }
}

/**
 * Determine best next action for an account
 */
function determineBestNextAction(scoredAccount, person) {
  if (!person) {
    return 'Identify decision maker';
  }
  
  if (person.linkedInUrl) {
    if (!person.connections) {
      return 'Connect on LinkedIn';
    }
    return 'Engage on LinkedIn';
  }
  
  if (scoredAccount.breakdown.conversationLeverage >= 2) {
    return 'Warm outreach via identified champion';
  }
  
  return 'Direct call to decision maker';
}

/**
 * Generate call list with talk tracks
 */
function generateCallList(scoredAccounts, personsByAccount) {
  return scoredAccounts.map(acc => {
    const person = personsByAccount[acc.accountKey]?.[0] || null;
    const title = person?.currentTitle || person?.title || 'Decision Maker';
    const companyName = acc.companyName || acc.rootDomain;
    
    // Generate talk track angle
    const talkTrack = generateTalkTrack(acc, person);
    const objectionGuess = generateObjectionGuess(acc);
    const cta = generateCTA(acc, person);
    
    return {
      person: person?.name || title,
      account: companyName,
      accountKey: acc.accountKey,
      score: acc.total,
      whyNow: getWhyNowReasoning(acc),
      talkTrack,
      objectionGuess,
      cta,
      phone: person?.phone || null, // If we store phone numbers
      linkedIn: person?.linkedInUrl || null,
    };
  });
}

/**
 * Generate LinkedIn action queue
 */
function generateLinkedInQueue(top10Accounts, personsByAccount, maxActions) {
  const actions = [];
  
  for (const account of top10Accounts) {
    const persons = personsByAccount[account.accountKey] || [];
    
    for (const person of persons.slice(0, 3)) { // Max 3 people per account
      if (actions.length >= maxActions) break;
      
      const state = determineLinkedInState(person);
      const action = determineLinkedInAction(state);
      const personalization = generateLinkedInPersonalization(account, person);
      
      actions.push({
        person: person.name,
        account: account.account,
        accountKey: account.accountKey,
        state,
        action,
        personalization,
        linkedInUrl: person.linkedInUrl || person.profileUrl,
      });
    }
    
    if (actions.length >= maxActions) break;
  }
  
  return actions;
}

/**
 * Generate email queue
 */
function generateEmailQueue(scoredAccounts, personsByAccount, maxEmails) {
  const emails = [];
  
  for (const acc of scoredAccounts) {
    if (emails.length >= maxEmails) break;
    
    const person = personsByAccount[acc.accountKey]?.[0];
    if (!person) continue;
    
    // Only queue emails when it's the best async step
    const reason = determineEmailReason(acc, person);
    if (!reason) continue;
    
    emails.push({
      person: person.name,
      account: acc.companyName || acc.rootDomain,
      accountKey: acc.accountKey,
      reason,
      intent: generateEmailIntent(acc, person),
      cta: generateEmailCTA(acc, person),
      email: person.email || null, // If we store emails
    });
  }
  
  return emails;
}

/**
 * Determine win condition
 */
function determineWinCondition(top10Accounts, callCount) {
  const highScoreCount = top10Accounts.filter(acc => acc.score >= 8).length;
  
  if (highScoreCount >= 3) {
    return `Connect with 2+ of the top 3 high-intent accounts (scores ≥8) and book 1 meeting`;
  }
  
  if (callCount >= 20) {
    return `Complete 20+ qualified calls and book 2 meetings`;
  }
  
  return `Complete ${callCount} calls from priority list and book 1 meeting`;
}

/**
 * Generate schedule
 */
function generateSchedule(callCount, linkedInCount, emailCount) {
  const callBlocks = Math.ceil(callCount / 12); // ~12 calls per hour
  
  return {
    block1_calls: callBlocks > 0 ? '10:00 AM - 11:00 AM' : null,
    block2_calls: callBlocks > 1 ? '2:00 PM - 3:30 PM' : null,
    linkedin_block: linkedInCount > 0 ? '11:00 AM - 11:30 AM' : null,
    admin_block: '4:00 PM - 4:30 PM (EOD check-in)',
    email_block: emailCount > 0 ? '9:30 AM - 10:00 AM' : null,
  };
}

/**
 * Generate talk track
 */
function generateTalkTrack(scoredAccount, person) {
  const reasons = [];
  
  if (scoredAccount.breakdown.intent >= 3) {
    reasons.push('I noticed your team is evaluating enterprise solutions');
  } else if (scoredAccount.breakdown.intent >= 2) {
    reasons.push('I saw you\'re working on modernization initiatives');
  }
  
  if (scoredAccount.breakdown.freshness >= 2) {
    reasons.push('Given your recent activity, I thought it might be timely to connect');
  }
  
  return reasons.length > 0 
    ? `${reasons[0]}. ${reasons[1] || 'I have a few ideas that might be relevant.'}`
    : 'I came across your company and thought we might be able to help with your initiatives.';
}

/**
 * Generate objection guess
 */
function generateObjectionGuess(scoredAccount) {
  if (scoredAccount.breakdown.freshness === 0) {
    return 'Not the right time / Just started evaluation';
  }
  
  if (scoredAccount.breakdown.intent < 2) {
    return 'Not currently evaluating / Happy with current solution';
  }
  
  return 'Budget constraints / Need to check with team';
}

/**
 * Generate CTA
 */
function generateCTA(scoredAccount, person) {
  if (scoredAccount.breakdown.intent >= 3) {
    return '15-minute discovery call to understand your requirements';
  }
  
  return 'Quick 10-minute conversation to see if there\'s a fit';
}

/**
 * Determine LinkedIn state
 */
function determineLinkedInState(person) {
  // Simplified - in real implementation, check connection status
  if (!person.linkedInUrl) return 'Not Connected';
  // Would need to check actual connection status
  return 'Unknown'; // Default for now
}

/**
 * Determine LinkedIn action
 */
function determineLinkedInAction(state) {
  switch (state) {
    case 'Not Connected':
      return 'Send personalized connection request';
    case 'Connected':
      return 'Like/comment on recent post';
    case 'Dormant':
      return 'Soft value nudge referencing relevant initiative';
    default:
      return 'Engage with content';
  }
}

/**
 * Generate LinkedIn personalization
 */
function generateLinkedInPersonalization(account, person) {
  return `Hi ${person.name?.split(' ')[0] || 'there'}, noticed ${account.account}'s recent initiatives - would love to connect!`;
}

/**
 * Determine email reason
 */
function determineEmailReason(scoredAccount, person) {
  // Only email if warm and needs next step, or async is better
  if (scoredAccount.breakdown.conversationLeverage >= 2 && scoredAccount.breakdown.freshness >= 1) {
    return 'Warm account needs clean next step';
  }
  
  if (scoredAccount.breakdown.proximity >= 2 && !person.linkedInUrl) {
    return 'Decision maker, async approach preferred';
  }
  
  return null; // Don't email
}

/**
 * Generate email intent
 */
function generateEmailIntent(scoredAccount, person) {
  if (scoredAccount.breakdown.intent >= 3) {
    return 'Schedule discovery call for enterprise evaluation';
  }
  return 'Share relevant resources and request brief call';
}

/**
 * Generate email CTA
 */
function generateEmailCTA(scoredAccount, person) {
  return 'Schedule a 15-minute call this week';
}

/**
 * Check if assumption refresh should trigger
 */
function shouldTriggerAssumptionRefresh() {
  // Simple check: every 3 workdays (would need to track this in a file)
  // For now, return false and let explicit flag control it
  return false;
}

/**
 * Generate assumption refresh list
 */
async function generateAssumptionRefresh(groqQuery, client, accounts) {
  // Select 5-10 accounts with potentially stale assumptions
  const selected = accounts.slice(0, Math.min(10, accounts.length)).map(acc => ({
    account: acc.companyName || acc.rootDomain,
    accountKey: acc.accountKey,
    assumptions: [
      'Tech stack signals may be outdated',
      'Org structure may have changed',
      'Intent activity needs re-validation',
      'Decision maker may have changed',
    ],
    refreshActions: [
      'Re-scan homepage for tech stack',
      'Check for recent news/announcements',
      'Update person intelligence brief',
      'Verify current decision maker',
    ],
  }));
  
  return {
    triggered: true,
    accounts: selected,
    notes: 'Flagged for assumption refresh - run person intelligence or re-scan accounts',
  };
}

