'use client'

import { Building2, FileText, Sparkles, Activity, TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DashboardMetrics } from '@/lib/types'

interface MetricsCardsProps {
  metrics: DashboardMetrics
}

export function MetricsCards({ metrics }: MetricsCardsProps) {
  const cards = [
    {
      title: 'Total Accounts',
      value: metrics.totalAccounts.toLocaleString(),
      change: '+12%',
      trend: 'up' as const,
      icon: Building2,
      description: 'Tracked accounts',
    },
    {
      title: 'Scanned This Week',
      value: metrics.accountsScannedThisWeek.toLocaleString(),
      change: '+8%',
      trend: 'up' as const,
      icon: Activity,
      description: 'Website scans completed',
    },
    {
      title: 'OSINT Reports',
      value: metrics.osintReportsGenerated.toLocaleString(),
      change: '+23%',
      trend: 'up' as const,
      icon: FileText,
      description: 'Intelligence reports',
    },
    {
      title: 'Enrichment Jobs',
      value: metrics.enrichmentJobsRunning.toLocaleString(),
      change: '-2',
      trend: 'down' as const,
      icon: Sparkles,
      description: 'Currently running',
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {card.trend === 'up' ? (
                <TrendingUp className="size-3 text-green-500" />
              ) : (
                <TrendingDown className="size-3 text-amber-500" />
              )}
              <span className={card.trend === 'up' ? 'text-green-500' : 'text-amber-500'}>
                {card.change}
              </span>
              <span>from last week</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
          </CardContent>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-primary/20 via-primary/60 to-primary/20" />
        </Card>
      ))}
    </div>
  )
}
