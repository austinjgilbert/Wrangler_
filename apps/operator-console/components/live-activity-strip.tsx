'use client'

import Link from 'next/link'
import { Activity, Bot, Clock3, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSnapshot } from '@/lib/hooks/use-api'

function summarizeStage(stage: unknown, fallback: string) {
  if (typeof stage === 'string' && stage.trim()) return stage
  if (typeof stage === 'number' && Number.isFinite(stage)) return `Stage ${stage}`
  return fallback
}

export function LiveActivityStrip() {
  const { data: snapshot } = useSnapshot()

  if (!snapshot) return null

  const recentJobs = (snapshot.jobs?.recent || []).slice(0, 6)
  const liveJobs = recentJobs.filter((job: any) =>
    ['running', 'in_progress', 'queued', 'pending'].includes(String(job.status || '')),
  )
  const gptActions = recentJobs.filter((job: any) =>
    /search|wrangler|gpt|research/i.test(String(job.jobType || '')),
  )
  const recentSignals = (snapshot.signals?.recent || []).slice(0, 4)

  return (
    <div className="border-b bg-background/95 px-4 py-3 backdrop-blur lg:px-6">
      <div className="grid gap-3 xl:grid-cols-[1.2fr_1.2fr_1fr]">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-3 p-3">
            <Bot className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Live GPT Activity</p>
                <Badge variant="outline">{gptActions.length}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {gptActions.length > 0 ? (
                  gptActions.slice(0, 3).map((job: any) => (
                    <Link
                      key={job.id}
                      href={`/job/${encodeURIComponent(job.id)}`}
                      className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                    >
                      <span className="font-medium text-foreground">
                        {job.targetEntity || job.jobType || 'Action'}
                      </span>
                      {' · '}
                      {summarizeStage(job.currentStage, String(job.status || 'active'))}
                    </Link>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No recent GPT-triggered actions yet.
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-3">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Enrichment And Jobs</p>
                <Badge variant="outline">
                  {snapshot.jobs?.running || 0} running / {snapshot.jobs?.queued || 0} queued
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {liveJobs.length > 0 ? (
                  liveJobs.slice(0, 3).map((job: any) => (
                    <Link
                      key={job.id}
                      href={`/job/${encodeURIComponent(job.id)}`}
                      className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground transition hover:border-amber-500/40 hover:text-foreground"
                    >
                      <span className="font-medium text-foreground">
                        {job.targetEntity || job.jobType || 'Job'}
                      </span>
                      {' · '}
                      {summarizeStage(job.currentStage, String(job.status || 'active'))}
                    </Link>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No active jobs at the moment.
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start gap-3 p-3">
            <Activity className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Recent Signals</p>
                <Badge variant="outline">{recentSignals.length}</Badge>
              </div>
              <div className="space-y-1">
                {recentSignals.length > 0 ? (
                  recentSignals.slice(0, 2).map((signal: any) => (
                    <div key={signal.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock3 className="size-3" />
                      <span className="truncate">
                        <span className="font-medium text-foreground">{signal.accountName}</span>
                        {' · '}
                        {signal.signalType}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No recent signals.</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
