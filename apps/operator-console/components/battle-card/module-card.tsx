'use client'

import { Loader2, Play, CheckCircle2, AlertCircle, Clock, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { BattleCardModule } from '@/lib/battle-card-modules'
import type { EnrichmentStatusState } from '@/lib/hooks/use-api'

interface ModuleCardProps {
  module: BattleCardModule
  status: EnrichmentStatusState | null
  currentStageLabel?: string
  onRunResearch: () => void
  isQueueing: boolean
  resultsSummary?: string | null
  onRefresh?: () => void
}

const statusConfig: Record<
  EnrichmentStatusState,
  { label: string; icon: typeof Clock; className: string }
> = {
  not_run: {
    label: 'Not Run',
    icon: Clock,
    className: 'bg-muted text-muted-foreground border-muted',
  },
  queued: {
    label: 'Queued',
    icon: Clock,
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
  in_progress: {
    label: 'Running',
    icon: Loader2,
    className: 'bg-primary/10 text-primary border-primary/20',
  },
  complete: {
    label: 'Completed',
    icon: CheckCircle2,
    className: 'bg-green-500/10 text-green-600 border-green-500/20',
  },
  failed: {
    label: 'Failed',
    icon: AlertCircle,
    className: 'bg-red-500/10 text-red-600 border-red-500/20',
  },
}

export function ModuleCard({
  module,
  status,
  currentStageLabel,
  onRunResearch,
  isQueueing,
  resultsSummary,
  onRefresh,
}: ModuleCardProps) {
  const state = status ?? 'not_run'
  const config = statusConfig[state]
  const StatusIcon = config.icon

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{module.title}</CardTitle>
            <CardDescription className="mt-1 text-sm">
              {module.purpose}
            </CardDescription>
          </div>
          <Badge variant="outline" className={config.className}>
            <StatusIcon
              className={`mr-1 size-3.5 ${state === 'in_progress' ? 'animate-spin' : ''}`}
            />
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === 'in_progress' && currentStageLabel && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            {currentStageLabel}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={onRunResearch}
            disabled={isQueueing || state === 'in_progress' || state === 'queued'}
          >
            {isQueueing ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Play className="mr-2 size-4" />
            )}
            Run Research
          </Button>
          {onRefresh && (state === 'complete' || state === 'failed') && (
            <Button size="sm" variant="outline" onClick={onRefresh}>
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
          )}
        </div>
        {resultsSummary && state === 'complete' && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-muted-foreground mb-1">Results</p>
            <p className="whitespace-pre-wrap">{resultsSummary}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
