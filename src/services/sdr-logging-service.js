/**
 * SDR Logging Service
 * Handles writing to daily log files and tracking accountability
 */

/**
 * Write daily log entry
 * Note: In Cloudflare Workers, we can't write to files directly
 * So we'll store logs in Sanity or return structured data for logging
 */
export async function writeDailyLog(plan, requestId) {
  const today = new Date().toISOString().split('T')[0];
  
  const logEntry = {
    date: today,
    requestId,
    winCondition: plan.winCondition,
    plan: {
      callsPlanned: plan.callList.length,
      linkedInPlanned: plan.linkedInQueue.length,
      emailsPlanned: plan.emailQueue.length,
    },
    topAccounts: plan.top10Accounts.slice(0, 3).map(acc => ({
      account: acc.account,
      score: acc.score,
      whyNow: acc.whyNow,
    })),
    stats: plan.stats,
    schedule: plan.schedule,
    eodReminder: {
      timestamp: `${today}T16:30:00Z`, // 4:30 PM UTC
      checklist: [
        'Calls placed:',
        'Connects:',
        'Conversations:',
        'Meetings booked:',
        'LI actions done:',
        'Emails sent:',
        'Notes (what worked / what didn\'t):',
        'Objections / language patterns:',
      ],
    },
  };
  
  // In Workers, we return the log entry structure
  // The actual file writing would happen client-side or via a separate service
  return logEntry;
}

/**
 * Append EOD reminder to log
 */
export async function appendEODReminder(plan, requestId) {
  const today = new Date().toISOString().split('T')[0];
  
  return {
    date: today,
    requestId,
    reminder: `EOD check-in scheduled for 4:30 PM local time`,
    checklist: [
      'Calls placed:',
      'Connects:',
      'Conversations:',
      'Meetings booked:',
      'LI actions done:',
      'Emails sent:',
      'Notes (what worked / what didn\'t):',
      'Objections / language patterns:',
    ],
  };
}

/**
 * Format log entry as markdown (for client-side file writing)
 */
export function formatDailyLogMarkdown(plan, requestId) {
  const today = new Date().toISOString().split('T')[0];
  
  let markdown = `## ${today}\n`;
  markdown += `**Win condition:**\n`;
  markdown += `- ${plan.winCondition}\n\n`;
  
  markdown += `**Plan:**\n`;
  markdown += `- Calls planned: ${plan.callList.length}\n`;
  markdown += `- LinkedIn actions planned: ${plan.linkedInQueue.length}\n`;
  markdown += `- Emails planned: ${plan.emailQueue.length}\n\n`;
  
  markdown += `**Top accounts:**\n`;
  plan.top10Accounts.slice(0, 3).forEach((acc, idx) => {
    markdown += `${idx + 1}) ${acc.account} (Score: ${acc.score}) - ${acc.whyNow}\n`;
  });
  markdown += `\n`;
  
  markdown += `**EOD results (fill at 4:30pm):**\n`;
  markdown += `- Calls placed:\n`;
  markdown += `- Connects:\n`;
  markdown += `- Conversations:\n`;
  markdown += `- Meetings booked:\n`;
  markdown += `- LI actions done:\n`;
  markdown += `- Emails sent:\n`;
  markdown += `- Notes (what worked / what didn't):\n`;
  markdown += `- Objections / language patterns:\n\n`;
  
  return markdown;
}

/**
 * Write assumption refresh log
 */
export function formatAssumptionRefreshMarkdown(assumptionRefresh, requestId) {
  if (!assumptionRefresh || !assumptionRefresh.triggered) {
    return null;
  }
  
  const today = new Date().toISOString().split('T')[0];
  
  let markdown = `## ${today}\n`;
  markdown += `Accounts flagged for refresh:\n`;
  
  assumptionRefresh.accounts.forEach(acc => {
    markdown += `- ${acc.account} | ${acc.assumptions.join(', ')} | Refresh: ${acc.refreshActions.join(', ')}\n`;
  });
  
  markdown += `\nNotes:\n`;
  markdown += `- ${assumptionRefresh.notes}\n\n`;
  
  return markdown;
}

