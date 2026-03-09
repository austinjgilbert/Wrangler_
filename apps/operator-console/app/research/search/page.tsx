'use client'

import { useMemo, useState } from 'react'
import { AppPageFrame } from '@/components/app-page-frame'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AlertCircle, ExternalLink, Loader2, Search } from 'lucide-react'

type SearchResult = {
  title?: string
  url: string
  description?: string
  score?: number
}

export default function SearchResearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queuedDomain, setQueuedDomain] = useState<string | null>(null)

  const domains = useMemo(
    () =>
      results.map((result) => {
        try {
          return new URL(result.url).hostname.replace(/^www\./, '')
        } catch {
          return result.url
        }
      }),
    [results],
  )

  async function runSearch() {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/research/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, limit: 8 }),
      })
      const payload = await response.json()
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error?.message || 'Search failed')
      }
      setResults(payload?.data?.results || payload?.results || [])
    } catch (nextError: any) {
      setError(nextError?.message || 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  async function queueResearch(domain: string) {
    setQueuedDomain(domain)
    setError(null)
    try {
      const response = await fetch('/api/console/command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command: `queue research ${domain}` }),
      })
      const payload = await response.json()
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error?.message || 'Failed to queue research')
      }
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to queue research')
    } finally {
      setQueuedDomain(null)
    }
  }

  return (
    <AppPageFrame
      breadcrumbs={[
        { label: 'Research', href: '/research' },
        { label: 'Search' },
      ]}
    >
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Web Search Intelligence</h1>
        <p className="text-muted-foreground">
          Search the web with the live worker, store the action in the job feed, and queue deeper background research.
        </p>
      </div>

      <Card>
        <CardContent className="flex gap-3 p-6">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for a company, product signal, or market event"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void runSearch()
              }
            }}
          />
          <Button onClick={() => void runSearch()} disabled={!query.trim() || loading}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Search className="mr-2 size-4" />}
            Search
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {results.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Search Results</CardTitle>
              <CardDescription>Ranked live results from the worker search endpoint.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {results.map((result, index) => {
                const domain = domains[index]
                return (
                  <div key={`${result.url}-${index}`} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {result.title || domain}
                        </a>
                        <p className="text-xs text-muted-foreground">{domain}</p>
                      </div>
                      <Badge variant="outline">{Math.round(Number(result.score || 0)) || 'ranked'}</Badge>
                    </div>
                    {result.description && (
                      <p className="mt-3 text-sm text-muted-foreground">{result.description}</p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a href={result.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-2 size-4" />
                          Open
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void queueResearch(domain)}
                        disabled={queuedDomain === domain}
                      >
                        {queuedDomain === domain && <Loader2 className="mr-2 size-4 animate-spin" />}
                        Queue Research
                      </Button>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Live Flow</CardTitle>
              <CardDescription>
                Every search is recorded as a live job at the top of the app. Queueing research creates deeper background work that will appear in the enrichment/job feed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>1. Run a live web search.</p>
              <p>2. Review ranked results and pick a target domain.</p>
              <p>3. Queue background research to trigger downstream enrichment and pattern work.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </AppPageFrame>
  )
}
