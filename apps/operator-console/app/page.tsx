'use client'

import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { MetricsCards } from '@/components/dashboard/metrics-cards'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { AccountsTable } from '@/components/dashboard/accounts-table'
import { TechStackChart } from '@/components/dashboard/tech-stack-chart'
import { EnrichmentStatus } from '@/components/dashboard/enrichment-status'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { useDashboardStats, useAccounts, useEnrichments } from '@/lib/hooks/use-api'
import { Loader2 } from 'lucide-react'

export default function DashboardPage() {
  const { data: statsData } = useDashboardStats()
  const { data: accountsData } = useAccounts()
  const { data: enrichmentsData } = useEnrichments()

  if (!statsData || !accountsData || !enrichmentsData) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <DashboardHeader breadcrumbs={[{ label: 'Dashboard' }]} />
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const activities = statsData?.recentActivity?.map(a => ({
    id: a.id,
    type: a.type as 'scan' | 'enrichment' | 'osint' | 'alert',
    message: `${a.action}: ${a.target}`,
    timestamp: a.timestamp,
    status: 'completed' as const,
    accountName: a.target,
    title: a.action,
    description: a.target,
  })) || []

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader
          breadcrumbs={[
            { label: 'Dashboard' },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
          <QuickActions />

          <MetricsCards metrics={statsData} />

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ActivityFeed activities={activities} />
            </div>

            <div className="space-y-6">
              <EnrichmentStatus jobs={enrichmentsData || []} />
            </div>
          </div>

          <AccountsTable accounts={accountsData?.accounts || []} />

          <div className="grid gap-6 lg:grid-cols-2">
            <TechStackChart data={statsData.techStackDistribution || []} />
            <div className="flex items-center justify-center rounded-xl border border-dashed border-muted-foreground/25 p-8">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  More analytics and charts coming soon
                </p>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
