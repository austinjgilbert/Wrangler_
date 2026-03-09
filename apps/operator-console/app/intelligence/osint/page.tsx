'use client'

import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { OSINTReportView } from '@/components/intelligence/osint-report-view'
import { useSnapshot } from '@/lib/hooks/use-api'
import { Loader2, Search } from 'lucide-react'

export default function OSINTPage() {
  const { data: snapshot } = useSnapshot();

  if (!snapshot) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <DashboardHeader breadcrumbs={[{ label: 'Intelligence' }, { label: 'OSINT Reports' }]} />
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  // Find the first brief as the OSINT report
  const brief = snapshot.research?.briefs?.[0];

  const report = brief ? {
    _id: brief.id,
    accountKey: brief.title,
    companyName: brief.title,
    executiveSummary: brief.summaryMarkdown || brief.summary || "No summary available.",
    initiatives: brief.topActions?.map((action: any) => ({
      title: action.action,
      description: action.whyNow,
      importanceScore: Math.round((action.score || 0) * 100),
      confidence: (action.confidence || 0) > 0.7 ? 'high' : 'medium',
      timeHorizon: '0-3mo',
      status: 'needing_execution',
      progress: 0,
      evidenceCitations: []
    })) || [],
    risks: [],
    hiringSignals: [],
    digitalSignals: [],
    recommendedNextSteps: brief.topActions?.map((action: any) => action.action) || [],
    generatedAt: brief.generatedAt || new Date().toISOString(),
    confidence: 'high' as const,
  } : null;

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

          {report ? (
            <OSINTReportView report={report} />
          ) : (
             <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl border border-dashed border-muted-foreground/25">
               <Search className="size-10 text-muted-foreground/50 mb-4" />
               <p className="text-muted-foreground">No OSINT Reports found. Run a brief first.</p>
             </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
