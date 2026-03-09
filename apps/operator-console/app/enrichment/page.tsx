'use client'

import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { EnrichmentPipeline } from '@/components/enrichment/enrichment-pipeline'
import { useEnrichments, useAccounts } from '@/lib/hooks/use-api'
import { Loader2 } from 'lucide-react'

export default function EnrichmentPage() {
  const { data: enrichmentsData } = useEnrichments()
  const { data: accountsData } = useAccounts()

  if (!enrichmentsData || !accountsData) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <DashboardHeader breadcrumbs={[{ label: 'Enrichment' }]} />
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  // Transform data to fit the expected UI shapes
  const jobs = enrichmentsData.map(e => ({
    id: e.id,
    accountKey: e.companyName,
    accountName: e.companyName,
    status: e.status === 'completed' ? 'complete' : e.status === 'failed' ? 'failed' : e.status === 'queued' || e.status === 'pending' ? 'queued' : 'in_progress',
    currentStage: Math.floor((e.enrichmentProgress?.progress || 0) / 14), // approx 7 stages
    totalStages: 7,
    startedAt: e.createdAt,
    completedAt: e.updatedAt,
  })) as any[]

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader
          breadcrumbs={[
            { label: 'Enrichment' },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Account Enrichment</h1>
            <p className="text-muted-foreground">
              Multi-stage enrichment pipeline for comprehensive account intelligence.
            </p>
          </div>

          <EnrichmentPipeline jobs={jobs} accounts={accountsData.accounts as any[]} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
