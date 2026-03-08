module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/lib/server-proxy.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "proxyToWorker",
    ()=>proxyToWorker,
    "workerBaseUrl",
    ()=>workerBaseUrl,
    "workerHeaders",
    ()=>workerHeaders
]);
const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';
function workerBaseUrl() {
    return process.env.WORKER_BASE_URL || DEFAULT_BASE_URL;
}
function workerHeaders() {
    const headers = {
        'content-type': 'application/json'
    };
    if (process.env.WORKER_ADMIN_TOKEN) {
        headers['x-admin-token'] = process.env.WORKER_ADMIN_TOKEN;
    }
    if (process.env.WORKER_API_KEY) {
        headers['x-api-key'] = process.env.WORKER_API_KEY;
    }
    return headers;
}
async function proxyToWorker(path, init) {
    const response = await fetch(`${workerBaseUrl()}${path}`, {
        ...init,
        headers: {
            ...workerHeaders(),
            ...init?.headers || {}
        },
        cache: 'no-store'
    });
    const payload = await response.text();
    return new Response(payload, {
        status: response.status,
        headers: {
            'content-type': response.headers.get('content-type') || 'application/json'
        }
    });
}
}),
"[project]/app/api/console/snapshot/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$server$2d$proxy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/server-proxy.ts [app-route] (ecmascript)");
;
async function GET() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$server$2d$proxy$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["proxyToWorker"])('/operator/console/snapshot');
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__60825fd6._.js.map