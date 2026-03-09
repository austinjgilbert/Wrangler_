'use client'

import { AppPageFrame } from '@/components/app-page-frame'
import { MetricsCards } from '@/components/dashboard/metrics-cards'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { AccountsTable } from '@/components/dashboard/accounts-table'
import { TechStackChart } from '@/components/dashboard/tech-stack-chart'
import { EnrichmentStatus } from '@/components/dashboard/enrichment-status'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { useDashboardStats, useAccounts, useEnrichments } from '@/lib/hooks/use-api'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function DashboardPage() {
  const { data: statsData, error: statsError } = useDashboardStats()
  const { data: accountsData, error: accountsError } = useAccounts()
  const { data: enrichmentsData, error: enrichmentsError } = useEnrichments()

  const error = statsError || accountsError || enrichmentsError

  if (error) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Dashboard' }]}>
          <div className="flex flex-1 items-center justify-center p-6">
            <Alert variant="destructive" className="max-w-xl">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error.message || 'Failed to load live dashboard data.'}
              </AlertDescription>
            </Alert>
          </div>
      </AppPageFrame>
    )
  }

  if (!statsData || !accountsData || !enrichmentsData) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Dashboard' }]}>
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
      </AppPageFrame>
    )
  }

  return (
    <AppPageFrame
      breadcrumbs={[
        { label: 'Dashboard' },
      ]}
    >
          <QuickActions />

          <MetricsCards metrics={statsData} />

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ActivityFeed activities={statsData.recentActivity} />
            </div>

            <div className="space-y-6">
              <EnrichmentStatus jobs={enrichmentsData} />
            </div>
          </div>

          <AccountsTable accounts={accountsData.accounts} />

          <div className="grid gap-6 lg:grid-cols-2">
            <TechStackChart data={statsData.topTechStacks} />
            <div className="rounded-xl border p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold tracking-tight">Live Pipeline Snapshot</h3>
                  <p className="text-sm text-muted-foreground">
                    Real-time summary from current research and enrichment activity.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Recent Activity Events</p>
                    <p className="mt-2 text-2xl font-semibold">{statsData.recentActivity.length}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Tracked Enrichment Jobs</p>
                    <p className="mt-2 text-2xl font-semibold">{enrichmentsData.length}</p>
                  </div>
                  <div className="rounded-lg border p-4 sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Most Active Technologies</p>
                    <p className="mt-2 text-sm">
                      {statsData.topTechStacks.slice(0, 3).map((item) => item.name).join(', ') || 'No technologies detected yet'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
    </AppPageFrame>
  )
}
