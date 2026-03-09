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

// Fallback mock data for development/demo
import {
  mockDashboardMetrics,
  mockActivityFeed,
  mockAccounts,
  mockEnrichmentJobs,
} from '@/lib/mock-data'

export default function DashboardPage() {
  // Try to fetch live data, fall back to mock data if API unavailable
  const { data: statsData } = useDashboardStats()
  const { data: accountsData } = useAccounts({ limit: 10 })
  const { data: enrichmentsData } = useEnrichments()

  // Transform API data or use mock data
  const metrics = statsData ? {
    totalAccounts: statsData.totalAccounts,
    enrichedAccounts: statsData.enrichedAccounts,
    activeScans: statsData.activeScans,
    osintReports: statsData.osintReports,
    enrichmentRate: statsData.enrichedAccounts / statsData.totalAccounts * 100,
    topTechStacks: statsData.techStackDistribution?.map(t => ({
      name: t.category,
      count: t.count,
      growth: 0,
    })) || [],
  } : mockDashboardMetrics

  const activities = statsData?.recentActivity?.map(a => ({
    id: a.id,
    type: a.type as 'scan' | 'enrichment' | 'osint' | 'alert',
    message: `${a.action}: ${a.target}`,
    timestamp: a.timestamp,
    status: 'completed' as const,
    accountName: a.target,
  })) || mockActivityFeed

  const accounts = accountsData?.accounts || mockAccounts
  
  const enrichmentJobs = enrichmentsData?.map(e => ({
    id: e.id,
    accountName: e.companyName,
    progress: e.enrichmentProgress?.progress || 0,
    stage: e.enrichmentProgress?.currentStep || e.status,
    status: e.status === 'completed' ? 'completed' as const : 
            e.status === 'failed' ? 'failed' as const : 
            'in_progress' as const,
    startedAt: e.createdAt,
  })) || mockEnrichmentJobs
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
          {/* Quick Actions */}
          <QuickActions />

          {/* Metrics Overview */}
          <MetricsCards metrics={metrics} />

          {/* Main Content Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Activity Feed */}
            <div className="lg:col-span-2">
              <ActivityFeed activities={activities} />
            </div>

            {/* Enrichment Status */}
            <div className="space-y-6">
              <EnrichmentStatus jobs={enrichmentJobs} />
            </div>
          </div>

          {/* Accounts Table */}
          <AccountsTable accounts={accounts} />

          {/* Tech Stack Chart */}
          <div className="grid gap-6 lg:grid-cols-2">
            <TechStackChart data={metrics.topTechStacks} />
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
