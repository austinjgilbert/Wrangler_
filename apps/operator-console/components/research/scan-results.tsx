'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ExternalLink,
  CheckCircle2,
  Cpu,
  Gauge,
  Lightbulb,
  Building2,
  Sparkles,
  FileText,
  Download,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ScanResult } from '@/lib/types'

interface ScanResultsProps {
  result: ScanResult
}

const categoryColors: Record<string, string> = {
  'Frontend Framework': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  'Meta Framework': 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
  Runtime: 'bg-green-500/10 text-green-500 border-green-500/20',
  Database: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  'Cloud Provider': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  Orchestration: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  Payments: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
  Analytics: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  Support: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
  CDN: 'bg-red-500/10 text-red-500 border-red-500/20',
}

function getPerformanceScore(metrics: ScanResult['performance']): number {
  if (!metrics) return 0
  const scores = [
    metrics.loadTime && metrics.loadTime < 2 ? 25 : metrics.loadTime && metrics.loadTime < 4 ? 15 : 5,
    metrics.ttfb && metrics.ttfb < 0.5 ? 25 : metrics.ttfb && metrics.ttfb < 1 ? 15 : 5,
    metrics.cls !== undefined && metrics.cls < 0.1 ? 25 : metrics.cls !== undefined && metrics.cls < 0.25 ? 15 : 5,
    metrics.lcp && metrics.lcp < 2.5 ? 25 : metrics.lcp && metrics.lcp < 4 ? 15 : 5,
  ]
  return scores.reduce((a, b) => a + b, 0)
}

export function ScanResults({ result }: ScanResultsProps) {
  const router = useRouter()
  const performanceScore = getPerformanceScore(result.performance)
  const [isQueueing, setIsQueueing] = useState(false)

  const normalizedDomain = result.url
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .trim()

  async function queueResearch() {
    if (!normalizedDomain) return
    setIsQueueing(true)
    try {
      await fetch('/api/console/command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command: `queue research ${normalizedDomain}` }),
      })
      router.push('/enrichment')
    } finally {
      setIsQueueing(false)
    }
  }

  function exportResult() {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `${normalizedDomain || 'scan-result'}.json`
    link.click()
    URL.revokeObjectURL(href)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-green-500" />
                Scan Complete
              </CardTitle>
              <CardDescription className="flex items-center gap-2">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  {result.url}
                  <ExternalLink className="size-3" />
                </a>
              </CardDescription>
            </div>
            <CardAction>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportResult}>
                  <Download className="mr-2 size-4" />
                  Export
                </Button>
                <Button size="sm" onClick={() => void queueResearch()} disabled={isQueueing}>
                  <Sparkles className="mr-2 size-4" />
                  {isQueueing ? 'Queueing...' : 'Queue Research'}
                </Button>
              </div>
            </CardAction>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">{result.title}</h3>
            <p className="text-muted-foreground">{result.description}</p>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs defaultValue="tech-stack" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="tech-stack" className="gap-2">
            <Cpu className="size-4" />
            <span className="hidden sm:inline">Tech Stack</span>
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-2">
            <Gauge className="size-4" />
            <span className="hidden sm:inline">Performance</span>
          </TabsTrigger>
          <TabsTrigger value="ai-signals" className="gap-2">
            <Lightbulb className="size-4" />
            <span className="hidden sm:inline">AI Signals</span>
          </TabsTrigger>
          <TabsTrigger value="business" className="gap-2">
            <Building2 className="size-4" />
            <span className="hidden sm:inline">Business</span>
          </TabsTrigger>
        </TabsList>

        {/* Tech Stack Tab */}
        <TabsContent value="tech-stack">
          <Card>
            <CardHeader>
              <CardTitle>Detected Technologies</CardTitle>
              <CardDescription>
                {result.techStack.length} technologies identified with confidence scores
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {result.techStack.map((tech) => (
                  <div
                    key={tech.name}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary">
                        {tech.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium">
                          {tech.name}
                          {tech.version && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              v{tech.version}
                            </span>
                          )}
                        </p>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            categoryColors[tech.category] || ''
                          }`}
                        >
                          {tech.category}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">
                        {Math.round(tech.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance">
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
              <CardDescription>Core Web Vitals and loading performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="flex size-20 items-center justify-center rounded-full border-4 border-primary">
                    <span className="text-2xl font-bold">{performanceScore}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-lg">Overall Score</p>
                    <p className="text-sm text-muted-foreground">
                      Based on Core Web Vitals
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {result.performance && (
                    <>
                      <div className="space-y-2 rounded-lg border p-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Load Time</span>
                          <span className="font-medium">{result.performance.loadTime}s</span>
                        </div>
                        <Progress
                          value={Math.max(0, 100 - (result.performance.loadTime || 0) * 20)}
                        />
                      </div>

                      <div className="space-y-2 rounded-lg border p-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">TTFB</span>
                          <span className="font-medium">{result.performance.ttfb}s</span>
                        </div>
                        <Progress
                          value={Math.max(0, 100 - (result.performance.ttfb || 0) * 100)}
                        />
                      </div>

                      <div className="space-y-2 rounded-lg border p-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">CLS</span>
                          <span className="font-medium">{result.performance.cls}</span>
                        </div>
                        <Progress
                          value={Math.max(0, 100 - (result.performance.cls || 0) * 200)}
                        />
                      </div>

                      <div className="space-y-2 rounded-lg border p-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">LCP</span>
                          <span className="font-medium">{result.performance.lcp}s</span>
                        </div>
                        <Progress
                          value={Math.max(0, 100 - (result.performance.lcp || 0) * 20)}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Signals Tab */}
        <TabsContent value="ai-signals">
          <Card>
            <CardHeader>
              <CardTitle>AI Readiness Signals</CardTitle>
              <CardDescription>
                Detected signals indicating AI/ML adoption and modernization efforts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {result.aiSignals?.map((signal, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Lightbulb className="size-5 text-primary" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{signal.type}</p>
                        <Badge variant="outline">
                          {Math.round(signal.confidence * 100)}% confidence
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {signal.description}
                      </p>
                      {signal.source && (
                        <p className="text-xs text-muted-foreground">
                          Source: {signal.source}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Business Tab */}
        <TabsContent value="business">
          <Card>
            <CardHeader>
              <CardTitle>Business Units</CardTitle>
              <CardDescription>
                Identified business segments and service areas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {result.businessUnits?.map((unit) => (
                  <div
                    key={unit}
                    className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <Building2 className="size-5 text-primary" />
                    <span className="font-medium">{unit}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Actions */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <p className="text-sm text-muted-foreground">
            Want more detailed intelligence on this company?
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/intelligence/osint')}>
              <FileText className="mr-2 size-4" />
              View OSINT Reports
            </Button>
            <Button onClick={() => router.push('/enrichment')}>
              <Sparkles className="mr-2 size-4" />
              Open Enrichment Pipeline
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
