/**
 * Telegram Webhook Handler
 *
 * POST /webhooks/telegram
 *
 * Receives updates from Telegram Bot API when users message the bot.
 * Handles commands: /start, /help, /patterns, /status
 * And natural language: "find patterns for X", "enrich example.com"
 *
 * Setup:
 *   1. Create a bot via @BotFather on Telegram, get the token.
 *   2. Set TELEGRAM_BOT_TOKEN: wrangler secret put TELEGRAM_BOT_TOKEN
 *   3. Set webhook: POST https://api.telegram.org/bot<TOKEN>/setWebhook
 *      Body: { "url": "https://website-scanner.austin-gilbert.workers.dev/webhooks/telegram" }
 */

const TELEGRAM_API = 'https://api.telegram.org/bot';

async function sendTelegramMessage(token: string, chatId: number, text: string): Promise<boolean> {
  try {
    const resp = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    return resp.ok;
  } catch (e) {
    console.error('[Telegram] sendMessage failed:', (e as Error).message);
    return false;
  }
}

export async function handleTelegramWebhook(request: Request, requestId: string, env: any) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set');
    return new Response('OK', { status: 200 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response('OK', { status: 200 });
  }

  const message = body?.message;
  if (!message?.chat?.id || !message?.from) {
    return new Response('OK', { status: 200 });
  }

  const chatId = message.chat.id;
  const text = (message.text || '').trim();
  const fromName = message.from.first_name || message.from.username || 'User';

  const reply = async (msg: string) => {
    await sendTelegramMessage(token, chatId, msg);
  };

  // ── Commands ────────────────────────────────────────────────────────

  if (text === '/start') {
    await reply(
      `Hi ${fromName}! I'm the Molt Content OS bot.\n\n` +
        'Commands:\n' +
        '/help - List commands\n' +
        '/patterns - Show tech & pain point patterns from Sanity\n' +
        '/status - System health\n\n' +
        "Just say: \"what do we know about example.com\", \"enrich fleetfeet.com\", \"competitors of Acme\", \"good morning\", etc.",
    );
    return new Response('OK', { status: 200 });
  }

  // ── Parse intent and execute tool ────────────────────────────────────

  const { parseIntent, executeTool, getHelpText } = await import('./telegram-tools.ts');

  if (text === '/help') {
    await reply(getHelpText());
    return new Response('OK', { status: 200 });
  }

  const parsed = parseIntent(text);
  const replyText = await executeTool(parsed, env, requestId);
  await reply(replyText);
  return new Response('OK', { status: 200 });
}
