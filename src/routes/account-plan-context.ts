/**
 * Account Plan Context Generator
 *
 * Routes:
 *   GET  /account-plan/context              → HTML page (input form + output panel)
 *   POST /account-plan/context/generate     → Generate 4 context blocks via LLM
 *   POST /account-plan/context/save         → Save draft to Sanity
 *   GET  /account-plan/context/recent       → List recent drafts
 *   POST /account-plan/context/ingest       → Chrome extension ingest (capture → redirect)
 *   GET  /account-plan/context/draft/:id    → Fetch a single draft by ID
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';
import { callLlm, extractTextFromImage } from '../lib/llm.ts';
import { buildAbmPromptMessages, parseAbmResponse } from '../lib/abm-prompt.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

interface GenerateBody {
  accountName: string;
  rawInputText: string;
  screenshots?: Array<{ dataUrl?: string; fileRef?: string }>;
  capturedSources?: Array<{ type: string; value: string; title?: string; ts?: string }>;
  structuredData?: {
    sourceType?: string;
    accounts?: string;
    people?: string;
    technologies?: string[];
    signals?: string;
  };
}

interface SaveBody {
  accountName: string;
  rawInputText?: string;
  extractedText?: string;
  capturedSources?: Array<{ type: string; value: string; title?: string; ts?: string }>;
  outputSalesNavigator: string;
  outputIntentSignals: string;
  outputStakeholders: string;
  outputAdditionalContext: string;
  templatePlanId?: string;
}

// ─── Generate endpoint ──────────────────────────────────────────────────────

export async function handleContextGenerate(
  request: Request,
  requestId: string,
  env: any,
): Promise<Response> {
  try {
    const body = (await request.json()) as GenerateBody;

    if (!body.accountName?.trim()) {
      return createErrorResponse('VALIDATION_ERROR', 'accountName is required', {}, 400, requestId);
    }

    // 1. Extract text from screenshots (if any)
    let extractedScreenshotText = '';
    const screenshots = body.screenshots || [];
    if (screenshots.length > 0) {
      const apiKey = env.LLM_API_KEY || env.OPENAI_API_KEY;
      if (!apiKey) {
        return createErrorResponse(
          'LLM_NOT_CONFIGURED',
          'LLM_API_KEY required for screenshot text extraction. Set via: wrangler secret put LLM_API_KEY',
          {},
          503,
          requestId,
        );
      }

      const extractions: string[] = [];
      for (const ss of screenshots.slice(0, 5)) {
        if (!ss.dataUrl) continue;
        try {
          const text = await extractTextFromImage(env, ss.dataUrl);
          if (text && text !== 'No text found.') {
            extractions.push(text);
          }
        } catch (err: any) {
          extractions.push(`[Screenshot extraction failed: ${err.message}]`);
        }
      }
      extractedScreenshotText = extractions.join('\n\n---\n\n');
    }

    // 2. Build LLM prompt
    const messages = buildAbmPromptMessages({
      accountName: body.accountName.trim(),
      rawInput: body.rawInputText || '',
      extractedScreenshotText,
      capturedSources: body.capturedSources,
      structuredData: body.structuredData,
    });

    // 3. Call LLM
    const llmResult = await callLlm(env, messages, {
      temperature: 0.15,
      maxTokens: 3000,
      json: true,
    });

    // 4. Parse response
    const blocks = parseAbmResponse(llmResult.content);

    return createSuccessResponse(
      {
        ...blocks,
        extractedText: extractedScreenshotText || undefined,
        model: llmResult.model,
        usage: llmResult.usage,
      },
      requestId,
    );
  } catch (error: any) {
    return createErrorResponse('GENERATE_ERROR', error.message, {}, 500, requestId);
  }
}

// ─── Save endpoint ──────────────────────────────────────────────────────────

export async function handleContextSave(
  request: Request,
  requestId: string,
  env: any,
): Promise<Response> {
  try {
    const body = (await request.json()) as SaveBody;

    if (!body.accountName?.trim()) {
      return createErrorResponse('VALIDATION_ERROR', 'accountName is required', {}, 400, requestId);
    }

    const { initSanityClient, upsertDocument } = await import('../sanity-client.js');
    const client = initSanityClient(env);
    if (!client) {
      return createErrorResponse('SANITY_ERROR', 'Sanity not configured', {}, 503, requestId);
    }

    const draftId = `abmDraft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const doc = {
      _type: 'accountPlanContextDraft',
      _id: draftId,
      accountName: body.accountName.trim(),
      rawInputText: (body.rawInputText || '').slice(0, 50000),
      extractedTextFromScreenshots: (body.extractedText || '').slice(0, 50000),
      capturedSources: body.capturedSources || [],
      outputSalesNavigator: body.outputSalesNavigator || '',
      outputIntentSignals: body.outputIntentSignals || '',
      outputStakeholders: body.outputStakeholders || '',
      outputAdditionalContext: body.outputAdditionalContext || '',
      templatePlanId: body.templatePlanId || null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertDocument(client, doc);

    return createSuccessResponse({ draftId, createdAt: now }, requestId);
  } catch (error: any) {
    return createErrorResponse('SAVE_ERROR', error.message, {}, 500, requestId);
  }
}

// ─── Recent drafts endpoint ─────────────────────────────────────────────────

export async function handleContextRecent(
  request: Request,
  requestId: string,
  env: any,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const accountName = url.searchParams.get('accountName') || '';

    const { initSanityClient, groqQuery } = await import('../sanity-client.js');
    const client = initSanityClient(env);
    if (!client) {
      return createErrorResponse('SANITY_ERROR', 'Sanity not configured', {}, 503, requestId);
    }

    let query: string;
    const params: Record<string, string> = {};

    if (accountName.trim()) {
      query = `*[_type == "accountPlanContextDraft" && accountName == $name] | order(createdAt desc)[0...20]{
        _id, accountName, createdAt, updatedAt,
        "preview": outputSalesNavigator[0...120]
      }`;
      params.name = accountName.trim();
    } else {
      query = `*[_type == "accountPlanContextDraft"] | order(createdAt desc)[0...20]{
        _id, accountName, createdAt, updatedAt,
        "preview": outputSalesNavigator[0...120]
      }`;
    }

    const drafts = await groqQuery(client, query, params);

    return createSuccessResponse({ drafts: drafts || [] }, requestId);
  } catch (error: any) {
    return createErrorResponse('RECENT_ERROR', error.message, {}, 500, requestId);
  }
}

// ─── Fetch single draft ─────────────────────────────────────────────────────

export async function handleContextDraftGet(
  request: Request,
  requestId: string,
  env: any,
  draftId: string,
): Promise<Response> {
  try {
    const { initSanityClient, getDocument } = await import('../sanity-client.js');
    const client = initSanityClient(env);
    if (!client) {
      return createErrorResponse('SANITY_ERROR', 'Sanity not configured', {}, 503, requestId);
    }

    const result = await getDocument(client, draftId);
    // getDocument returns the doc, an array, or null depending on the query.
    const draft = Array.isArray(result) ? result[0] : result;
    if (!draft || !draft._id) {
      return createErrorResponse('NOT_FOUND', 'Draft not found', {}, 404, requestId);
    }

    return createSuccessResponse({ draft }, requestId);
  } catch (error: any) {
    return createErrorResponse('DRAFT_ERROR', error.message, {}, 500, requestId);
  }
}

// ─── Extension ingest endpoint ──────────────────────────────────────────────

export async function handleContextIngest(
  request: Request,
  requestId: string,
  env: any,
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      accountName?: string;
      selectedText?: string;
      pageUrl?: string;
      pageTitle?: string;
      screenshotDataUrl?: string;
      extractedData?: {
        source?: string;
        accounts?: Array<Record<string, any>>;
        people?: Array<Record<string, any>>;
        technologies?: string[];
        signals?: Array<Record<string, any>>;
        metadata?: Record<string, any>;
        rawText?: string;
      };
    };

    const { initSanityClient, upsertDocument } = await import('../sanity-client.js');
    const client = initSanityClient(env);
    if (!client) {
      return createErrorResponse('SANITY_ERROR', 'Sanity not configured', {}, 503, requestId);
    }

    const draftId = `abmDraft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const ext = body.extractedData;

    const capturedSources: Array<{ type: string; value: string; title?: string; ts: string }> = [];
    if (body.pageUrl) {
      capturedSources.push({ type: 'url', value: body.pageUrl, title: body.pageTitle, ts: now });
    }
    if (body.selectedText) {
      capturedSources.push({ type: 'selected_text', value: body.selectedText.slice(0, 15000), ts: now });
    }

    // Build the raw input from all available data
    const rawParts: string[] = [];
    if (body.selectedText?.trim()) rawParts.push(body.selectedText.trim());
    if (ext?.rawText?.trim()) rawParts.push(ext.rawText.trim());

    const doc: Record<string, any> = {
      _type: 'accountPlanContextDraft',
      _id: draftId,
      accountName: body.accountName || body.pageTitle || 'Unknown Account',
      rawInputText: rawParts.join('\n\n---\n\n').slice(0, 50000),
      extractedTextFromScreenshots: '',
      capturedSources,
      sourceType: ext?.source || 'manual',
      extractedAccounts: (ext?.accounts || []).slice(0, 20).map(a => JSON.stringify(a)).join('\n'),
      extractedPeople: (ext?.people || []).slice(0, 20).map(p => JSON.stringify(p)).join('\n'),
      extractedTechnologies: (ext?.technologies || []).slice(0, 50),
      extractedSignals: (ext?.signals || []).slice(0, 20).map(s => JSON.stringify(s)).join('\n'),
      pageMetadata: ext?.metadata ? JSON.stringify(ext.metadata) : '',
      outputSalesNavigator: '',
      outputIntentSignals: '',
      outputStakeholders: '',
      outputAdditionalContext: '',
      templatePlanId: null,
      createdAt: now,
      updatedAt: now,
    };

    // If screenshot was included, store the data URL in capturedSources
    if (body.screenshotDataUrl) {
      capturedSources.push({ type: 'screenshot', value: '[screenshot attached]', ts: now });
      doc.screenshotDataUrl = body.screenshotDataUrl.slice(0, 500000);
    }

    await upsertDocument(client, doc);

    return createSuccessResponse({ draftId, accountName: doc.accountName }, requestId);
  } catch (error: any) {
    return createErrorResponse('INGEST_ERROR', error.message, {}, 500, requestId);
  }
}

// ─── HTML Page ──────────────────────────────────────────────────────────────

export async function handleContextPage(
  request: Request,
  requestId: string,
  env: any,
): Promise<Response> {
  const url = new URL(request.url);
  const draftId = url.searchParams.get('draftId') || '';
  const accountNameParam = url.searchParams.get('accountName') || '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Account Plan Context Generator</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f1f5f9; color: #1a1a1a; line-height: 1.5; }
    .container { max-width: 960px; margin: 0 auto; padding: 1.5rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
    .subtitle { color: #64748b; font-size: 0.9rem; margin-bottom: 1.5rem; }

    /* Cards */
    .card { background: #fff; border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .card-title { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 0.75rem; }

    /* Form elements */
    label { display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 0.25rem; }
    input[type="text"], textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.6rem 0.75rem; font-size: 0.9rem; font-family: inherit; outline: none; transition: border-color 0.15s; }
    input[type="text"]:focus, textarea:focus { border-color: #0f766e; box-shadow: 0 0 0 2px rgba(15,118,110,0.15); }
    textarea { resize: vertical; min-height: 120px; }

    /* Buttons */
    .btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s; }
    .btn--primary { background: #0f766e; color: #fff; }
    .btn--primary:hover { background: #0d6961; }
    .btn--primary:disabled { background: #94a3b8; cursor: not-allowed; }
    .btn--secondary { background: #e2e8f0; color: #334155; }
    .btn--secondary:hover { background: #cbd5e1; }
    .btn--sm { padding: 0.35rem 0.65rem; font-size: 0.78rem; }
    .btn--copy { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
    .btn--copy:hover { background: #e2e8f0; }

    /* Screenshot uploader */
    .upload-zone { border: 2px dashed #cbd5e1; border-radius: 8px; padding: 1.5rem; text-align: center; color: #64748b; cursor: pointer; transition: all 0.15s; }
    .upload-zone:hover, .upload-zone.drag-over { border-color: #0f766e; background: #f0fdfa; }
    .upload-zone input { display: none; }
    .screenshot-previews { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
    .screenshot-preview { position: relative; width: 80px; height: 60px; border-radius: 6px; overflow: hidden; border: 1px solid #e2e8f0; }
    .screenshot-preview img { width: 100%; height: 100%; object-fit: cover; }
    .screenshot-preview .remove-btn { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; }

    /* Status */
    .status { padding: 0.6rem 0.85rem; border-radius: 8px; font-size: 0.85rem; margin-bottom: 0.75rem; display: none; }
    .status--generating { display: block; background: #fef3c7; color: #92400e; }
    .status--success { display: block; background: #d1fae5; color: #065f46; }
    .status--error { display: block; background: #fee2e2; color: #991b1b; }

    /* Output sections */
    .output-section { margin-bottom: 1rem; }
    .output-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem; }
    .output-label { font-size: 0.8rem; font-weight: 700; color: #0f766e; text-transform: uppercase; letter-spacing: 0.04em; }
    .output-textarea { width: 100%; min-height: 140px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.6rem 0.75rem; font-size: 0.85rem; font-family: inherit; resize: vertical; background: #fafbfc; }
    .output-textarea:focus { border-color: #0f766e; background: #fff; }

    /* Actions bar */
    .actions-bar { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }

    /* Extracted data panel */
    .extracted-panel { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 1rem; margin-top: 0.75rem; }
    .extracted-panel .ep-title { font-size: 0.75rem; font-weight: 700; color: #0369a1; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.4rem; }
    .extracted-panel .ep-source-badge { display: inline-flex; padding: 0.15rem 0.45rem; background: #0ea5e9; color: #fff; border-radius: 6px; font-size: 0.7rem; font-weight: 600; text-transform: capitalize; }
    .ep-section { margin-bottom: 0.5rem; }
    .ep-section-label { font-size: 0.72rem; font-weight: 600; color: #475569; margin-bottom: 0.25rem; }
    .ep-items { display: flex; flex-wrap: wrap; gap: 0.3rem; }
    .ep-item { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.2rem 0.5rem; border-radius: 10px; font-size: 0.73rem; line-height: 1.3; }
    .ep-item--account { background: #dbeafe; color: #1e40af; }
    .ep-item--person { background: #ede9fe; color: #5b21b6; }
    .ep-item--tech { background: #d1fae5; color: #065f46; }
    .ep-item--signal { background: #fef3c7; color: #92400e; }
    .ep-person-detail { color: #64748b; font-size: 0.68rem; }

    /* History drawer */
    .history-panel { margin-top: 1rem; }
    .history-item { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem; cursor: pointer; }
    .history-item:hover { background: #f8fafc; }
    .history-item .account { font-weight: 600; }
    .history-item .date { color: #94a3b8; font-size: 0.78rem; }

    /* Grid */
    .form-row { display: grid; grid-template-columns: 1fr; gap: 0.75rem; margin-bottom: 0.75rem; }
    @media (min-width: 640px) { .form-row--2 { grid-template-columns: 1fr 1fr; } }

    /* Captured sources chips */
    .source-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.35rem; }
    .chip { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.2rem 0.5rem; background: #e0f2fe; color: #0369a1; border-radius: 12px; font-size: 0.75rem; }
    .chip .chip-remove { cursor: pointer; font-weight: bold; margin-left: 0.15rem; }

    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Account Plan Context Generator</h1>
    <p class="subtitle">Paste research, upload screenshots, and generate structured context for your Sales Command plan.</p>

    <div id="status" class="status"></div>

    <!-- INPUT CARD -->
    <div class="card">
      <div class="card-title">Research Input</div>

      <div class="form-row">
        <div>
          <label for="accountName">Account Name *</label>
          <input type="text" id="accountName" placeholder="e.g. Acme Corp" value="${esc(accountNameParam)}">
        </div>
      </div>

      <div class="form-row">
        <div>
          <label for="rawInput">Research Dump (paste anything)</label>
          <textarea id="rawInput" rows="8" placeholder="Paste company overview, LinkedIn notes, competitor intel, stakeholder info, signals, news, anything..."></textarea>
        </div>
      </div>

      <div class="form-row">
        <div>
          <label>Screenshots (optional)</label>
          <div class="upload-zone" id="uploadZone">
            <input type="file" id="fileInput" accept="image/*" multiple>
            Click or drag images here (max 5)
          </div>
          <div class="screenshot-previews" id="previews"></div>
        </div>
      </div>

      <!-- EXTRACTED DATA PANEL (populated from extension ingest) -->
      <div id="extractedPanel" class="extracted-panel" style="display:none;">
        <div class="ep-title">
          <span>Extracted from page</span>
          <span class="ep-source-badge" id="epSourceBadge"></span>
        </div>
        <div id="epAccounts" class="ep-section" style="display:none;">
          <div class="ep-section-label">Accounts</div>
          <div class="ep-items" id="epAccountItems"></div>
        </div>
        <div id="epPeople" class="ep-section" style="display:none;">
          <div class="ep-section-label">People</div>
          <div class="ep-items" id="epPeopleItems"></div>
        </div>
        <div id="epTech" class="ep-section" style="display:none;">
          <div class="ep-section-label">Technologies</div>
          <div class="ep-items" id="epTechItems"></div>
        </div>
        <div id="epSignals" class="ep-section" style="display:none;">
          <div class="ep-section-label">Signals</div>
          <div class="ep-items" id="epSignalItems"></div>
        </div>
      </div>

      <div class="form-row">
        <div>
          <label>Captured Sources</label>
          <div class="source-chips" id="capturedChips"></div>
          <div style="margin-top: 0.35rem; display: flex; gap: 0.35rem;">
            <input type="text" id="addSourceInput" placeholder="Add a URL or note..." style="flex:1;">
            <button class="btn btn--secondary btn--sm" id="addSourceBtn">Add</button>
          </div>
        </div>
      </div>

      <div class="actions-bar">
        <button class="btn btn--primary" id="generateBtn">Generate Context</button>
      </div>
    </div>

    <!-- OUTPUT CARD -->
    <div class="card" id="outputCard" style="display:none;">
      <div class="card-title">Generated Context</div>

      <div class="output-section">
        <div class="output-header">
          <span class="output-label">1. Sales Navigator</span>
          <button class="btn btn--copy btn--sm" data-target="outSalesNav">Copy</button>
        </div>
        <textarea class="output-textarea" id="outSalesNav" rows="6"></textarea>
      </div>

      <div class="output-section">
        <div class="output-header">
          <span class="output-label">2. Intent Signals</span>
          <button class="btn btn--copy btn--sm" data-target="outIntent">Copy</button>
        </div>
        <textarea class="output-textarea" id="outIntent" rows="6"></textarea>
      </div>

      <div class="output-section">
        <div class="output-header">
          <span class="output-label">3. Stakeholders</span>
          <button class="btn btn--copy btn--sm" data-target="outStakeholders">Copy</button>
        </div>
        <textarea class="output-textarea" id="outStakeholders" rows="8"></textarea>
      </div>

      <div class="output-section">
        <div class="output-header">
          <span class="output-label">4. Additional Context</span>
          <button class="btn btn--copy btn--sm" data-target="outAdditional">Copy</button>
        </div>
        <textarea class="output-textarea" id="outAdditional" rows="6"></textarea>
      </div>

      <div class="actions-bar">
        <button class="btn btn--primary" id="copyAllBtn">Copy All</button>
        <button class="btn btn--secondary" id="saveBtn">Save Draft</button>
        <span id="saveStatus" style="font-size:0.8rem; color:#64748b;"></span>
      </div>
    </div>

    <!-- HISTORY CARD -->
    <div class="card history-panel">
      <div class="card-title">Recent Drafts</div>
      <div id="historyList"><p style="color:#94a3b8; font-size:0.85rem;">Loading...</p></div>
    </div>
  </div>

  <script>
    const BASE = window.location.origin;
    let screenshots = [];
    let capturedSources = [];
    let structuredData = null; // holds { sourceType, accounts, people, technologies, signals }

    // ── Screenshot upload ───────────────────────────────────
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const previews = document.getElementById('previews');

    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', (e) => { e.preventDefault(); uploadZone.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });
    fileInput.addEventListener('change', () => handleFiles(fileInput.files));

    function handleFiles(files) {
      for (const f of files) {
        if (screenshots.length >= 5) break;
        if (!f.type.startsWith('image/')) continue;
        const reader = new FileReader();
        reader.onload = (e) => {
          screenshots.push(e.target.result);
          renderPreviews();
        };
        reader.readAsDataURL(f);
      }
    }

    function renderPreviews() {
      previews.innerHTML = screenshots.map((s, i) =>
        '<div class="screenshot-preview"><img src="' + s + '"><button class="remove-btn" data-idx="' + i + '">&times;</button></div>'
      ).join('');
      previews.querySelectorAll('.remove-btn').forEach(b => {
        b.addEventListener('click', () => { screenshots.splice(+b.dataset.idx, 1); renderPreviews(); });
      });
    }

    // ── Captured sources ────────────────────────────────────
    const chipsEl = document.getElementById('capturedChips');
    document.getElementById('addSourceBtn').addEventListener('click', () => {
      const input = document.getElementById('addSourceInput');
      const val = input.value.trim();
      if (!val) return;
      const type = val.startsWith('http') ? 'url' : 'note';
      capturedSources.push({ type, value: val });
      input.value = '';
      renderChips();
    });

    function renderChips() {
      chipsEl.innerHTML = capturedSources.map((s, i) => {
        const label = s.type === 'url' ? 'URL' : s.type === 'selected_text' ? 'Text' : 'Note';
        return '<span class="chip">' + label + ': ' + s.value.substring(0, 40) + (s.value.length > 40 ? '...' : '') + ' <span class="chip-remove" data-idx="' + i + '">&times;</span></span>';
      }).join('');
      chipsEl.querySelectorAll('.chip-remove').forEach(b => {
        b.addEventListener('click', () => { capturedSources.splice(+b.dataset.idx, 1); renderChips(); });
      });
    }

    // ── Render extracted data panel ────────────────────────
    function renderExtractedPanel() {
      const panel = document.getElementById('extractedPanel');
      if (!structuredData) { panel.style.display = 'none'; return; }
      panel.style.display = '';

      // Source badge
      document.getElementById('epSourceBadge').textContent = structuredData.sourceType || 'page';

      // Accounts
      const acctItems = document.getElementById('epAccountItems');
      const accounts = parseJsonLines(structuredData.accounts || '');
      if (accounts.length > 0) {
        document.getElementById('epAccounts').style.display = '';
        acctItems.innerHTML = accounts.map(a => {
          const name = a.name || a.domain || 'Unknown';
          const detail = [a.industry, a.employeeCount, a.headquarters].filter(Boolean).join(' · ');
          return '<span class="ep-item ep-item--account">' + escH(name) + (detail ? ' <span class="ep-person-detail">(' + escH(detail) + ')</span>' : '') + '</span>';
        }).join('');
      } else {
        document.getElementById('epAccounts').style.display = 'none';
      }

      // People
      const peopleItems = document.getElementById('epPeopleItems');
      const people = parseJsonLines(structuredData.people || '');
      if (people.length > 0) {
        document.getElementById('epPeople').style.display = '';
        peopleItems.innerHTML = people.map(p => {
          const name = p.name || 'Unknown';
          const detail = [p.headline || p.currentTitle, p.currentCompany].filter(Boolean).join(' @ ');
          return '<span class="ep-item ep-item--person">' + escH(name) + (detail ? ' <span class="ep-person-detail">— ' + escH(detail) + '</span>' : '') + '</span>';
        }).join('');
      } else {
        document.getElementById('epPeople').style.display = 'none';
      }

      // Technologies
      const techItems = document.getElementById('epTechItems');
      const techs = structuredData.technologies || [];
      if (techs.length > 0) {
        document.getElementById('epTech').style.display = '';
        techItems.innerHTML = techs.map(t => '<span class="ep-item ep-item--tech">' + escH(t) + '</span>').join('');
      } else {
        document.getElementById('epTech').style.display = 'none';
      }

      // Signals
      const signalItems = document.getElementById('epSignalItems');
      const signals = parseJsonLines(structuredData.signals || '');
      if (signals.length > 0) {
        document.getElementById('epSignals').style.display = '';
        signalItems.innerHTML = signals.map(s => '<span class="ep-item ep-item--signal">' + escH(s.text || JSON.stringify(s)) + '</span>').join('');
      } else {
        document.getElementById('epSignals').style.display = 'none';
      }
    }

    function parseJsonLines(str) {
      if (!str) return [];
      return str.split('\\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
    }

    function escH(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    // ── Load draft if draftId in URL ────────────────────────
    const urlParams = new URLSearchParams(window.location.search);
    const loadDraftId = urlParams.get('draftId');
    if (loadDraftId) {
      fetch(BASE + '/account-plan/context/draft/' + encodeURIComponent(loadDraftId))
        .then(r => r.json())
        .then(res => {
          if (!res.ok || !res.data?.draft) return;
          const d = res.data.draft;
          document.getElementById('accountName').value = d.accountName || '';
          document.getElementById('rawInput').value = d.rawInputText || '';
          if (d.capturedSources) { capturedSources = d.capturedSources; renderChips(); }

          // Load structured extraction data
          if (d.sourceType || d.extractedAccounts || d.extractedPeople || d.extractedTechnologies || d.extractedSignals) {
            structuredData = {
              sourceType: d.sourceType || '',
              accounts: d.extractedAccounts || '',
              people: d.extractedPeople || '',
              technologies: d.extractedTechnologies || [],
              signals: d.extractedSignals || '',
            };
            renderExtractedPanel();
          }

          if (d.outputSalesNavigator) {
            document.getElementById('outSalesNav').value = d.outputSalesNavigator;
            document.getElementById('outIntent').value = d.outputIntentSignals || '';
            document.getElementById('outStakeholders').value = d.outputStakeholders || '';
            document.getElementById('outAdditional').value = d.outputAdditionalContext || '';
            document.getElementById('outputCard').style.display = '';
          }
        }).catch(() => {});
    }

    // ── Generate ────────────────────────────────────────────
    const generateBtn = document.getElementById('generateBtn');
    const statusEl = document.getElementById('status');
    const outputCard = document.getElementById('outputCard');

    generateBtn.addEventListener('click', async () => {
      const accountName = document.getElementById('accountName').value.trim();
      if (!accountName) { setStatus('error', 'Account name is required.'); return; }

      const rawInputText = document.getElementById('rawInput').value;
      if (!rawInputText.trim() && screenshots.length === 0 && capturedSources.length === 0) {
        setStatus('error', 'Provide at least some research input, a screenshot, or a captured source.');
        return;
      }

      generateBtn.disabled = true;
      setStatus('generating', 'Generating context blocks...');

      try {
        const body = {
          accountName,
          rawInputText,
          screenshots: screenshots.map(s => ({ dataUrl: s })),
          capturedSources,
          structuredData: structuredData || undefined,
        };

        const res = await fetch(BASE + '/account-plan/context/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!data.ok) {
          setStatus('error', data.error?.message || 'Generation failed.');
          return;
        }

        document.getElementById('outSalesNav').value = data.data.salesNavigator || '';
        document.getElementById('outIntent').value = data.data.intentSignals || '';
        document.getElementById('outStakeholders').value = data.data.stakeholders || '';
        document.getElementById('outAdditional').value = data.data.additionalContext || '';
        outputCard.style.display = '';
        setStatus('success', 'Context generated. Edit fields as needed, then Copy or Save.');
      } catch (err) {
        setStatus('error', 'Network error: ' + err.message);
      } finally {
        generateBtn.disabled = false;
      }
    });

    function setStatus(type, msg) {
      statusEl.className = 'status status--' + type;
      statusEl.textContent = msg;
      if (type === 'success' || type === 'error') {
        setTimeout(() => { statusEl.className = 'status'; statusEl.textContent = ''; }, 6000);
      }
    }

    // ── Copy buttons ────────────────────────────────────────
    document.querySelectorAll('.btn--copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const ta = document.getElementById(btn.dataset.target);
        if (!ta) return;
        navigator.clipboard.writeText(ta.value).then(() => {
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        });
      });
    });

    document.getElementById('copyAllBtn').addEventListener('click', () => {
      const all = [
        '=== SALES NAVIGATOR ===\\n' + document.getElementById('outSalesNav').value,
        '\\n=== INTENT SIGNALS ===\\n' + document.getElementById('outIntent').value,
        '\\n=== STAKEHOLDERS ===\\n' + document.getElementById('outStakeholders').value,
        '\\n=== ADDITIONAL CONTEXT ===\\n' + document.getElementById('outAdditional').value,
      ].join('\\n');
      navigator.clipboard.writeText(all).then(() => {
        const btn = document.getElementById('copyAllBtn');
        btn.textContent = 'Copied All!';
        setTimeout(() => { btn.textContent = 'Copy All'; }, 1500);
      });
    });

    // ── Save ────────────────────────────────────────────────
    document.getElementById('saveBtn').addEventListener('click', async () => {
      const saveStatus = document.getElementById('saveStatus');
      saveStatus.textContent = 'Saving...';
      try {
        const body = {
          accountName: document.getElementById('accountName').value.trim(),
          rawInputText: document.getElementById('rawInput').value,
          capturedSources,
          outputSalesNavigator: document.getElementById('outSalesNav').value,
          outputIntentSignals: document.getElementById('outIntent').value,
          outputStakeholders: document.getElementById('outStakeholders').value,
          outputAdditionalContext: document.getElementById('outAdditional').value,
        };
        const res = await fetch(BASE + '/account-plan/context/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.ok) {
          saveStatus.textContent = 'Saved!';
          loadHistory();
        } else {
          saveStatus.textContent = 'Save failed: ' + (data.error?.message || 'unknown');
        }
      } catch (err) {
        saveStatus.textContent = 'Error: ' + err.message;
      }
      setTimeout(() => { saveStatus.textContent = ''; }, 4000);
    });

    // ── History ─────────────────────────────────────────────
    async function loadHistory() {
      const el = document.getElementById('historyList');
      try {
        const acct = document.getElementById('accountName').value.trim();
        const qs = acct ? '?accountName=' + encodeURIComponent(acct) : '';
        const res = await fetch(BASE + '/account-plan/context/recent' + qs);
        const data = await res.json();
        const drafts = data.data?.drafts || [];
        if (drafts.length === 0) {
          el.innerHTML = '<p style="color:#94a3b8; font-size:0.85rem;">No drafts yet.</p>';
          return;
        }
        el.innerHTML = drafts.map(d =>
          '<div class="history-item" data-id="' + d._id + '">' +
          '<span class="account">' + (d.accountName || 'Unknown') + '</span>' +
          '<span class="date">' + new Date(d.createdAt).toLocaleString() + '</span>' +
          '</div>'
        ).join('');
        el.querySelectorAll('.history-item').forEach(item => {
          item.addEventListener('click', () => {
            window.location.href = BASE + '/account-plan/context?draftId=' + encodeURIComponent(item.dataset.id);
          });
        });
      } catch {
        el.innerHTML = '<p style="color:#94a3b8; font-size:0.85rem;">Could not load history.</p>';
      }
    }
    loadHistory();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
