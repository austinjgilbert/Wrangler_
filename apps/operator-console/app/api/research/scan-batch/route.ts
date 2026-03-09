import { workerBaseUrl, workerHeaders } from '@/lib/server-proxy'

const MAX_URLS_PER_REQUEST = 8
const MAX_ENCODED_QUERY_LENGTH = 1500

function chunkUrls(urls: string[]) {
  const chunks: string[][] = []
  let current: string[] = []

  for (const url of urls) {
    const candidate = [...current, url]
    const encodedLength = encodeURIComponent(candidate.join(',')).length
    if (
      current.length > 0 &&
      (candidate.length > MAX_URLS_PER_REQUEST || encodedLength > MAX_ENCODED_QUERY_LENGTH)
    ) {
      chunks.push(current)
      current = [url]
      continue
    }
    current = candidate
  }

  if (current.length > 0) {
    chunks.push(current)
  }

  return chunks
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const urls = Array.isArray(body?.urls)
    ? body.urls.map((value: unknown) => String(value || '').trim()).filter(Boolean)
    : []

  if (urls.length === 0) {
    return Response.json(
      { ok: false, error: { message: 'urls is required' } },
      { status: 400 },
    )
  }

  const chunks = chunkUrls(urls)
  const responses = await Promise.all(
    chunks.map(async (chunk) => {
      const response = await fetch(
        `${workerBaseUrl()}/scan-batch?urls=${encodeURIComponent(chunk.join(','))}`,
        {
          headers: workerHeaders(),
          cache: 'no-store',
        },
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error?.message || 'Batch scan request failed')
      }
      return payload?.data || {}
    }),
  )

  const combinedResults = responses.flatMap((item) => item.results || [])
  const combinedFailed = responses.flatMap((item) => item.failed || [])
  const summaries = responses.map((item) => item.summary || {})

  const topAIReady = combinedResults
    .filter((item) => typeof item?.aiReadinessScore === 'number')
    .sort((a, b) => Number(b.aiReadinessScore || 0) - Number(a.aiReadinessScore || 0))
    .slice(0, 10)
    .map((item) => ({
      url: item.url,
      aiReadinessScore: item.aiReadinessScore,
      aiReadinessLevel: item.aiReadinessLevel,
      opportunityScore: item.opportunityScore,
    }))

  return Response.json({
    ok: true,
    data: {
      summary: {
        totalScanned: combinedResults.length + combinedFailed.length,
        successful: combinedResults.length,
        failed: combinedFailed.length,
        mode: chunks.length > 1 ? 'chunked' : summaries[0]?.mode,
        guidance:
          chunks.length > 1
            ? 'Large input was split into multiple live batch scans to avoid URL-size limits.'
            : summaries[0]?.guidance,
        topAIReady,
      },
      results: combinedResults,
      failed: combinedFailed,
      scannedAt: new Date().toISOString(),
    },
  })
}
