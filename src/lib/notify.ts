/**
 * Notification Abstraction (Slack-ready)
 * Currently logs and stores a notification draft in Sanity.
 */

import { createMoltNotification } from './sanity.ts';
import { postSlackMessage } from './slack.ts';

interface NotifyResult {
  ok: boolean;
}

export async function notify(type: string, message: string, payload: any = {}, env: any = null): Promise<NotifyResult> {
  // Draft-only: do not send external messages.
  const logPayload = {
    type,
    message,
    payload,
    createdAt: new Date().toISOString(),
  };
  console.log('[notify]', JSON.stringify(logPayload));

  if (env) {
    await createMoltNotification(env, {
      _type: 'molt.notification',
      _id: `molt.notification.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`,
      type,
      message,
      payload,
      channel: 'draft',
      createdAt: logPayload.createdAt,
    });
  }

  // If Slack is configured, send a lightweight notification.
  if (env && env.SLACK_BOT_TOKEN && env.SLACK_DEFAULT_CHANNEL) {
    await postSlackMessage(env, {
      channel: env.SLACK_DEFAULT_CHANNEL,
      text: `[${type}] ${message}`,
    });
  }

  return { ok: true };
}
