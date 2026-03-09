'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Play,
  Search,
  Globe,
  FileText,
  Sparkles,
  Database,
  Eye,
  Zap,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import type { EnrichmentJob, Account } from '@/lib/types'
const enrichmentStages = [
  'Account Validation',
  'Domain Resolution',
  'Page Crawling',
  'Technology Detection',
  'Source Selection',
  'Signal Extraction',
  'Knowledge Graph Update',
];

interface EnrichmentPipelineProps {
  jobs: EnrichmentJob[]
  accounts: Account[]
}

const stageIcons = [
  Database,
  Globe,
  FileText,
  Search,
  Eye,
  FileText,
  Zap,
]

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

export function EnrichmentPipeline({ jobs, accounts }: EnrichmentPipelineProps) {
  const [selectedAccount, setSelectedAccount] = useState('')

  return (
    <div className="space-y-6">
      {/* Start New Enrichment */}
      <Card className="bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            Start New Enrichment
          </CardTitle>
          <CardDescription>
            Queue an account for multi-stage enrichment analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="flex-1 bg-background">
                <SelectValue placeholder="Select an account..." />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account._id} value={account.accountKey}>
                    {account.companyName} ({account.domain})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button disabled={!selectedAccount}>
              <Play className="mr-2 size-4" />
              Start Enrichment
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Stages Visualization */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Stages</CardTitle>
          <CardDescription>
            The 7-stage enrichment process for comprehensive account intelligence
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-4">
            {enrichmentStages.map((stage, index) => {
              const StageIcon = stageIcons[index]
              return (
                <div key={stage} className="flex flex-col items-center gap-2 min-w-[100px]">
                  <div className="relative">
                    <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                      <StageIcon className="size-5 text-primary" />
                    </div>
                    <div className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {index + 1}
                    </div>
                  </div>
                  <span className="text-xs text-center text-muted-foreground max-w-[80px]">
                    {stage}
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Active Jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Active Enrichment Jobs</CardTitle>
          <CardDescription>Currently running and queued enrichment processes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="size-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No active enrichment jobs</p>
                <p className="text-sm text-muted-foreground">
                  Select an account above to start enrichment
                </p>
              </div>
            ) : (
              jobs.map((job) => {
                const StatusIcon = statusIcons[job.status]
                const progress = (job.currentStage / job.totalStages) * 100
                const currentStageName =
                  job.status === 'queued'
                    ? 'Waiting in queue'
                    : enrichmentStages[job.currentStage - 1] || 'Starting'

                return (
                  <div key={job.accountKey} className="space-y-4 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <StatusIcon
                          className={`size-5 ${statusColors[job.status]} ${
                            job.status === 'in_progress' ? 'animate-spin' : ''
                          }`}
                        />
                        <div>
                          <p className="font-medium">{job.accountKey}</p>
                          <p className="text-sm text-muted-foreground">
                            Started{' '}
                            {formatDistanceToNow(new Date(job.startedAt), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          job.status === 'in_progress'
                            ? 'bg-primary/10 text-primary border-primary/20'
                            : job.status === 'queued'
                            ? 'bg-muted'
                            : ''
                        }
                      >
                        {job.status === 'in_progress' ? 'Running' : job.status}
                      </Badge>
                    </div>

                    {/* Stage Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Stage {job.currentStage}/{job.totalStages}: {currentStageName}
                        </span>
                        <span className="font-medium">{Math.round(progress)}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>

                    {/* Stage Indicators */}
                    <div className="flex items-center gap-1">
                      {enrichmentStages.map((_, index) => (
                        <div
                          key={index}
                          className={`h-1.5 flex-1 rounded-full ${
                            index < job.currentStage
                              ? 'bg-green-500'
                              : index === job.currentStage - 1
                              ? 'bg-primary'
                              : 'bg-muted'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
