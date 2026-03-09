const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';

export function workerBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || process.env.WORKER_BASE_URL || DEFAULT_BASE_URL;
}

export function workerHeaders() {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (process.env.WORKER_ADMIN_TOKEN) {
    headers['x-admin-token'] = process.env.WORKER_ADMIN_TOKEN;
  }
  if (process.env.WORKER_API_KEY) {
    headers['x-api-key'] = process.env.WORKER_API_KEY;
  }
  return headers;
}

export async function proxyToWorker(path: string, init?: RequestInit) {
  const response = await fetch(`${workerBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...workerHeaders(),
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  const payload = await response.text();
  return new Response(payload, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') || 'application/json',
    },
  });
}
