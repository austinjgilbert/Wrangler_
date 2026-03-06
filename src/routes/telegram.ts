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

/** Send "typing" chat action for up to 5 seconds (user sees "typing...") */
async function sendChatAction(token: string, chatId: number, action: string = 'typing'): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch {
    // best-effort
  }
}

/** Telegram message length limit (API will reject longer) */
const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

/** Send a text message with optional inline keyboard (Bot API: reply_markup) */
async function sendTelegramMessage(
  token: string,
  chatId: number,
  text: string,
  opts?: { reply_markup?: { inline_keyboard?: Array<Array<{ text: string; url?: string; callback_data?: string }>> } },
): Promise<boolean> {
  try {
    const truncated = text.length > TELEGRAM_MAX_MESSAGE_LENGTH
      ? text.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH - 20) + '\n\n… (truncated)'
      : text;
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: truncated,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };
    if (opts?.reply_markup) body.reply_markup = opts.reply_markup;
    const resp = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      console.error('[Telegram] sendMessage failed:', resp.status, errBody);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[Telegram] sendMessage failed:', (e as Error).message);
    return false;
  }
}

/** Answer a callback query (required after inline button press to clear loading state) */
async function answerCallbackQuery(token: string, callbackQueryId: string, text?: string): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text?.slice(0, 200) }),
    });
  } catch {
    // best-effort
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

  // ── Callback query (inline button press) ───────────────────────────────
  const callbackQuery = body?.callback_query;
  if (callbackQuery?.id && callbackQuery?.data && callbackQuery?.message?.chat?.id) {
    const cqId = callbackQuery.id;
    const chatId = callbackQuery.message.chat.id;
    const data = String(callbackQuery.data);
    await answerCallbackQuery(token, cqId);
    if (data.startsWith('enrich:')) {
      const domain = data.replace(/^enrich:/, '').trim();
      if (domain) {
        await sendChatAction(token, chatId);
        const { executeTool, getProgressMessage } = await import('./telegram-tools.ts');
        await sendTelegramMessage(token, chatId, getProgressMessage({ intent: 'enrich_account', domains: [domain] }));
        try {
          const replyText = await executeTool({ intent: 'enrich_account', domains: [domain] }, env, requestId);
          await sendTelegramMessage(token, chatId, `${replyText}\n\n✅ Done.`);
        } catch (e: any) {
          await sendTelegramMessage(token, chatId, `Error: ${(e?.message || String(e)).slice(0, 200)}`);
        }
      }
    }
    return new Response('OK', { status: 200 });
  }

  const message = body?.message;
  if (!message?.chat?.id || !message?.from) {
    return new Response('OK', { status: 200 });
  }

  const chatId = message.chat.id;
  const text = (message.text || '').trim();
  const fromName = message.from.first_name || message.from.username || 'User';

  const reply = async (msg: string, opts?: { reply_markup?: { inline_keyboard?: Array<Array<{ text: string; url?: string; callback_data?: string }>> } }) => {
    await sendTelegramMessage(token, chatId, msg, opts);
  };

  // ── Commands ────────────────────────────────────────────────────────

  if (text === '/start') {
    await reply(
      `Hi ${fromName}! I'm the Molt Content OS bot.\n\n` +
        '<b>Commands</b>\n' +
        '/help — list all commands & phrases\n' +
        '/status — system health\n' +
        '/account &lt;domain&gt; — what we know about an account\n' +
        '/enrich &lt;domain&gt; — run enrichment\n' +
        '/competitors &lt;domain&gt; — competitor research\n' +
        '/compare &lt;d1&gt; &lt;d2&gt; — compare two accounts\n' +
        '/people &lt;domain&gt; — contacts at company\n' +
        '/tech &lt;name&gt; — accounts using this tech\n' +
        '/patterns — tech & pain point patterns\n' +
        '/captures — recent extension captures\n' +
        '/briefing — daily SDR briefing\n' +
        '/jobs — recent enrichment jobs\n' +
        '/network — Moltbook & network updates\n' +
        '/teach — research network & explain cutting edge\n' +
        '/trends — rising/falling themes\n' +
        '/moltbook [post <message>] — feed or post to Moltbook\n' +
        '/status — system health\n\n' +
        'Or just say: "what do we know about example.com", "good morning", etc.',
    );
    return new Response('OK', { status: 200 });
  }

  // ── Parse intent and execute tool ────────────────────────────────────

  const { parseIntent, executeTool, getHelpText } = await import('./telegram-tools.ts');

  if (text === '/help') {
    await reply(getHelpText());
    return new Response('OK', { status: 200 });
  }

  const baseUrl = (env && (env.BASE_URL || env.MOLT_TOOL_BASE_URL)) ? String(env.BASE_URL || env.MOLT_TOOL_BASE_URL).replace(/\/$/, '') : 'https://website-scanner.austin-gilbert.workers.dev';

  // ── Slash commands with optional args ─────────────────────────────────

  const cmdMatch = text.match(/^\/(\w+)(?:\s+(.+))?$/s);
  if (cmdMatch) {
    const cmd = cmdMatch[1].toLowerCase();
    const args = (cmdMatch[2] || '').trim();
    const argList = args ? args.split(/\s+/).filter(Boolean) : [];
    const { executeTool, getProgressMessage, getViewUrl } = await import('./telegram-tools.ts');
    type Intent = import('./telegram-tools.ts').ParsedIntent;

    const run = async (parsed: Intent) => {
      try {
        await sendChatAction(token, chatId);
        await reply(getProgressMessage(parsed));
        const replyText = await executeTool(parsed, env, requestId);
        const viewUrl = getViewUrl(parsed, baseUrl);
        const singleDomain = (parsed.intent === 'account_lookup' || parsed.intent === 'enrich_account') && parsed.domains?.length === 1 ? parsed.domains[0] : null;
        const done = viewUrl
          ? `${replyText}\n\n✅ Done.\n📄 View: ${viewUrl}`
          : `${replyText}\n\n✅ Done.`;
        const replyMarkup = singleDomain
          ? {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📄 View account', url: `${baseUrl}/accounts/${encodeURIComponent(singleDomain)}` }, { text: '⏳ Enrich', callback_data: `enrich:${singleDomain}` }],
                ],
              },
            }
          : undefined;
        await reply(done, replyMarkup);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        await reply(`Error: ${errMsg.slice(0, 200)}`);
      }
    };

    if (cmd === 'account') {
      if (argList[0]) await run({ intent: 'account_lookup', domains: [argList[0].replace(/^www\./, '')] });
      else await reply('Usage: /account <domain>\nExample: /account example.com');
      return new Response('OK', { status: 200 });
    }
    if (cmd === 'enrich') {
      if (argList[0]) await run({ intent: 'enrich_account', domains: [argList[0].replace(/^www\./, '')] });
      else await reply('Usage: /enrich <domain>\nExample: /enrich example.com');
      return new Response('OK', { status: 200 });
    }
    if (cmd === 'competitors') {
      if (argList[0]) await run({ intent: 'competitors', domains: [argList[0].replace(/^www\./, '')] });
      else await reply('Usage: /competitors <domain or company>\nExample: /competitors example.com');
      return new Response('OK', { status: 200 });
    }
    if (cmd === 'compare') {
      if (argList.length >= 2) await run({ intent: 'compare', domains: [argList[0], argList[1]] });
      else await reply('Usage: /compare <domain1> <domain2>\nExample: /compare a.com b.com');
      return new Response('OK', { status: 200 });
    }
    if (cmd === 'people') {
      if (argList[0]) await run({ intent: 'person_lookup', domains: [argList[0].replace(/^www\./, '')] });
      else await reply('Usage: /people <domain>\nExample: /people example.com');
      return new Response('OK', { status: 200 });
    }
    if (cmd === 'tech') {
      if (args) await run({ intent: 'accounts_by_tech', tech: args });
      else await reply('Usage: /tech <technology>\nExample: /tech React');
      return new Response('OK', { status: 200 });
    }
    if (cmd === 'captures') {
      await run({ intent: 'recent_captures' });
      return new Response('OK', { status: 200 });
    }
    if (cmd === 'briefing') {
      await run({ intent: 'sdr_briefing' });
      return new Response('OK', { status: 200 });
    }
    if (cmd === 'jobs') {
      await run({ intent: 'jobs_list' });
      return new Response('OK', { status: 200 });
    }
    if (cmd === 'status') {
      await run({ intent: 'status' });
      return new Response('OK', { status: 200 });
    }
    if (cmd === 'network') {
      await run({ intent: 'network_updates' });
      return new Response('OK', { status: 200 });
    }
    if (cmd === 'teach') {
      await run({ intent: 'network_teach' });
      return new Response('OK', { status: 200 });
    }
    if (cmd === 'trends') {
      await run({ intent: 'network_trends' });
      return new Response('OK', { status: 200 });
    }
    if (cmd === 'moltbook') {
      const sub = (argList[0] || '').toLowerCase();
      if (sub === 'post' && argList.length > 1) {
        await run({ intent: 'moltbook_post', moltbookMessage: argList.slice(1).join(' ').trim() });
      } else if (!args || sub === 'feed' || sub === '') {
        await run({ intent: 'network_updates' });
      } else {
        await reply('Usage: /moltbook — show feed\n/moltbook post <message> — post to Moltbook');
      }
      return new Response('OK', { status: 200 });
    }
  }

  // ── Natural language (and unknown slash commands) ───────────────────────

  try {
    const { parseIntent, executeTool, getProgressMessage, getViewUrl } = await import('./telegram-tools.ts');
    const parsed = parseIntent(text);
    await sendChatAction(token, chatId);
    await reply(getProgressMessage(parsed));
    const replyText = await executeTool(parsed, env, requestId);
    const viewUrl = getViewUrl(parsed, baseUrl);
    const singleDomain = (parsed.intent === 'account_lookup' || parsed.intent === 'enrich_account') && parsed.domains?.length === 1 ? parsed.domains[0] : null;
    const done = viewUrl
      ? `${replyText}\n\n✅ Done.\n📄 View: ${viewUrl}`
      : `${replyText}\n\n✅ Done.`;
    const replyMarkup = singleDomain
      ? { reply_markup: { inline_keyboard: [[{ text: '📄 View account', url: `${baseUrl}/accounts/${encodeURIComponent(singleDomain)}` }, { text: '⏳ Enrich', callback_data: `enrich:${singleDomain}` }]] } }
      : undefined;
    await reply(done, replyMarkup);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error('[Telegram] executeTool failed:', errMsg);
    await reply(`Something went wrong: ${errMsg.slice(0, 200)}`);
  }
  return new Response('OK', { status: 200 });
}
