(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/lib/api.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "explainCopilot",
    ()=>explainCopilot,
    "fetchAccountDetail",
    ()=>fetchAccountDetail,
    "fetchAgentRegistry",
    ()=>fetchAgentRegistry,
    "fetchCopilotState",
    ()=>fetchCopilotState,
    "fetchFunctionRegistry",
    ()=>fetchFunctionRegistry,
    "fetchSnapshot",
    ()=>fetchSnapshot,
    "queryCopilot",
    ()=>queryCopilot,
    "runCommand",
    ()=>runCommand,
    "runCopilotAction",
    ()=>runCopilotAction,
    "runDiagnostic",
    ()=>runDiagnostic,
    "runSimulation",
    ()=>runSimulation,
    "streamCopilotQuery",
    ()=>streamCopilotQuery
]);
async function readJson(input, init) {
    const response = await fetch(input, init);
    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || 'Request failed');
    }
    return payload.data;
}
async function fetchSnapshot() {
    return readJson('/api/console/snapshot', {
        cache: 'no-store'
    });
}
async function fetchAccountDetail(accountId) {
    return readJson(`/api/console/account/${encodeURIComponent(accountId)}`, {
        cache: 'no-store'
    });
}
async function runCommand(command, extra = {}) {
    return readJson('/api/console/command', {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            command,
            ...extra
        })
    });
}
async function runSimulation(input) {
    return readJson('/api/console/simulate', {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify(input)
    });
}
async function runDiagnostic(diagnosticId) {
    return readJson('/api/console/diagnostics', {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            diagnosticId
        })
    });
}
async function fetchCopilotState(context) {
    const url = new URL('/api/console/copilot', window.location.origin);
    if (context.section) url.searchParams.set('section', context.section);
    if (context.accountId) url.searchParams.set('accountId', context.accountId);
    if (context.accountName) url.searchParams.set('accountName', context.accountName);
    return readJson(url.toString(), {
        cache: 'no-store'
    });
}
async function queryCopilot(prompt, context = {}) {
    return readJson('/api/console/copilot/query', {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            prompt,
            context
        })
    });
}
async function explainCopilot(input) {
    return readJson('/api/console/copilot/explain', {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify(input)
    });
}
async function runCopilotAction(command, confirmed = false) {
    return readJson('/api/console/copilot/action', {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            command,
            confirmed
        })
    });
}
async function streamCopilotQuery(prompt, context, handlers) {
    const response = await fetch('/api/console/copilot/stream', {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            prompt,
            context
        })
    });
    if (!response.ok || !response.body) {
        throw new Error('Streaming query failed');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while(true){
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {
            stream: true
        });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines){
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.type === 'message') {
                handlers.onChunk(String(event.chunk || ''));
            }
            if (event.type === 'result') {
                handlers.onResult(event.data);
            }
        }
    }
}
async function fetchFunctionRegistry() {
    return readJson('/api/console/functions', {
        cache: 'no-store'
    });
}
async function fetchAgentRegistry() {
    return readJson('/api/console/agents', {
        cache: 'no-store'
    });
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/operator-console.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OperatorConsole",
    ()=>OperatorConsole
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$activity$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Activity$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/activity.js [app-client] (ecmascript) <export default as Activity>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$beaker$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Beaker$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/beaker.js [app-client] (ecmascript) <export default as Beaker>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bolt$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Bolt$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/bolt.js [app-client] (ecmascript) <export default as Bolt>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$brain$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Brain$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/brain.js [app-client] (ecmascript) <export default as Brain>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/building-2.js [app-client] (ecmascript) <export default as Building2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-right.js [app-client] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$cog$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Cog$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/cog.js [app-client] (ecmascript) <export default as Cog>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$command$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Command$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/command.js [app-client] (ecmascript) <export default as Command>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$gauge$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Gauge$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/gauge.js [app-client] (ecmascript) <export default as Gauge>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-client] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$microscope$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Microscope$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/microscope.js [app-client] (ecmascript) <export default as Microscope>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$right$2d$close$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelRightClose$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/panel-right-close.js [app-client] (ecmascript) <export default as PanelRightClose>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$right$2d$open$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelRightOpen$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/panel-right-open.js [app-client] (ecmascript) <export default as PanelRightOpen>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$radio$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Radio$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/radio.js [app-client] (ecmascript) <export default as Radio>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/refresh-cw.js [app-client] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/search.js [app-client] (ecmascript) <export default as Search>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/settings.js [app-client] (ecmascript) <export default as Settings>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/sparkles.js [app-client] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$round$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__UserRound$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/user-round.js [app-client] (ecmascript) <export default as UserRound>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/api.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
const SIDEBAR_ITEMS = [
    {
        id: 'overview',
        label: 'Overview',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$gauge$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Gauge$3e$__["Gauge"]
    },
    {
        id: 'accounts',
        label: 'Accounts',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"]
    },
    {
        id: 'people',
        label: 'People',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$user$2d$round$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__UserRound$3e$__["UserRound"]
    },
    {
        id: 'signals',
        label: 'Signals',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$radio$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Radio$3e$__["Radio"]
    },
    {
        id: 'patterns',
        label: 'Patterns',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$brain$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Brain$3e$__["Brain"]
    },
    {
        id: 'actions',
        label: 'Actions',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bolt$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Bolt$3e$__["Bolt"]
    },
    {
        id: 'research',
        label: 'Research',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$microscope$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Microscope$3e$__["Microscope"]
    },
    {
        id: 'jobs',
        label: 'Jobs',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings$3e$__["Settings"]
    },
    {
        id: 'metrics',
        label: 'Metrics',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$activity$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Activity$3e$__["Activity"]
    },
    {
        id: 'system-lab',
        label: 'System Lab',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$beaker$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Beaker$3e$__["Beaker"]
    },
    {
        id: 'capabilities',
        label: 'Capabilities',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"]
    },
    {
        id: 'settings',
        label: 'Settings',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$cog$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Cog$3e$__["Cog"]
    }
];
const COMMAND_SUGGESTIONS = [
    'scan nike.com',
    'queue research fleetfeet.com',
    'generate sdr actions',
    'run nightly jobs',
    'refresh stale entities',
    'recalculate scores',
    'run autopilot',
    'preview strategy'
];
const COMMAND_PALETTE_ITEMS = [
    {
        id: 'scan',
        label: 'scan nike.com',
        description: 'Scan a website',
        keywords: [
            'scan',
            'website'
        ]
    },
    {
        id: 'queue-research',
        label: 'queue research fleetfeet.com',
        description: 'Queue research for a domain',
        keywords: [
            'queue',
            'research'
        ]
    },
    {
        id: 'generate-actions',
        label: 'generate sdr actions',
        description: 'Generate SDR action queue',
        keywords: [
            'generate',
            'sdr',
            'actions'
        ]
    },
    {
        id: 'nightly',
        label: 'run nightly jobs',
        description: 'Run nightly intelligence pipeline',
        keywords: [
            'run',
            'nightly',
            'jobs'
        ]
    },
    {
        id: 'refresh',
        label: 'refresh stale entities',
        description: 'Refresh stale entities',
        keywords: [
            'refresh',
            'stale'
        ]
    },
    {
        id: 'recalculate',
        label: 'recalculate scores',
        description: 'Recalculate opportunity scores',
        keywords: [
            'recalculate',
            'scores'
        ]
    },
    {
        id: 'autopilot',
        label: 'run autopilot',
        description: 'Run autopilot cycle',
        keywords: [
            'run',
            'autopilot'
        ]
    },
    {
        id: 'preview',
        label: 'preview strategy',
        description: 'Preview strategy updates',
        keywords: [
            'preview',
            'strategy'
        ]
    }
];
function OperatorConsole() {
    _s();
    const [snapshot, setSnapshot] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [selectedSection, setSelectedSection] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('overview');
    const [selectedAccountId, setSelectedAccountId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [accountDetail, setAccountDetail] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [commandInput, setCommandInput] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [searchQuery, setSearchQuery] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [statusMessage, setStatusMessage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [commandResult, setCommandResult] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [busy, setBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [simDomain, setSimDomain] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('example.com');
    const [simSignals, setSimSignals] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('pricing page visit, docs engagement, hiring signal');
    const [simulationResult, setSimulationResult] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [copilotOpen, setCopilotOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [copilotState, setCopilotState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [copilotPrompt, setCopilotPrompt] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [copilotBusy, setCopilotBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [copilotMessages, setCopilotMessages] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([
        {
            id: 'welcome',
            role: 'assistant',
            text: 'I can explain why things matter, suggest next steps, and safely trigger system capabilities.'
        }
    ]);
    const [pendingConfirmation, setPendingConfirmation] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [copilotQueryResult, setCopilotQueryResult] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [functionRegistry, setFunctionRegistry] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [agentRegistry, setAgentRegistry] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [selectedPersonId, setSelectedPersonId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [flexScope, setFlexScope] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('single-account');
    const [flexRunMode, setFlexRunMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('queue');
    const [flexOutputMode, setFlexOutputMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('preview');
    const [flexSelectedFunctions, setFlexSelectedFunctions] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [commandPaletteOpen, setCommandPaletteOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const selectedAccountRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OperatorConsole.useEffect": ()=>{
            const onKey = {
                "OperatorConsole.useEffect.onKey": (e)=>{
                    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                        e.preventDefault();
                        setCommandPaletteOpen({
                            "OperatorConsole.useEffect.onKey": (o)=>!o
                        }["OperatorConsole.useEffect.onKey"]);
                    }
                }
            }["OperatorConsole.useEffect.onKey"];
            window.addEventListener('keydown', onKey);
            return ({
                "OperatorConsole.useEffect": ()=>window.removeEventListener('keydown', onKey)
            })["OperatorConsole.useEffect"];
        }
    }["OperatorConsole.useEffect"], []);
    const latestAccountLoadRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OperatorConsole.useEffect": ()=>{
            void loadSnapshot();
            void loadRegistries();
            const interval = window.setInterval({
                "OperatorConsole.useEffect.interval": ()=>{
                    void loadSnapshot(false);
                }
            }["OperatorConsole.useEffect.interval"], 30000);
            return ({
                "OperatorConsole.useEffect": ()=>window.clearInterval(interval)
            })["OperatorConsole.useEffect"];
        }
    }["OperatorConsole.useEffect"], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OperatorConsole.useEffect": ()=>{
            if (!selectedAccountId) {
                setAccountDetail(null);
                return;
            }
            selectedAccountRef.current = selectedAccountId;
            setAccountDetail(null);
            void loadAccount(selectedAccountId);
        }
    }["OperatorConsole.useEffect"], [
        selectedAccountId
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "OperatorConsole.useEffect": ()=>{
            if (!snapshot) return;
            void loadCopilot();
        }
    }["OperatorConsole.useEffect"], [
        snapshot,
        selectedSection,
        selectedAccountId,
        accountDetail?.account.id
    ]);
    const filteredAccounts = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "OperatorConsole.useMemo[filteredAccounts]": ()=>{
            const accounts = snapshot?.entities.accounts || [];
            if (!searchQuery.trim()) return accounts;
            const query = searchQuery.toLowerCase();
            return accounts.filter({
                "OperatorConsole.useMemo[filteredAccounts]": (account)=>account.name.toLowerCase().includes(query) || String(account.domain || '').toLowerCase().includes(query) || account.technologies.some({
                        "OperatorConsole.useMemo[filteredAccounts]": (item)=>item.toLowerCase().includes(query)
                    }["OperatorConsole.useMemo[filteredAccounts]"])
            }["OperatorConsole.useMemo[filteredAccounts]"]);
        }
    }["OperatorConsole.useMemo[filteredAccounts]"], [
        searchQuery,
        snapshot
    ]);
    async function loadSnapshot(showLoader = true) {
        if (showLoader) setLoading(true);
        try {
            const next = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchSnapshot"])();
            setSnapshot(next);
            setError(null);
            if (!selectedAccountId && next.entities.accounts.length > 0) {
                setSelectedAccountId(next.entities.accounts[0].id);
            }
        } catch (nextError) {
            setError(nextError.message || 'Failed to load console snapshot.');
        } finally{
            if (showLoader) setLoading(false);
        }
    }
    async function loadAccount(accountId) {
        const requestId = latestAccountLoadRef.current + 1;
        latestAccountLoadRef.current = requestId;
        try {
            const next = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchAccountDetail"])(accountId);
            if (latestAccountLoadRef.current === requestId && selectedAccountRef.current === accountId) {
                setAccountDetail(next);
            }
        } catch  {
            if (latestAccountLoadRef.current === requestId && selectedAccountRef.current === accountId) {
                setAccountDetail(null);
            }
        }
    }
    async function loadCopilot() {
        try {
            const next = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchCopilotState"])({
                section: selectedSection,
                accountId: selectedAccountId,
                accountName: accountDetail?.account.name || null
            });
            setCopilotState(next);
        } catch  {
            setCopilotState(null);
        }
    }
    async function loadRegistries() {
        try {
            const [functions, agents] = await Promise.all([
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchFunctionRegistry"])(),
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchAgentRegistry"])()
            ]);
            setFunctionRegistry(functions.functions);
            setAgentRegistry(agents.agents);
        } catch  {
            setFunctionRegistry([]);
            setAgentRegistry([]);
        }
    }
    async function submitCommand(raw, confirmed = false) {
        const command = raw.trim();
        if (!command) return;
        if (!confirmed && requiresCommandConfirmation(command)) {
            setCopilotOpen(true);
            setPendingConfirmation({
                command,
                message: `Are you sure you want to run "${command}"?`,
                source: 'command'
            });
            return;
        }
        setBusy(true);
        setStatusMessage(`Running: ${command}`);
        try {
            const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["runCommand"])(command);
            setCommandResult(result);
            setStatusMessage(`Completed: ${command}`);
            if (command.startsWith('scan ') || command.startsWith('queue research ')) {
                setSelectedSection('jobs');
            }
            if (command.includes('action')) {
                setSelectedSection('actions');
            }
            await loadSnapshot(false);
        } catch (nextError) {
            setStatusMessage(nextError.message || `Command failed: ${command}`);
        } finally{
            setBusy(false);
        }
    }
    async function submitFeedback(actionCandidateId, feedbackType, operatorEdit) {
        setBusy(true);
        try {
            const response = await fetch('/api/molt/feedback', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    actionCandidateId,
                    feedbackType,
                    operatorEdit,
                    timestamp: new Date().toISOString()
                })
            });
            const payload = await response.json();
            if (!response.ok || !payload?.ok) {
                throw new Error(payload?.error?.message || 'Feedback failed');
            }
            setStatusMessage(`Feedback recorded: ${feedbackType}`);
            await loadSnapshot(false);
        } catch (nextError) {
            setStatusMessage(nextError.message || 'Feedback failed');
        } finally{
            setBusy(false);
        }
    }
    async function triggerDiagnostic(diagnosticId) {
        setBusy(true);
        try {
            const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["runDiagnostic"])(diagnosticId);
            setCommandResult(result);
            setStatusMessage(`Diagnostic completed: ${diagnosticId}`);
            await loadSnapshot(false);
        } catch (nextError) {
            setStatusMessage(nextError.message || 'Diagnostic failed');
        } finally{
            setBusy(false);
        }
    }
    async function triggerSimulation(fixtureId) {
        setBusy(true);
        try {
            const result = fixtureId ? await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["runSimulation"])({
                fixtureId
            }) : await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["runSimulation"])({
                domain: simDomain,
                signals: simSignals.split(',').map((item)=>item.trim()).filter(Boolean)
            });
            setSimulationResult(result);
            setStatusMessage('Scenario simulation completed.');
            setSelectedSection('system-lab');
        } catch (nextError) {
            setStatusMessage(nextError.message || 'Simulation failed');
        } finally{
            setBusy(false);
        }
    }
    async function submitCopilotPrompt(prompt) {
        const trimmed = prompt.trim();
        if (!trimmed) return;
        setCopilotBusy(true);
        const assistantMessageId = `assistant-${Date.now()}`;
        setCopilotMessages((current)=>[
                ...current,
                {
                    id: `user-${Date.now()}`,
                    role: 'user',
                    text: trimmed
                },
                {
                    id: assistantMessageId,
                    role: 'assistant',
                    text: ''
                }
            ]);
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["streamCopilotQuery"])(trimmed, {
                section: selectedSection,
                accountId: selectedAccountId,
                accountName: accountDetail?.account.name || null
            }, {
                onChunk: (chunk)=>{
                    setCopilotMessages((current)=>current.map((message)=>message.id === assistantMessageId ? {
                                ...message,
                                text: `${message.text}${chunk}`
                            } : message));
                },
                onResult: async (result)=>{
                    setCopilotQueryResult(result);
                    if (result.action?.command) {
                        if (result.action.requiresConfirmation) {
                            setPendingConfirmation({
                                command: result.action.command,
                                message: `Confirm action: ${result.action.command}`,
                                source: 'copilot'
                            });
                        } else {
                            await executeCopilotAction(result.action.command, false);
                        }
                    }
                    setCopilotMessages((current)=>current.map((message)=>message.id === assistantMessageId ? {
                                ...message,
                                text: result.response
                            } : message));
                }
            });
        } catch (nextError) {
            setCopilotMessages((current)=>current.map((message)=>message.id === assistantMessageId ? {
                        ...message,
                        text: nextError.message || 'Co-Pilot could not complete that request.'
                    } : message));
        } finally{
            setCopilotBusy(false);
            setCopilotPrompt('');
        }
    }
    async function executeCopilotAction(command, confirmed) {
        setCopilotBusy(true);
        try {
            const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["runCopilotAction"])(command, confirmed);
            if (result.requiresConfirmation) {
                setPendingConfirmation({
                    command: String(result.command || command),
                    message: String(result.confirmationMessage || `Confirm action: ${command}`),
                    source: 'copilot'
                });
            } else {
                const shouldDelegateToCommand = result.ok === true && result.command === command;
                if (shouldDelegateToCommand) {
                    await submitCommand(command);
                } else {
                    setCommandResult(result);
                    setStatusMessage(`Co-Pilot executed: ${command}`);
                }
                setPendingConfirmation(null);
                await loadSnapshot(false);
                await loadCopilot();
            }
        } catch (nextError) {
            setStatusMessage(nextError.message || 'Co-Pilot action failed');
        } finally{
            setCopilotBusy(false);
        }
    }
    async function requestCopilotExplanation(input) {
        setCopilotBusy(true);
        try {
            const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["explainCopilot"])(input);
            setCommandResult(result);
            setCopilotMessages((current)=>[
                    ...current,
                    {
                        id: `assistant-${Date.now()}`,
                        role: 'assistant',
                        text: 'I added the explanation output to the panel state so you can inspect the underlying reasoning.'
                    }
                ]);
        } catch (nextError) {
            setStatusMessage(nextError.message || 'Co-Pilot explanation failed');
        } finally{
            setCopilotBusy(false);
        }
    }
    function openAccount(accountId) {
        if (!accountId) return;
        selectedAccountRef.current = accountId;
        setSelectedAccountId(accountId);
        setSelectedSection('accounts');
    }
    const greeting = (()=>{
        const h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 18) return 'Good afternoon';
        return 'Good evening';
    })();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
        className: "min-h-screen bg-[var(--background)] text-[var(--text)]",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "mx-auto flex min-h-screen max-w-[1700px] gap-0",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                    className: "flex w-16 flex-shrink-0 flex-col items-center border-r border-[var(--border)] bg-[var(--surface)] py-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent)]",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                                className: "h-5 w-5"
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 462,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 461,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mt-4 flex flex-1 flex-col gap-1",
                            children: SIDEBAR_ITEMS.map((item)=>{
                                const Icon = item.icon;
                                const active = selectedSection === item.id;
                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    title: item.label,
                                    onClick: ()=>setSelectedSection(item.id),
                                    className: `flex h-10 w-10 items-center justify-center rounded-lg transition ${active ? 'bg-[var(--background)] text-[var(--text)]' : 'text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-secondary)]'}`,
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Icon, {
                                        className: "h-5 w-5"
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 480,
                                        columnNumber: 19
                                    }, this)
                                }, item.id, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 469,
                                    columnNumber: 17
                                }, this);
                            })
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 464,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mt-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--background)] text-xs font-medium text-[var(--text-secondary)]",
                            children: "AG"
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 485,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/operator-console.tsx",
                    lineNumber: 460,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex min-w-0 flex-1 flex-col gap-6 p-6",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            className: "flex flex-col gap-4",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                    className: "text-xl font-semibold text-[var(--text)]",
                                    children: [
                                        greeting,
                                        ", Austin"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 493,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-col gap-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--card-shadow)]",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$command$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Command$3e$__["Command"], {
                                                    className: "h-4 w-4 shrink-0 text-[var(--muted)]"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 498,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                    value: commandInput,
                                                    onChange: (event)=>setCommandInput(event.target.value),
                                                    onKeyDown: (event)=>{
                                                        if (event.key === 'Enter') {
                                                            void submitCommand(commandInput);
                                                            setCommandInput('');
                                                        }
                                                    },
                                                    placeholder: "Ask Intelligence OS to translate, find, or run a command…",
                                                    className: "w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 499,
                                                    columnNumber: 17
                                                }, this),
                                                busy ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                    className: "h-4 w-4 shrink-0 animate-spin text-[var(--accent)]"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 511,
                                                    columnNumber: 25
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 497,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex flex-wrap gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "mr-1 self-center text-xs text-[var(--muted)]",
                                                    children: "Quick actions:"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 514,
                                                    columnNumber: 17
                                                }, this),
                                                [
                                                    'What can I do?',
                                                    'Help me find',
                                                    'Run research',
                                                    'Generate actions'
                                                ].map((label)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        type: "button",
                                                        onClick: ()=>{
                                                            if (label === 'What can I do?') setCopilotOpen(true);
                                                            if (label === 'Help me find') setCommandInput('search ');
                                                            if (label === 'Run research') setCommandInput('queue research ');
                                                            if (label === 'Generate actions') void submitCommand('generate sdr actions');
                                                        },
                                                        className: "pill",
                                                        children: label
                                                    }, label, false, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 516,
                                                        columnNumber: 19
                                                    }, this)),
                                                COMMAND_SUGGESTIONS.slice(0, 4).map((suggestion)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        type: "button",
                                                        onClick: ()=>void submitCommand(suggestion),
                                                        className: "pill",
                                                        children: suggestion
                                                    }, suggestion, false, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 531,
                                                        columnNumber: 19
                                                    }, this))
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 513,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 496,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-wrap items-center gap-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-xs text-[var(--muted)]",
                                            children: statusMessage || 'What matters right now, and what should I do?'
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 543,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                                                            className: "h-3.5 w-3.5"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 548,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                            value: searchQuery,
                                                            onChange: (event)=>setSearchQuery(event.target.value),
                                                            placeholder: "Filter",
                                                            className: "w-28 bg-transparent outline-none placeholder:text-[var(--muted)]"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 549,
                                                            columnNumber: 19
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 547,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    onClick: ()=>void loadSnapshot(),
                                                    className: "pill",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                                                            className: "mr-1.5 h-3.5 w-3.5"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 557,
                                                            columnNumber: 19
                                                        }, this),
                                                        "Refresh"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 556,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    onClick: ()=>setCopilotOpen((current)=>!current),
                                                    className: "pill",
                                                    children: [
                                                        copilotOpen ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$right$2d$close$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelRightClose$3e$__["PanelRightClose"], {
                                                            className: "mr-1.5 h-3.5 w-3.5"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 565,
                                                            columnNumber: 34
                                                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$right$2d$open$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelRightOpen$3e$__["PanelRightOpen"], {
                                                            className: "mr-1.5 h-3.5 w-3.5"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 565,
                                                            columnNumber: 87
                                                        }, this),
                                                        "AI Co-Pilot"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 560,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 546,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 542,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 492,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                            className: `grid min-h-[calc(100vh-180px)] grid-cols-1 gap-6 ${copilotOpen ? '2xl:grid-cols-[320px_minmax(0,1fr)_360px]' : 'xl:grid-cols-[320px_minmax(0,1fr)]'}`,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "card min-w-0 p-4",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mb-3 flex items-center justify-between",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-xs font-medium uppercase tracking-wider text-[var(--muted)]",
                                                            children: "Operator Layer"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 576,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "mt-1 text-sm font-semibold text-[var(--text)]",
                                                            children: "Workspace Index"
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 577,
                                                            columnNumber: 19
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 575,
                                                    columnNumber: 17
                                                }, this),
                                                snapshot ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "badge-new",
                                                    children: [
                                                        snapshot.overview.intelligenceStatus.activeOpportunities,
                                                        " live"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 580,
                                                    columnNumber: 19
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 574,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "space-y-1",
                                            children: filteredAccounts.slice(0, 12).map((account)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    type: "button",
                                                    onClick: ()=>openAccount(account.id),
                                                    className: `card-list-item w-full rounded-lg p-3 text-left transition first:border-t-0 ${selectedAccountId === account.id ? 'bg-[var(--accent-muted)] border-[var(--accent)]/30' : 'hover:bg-[var(--surface-muted)]'}`,
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "flex items-start justify-between gap-3",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "min-w-0",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                            className: "truncate text-sm font-semibold text-[var(--text)]",
                                                                            children: account.name
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/components/operator-console.tsx",
                                                                            lineNumber: 598,
                                                                            columnNumber: 25
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                            className: "truncate text-xs text-[var(--muted)]",
                                                                            children: account.domain || 'No domain'
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/components/operator-console.tsx",
                                                                            lineNumber: 599,
                                                                            columnNumber: 25
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/components/operator-console.tsx",
                                                                    lineNumber: 597,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-secondary)]",
                                                                    children: account.opportunityScore
                                                                }, void 0, false, {
                                                                    fileName: "[project]/components/operator-console.tsx",
                                                                    lineNumber: 601,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 596,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "mt-2 flex items-center justify-between text-xs text-[var(--muted)]",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    children: [
                                                                        "Completion ",
                                                                        account.completion,
                                                                        "%"
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/components/operator-console.tsx",
                                                                    lineNumber: 606,
                                                                    columnNumber: 23
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                    children: account.technologies[0] || 'Needs enrichment'
                                                                }, void 0, false, {
                                                                    fileName: "[project]/components/operator-console.tsx",
                                                                    lineNumber: 607,
                                                                    columnNumber: 23
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 605,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, account.id, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 586,
                                                    columnNumber: 19
                                                }, this))
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 584,
                                            columnNumber: 15
                                        }, this),
                                        filteredAccounts.length > 12 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            className: "mt-2 text-xs text-[var(--muted)] hover:text-[var(--text)]",
                                            children: "View all →"
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 613,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "card mt-4 p-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-xs font-medium uppercase tracking-wider text-[var(--muted)]",
                                                    children: "System Pulse"
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 619,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mt-3 space-y-2 text-sm",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(QuickStat, {
                                                            label: "Signals today",
                                                            value: snapshot?.overview.intelligenceStatus.signalsToday || 0
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 621,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(QuickStat, {
                                                            label: "Actions queued",
                                                            value: snapshot?.actions.queue.totalActions || 0
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 622,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(QuickStat, {
                                                            label: "Jobs running",
                                                            value: snapshot?.jobs.running || 0
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 623,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(QuickStat, {
                                                            label: "Drift risk",
                                                            value: snapshot?.systemLab.engineStatus.driftRisk || 'LOW'
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 624,
                                                            columnNumber: 19
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 620,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 618,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 573,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "card min-w-0 p-4",
                                    children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex h-full min-h-[520px] items-center justify-center text-[var(--muted)]",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                className: "mr-3 h-5 w-5 animate-spin"
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 632,
                                                columnNumber: 19
                                            }, this),
                                            "Loading Intelligence OS…"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 631,
                                        columnNumber: 17
                                    }, this) : error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex h-full min-h-[520px] items-center justify-center text-sm text-[var(--danger)]",
                                        children: error
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 636,
                                        columnNumber: 17
                                    }, this) : snapshot ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Workspace, {
                                        snapshot: snapshot,
                                        section: selectedSection,
                                        accountDetail: accountDetail,
                                        selectedAccountId: selectedAccountId,
                                        selectedPersonId: selectedPersonId,
                                        setSelectedPersonId: setSelectedPersonId,
                                        onOpenAccount: openAccount,
                                        onCommand: submitCommand,
                                        onFeedback: submitFeedback,
                                        onDiagnostic: triggerDiagnostic,
                                        onRunSimulation: triggerSimulation,
                                        simulationResult: simulationResult,
                                        simDomain: simDomain,
                                        setSimDomain: setSimDomain,
                                        simSignals: simSignals,
                                        setSimSignals: setSimSignals,
                                        commandResult: commandResult,
                                        functionRegistry: functionRegistry,
                                        agentRegistry: agentRegistry,
                                        flexScope: flexScope,
                                        setFlexScope: setFlexScope,
                                        flexRunMode: flexRunMode,
                                        setFlexRunMode: setFlexRunMode,
                                        flexOutputMode: flexOutputMode,
                                        setFlexOutputMode: setFlexOutputMode,
                                        flexSelectedFunctions: flexSelectedFunctions,
                                        setFlexSelectedFunctions: setFlexSelectedFunctions
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 640,
                                        columnNumber: 17
                                    }, this) : null
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 629,
                                    columnNumber: 13
                                }, this),
                                copilotOpen ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(CopilotPanel, {
                                    copilotState: copilotState,
                                    busy: copilotBusy,
                                    prompt: copilotPrompt,
                                    setPrompt: setCopilotPrompt,
                                    onSubmitPrompt: submitCopilotPrompt,
                                    onAction: executeCopilotAction,
                                    onExplain: requestCopilotExplanation,
                                    onClose: ()=>setCopilotOpen(false),
                                    selectedAccountId: selectedAccountId,
                                    selectedSection: selectedSection,
                                    simulationResult: simulationResult,
                                    messages: copilotMessages,
                                    pendingConfirmation: pendingConfirmation,
                                    onConfirm: async ()=>{
                                        if (!pendingConfirmation) return;
                                        if (pendingConfirmation.source === 'command') {
                                            await submitCommand(pendingConfirmation.command, true);
                                        } else {
                                            await executeCopilotAction(pendingConfirmation.command, true);
                                        }
                                        setPendingConfirmation(null);
                                    },
                                    onCancelConfirmation: ()=>setPendingConfirmation(null),
                                    commandResult: commandResult,
                                    queryResult: copilotQueryResult
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 673,
                                    columnNumber: 15
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 572,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/operator-console.tsx",
                    lineNumber: 490,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/components/operator-console.tsx",
            lineNumber: 458,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 457,
        columnNumber: 5
    }, this);
}
_s(OperatorConsole, "UuIauzv32NP93Uu1Dk3PrrXERno=");
_c = OperatorConsole;
function Workspace(props) {
    switch(props.section){
        case 'overview':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(OverviewView, {
                ...props
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 739,
                columnNumber: 14
            }, this);
        case 'accounts':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(AccountsView, {
                ...props
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 741,
                columnNumber: 14
            }, this);
        case 'people':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(PeopleView, {
                snapshot: props.snapshot,
                onOpenAccount: props.onOpenAccount,
                selectedPersonId: props.selectedPersonId,
                setSelectedPersonId: props.setSelectedPersonId
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 743,
                columnNumber: 14
            }, this);
        case 'signals':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SignalsView, {
                snapshot: props.snapshot,
                onOpenAccount: props.onOpenAccount
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 745,
                columnNumber: 14
            }, this);
        case 'patterns':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(PatternsView, {
                snapshot: props.snapshot
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 747,
                columnNumber: 14
            }, this);
        case 'actions':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionsView, {
                snapshot: props.snapshot,
                onFeedback: props.onFeedback,
                onCommand: props.onCommand
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 749,
                columnNumber: 14
            }, this);
        case 'research':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ResearchView, {
                snapshot: props.snapshot,
                accountDetail: props.accountDetail
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 751,
                columnNumber: 14
            }, this);
        case 'jobs':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(JobsView, {
                snapshot: props.snapshot,
                onCommand: props.onCommand
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 753,
                columnNumber: 14
            }, this);
        case 'metrics':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricsView, {
                snapshot: props.snapshot
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 755,
                columnNumber: 14
            }, this);
        case 'system-lab':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SystemLabView, {
                snapshot: props.snapshot,
                onCommand: props.onCommand,
                onDiagnostic: props.onDiagnostic,
                onRunSimulation: props.onRunSimulation,
                simulationResult: props.simulationResult,
                simDomain: props.simDomain,
                setSimDomain: props.setSimDomain,
                simSignals: props.simSignals,
                setSimSignals: props.setSimSignals,
                commandResult: props.commandResult
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 758,
                columnNumber: 9
            }, this);
        case 'capabilities':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(CapabilitiesView, {
                functionRegistry: props.functionRegistry,
                agentRegistry: props.agentRegistry,
                onCommand: props.onCommand,
                flexScope: props.flexScope,
                setFlexScope: props.setFlexScope,
                flexRunMode: props.flexRunMode,
                setFlexRunMode: props.setFlexRunMode,
                flexOutputMode: props.flexOutputMode,
                setFlexOutputMode: props.setFlexOutputMode,
                flexSelectedFunctions: props.flexSelectedFunctions,
                setFlexSelectedFunctions: props.setFlexSelectedFunctions
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 773,
                columnNumber: 9
            }, this);
        case 'settings':
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-4 p-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-sm font-medium uppercase tracking-wider text-[var(--muted)]",
                        children: "Settings"
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 790,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-sm text-[var(--text-secondary)]",
                        children: "Operator and system settings. (Placeholder.)"
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 791,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 789,
                columnNumber: 9
            }, this);
        default:
            return null;
    }
}
_c1 = Workspace;
function OverviewView(props) {
    const status = props.snapshot.overview.intelligenceStatus;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Header, {
                eyebrow: "Mission Control",
                title: "Intelligence Status",
                description: "Single-page operating surface for accounts, signals, actions, and system state."
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 807,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-3 md:grid-cols-2 xl:grid-cols-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                        label: "Accounts indexed",
                        value: status.accountsIndexed
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 814,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                        label: "People indexed",
                        value: status.peopleIndexed
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 815,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                        label: "Signals today",
                        value: status.signalsToday
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 816,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                        label: "Active opportunities",
                        value: status.activeOpportunities
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 817,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 813,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-4 xl:grid-cols-[1.2fr_0.8fr]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Opportunity Radar",
                        subtitle: `System completion ${status.systemCompletion}% • Drift risk ${status.driftRisk}`,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: props.snapshot.overview.opportunityRadar.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>props.onOpenAccount(item.accountId),
                                    className: "card w-full rounded-xl p-4 text-left transition hover:border-[var(--accent)]/40",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-start justify-between gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-sm font-semibold",
                                                            children: item.accountName
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 832,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "mt-1 text-xs text-[var(--muted)]",
                                                            children: [
                                                                "Signal: ",
                                                                item.signal,
                                                                " • Pattern: ",
                                                                item.pattern
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 833,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 831,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                    tone: item.draftReady ? 'success' : 'neutral',
                                                    children: [
                                                        item.confidence,
                                                        "%"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 837,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 830,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-3 text-sm text-[var(--text)]",
                                            children: item.action
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 839,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-2 text-xs text-[var(--muted)]",
                                            children: item.whyNow
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 840,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, item.actionCandidateId, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 824,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 822,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 821,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Signals Timeline",
                        subtitle: "Fast context for what changed most recently",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: props.snapshot.overview.signalTimeline.slice(0, 10).map((signal)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-start justify-between gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-sm font-medium",
                                                            children: signal.accountName
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 852,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-xs text-[var(--muted)]",
                                                            children: signal.signalType
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 853,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 851,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-xs text-[var(--muted)]",
                                                    children: formatTime(signal.timestamp)
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 855,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 850,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-2 flex items-center gap-2 text-xs text-[var(--muted)]",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                    tone: signal.uncertaintyState === 'likely' ? 'warning' : 'neutral',
                                                    children: signal.uncertaintyState
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 858,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: signal.source
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 859,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: signal.strength
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 860,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 857,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, signal.id, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 849,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 847,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 846,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 820,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-4 xl:grid-cols-[0.8fr_1.2fr]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Completion / Enrichment",
                        subtitle: "Lowest-completion accounts first",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: props.snapshot.overview.completionRows.slice(0, 8).map((row)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>props.onOpenAccount(row.accountId),
                                    className: "flex w-full items-center justify-between rounded-2xl border border-[var(--border)] px-4 py-3 text-left",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-sm font-medium",
                                                    children: row.accountName
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 879,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-xs text-[var(--muted)]",
                                                    children: [
                                                        "Missing: ",
                                                        (row.missing || []).slice(0, 3).join(', ') || 'None'
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 880,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 878,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-right",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-sm font-semibold",
                                                    children: [
                                                        row.completion,
                                                        "%"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 885,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-xs text-[var(--muted)]",
                                                    children: row.nextStages[0] || 'ready'
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 886,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 884,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, row.accountId, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 872,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 870,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 869,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Command Output",
                        subtitle: "Latest command or background result",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                            className: "overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs text-[var(--muted)]",
                            children: JSON.stringify(props.commandResult || props.snapshot.systemLab.codeIntelligence, null, 2)
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 894,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 893,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 868,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                title: "Recent work",
                subtitle: "Generated pages for jobs, research, and drafts",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "grid gap-3 sm:grid-cols-3",
                    children: [
                        props.snapshot.jobs.recent[0] ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                            href: `/job/${encodeURIComponent(props.snapshot.jobs.recent[0].id)}`,
                            className: "card rounded-xl p-4 transition hover:border-[var(--accent)]/40",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-sm font-semibold text-[var(--text)]",
                                    children: "Latest job"
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 904,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "mt-1 truncate text-xs text-[var(--muted)]",
                                    children: props.snapshot.jobs.recent[0].jobType
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 905,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "mt-2 text-xs text-[var(--accent)]",
                                    children: "View job →"
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 906,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 903,
                            columnNumber: 13
                        }, this) : null,
                        props.snapshot.research.briefs[0] ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                            href: `/research/${encodeURIComponent(props.snapshot.research.briefs[0].id)}`,
                            className: "card rounded-xl p-4 transition hover:border-[var(--accent)]/40",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-sm font-semibold text-[var(--text)]",
                                    children: "Latest brief"
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 911,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "mt-1 truncate text-xs text-[var(--muted)]",
                                    children: props.snapshot.research.briefs[0].date || props.snapshot.research.briefs[0].id
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 912,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "mt-2 text-xs text-[var(--accent)]",
                                    children: "View brief →"
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 913,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 910,
                            columnNumber: 13
                        }, this) : null,
                        props.snapshot.research.drafts[0] ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                            href: `/draft/${encodeURIComponent(props.snapshot.research.drafts[0].id)}`,
                            className: "card rounded-xl p-4 transition hover:border-[var(--accent)]/40",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-sm font-semibold text-[var(--text)]",
                                    children: "Latest draft"
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 918,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "mt-1 truncate text-xs text-[var(--muted)]",
                                    children: props.snapshot.research.drafts[0].subject || props.snapshot.research.drafts[0].id
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 919,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "mt-2 text-xs text-[var(--accent)]",
                                    children: "View draft →"
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 920,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 917,
                            columnNumber: 13
                        }, this) : null,
                        !props.snapshot.jobs.recent[0] && !props.snapshot.research.briefs[0] && !props.snapshot.research.drafts[0] && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-sm text-[var(--muted)]",
                            children: "No recent jobs, briefs, or drafts yet. Run jobs or generate actions to see work here."
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 924,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/operator-console.tsx",
                    lineNumber: 901,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 900,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 806,
        columnNumber: 5
    }, this);
}
_c2 = OverviewView;
function AccountsView(props) {
    const detail = props.accountDetail;
    const account = props.snapshot.entities.accounts.find((item)=>item.id === props.selectedAccountId);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Header, {
                eyebrow: "Account Explorer",
                title: detail?.account.name || account?.name || 'Select an account',
                description: detail?.account.domain || 'Entity view, signals, patterns, actions, and research in one workspace.'
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 942,
                columnNumber: 7
            }, this),
            !detail ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(EmptyState, {
                message: "Select an account from the left rail to inspect its full workspace."
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 949,
                columnNumber: 9
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid gap-3 md:grid-cols-2 xl:grid-cols-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                label: "Completion",
                                value: `${detail.account.completion}%`
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 953,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                label: "Opportunity Score",
                                value: detail.account.opportunityScore
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 954,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                label: "Signals",
                                value: detail.signalsTimeline.length
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 955,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                label: "Actions",
                                value: detail.actions.length
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 956,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 952,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid gap-4 xl:grid-cols-[0.9fr_1.1fr]",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                                title: "Tech Stack",
                                subtitle: "Validated technologies and likely stack clues",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-wrap gap-2",
                                        children: detail.account.technologies.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                children: item
                                            }, item, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 963,
                                                columnNumber: 19
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 961,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-4 text-sm text-[var(--muted)]",
                                        children: detail.account.description || 'No account description yet.'
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 966,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 960,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                                title: "Right-side Triggers",
                                subtitle: "Fast operator actions",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid gap-2 md:grid-cols-2",
                                    children: detail.controls.map((control)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: ()=>void props.onCommand(control.label.toLowerCase()),
                                            className: "card rounded-xl px-4 py-3 text-left text-sm transition hover:border-[var(--accent)]/40",
                                            children: control.label
                                        }, control.id, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 972,
                                            columnNumber: 19
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 970,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 969,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 959,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid gap-4 xl:grid-cols-[0.9fr_1.1fr]",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                                title: "Signals Timeline",
                                subtitle: "This dramatically improves decision quality",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-3",
                                    children: detail.signalsTimeline.map((signal)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-start justify-between gap-3",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "text-sm font-medium",
                                                                children: signal.signalType
                                                            }, void 0, false, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 992,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "text-xs text-[var(--muted)]",
                                                                children: signal.summary
                                                            }, void 0, false, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 993,
                                                                columnNumber: 25
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 991,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-right text-xs text-[var(--muted)]",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: formatTime(signal.timestamp)
                                                            }, void 0, false, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 996,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: signal.strength
                                                            }, void 0, false, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 997,
                                                                columnNumber: 25
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 995,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 990,
                                                columnNumber: 21
                                            }, this)
                                        }, signal.id, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 989,
                                            columnNumber: 19
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 987,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 986,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                                title: "Actions + Research",
                                subtitle: "Evidence-backed next moves",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-3",
                                    children: [
                                        detail.actions.map((action)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex items-start justify-between gap-3",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "text-sm font-semibold",
                                                                        children: action.actionType
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/components/operator-console.tsx",
                                                                        lineNumber: 1011,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "mt-1 text-xs text-[var(--muted)]",
                                                                        children: action.whyNow
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/components/operator-console.tsx",
                                                                        lineNumber: 1012,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 1010,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                                tone: action.confidence >= 70 ? 'success' : 'warning',
                                                                children: [
                                                                    action.confidence,
                                                                    "%"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 1014,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1009,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "mt-3 flex flex-wrap gap-2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                                children: action.draftStatus
                                                            }, void 0, false, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 1017,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                                children: action.uncertaintyState
                                                            }, void 0, false, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 1018,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                                children: action.recommendedNextStep
                                                            }, void 0, false, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 1019,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1016,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, action.id, true, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1008,
                                                columnNumber: 19
                                            }, this)),
                                        detail.research.briefs.map((brief)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-sm font-semibold",
                                                        children: brief.title
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1025,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "mt-2 text-xs text-[var(--muted)]",
                                                        children: brief.summary || 'No brief summary yet.'
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1026,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, brief.id, true, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1024,
                                                columnNumber: 19
                                            }, this))
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1006,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1005,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 985,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 941,
        columnNumber: 5
    }, this);
}
_c3 = AccountsView;
function PeopleView(props) {
    const selectedPerson = props.snapshot.entities.people.find((person)=>person.id === props.selectedPersonId) || props.snapshot.entities.people[0] || null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Header, {
                eyebrow: "People",
                title: "Person Layer",
                description: "Decision makers and likely entry points across active accounts."
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1047,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-4 xl:grid-cols-[0.9fr_1.1fr]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "People Explorer",
                        subtitle: "Fast scan of likely buyers and champions",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid gap-3 md:grid-cols-2",
                            children: props.snapshot.entities.people.map((person)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    type: "button",
                                    onClick: ()=>props.setSelectedPersonId(person.id),
                                    className: `rounded-xl border px-4 py-3 text-left ${selectedPerson?.id === person.id ? 'border-[var(--accent)]/40 bg-[var(--accent-muted)]' : 'border-[var(--border)] bg-[var(--surface)]'}`,
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-sm font-semibold",
                                            children: person.name
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1062,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-1 text-xs text-[var(--muted)]",
                                            children: person.title || 'Unknown title'
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1063,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-3 flex items-center justify-between text-xs text-[var(--muted)]",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: person.accountName || 'No account'
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1065,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    children: person.seniority || 'unknown'
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1066,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1064,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, person.id, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1052,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1050,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1049,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Person Detail",
                        subtitle: "Responsibilities, account context, and likely outreach angle",
                        children: selectedPerson ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-4",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-lg font-semibold",
                                            children: selectedPerson.name
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1076,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-1 text-sm text-[var(--muted)]",
                                            children: selectedPerson.title || 'Unknown title'
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1077,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1075,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-wrap gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                            children: selectedPerson.seniority || 'unknown'
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1080,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                            children: selectedPerson.accountName || 'No linked account'
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1081,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                            children: selectedPerson.title?.toLowerCase().includes('vp') ? 'likely decision maker' : 'potential influencer'
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1082,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1079,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-2xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]",
                                    children: [
                                        "Likely role: ",
                                        inferPersonRole(selectedPerson.title),
                                        ". Recommended angle: ",
                                        inferOutreachAngle(selectedPerson.title),
                                        "."
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1084,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "grid gap-2 md:grid-cols-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                            label: "Open account",
                                            onClick: ()=>props.onOpenAccount(selectedPerson.accountId)
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1088,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                            label: "Draft outreach",
                                            onClick: ()=>props.onOpenAccount(selectedPerson.accountId)
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1089,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                            label: "Validate title",
                                            onClick: ()=>props.setSelectedPersonId(selectedPerson.id)
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1090,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                            label: "Show why they matter",
                                            onClick: ()=>props.onOpenAccount(selectedPerson.accountId)
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1091,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1087,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1074,
                            columnNumber: 13
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(EmptyState, {
                            message: "Select a person to inspect title confidence, account alignment, and outreach angle."
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1095,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1072,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1048,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1046,
        columnNumber: 5
    }, this);
}
_c4 = PeopleView;
function SignalsView(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Header, {
                eyebrow: "Signals",
                title: "Signal Monitoring",
                description: "Compressed stream of timing, intent, and evidence changes."
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1106,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                title: "Recent Signals",
                subtitle: "Website, docs, pricing, hiring, and operator notes",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-3",
                    children: props.snapshot.signals.recent.map((signal)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            type: "button",
                            onClick: ()=>props.onOpenAccount(signal.accountId),
                            className: "flex w-full items-center justify-between rounded-2xl border border-[var(--border)] px-4 py-3 text-left",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-sm font-semibold",
                                            children: signal.accountName
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1117,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-xs text-[var(--muted)]",
                                            children: [
                                                signal.signalType,
                                                " • ",
                                                signal.source
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1118,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1116,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-right",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-sm",
                                            children: signal.strength
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1121,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-xs text-[var(--muted)]",
                                            children: signal.uncertaintyState
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1122,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1120,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, signal.id, true, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1110,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/components/operator-console.tsx",
                    lineNumber: 1108,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1107,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1105,
        columnNumber: 5
    }, this);
}
_c5 = SignalsView;
function PatternsView(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Header, {
                eyebrow: "Pattern Engine",
                title: "Active Patterns",
                description: "Pattern visibility, confidence, lifecycle state, and recommended moves."
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1135,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-3 md:grid-cols-2",
                children: props.snapshot.patterns.active.map((pattern)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: pattern.type,
                        subtitle: pattern.lifecycleState,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3 text-sm",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-[var(--muted)]",
                                    children: pattern.summary || 'No summary available.'
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1140,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-wrap gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                            children: [
                                                pattern.matchFrequency,
                                                " matches"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1142,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                            children: [
                                                Math.round(pattern.conversionAssociation * 100) / 100,
                                                " conversion assoc."
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1143,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                            children: pattern.owner || 'unowned'
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1144,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1141,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-2",
                                    children: (pattern.recommendedMoves || []).slice(0, 3).map((move)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]",
                                            children: move
                                        }, move, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1148,
                                            columnNumber: 19
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1146,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1139,
                            columnNumber: 13
                        }, this)
                    }, pattern.id, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1138,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1136,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1134,
        columnNumber: 5
    }, this);
}
_c6 = PatternsView;
function ActionsView(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Header, {
                eyebrow: "Execution Queue",
                title: "Today’s Actions",
                description: "The most important page: evidence-backed actions ready for SDR execution."
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1168,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-3",
                children: props.snapshot.actions.queue.actions.map((action)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: `${action.rank}. ${action.account}`,
                        subtitle: `${action.action} • ${action.pattern}`,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "text-sm text-[var(--muted)]",
                                    children: action.whyNow
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1173,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-wrap gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                            tone: action.confidence >= 75 ? 'success' : 'warning',
                                            children: [
                                                action.confidence,
                                                "% confidence"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1175,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                            children: action.person || 'No persona'
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1176,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                            tone: action.draftReady ? 'success' : 'neutral',
                                            children: action.draftReady ? 'Draft ready' : 'Draft pending'
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1177,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1174,
                                    columnNumber: 15
                                }, this),
                                (()=>{
                                    const draft = props.snapshot.research.drafts.find((d)=>d.actionCandidateId === action.actionCandidateId);
                                    return draft ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                href: `/draft/${encodeURIComponent(draft.id)}`,
                                                className: "text-[var(--accent)] hover:underline",
                                                children: [
                                                    "View draft: ",
                                                    draft.subject || draft.id
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1183,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mt-1 text-xs text-[var(--muted)]",
                                                children: [
                                                    "Status: ",
                                                    draft.status,
                                                    " · Updated ",
                                                    formatTime(draft.updatedAt)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1186,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1182,
                                        columnNumber: 19
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--muted)]",
                                        children: action.draftReady ? 'Draft ready — generate or open from Gmail workflow.' : 'Draft pending.'
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1189,
                                        columnNumber: 19
                                    }, this);
                                })(),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-wrap gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                            label: "Send",
                                            onClick: ()=>props.onFeedback(action.actionCandidateId, 'sent_draft')
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1195,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                            label: "Edit",
                                            onClick: ()=>props.onFeedback(action.actionCandidateId, 'edited_draft', 'Edited from operator console.')
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1196,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                            label: "Skip",
                                            onClick: ()=>props.onFeedback(action.actionCandidateId, 'ignored_action')
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1197,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                            label: "Mark incorrect",
                                            onClick: ()=>props.onFeedback(action.actionCandidateId, 'marked_incorrect')
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1198,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                            label: "Explain",
                                            onClick: ()=>props.onCommand(`explain action ${action.actionCandidateId}`)
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1199,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1194,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1172,
                            columnNumber: 13
                        }, this)
                    }, action.actionCandidateId, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1171,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1169,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1167,
        columnNumber: 5
    }, this);
}
_c7 = ActionsView;
function ResearchView(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Header, {
                eyebrow: "Research Console",
                title: "Research Output",
                description: "Scans, crawls, intelligence synthesis, evidence packs, and generated briefs."
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1212,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-4 xl:grid-cols-[1fr_1fr]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Latest Briefings",
                        subtitle: "Operator-ready generated intelligence",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: props.snapshot.research.briefs.map((brief)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                    href: `/research/${encodeURIComponent(brief.id)}`,
                                    className: "block rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--accent)]/40",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-sm font-semibold text-[var(--text)]",
                                            children: brief.date || brief.id
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1218,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-[var(--muted)] line-clamp-3",
                                            children: brief.summaryMarkdown
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1219,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "mt-2 inline-block text-xs text-[var(--accent)]",
                                            children: "View full brief →"
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1222,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, brief.id, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1217,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1215,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1214,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Drafts",
                        subtitle: "Outreach drafts linked to actions",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-2",
                            children: [
                                props.snapshot.research.drafts.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-sm text-[var(--muted)]",
                                    children: "No drafts yet."
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1230,
                                    columnNumber: 15
                                }, this) : props.snapshot.research.drafts.slice(0, 15).map((draft)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                        href: `/draft/${encodeURIComponent(draft.id)}`,
                                        className: "card-list-item flex items-center justify-between rounded-lg px-3 py-2 transition hover:bg-[var(--surface-muted)]",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "truncate text-sm font-medium text-[var(--text)]",
                                                children: draft.subject || draft.id
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1234,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                children: draft.status
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1235,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, draft.id, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1233,
                                        columnNumber: 17
                                    }, this)),
                                props.snapshot.research.drafts.length > 15 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                    href: "/",
                                    className: "text-xs text-[var(--muted)] hover:text-[var(--text)]",
                                    children: "View all →"
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1240,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1228,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1227,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Account Research",
                        subtitle: "Evidence packs and briefs for the selected account",
                        children: props.accountDetail ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: [
                                props.accountDetail.research.evidence.map((evidence)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-sm font-semibold",
                                                children: evidence.summary
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1249,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mt-2 flex gap-2 text-xs text-[var(--muted)]",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                        children: evidence.uncertaintyState
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1251,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        children: formatTime(evidence.observedAt)
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1252,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1250,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, evidence.id, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1248,
                                        columnNumber: 17
                                    }, this)),
                                props.accountDetail.research.briefs.map((brief)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                        href: `/research/${encodeURIComponent(brief.id)}`,
                                        className: "block rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--accent)]/40",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-sm font-semibold text-[var(--text)]",
                                                children: brief.title
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1258,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mt-2 line-clamp-2 text-xs text-[var(--muted)]",
                                                children: brief.summary
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1259,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "mt-2 inline-block text-xs text-[var(--accent)]",
                                                children: "View →"
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1260,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, brief.id, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1257,
                                        columnNumber: 17
                                    }, this))
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1246,
                            columnNumber: 13
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(EmptyState, {
                            message: "Select an account to load its evidence packs and research briefs."
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1265,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1244,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1213,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1211,
        columnNumber: 5
    }, this);
}
_c8 = ResearchView;
function JobsView(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Header, {
                eyebrow: "Job Control Center",
                title: "Jobs",
                description: "Queue visibility, stale refresh, maintenance triggers, and recent failures."
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1276,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-3 md:grid-cols-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                        label: "Running",
                        value: props.snapshot.jobs.running
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1278,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                        label: "Queued",
                        value: props.snapshot.jobs.queued
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1279,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                        label: "Enrich queued",
                        value: props.snapshot.jobs.enrichQueued
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1280,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1277,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                title: "Batch Controls",
                subtitle: "One-click job orchestration",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "grid gap-2 md:grid-cols-2 xl:grid-cols-5",
                    children: [
                        'queue research fleetfeet.com',
                        'refresh stale entities',
                        'recalculate scores',
                        'run nightly jobs',
                        'generate sdr actions',
                        'run autopilot'
                    ].map((command)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                            label: command,
                            onClick: ()=>props.onCommand(command)
                        }, command, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1285,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/components/operator-console.tsx",
                    lineNumber: 1283,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1282,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                title: "Recent Jobs",
                subtitle: "Priority, retries, and failure visibility",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-2",
                        children: props.snapshot.jobs.recent.map((job)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                href: `/job/${encodeURIComponent(job.id)}`,
                                className: "grid grid-cols-[1.4fr_0.7fr_0.5fr] gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm transition hover:border-[var(--accent)]/40",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "min-w-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "truncate font-semibold text-[var(--text)]",
                                                children: job.jobType
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1294,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "truncate text-xs text-[var(--muted)]",
                                                children: job.id
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1295,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1293,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-xs text-[var(--muted)]",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    "Status: ",
                                                    job.status
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1298,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    "Priority: ",
                                                    job.priority
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1299,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    "Attempts: ",
                                                    job.attempts
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1300,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1297,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-right text-xs text-[var(--muted)]",
                                        children: job.error ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-[var(--danger)]",
                                            children: job.error
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1303,
                                            columnNumber: 30
                                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: formatTime(job.updatedAt)
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1303,
                                            columnNumber: 88
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1302,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, job.id, true, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1292,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1290,
                        columnNumber: 9
                    }, this),
                    props.snapshot.jobs.recent.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-2 text-xs text-[var(--muted)]",
                        children: "Click a job to open its detail page."
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1309,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1289,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1275,
        columnNumber: 5
    }, this);
}
_c9 = JobsView;
function MetricsView(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Header, {
                eyebrow: "Drift Monitoring",
                title: "Metrics",
                description: "Confidence calibration, stale evidence, duplicate actions, and reliability trends."
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1319,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-3 md:grid-cols-2 xl:grid-cols-5",
                children: props.snapshot.metrics.drift.map((metric)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                        label: metric.label,
                        value: metric.value,
                        tone: metric.severity === 'high' ? 'danger' : metric.severity === 'medium' ? 'warning' : 'neutral'
                    }, metric.metricType, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1322,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1320,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                title: "Drift Detail",
                subtitle: "The anti-drift contract, rendered as live metrics",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                    className: "overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs text-[var(--muted)]",
                    children: JSON.stringify(props.snapshot.metrics.drift, null, 2)
                }, void 0, false, {
                    fileName: "[project]/components/operator-console.tsx",
                    lineNumber: 1326,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1325,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1318,
        columnNumber: 5
    }, this);
}
_c10 = MetricsView;
function SystemLabView(props) {
    const lab = props.snapshot.systemLab;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Header, {
                eyebrow: "System Layer",
                title: "System Lab",
                description: "Developer console + intelligence control panel for the platform."
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1349,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-3 md:grid-cols-2 xl:grid-cols-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                        label: "Signals processed today",
                        value: lab.engineStatus.signalsProcessedToday
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1352,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                        label: "Patterns active",
                        value: lab.engineStatus.patternsActive
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1353,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                        label: "Drafts generated",
                        value: lab.engineStatus.draftsGenerated
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1354,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                        label: "Drift risk",
                        value: lab.engineStatus.driftRisk,
                        tone: lab.engineStatus.driftRisk === 'HIGH' ? 'danger' : lab.engineStatus.driftRisk === 'MEDIUM' ? 'warning' : 'success'
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1355,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1351,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-4 xl:grid-cols-[0.75fr_1.25fr]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Capabilities",
                        subtitle: "What the engine can actually do",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid gap-2 md:grid-cols-2",
                            children: lab.capabilities.map((capability)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-center justify-between rounded-2xl border border-[var(--border)] px-4 py-3 text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            children: capability.label
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1363,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                            tone: capability.enabled ? 'success' : 'danger',
                                            children: capability.enabled ? 'enabled' : 'off'
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1364,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, capability.id, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1362,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1360,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1359,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Batch Operations",
                        subtitle: "Large-scale system actions with risk visibility",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: lab.batchOperations.map((operation)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center justify-between gap-3",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-sm font-semibold",
                                                        children: operation.label
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1376,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-xs text-[var(--muted)]",
                                                        children: [
                                                            operation.estimatedAccountsAffected,
                                                            " accounts • ",
                                                            operation.estimatedRuntime,
                                                            " • risk ",
                                                            operation.riskLevel
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1377,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1375,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                label: "Start",
                                                onClick: ()=>props.onCommand(mapBatchOperation(operation.id))
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1381,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1374,
                                        columnNumber: 17
                                    }, this)
                                }, operation.id, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1373,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1371,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1370,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1358,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-4 xl:grid-cols-[0.8fr_1.2fr]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Learning Mode",
                        subtitle: "Safe learning guardrails and recent events",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid gap-3 md:grid-cols-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        label: "Feedback captured",
                                        value: lab.learningMode.operatorFeedbackCaptured
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1392,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        label: "Signal weights updated",
                                        value: lab.learningMode.signalWeightsUpdated
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1393,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        label: "Patterns strengthened",
                                        value: lab.learningMode.patternsStrengthened
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1394,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        label: "Patterns weakened",
                                        value: lab.learningMode.patternsWeakened
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1395,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1391,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-4 flex flex-wrap gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                        tone: lab.learningMode.enabled ? 'success' : 'danger',
                                        children: lab.learningMode.enabled ? 'Learning enabled' : 'Learning off'
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1398,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                        tone: lab.learningMode.safeLearningGuardrails ? 'success' : 'warning',
                                        children: lab.learningMode.safeLearningGuardrails ? 'Safe guardrails enabled' : 'Guardrails disabled'
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1399,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1397,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-4 space-y-2",
                                children: lab.learningMode.recentEvents.map((event)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]",
                                        children: [
                                            event.type,
                                            " • ",
                                            formatTime(event.timestamp),
                                            " • ",
                                            event.actionCandidateId
                                        ]
                                    }, event.id, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1405,
                                        columnNumber: 15
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1403,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1390,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Pattern Engine",
                        subtitle: "Pattern visibility, controls, and simulation",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: lab.patternEngine.map((pattern)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-sm font-semibold",
                                                            children: pattern.name
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 1418,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-xs text-[var(--muted)]",
                                                            children: [
                                                                "Matches ",
                                                                pattern.matches,
                                                                " • Success ",
                                                                pattern.successRate,
                                                                "% • Confidence ",
                                                                pattern.confidence,
                                                                "%"
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 1419,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1417,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                    children: pattern.lifecycleState
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1423,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1416,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-3 flex flex-wrap gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: "View pattern",
                                                    onClick: ()=>props.onCommand('preview strategy')
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1426,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: "Edit pattern",
                                                    onClick: ()=>props.onCommand('preview strategy')
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1427,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: "Disable pattern",
                                                    onClick: ()=>props.onCommand('queue anti drift maintenance')
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1428,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: "Simulate pattern",
                                                    onClick: ()=>props.onRunSimulation()
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1429,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1425,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, pattern.id, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1415,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1413,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1412,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1389,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-4 xl:grid-cols-[1fr_1fr]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Policy Management",
                        subtitle: "Versioned system policy surfaces",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid gap-3 md:grid-cols-2",
                            children: Object.entries(lab.policyManagement).map(([key, policy])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-sm font-semibold capitalize",
                                            children: key.replace(/([A-Z])/g, ' $1')
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1442,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-1 text-xs text-[var(--muted)]",
                                            children: policy?.versionId || 'No version'
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1443,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-3 flex flex-wrap gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: "Preview changes",
                                                    onClick: ()=>props.onCommand('preview strategy')
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1445,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: "Run impact simulation",
                                                    onClick: ()=>props.onRunSimulation()
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1446,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: "Apply update",
                                                    onClick: ()=>props.onCommand('generate sdr actions')
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1447,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: "Rollback version",
                                                    onClick: ()=>props.onCommand('preview strategy')
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1448,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1444,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, key, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1441,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1439,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1438,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Scenario Simulator",
                        subtitle: "Fixture simulations and ad hoc scenario testing",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid gap-3 md:grid-cols-[1fr_1fr]",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "space-y-3",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                className: "block text-xs uppercase tracking-[0.24em] text-[var(--muted)]",
                                                children: [
                                                    "Domain",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                        value: props.simDomain,
                                                        onChange: (event)=>props.setSimDomain(event.target.value),
                                                        className: "mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1460,
                                                        columnNumber: 17
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1458,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                className: "block text-xs uppercase tracking-[0.24em] text-[var(--muted)]",
                                                children: [
                                                    "Signals",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                        value: props.simSignals,
                                                        onChange: (event)=>props.setSimSignals(event.target.value),
                                                        rows: 5,
                                                        className: "mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none"
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1468,
                                                        columnNumber: 17
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1466,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                label: "Run Simulation",
                                                onClick: ()=>props.onRunSimulation()
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1475,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1457,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "space-y-3",
                                        children: lab.scenarioSimulator.fixtures.slice(0, 6).map((fixture)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                onClick: ()=>props.onRunSimulation(fixture.id),
                                                className: "w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-left",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-sm font-semibold",
                                                        children: fixture.name
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1485,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "mt-1 text-xs text-[var(--muted)]",
                                                        children: fixture.description
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1486,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, fixture.id, true, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1479,
                                                columnNumber: 17
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1477,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1456,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                                className: "mt-4 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs text-[var(--muted)]",
                                children: JSON.stringify(props.simulationResult || lab.scenarioSimulator.suiteSummary, null, 2)
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1491,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1455,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1437,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-4 xl:grid-cols-[0.9fr_1.1fr]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Code Intelligence",
                        subtitle: "What the codebase actively supports",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid gap-3 md:grid-cols-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-xs uppercase tracking-[0.24em] text-[var(--muted)]",
                                                children: "Active modules"
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1501,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mt-3 flex flex-wrap gap-2",
                                                children: lab.codeIntelligence.activeModules.map((module)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                        children: module
                                                    }, module, false, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1504,
                                                        columnNumber: 19
                                                    }, this))
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1502,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1500,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-xs uppercase tracking-[0.24em] text-[var(--muted)]",
                                                children: "Services"
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1509,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mt-3 flex flex-wrap gap-2",
                                                children: lab.codeIntelligence.activeServices.map((service)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                        children: service
                                                    }, service, false, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1512,
                                                        columnNumber: 19
                                                    }, this))
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1510,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1508,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1499,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-4 flex flex-wrap gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                        label: "Reload system modules",
                                        onClick: ()=>props.onCommand('generate sdr actions')
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1518,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                        label: "Run system diagnostics",
                                        onClick: ()=>props.onDiagnostic('test_opportunity_engine')
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1519,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                        label: "View architecture map",
                                        onClick: ()=>props.onCommand('preview strategy')
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1520,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1517,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1498,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Drift Monitoring + Diagnostics",
                        subtitle: "Keep the engine explainable and non-generic",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid gap-3 md:grid-cols-2",
                                children: lab.driftMonitoring.map((metric)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-sm font-semibold",
                                                children: metric.label
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1528,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mt-1 text-xs text-[var(--muted)]",
                                                children: metric.metricType
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1529,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mt-3 flex items-center justify-between",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-2xl font-semibold",
                                                        children: metric.value
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1531,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                        tone: metric.severity === 'high' ? 'danger' : metric.severity === 'medium' ? 'warning' : 'success',
                                                        children: metric.severity
                                                    }, void 0, false, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1532,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1530,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, metric.metricType, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1527,
                                        columnNumber: 15
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1525,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-4 grid gap-2 md:grid-cols-2",
                                children: lab.diagnostics.map((diagnostic)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                        label: diagnostic.label,
                                        onClick: ()=>props.onDiagnostic(diagnostic.id)
                                    }, diagnostic.id, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1541,
                                        columnNumber: 15
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1539,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                                className: "mt-4 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs text-[var(--muted)]",
                                children: JSON.stringify(props.commandResult || lab.codeIntelligence, null, 2)
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1544,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1524,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1497,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-4 xl:grid-cols-[0.8fr_1.2fr]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Autopilot",
                        subtitle: "Continuous autonomous validation, bounded repairs, and confidence learning",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid gap-3 md:grid-cols-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        label: "Flows healthy",
                                        value: lab.autopilot.runtimeHealth.flowsHealthy,
                                        tone: "success"
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1553,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        label: "Flows degraded",
                                        value: lab.autopilot.runtimeHealth.flowsDegraded,
                                        tone: lab.autopilot.runtimeHealth.flowsDegraded > 0 ? 'warning' : 'neutral'
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1554,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        label: "Flows quarantined",
                                        value: lab.autopilot.runtimeHealth.flowsQuarantined,
                                        tone: lab.autopilot.runtimeHealth.flowsQuarantined > 0 ? 'danger' : 'neutral'
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1555,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        label: "Open incidents",
                                        value: lab.autopilot.runtimeHealth.openIncidents,
                                        tone: lab.autopilot.runtimeHealth.openIncidents > 0 ? 'warning' : 'neutral'
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1556,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1552,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-4 flex flex-wrap gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                        label: "Run Autopilot",
                                        onClick: ()=>props.onCommand('run autopilot')
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1559,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                        label: "Test Autopilot",
                                        onClick: ()=>props.onDiagnostic('test_autopilot')
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1560,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1558,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-4 text-xs text-[var(--muted)]",
                                children: [
                                    "Weakest areas: ",
                                    lab.autopilot.runtimeHealth.weakestAreas.join(', ') || 'None currently detected'
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1562,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1551,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Scenario Confidence",
                        subtitle: "Critical, reliability, stress, and chaos scenario health",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: [
                                ...lab.autopilot.scenarioConfidence.top,
                                ...lab.autopilot.scenarioConfidence.weakest
                            ].slice(0, 8).map((scenario)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-sm font-semibold",
                                                            children: scenario.scenarioId
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 1573,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-xs text-[var(--muted)]",
                                                            children: [
                                                                scenario.scenarioClass,
                                                                " • ",
                                                                formatTime(scenario.generatedAt)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 1574,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1572,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                    tone: scenario.overallConfidence >= 80 ? 'success' : scenario.overallConfidence >= 60 ? 'warning' : 'danger',
                                                    children: [
                                                        scenario.overallConfidence,
                                                        "%"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1576,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1571,
                                            columnNumber: 17
                                        }, this),
                                        scenario.issues.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-2 text-xs text-[var(--muted)]",
                                            children: scenario.issues.join(', ')
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1581,
                                            columnNumber: 19
                                        }, this) : null
                                    ]
                                }, `${scenario.scenarioId}-${scenario.generatedAt}`, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1570,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1568,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1567,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1550,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-4 xl:grid-cols-[1fr_1fr_1fr]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Repair Activity",
                        subtitle: "What was attempted and what actually worked",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid gap-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        label: "Repairs attempted",
                                        value: lab.autopilot.repairActivity.attempted
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1592,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        label: "Repairs succeeded",
                                        value: lab.autopilot.repairActivity.succeeded,
                                        tone: "success"
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1593,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MetricCard, {
                                        label: "Approvals needed",
                                        value: lab.autopilot.repairActivity.approvalsNeeded,
                                        tone: "warning"
                                    }, void 0, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1594,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1591,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-4 space-y-2",
                                children: lab.autopilot.repairActivity.recent.map((attempt)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]",
                                        children: [
                                            attempt.strategy,
                                            " • ",
                                            attempt.outcome,
                                            " • ",
                                            formatTime(attempt.completedAt)
                                        ]
                                    }, attempt.attemptId, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1598,
                                        columnNumber: 15
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1596,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1590,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Best Path Learning",
                        subtitle: "Workflow paths the system currently trusts most",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: lab.autopilot.bestPathLearning.map((path)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-sm font-semibold",
                                                    children: path.scenarioId
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1610,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                    tone: path.confidenceScore >= 80 ? 'success' : path.confidenceScore >= 60 ? 'warning' : 'danger',
                                                    children: [
                                                        path.confidenceScore,
                                                        "%"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1611,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1609,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-2 text-xs text-[var(--muted)]",
                                            children: path.steps.join(' → ')
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1615,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, path.scenarioId, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1608,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1606,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1605,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Autonomy Policy",
                        subtitle: "Boundaries for detect, repair, and escalate behavior",
                        children: [
                            lab.autopilot.autonomyPolicy ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-3 text-xs text-[var(--muted)]",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            "Policy: ",
                                            lab.autopilot.autonomyPolicy.policyId,
                                            " • v",
                                            lab.autopilot.autonomyPolicy.version
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1624,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            "Allowed repairs: ",
                                            lab.autopilot.autonomyPolicy.allowedRepairs.join(', ')
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1625,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            "Approval required: ",
                                            lab.autopilot.autonomyPolicy.approvalRequiredActions.join(', ')
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1626,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            "Monitor only: ",
                                            lab.autopilot.autonomyPolicy.monitorOnlyActions.join(', ')
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1627,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            "Updated: ",
                                            formatTime(lab.autopilot.autonomyPolicy.updatedAt)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1628,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1623,
                                columnNumber: 13
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(EmptyState, {
                                message: "No autonomy policy stored yet."
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1631,
                                columnNumber: 13
                            }, this),
                            lab.autopilot.quarantinedFlows.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-4 space-y-2",
                                children: lab.autopilot.quarantinedFlows.map((flow)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--danger)]",
                                        children: [
                                            flow.category,
                                            ": ",
                                            flow.summary
                                        ]
                                    }, flow.incidentId, true, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 1636,
                                        columnNumber: 17
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1634,
                                columnNumber: 13
                            }, this) : null
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1621,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1589,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1348,
        columnNumber: 5
    }, this);
}
_c11 = SystemLabView;
function CapabilitiesView(props) {
    const groupedFunctions = props.functionRegistry.reduce((acc, item)=>{
        acc[item.category] = acc[item.category] || [];
        acc[item.category].push(item);
        return acc;
    }, {});
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Header, {
                eyebrow: "Capabilities",
                title: "Function + Agent Registry",
                description: "Human-readable catalog of what the system can do, where to use it, and how to run it."
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1669,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid gap-4 xl:grid-cols-[1fr_1fr]",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Function Registry",
                        subtitle: "Grouped, operator-facing capability surface",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-4",
                            children: Object.entries(groupedFunctions).map(([category, items])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-xs uppercase tracking-[0.24em] text-[var(--muted)]",
                                            children: category
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1676,
                                            columnNumber: 17
                                        }, this),
                                        items.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex items-start justify-between gap-3",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "text-sm font-semibold",
                                                                        children: item.name
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/components/operator-console.tsx",
                                                                        lineNumber: 1681,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "mt-1 text-xs text-[var(--muted)]",
                                                                        children: item.description
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/components/operator-console.tsx",
                                                                        lineNumber: 1682,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 1680,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "flex flex-wrap gap-2",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                                        children: item.entityScope
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/components/operator-console.tsx",
                                                                        lineNumber: 1685,
                                                                        columnNumber: 25
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                                        children: item.outputType
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/components/operator-console.tsx",
                                                                        lineNumber: 1686,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 1684,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1679,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "mt-3 flex flex-wrap gap-2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                                children: item.canBatch ? 'batch' : 'single'
                                                            }, void 0, false, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 1690,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                                children: item.requiresConfirmation ? 'confirm' : 'direct'
                                                            }, void 0, false, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 1691,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                                children: item.explainabilitySupported ? 'explainable' : 'opaque'
                                                            }, void 0, false, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 1692,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1689,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "mt-3 flex flex-wrap gap-2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                                label: "Run",
                                                                onClick: ()=>props.onCommand((item.actionCommand || item.name).replace('{domain}', 'fleetfeet.com'))
                                                            }, void 0, false, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 1695,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                                label: props.flexSelectedFunctions.includes(item.id) ? 'Added to Flex Mode' : 'Add to Flex Mode',
                                                                onClick: ()=>props.setFlexSelectedFunctions(props.flexSelectedFunctions.includes(item.id) ? props.flexSelectedFunctions.filter((value)=>value !== item.id) : [
                                                                        ...props.flexSelectedFunctions,
                                                                        item.id
                                                                    ])
                                                            }, void 0, false, {
                                                                fileName: "[project]/components/operator-console.tsx",
                                                                lineNumber: 1696,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/components/operator-console.tsx",
                                                        lineNumber: 1694,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, item.id, true, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1678,
                                                columnNumber: 19
                                            }, this))
                                    ]
                                }, category, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1675,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1673,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1672,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Agent Registry",
                        subtitle: "Named workflows that package multiple functions into reusable operator tools",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: props.agentRegistry.map((agent)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-start justify-between gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-sm font-semibold",
                                                            children: agent.name
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 1718,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "mt-1 text-xs text-[var(--muted)]",
                                                            children: agent.purpose
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 1719,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1717,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                    tone: agent.currentStatus === 'ready' ? 'success' : agent.currentStatus === 'experimental' ? 'warning' : 'neutral',
                                                    children: agent.currentStatus
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1721,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1716,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-3 text-xs text-[var(--muted)]",
                                            children: agent.workflowSteps.join(' → ')
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1725,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-3 flex flex-wrap gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                    children: agent.estimatedRuntime
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1729,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                    children: agent.mutationScope
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1730,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1728,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-3 flex flex-wrap gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: "Run",
                                                    onClick: ()=>props.onCommand(agent.runCommand.replace('{domain}', 'fleetfeet.com'))
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1733,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: "Explain",
                                                    onClick: ()=>props.onCommand('preview strategy')
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1734,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1732,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, agent.id, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1715,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1713,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1712,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1671,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                title: "Flex Mode",
                subtitle: "Chain multiple functions without coding",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "grid gap-4 xl:grid-cols-[0.8fr_1.2fr]",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-4",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SelectGroup, {
                                    label: "Scope",
                                    value: props.flexScope,
                                    options: [
                                        'single-account',
                                        'person',
                                        'filtered-list',
                                        'saved-segment'
                                    ],
                                    onChange: (value)=>props.setFlexScope(value)
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1745,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SelectGroup, {
                                    label: "Output",
                                    value: props.flexOutputMode,
                                    options: [
                                        'update entities',
                                        'create report',
                                        'create actions',
                                        'preview'
                                    ],
                                    onChange: (value)=>props.setFlexOutputMode(value)
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1751,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(SelectGroup, {
                                    label: "Run Mode",
                                    value: props.flexRunMode,
                                    options: [
                                        'now',
                                        'queue',
                                        'nightly'
                                    ],
                                    onChange: (value)=>props.setFlexRunMode(value)
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1757,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1744,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-sm font-semibold",
                                            children: "Selected Function Chain"
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1766,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-3 space-y-2",
                                            children: props.flexSelectedFunctions.length > 0 ? props.flexSelectedFunctions.map((id, index)=>{
                                                const definition = props.functionRegistry.find((item)=>item.id === id);
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2 text-sm",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "text-[var(--muted)]",
                                                            children: index + 1
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 1772,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            children: definition?.name || id
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 1773,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, id, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1771,
                                                    columnNumber: 21
                                                }, this);
                                            }) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-sm text-[var(--muted)]",
                                                children: "Add functions from the registry to build a workflow."
                                            }, void 0, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 1776,
                                                columnNumber: 22
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1767,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1765,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-sm font-semibold",
                                            children: "Workflow Preview"
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1780,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-2 text-xs text-[var(--muted)]",
                                            children: [
                                                "Scope: ",
                                                props.flexScope,
                                                " • Output: ",
                                                props.flexOutputMode,
                                                " • Run mode: ",
                                                props.flexRunMode
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1781,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-3 flex flex-wrap gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: "Run workflow",
                                                    onClick: ()=>props.onCommand(resolveFlexCommand(props.flexSelectedFunctions, props.functionRegistry))
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1785,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: "Clear",
                                                    onClick: ()=>props.setFlexSelectedFunctions([])
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1786,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1784,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1779,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1764,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/operator-console.tsx",
                    lineNumber: 1743,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1742,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1668,
        columnNumber: 5
    }, this);
}
_c12 = CapabilitiesView;
function Header(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col gap-2 border-b border-[var(--border)] pb-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-xs font-medium uppercase tracking-wider text-[var(--muted)]",
                children: props.eyebrow
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1799,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        className: "text-xl font-semibold tracking-tight text-[var(--text)]",
                        children: props.title
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1801,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                        className: "h-4 w-4 text-[var(--muted)]"
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1802,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1800,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "max-w-3xl text-sm text-[var(--muted)]",
                children: props.description
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1804,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1798,
        columnNumber: 5
    }, this);
}
_c13 = Header;
function Panel(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: "card rounded-[var(--card-radius)] p-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-base font-semibold text-[var(--text)]",
                        children: props.title
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1813,
                        columnNumber: 9
                    }, this),
                    props.subtitle ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-1 text-sm text-[var(--muted)]",
                        children: props.subtitle
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1814,
                        columnNumber: 27
                    }, this) : null
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1812,
                columnNumber: 7
            }, this),
            props.children
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1811,
        columnNumber: 5
    }, this);
}
_c14 = Panel;
function MetricCard(props) {
    const toneClass = props.tone === 'success' ? 'text-[var(--success)]' : props.tone === 'warning' ? 'text-[var(--warning)]' : props.tone === 'danger' ? 'text-[var(--danger)]' : 'text-[var(--text)]';
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "card rounded-[var(--card-radius)] p-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-xs font-medium uppercase tracking-wider text-[var(--muted)]",
                children: props.label
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1831,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `mt-2 text-2xl font-semibold ${toneClass}`,
                children: props.value
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1832,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1830,
        columnNumber: 5
    }, this);
}
_c15 = MetricCard;
function Badge(props) {
    const toneClass = props.tone === 'success' ? 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success)]/20' : props.tone === 'warning' ? 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning)]/20' : props.tone === 'danger' ? 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger)]/20' : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)]';
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: `rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`,
        children: props.children
    }, void 0, false, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1845,
        columnNumber: 10
    }, this);
}
_c16 = Badge;
function ActionButton(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        type: "button",
        onClick: ()=>void props.onClick(),
        className: "pill text-xs font-medium",
        children: props.label
    }, void 0, false, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1850,
        columnNumber: 5
    }, this);
}
_c17 = ActionButton;
function QuickStat(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center justify-between",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "text-xs text-[var(--muted)]",
                children: props.label
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1863,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "font-mono text-xs text-[var(--text)]",
                children: props.value
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1864,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1862,
        columnNumber: 5
    }, this);
}
_c18 = QuickStat;
function EmptyState(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex min-h-[300px] items-center justify-center rounded-[var(--card-radius)] border border-dashed border-[var(--border)] text-sm text-[var(--muted)]",
        children: props.message
    }, void 0, false, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1871,
        columnNumber: 5
    }, this);
}
_c19 = EmptyState;
function SelectGroup(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-2 text-xs uppercase tracking-[0.24em] text-[var(--muted)]",
                children: props.label
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1885,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-wrap gap-2",
                children: props.options.map((option)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>props.onChange(option),
                        className: `pill ${props.value === option ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent-strong)]' : ''}`,
                        children: option
                    }, option, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1888,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1886,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1884,
        columnNumber: 5
    }, this);
}
_c20 = SelectGroup;
function CopilotPanel(props) {
    const state = props.copilotState;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
        className: "card flex min-w-0 flex-col p-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-4 flex items-start justify-between gap-3 border-b border-[var(--border)] pb-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-xs uppercase tracking-[0.24em] text-[var(--muted)]",
                                children: "AI Co-Pilot"
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1926,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-1 text-lg font-semibold",
                                children: "Suggestions, Insights, Chat"
                            }, void 0, false, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1927,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-1 text-xs text-[var(--muted)]",
                                children: [
                                    "Context: ",
                                    props.selectedSection,
                                    props.selectedAccountId ? ` • ${props.selectedAccountId}` : ''
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/operator-console.tsx",
                                lineNumber: 1928,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1925,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: props.onClose,
                        className: "rounded-full border border-[var(--border)] p-2 text-[var(--muted)] transition hover:text-[var(--text)]",
                        title: "Collapse Co-Pilot",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$panel$2d$right$2d$close$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PanelRightClose$3e$__["PanelRightClose"], {
                            className: "h-4 w-4"
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1938,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1932,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1924,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-4 overflow-y-auto",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Suggestions",
                        subtitle: "Ranked next steps based on system state and current context",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: (state?.suggestions || []).map((suggestion)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-start justify-between gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "text-sm font-semibold",
                                                            children: suggestion.title
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 1949,
                                                            columnNumber: 21
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "mt-1 text-xs text-[var(--muted)]",
                                                            children: suggestion.description
                                                        }, void 0, false, {
                                                            fileName: "[project]/components/operator-console.tsx",
                                                            lineNumber: 1950,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1948,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                    tone: suggestion.riskLevel === 'high' ? 'danger' : suggestion.riskLevel === 'medium' ? 'warning' : 'success',
                                                    children: suggestion.priority
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1952,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1947,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-3 flex flex-wrap gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                    children: suggestion.category
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1957,
                                                    columnNumber: 19
                                                }, this),
                                                suggestion.estimatedCount != null ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                    children: suggestion.estimatedCount
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1958,
                                                    columnNumber: 56
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1956,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-3 flex flex-wrap gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: suggestion.actionLabel,
                                                    onClick: ()=>props.onAction(suggestion.actionCommand, false)
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1961,
                                                    columnNumber: 19
                                                }, this),
                                                props.selectedAccountId && state?.suggestionPreview.topCandidateId ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: "Explain",
                                                    onClick: ()=>props.onExplain({
                                                            explainType: 'action',
                                                            actionId: state.suggestionPreview.topCandidateId
                                                        })
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1966,
                                                    columnNumber: 21
                                                }, this) : null
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1960,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, suggestion.id, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1946,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1944,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1943,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Insights",
                        subtitle: "Real-time observations from signals, patterns, learning, and drift",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: (state?.insights || []).map((insight)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-sm font-semibold",
                                                    children: insight.title
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1982,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                    tone: insight.severity === 'critical' ? 'danger' : insight.severity === 'warning' ? 'warning' : 'neutral',
                                                    children: insight.category
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 1983,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1981,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-2 text-xs text-[var(--muted)]",
                                            children: insight.summary
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1987,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, insight.id, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1980,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1978,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1977,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Conversation",
                        subtitle: "Ask for explanation, search, jobs, diagnostics, or action generation",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "max-h-64 space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3",
                                    children: props.messages.map((message)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: `rounded-lg px-3 py-2 text-sm ${message.role === 'assistant' ? 'bg-[var(--accent-muted)] text-[var(--text)]' : 'bg-[var(--surface)] text-[var(--muted)]'}`,
                                            children: message.text
                                        }, message.id, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 1997,
                                            columnNumber: 17
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 1995,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                    value: props.prompt,
                                    onChange: (event)=>props.setPrompt(event.target.value),
                                    rows: 4,
                                    placeholder: "Ask: Why is this account high priority? Find ecommerce companies evaluating CMS. Run research on fleetfeet.com.",
                                    className: "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none placeholder:text-[var(--muted)]"
                                }, void 0, false, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 2009,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-wrap gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                            label: props.busy ? 'Thinking…' : 'Ask Co-Pilot',
                                            onClick: ()=>props.onSubmitPrompt(props.prompt)
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 2017,
                                            columnNumber: 15
                                        }, this),
                                        (state?.conversationStarters || []).slice(0, 3).map((starter)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                label: starter,
                                                onClick: ()=>props.onSubmitPrompt(starter)
                                            }, starter, false, {
                                                fileName: "[project]/components/operator-console.tsx",
                                                lineNumber: 2019,
                                                columnNumber: 17
                                            }, this))
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 2016,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 1994,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 1993,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Learning Updates",
                        subtitle: "What the system is learning and how policy is shifting",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-2",
                            children: (state?.learningUpdates || []).map((update)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "font-semibold text-[var(--text)]",
                                            children: update.title
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 2029,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-1",
                                            children: update.summary
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 2030,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, update.id, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 2028,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 2026,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 2025,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "System Alerts",
                        subtitle: "Guardrails and confirmation-sensitive operations",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-3",
                            children: [
                                (state?.systemAlerts || []).map((alert)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "rounded-2xl border border-[var(--border)] px-4 py-3",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "text-sm font-semibold",
                                                    children: alert.summary
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 2041,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Badge, {
                                                    tone: alert.level === 'warning' ? 'warning' : 'neutral',
                                                    children: alert.level
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 2042,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 2040,
                                            columnNumber: 17
                                        }, this)
                                    }, alert.id, false, {
                                        fileName: "[project]/components/operator-console.tsx",
                                        lineNumber: 2039,
                                        columnNumber: 15
                                    }, this)),
                                props.pendingConfirmation ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-xl border border-[var(--warning)]/40 bg-[var(--warning-bg)] px-4 py-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "text-sm font-semibold text-[var(--warning)]",
                                            children: "Confirmation required"
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 2048,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-2 text-xs text-[var(--muted)]",
                                            children: props.pendingConfirmation.message
                                        }, void 0, false, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 2049,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-3 flex gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: "Confirm",
                                                    onClick: props.onConfirm
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 2051,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ActionButton, {
                                                    label: "Cancel",
                                                    onClick: props.onCancelConfirmation
                                                }, void 0, false, {
                                                    fileName: "[project]/components/operator-console.tsx",
                                                    lineNumber: 2052,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/components/operator-console.tsx",
                                            lineNumber: 2050,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/components/operator-console.tsx",
                                    lineNumber: 2047,
                                    columnNumber: 15
                                }, this) : null
                            ]
                        }, void 0, true, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 2037,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 2036,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Panel, {
                        title: "Output",
                        subtitle: "Latest explanation, simulation, or query result",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                            className: "overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs text-[var(--muted)]",
                            children: JSON.stringify(props.queryResult || props.simulationResult || props.commandResult || state?.suggestionPreview || {}, null, 2)
                        }, void 0, false, {
                            fileName: "[project]/components/operator-console.tsx",
                            lineNumber: 2060,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/components/operator-console.tsx",
                        lineNumber: 2059,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/operator-console.tsx",
                lineNumber: 1942,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/operator-console.tsx",
        lineNumber: 1923,
        columnNumber: 5
    }, this);
}
_c21 = CopilotPanel;
function formatTime(value) {
    return new Date(value).toLocaleString();
}
function inferPersonRole(title) {
    const lower = String(title || '').toLowerCase();
    if (lower.includes('vp') || lower.includes('chief')) return 'economic buyer or strategic approver';
    if (lower.includes('director') || lower.includes('lead')) return 'day-to-day evaluator and influencer';
    if (lower.includes('engineer') || lower.includes('developer')) return 'technical validator';
    return 'potential stakeholder requiring validation';
}
function inferOutreachAngle(title) {
    const lower = String(title || '').toLowerCase();
    if (lower.includes('marketing')) return 'connect performance, content velocity, and campaign agility';
    if (lower.includes('engineer') || lower.includes('platform')) return 'focus on architecture, workflow friction, and migration confidence';
    if (lower.includes('product')) return 'highlight team velocity and content iteration speed';
    return 'anchor on evidence-backed operational pain and concrete next steps';
}
function resolveFlexCommand(selectedFunctions, registry) {
    const definitions = selectedFunctions.map((id)=>registry.find((item)=>item.id === id)).filter(Boolean);
    if (definitions.some((item)=>item.id === 'run-nightly-jobs')) return 'run nightly jobs';
    if (definitions.some((item)=>item.id === 'refresh-stale-entities')) return 'refresh stale entities';
    if (definitions.some((item)=>item.id === 'recalculate-opportunity-scores')) return 'recalculate scores';
    if (definitions.some((item)=>item.id === 'generate-sdr-actions')) return 'generate sdr actions';
    if (definitions.some((item)=>item.id === 'scan-account')) return 'queue research fleetfeet.com';
    return 'preview strategy';
}
function requiresCommandConfirmation(command) {
    const lower = command.toLowerCase();
    return lower.includes('recalculate scores') || lower.includes('run nightly jobs') || lower.includes('refresh stale entities') || lower.includes('queue anti drift maintenance');
}
function mapBatchOperation(operationId) {
    switch(operationId){
        case 'refresh_stale_entities':
            return 'refresh stale entities';
        case 'recalculate_opportunity_scores':
            return 'recalculate scores';
        case 'rerun_pattern_detection':
            return 'generate sdr actions';
        case 'generate_briefs_for_incomplete_accounts':
            return 'run nightly jobs';
        case 'run_crawl_across_accounts':
        default:
            return 'queue research fleetfeet.com';
    }
}
var _c, _c1, _c2, _c3, _c4, _c5, _c6, _c7, _c8, _c9, _c10, _c11, _c12, _c13, _c14, _c15, _c16, _c17, _c18, _c19, _c20, _c21;
__turbopack_context__.k.register(_c, "OperatorConsole");
__turbopack_context__.k.register(_c1, "Workspace");
__turbopack_context__.k.register(_c2, "OverviewView");
__turbopack_context__.k.register(_c3, "AccountsView");
__turbopack_context__.k.register(_c4, "PeopleView");
__turbopack_context__.k.register(_c5, "SignalsView");
__turbopack_context__.k.register(_c6, "PatternsView");
__turbopack_context__.k.register(_c7, "ActionsView");
__turbopack_context__.k.register(_c8, "ResearchView");
__turbopack_context__.k.register(_c9, "JobsView");
__turbopack_context__.k.register(_c10, "MetricsView");
__turbopack_context__.k.register(_c11, "SystemLabView");
__turbopack_context__.k.register(_c12, "CapabilitiesView");
__turbopack_context__.k.register(_c13, "Header");
__turbopack_context__.k.register(_c14, "Panel");
__turbopack_context__.k.register(_c15, "MetricCard");
__turbopack_context__.k.register(_c16, "Badge");
__turbopack_context__.k.register(_c17, "ActionButton");
__turbopack_context__.k.register(_c18, "QuickStat");
__turbopack_context__.k.register(_c19, "EmptyState");
__turbopack_context__.k.register(_c20, "SelectGroup");
__turbopack_context__.k.register(_c21, "CopilotPanel");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=_584815d1._.js.map