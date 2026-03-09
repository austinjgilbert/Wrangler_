import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { EnrichmentPipeline } from '@/components/enrichment/enrichment-pipeline'
import { mockEnrichmentJobs, mockAccounts } from '@/lib/mock-data'

export default function EnrichmentPage() {
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

          <EnrichmentPipeline jobs={mockEnrichmentJobs} accounts={mockAccounts} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
