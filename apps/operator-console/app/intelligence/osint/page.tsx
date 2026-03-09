import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { OSINTReportView } from '@/components/intelligence/osint-report-view'
import { mockOSINTReport } from '@/lib/mock-data'

export default function OSINTPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader
          breadcrumbs={[
            { label: 'Intelligence', href: '/intelligence' },
            { label: 'OSINT Reports' },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">OSINT Intelligence</h1>
            <p className="text-muted-foreground">
              Year-ahead company intelligence with initiative tracking, benchmarking, and actionable insights.
            </p>
          </div>

          <OSINTReportView report={mockOSINTReport} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
