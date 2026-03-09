'use client'

import { formatDistanceToNow } from 'date-fns'
import {
  Search,
  FileText,
  Sparkles,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ActivityItem } from '@/lib/types'

interface ActivityFeedProps {
  activities: ActivityItem[]
}

const activityIcons = {
  scan: Search,
  osint: FileText,
  enrichment: Sparkles,
  research: BookOpen,
  learning: BrainCircuit,
}

const statusIcons = {
  success: CheckCircle2,
  pending: Clock,
  failed: XCircle,
}

const statusColors = {
  success: 'text-green-500',
  pending: 'text-amber-500',
  failed: 'text-red-500',
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm">
            View all
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-[400px] px-6">
          <div className="space-y-4 pb-4">
            {activities.map((activity) => {
              const ActivityIcon = activityIcons[activity.type]
              const StatusIcon = activity.status ? statusIcons[activity.status] : null
              const statusColor = activity.status ? statusColors[activity.status] : ''

              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <ActivityIcon className="size-4 text-primary" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium leading-none">
                        {activity.title}
                      </p>
                      {StatusIcon && (
                        <StatusIcon className={`size-3.5 ${statusColor}`} />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {activity.description}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      {activity.accountKey && (
                        <Badge variant="secondary" className="text-xs">
                          {activity.accountKey}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(activity.timestamp), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
