/**
 * Slack helpers (signing verification + post message).
 */

function textToArrayBuffer(text: string) {
  return new TextEncoder().encode(text);
}

async function hmacSha256(key: string, data: string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    textToArrayBuffer(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, textToArrayBuffer(data));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifySlackSignature(request: Request, rawBody: string, env: any) {
  const timestamp = request.headers.get('X-Slack-Request-Timestamp');
  const signature = request.headers.get('X-Slack-Signature');
  if (!timestamp || !signature || !env?.SLACK_SIGNING_SECRET) return false;

  // Reject old requests (5 minutes).
  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const digest = await hmacSha256(env.SLACK_SIGNING_SECRET, base);
  const expected = `v0=${digest}`;
  return expected === signature;
}

export async function postSlackMessage(env: any, payload: { channel: string; text: string }) {
  if (!env?.SLACK_BOT_TOKEN) {
    return { ok: false, error: 'Slack bot token not configured' };
  }
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  return result;
}
