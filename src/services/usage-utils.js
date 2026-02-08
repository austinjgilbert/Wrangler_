/**
 * Usage helper utilities
 */

function pickFirstValue(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
}

export async function readJsonBody(request) {
  if (!request) return null;
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }
    const text = await request.text();
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

export function buildPromptFromBody(body, url) {
  const queryParam = url.searchParams.get('q') || url.searchParams.get('query') || url.searchParams.get('search');
  const inputParam = url.searchParams.get('input') || url.searchParams.get('url') || url.searchParams.get('domain');
  const prompt = pickFirstValue([
    body?.prompt,
    body?.query,
    body?.question,
    body?.message,
    body?.text,
    body?.input,
    body?.search,
    queryParam,
    inputParam,
  ]);

  if (typeof prompt === 'string') {
    return prompt.trim();
  }

  return prompt ? String(prompt) : null;
}

export async function buildPromptFromRequest(request, url) {
  let cloned = null;
  try {
    cloned = request.clone();
  } catch (error) {
    cloned = request;
  }

  const body = await readJsonBody(cloned);
  return buildPromptFromBody(body, url);
}
