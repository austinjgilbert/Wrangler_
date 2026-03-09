'use client'

import { useMemo, useState } from 'react'
import { AppPageFrame } from '@/components/app-page-frame'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { AlertCircle, Loader2, Upload } from 'lucide-react'

type BatchResult = {
  url: string
  rank: number
  aiReadinessScore?: number
  aiReadinessLevel?: string
  opportunityScore?: number
  technologyStack?: {
    frameworks?: string[]
    cms?: string[]
    legacySystems?: string[]
  }
  businessScale?: {
    businessScale?: string
  }
}

type BatchSummary = {
  totalScanned: number
  successful: number
  failed: number
  topAIReady?: Array<{
    url: string
    aiReadinessScore: number
    aiReadinessLevel: string
  }>
  guidance?: string
}

export default function BatchResearchPage() {
  const [urlsText, setUrlsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<BatchSummary | null>(null)
  const [results, setResults] = useState<BatchResult[]>([])

  const urls = useMemo(
    () =>
      urlsText
        .split(/\n|,/)
        .map((value) => value.trim())
        .filter(Boolean),
    [urlsText],
  )

  async function runBatchScan() {
    if (!urls.length) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/research/scan-batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ urls }),
      })
      const payload = await response.json()
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error?.message || 'Batch scan failed')
      }
      const data = payload?.data || {}
      setSummary(data.summary || null)
      setResults(data.results || [])
    } catch (nextError: any) {
      setError(nextError?.message || 'Batch scan failed')
      setSummary(null)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppPageFrame
      breadcrumbs={[
        { label: 'Research', href: '/research' },
        { label: 'Batch Scan' },
      ]}
    >
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Batch Website Scan</h1>
        <p className="text-muted-foreground">
          Run lightweight scans across many domains, compare readiness, and surface which accounts deserve deeper enrichment.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload URLs</CardTitle>
          <CardDescription>Paste one URL per line or a comma-separated list.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={urlsText}
            onChange={(event) => setUrlsText(event.target.value)}
            placeholder={'https://stripe.com\nhttps://vercel.com\nhttps://linear.app'}
            className="min-h-40"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{urls.length} URLs ready</p>
            <Button onClick={() => void runBatchScan()} disabled={!urls.length || loading}>
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
              Run Batch Scan
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-semibold">{summary.totalScanned}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Successful</p><p className="text-2xl font-semibold">{summary.successful}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Failed</p><p className="text-2xl font-semibold">{summary.failed}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Guidance</p><p className="text-sm text-muted-foreground">{summary.guidance || 'Use top-ranked accounts for deeper scans.'}</p></CardContent></Card>
        </div>
      )}

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Batch Results</CardTitle>
            <CardDescription>Live results from the worker batch scan endpoint.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.map((result) => (
              <div key={result.url} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium">{result.url}</p>
                    <p className="text-xs text-muted-foreground">
                      {result.businessScale?.businessScale || 'Unknown scale'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Rank #{result.rank}</Badge>
                    <Badge variant="outline">
                      AI {Math.round(Number(result.aiReadinessScore || 0))}% {result.aiReadinessLevel || ''}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(result.technologyStack?.frameworks || []).slice(0, 4).map((tech) => (
                    <Badge key={tech} variant="secondary">{tech}</Badge>
                  ))}
                  {(result.technologyStack?.cms || []).slice(0, 2).map((tech) => (
                    <Badge key={tech} variant="secondary">{tech}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </AppPageFrame>
  )
}
