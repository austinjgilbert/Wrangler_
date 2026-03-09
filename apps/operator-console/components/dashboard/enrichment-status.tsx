'use client'

import { formatDistanceToNow } from 'date-fns'
import { Loader2, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import type { EnrichmentJob } from '@/lib/types'

const enrichmentStages = [
  'Account Validation',
  'Domain Resolution',
  'Page Crawling',
  'Technology Detection',
  'Source Selection',
  'Signal Extraction',
  'Knowledge Graph Update',
];

interface EnrichmentStatusProps {
  jobs: EnrichmentJob[]
}

const statusIcons = {
  queued: Clock,
  in_progress: Loader2,
  complete: CheckCircle2,
  failed: AlertCircle,
}

const statusColors = {
  queued: 'text-muted-foreground',
  in_progress: 'text-primary',
  complete: 'text-green-500',
  failed: 'text-red-500',
}

export function EnrichmentStatus({ jobs }: EnrichmentStatusProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Enrichment Pipeline</CardTitle>
        <CardDescription>Active enrichment jobs and their progress</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="size-10 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                No active enrichment jobs
              </p>
            </div>
          ) : (
            jobs.map((job) => {
              const StatusIcon = statusIcons[job.status] || Clock
              const progress = (job.currentStage / job.totalStages) * 100
              const currentStageName =
                job.status === 'queued'
                  ? 'Queued'
                  : enrichmentStages[job.currentStage - 1] || 'Starting'

              return (
                <div key={job.accountKey} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon
                        className={`size-4 ${statusColors[job.status] || ''} ${
                          job.status === 'in_progress' ? 'animate-spin' : ''
                        }`}
                      />
                      <span className="font-medium">{job.accountKey}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        job.status === 'in_progress'
                          ? 'bg-primary/10 text-primary border-primary/20'
                          : ''
                      }
                    >
                      {job.status === 'in_progress' ? 'Running' : job.status}
                    </Badge>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        Stage {job.currentStage}/{job.totalStages}: {currentStageName}
                      </span>
                      <span className="text-muted-foreground">
                        {Math.round(progress)}%
                      </span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Started{' '}
                    {formatDistanceToNow(new Date(job.startedAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}
