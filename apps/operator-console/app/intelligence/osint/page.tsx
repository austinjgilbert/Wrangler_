'use client'

import { AppPageFrame } from '@/components/app-page-frame'
import { OSINTReportView } from '@/components/intelligence/osint-report-view'
import { useSnapshot } from '@/lib/hooks/use-api'
import type { OSINTReport } from '@/lib/types'
import { Loader2, Search } from 'lucide-react'

export default function OSINTPage() {
  const { data: snapshot } = useSnapshot();

  if (!snapshot) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Intel' }, { label: 'Reports' }]}>
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
      </AppPageFrame>
    )
  }

  // Find the first brief as the OSINT report
  const brief = snapshot.research?.briefs?.[0];

  const report: OSINTReport | null = brief ? {
    _id: brief.id,
    accountKey: brief.title || brief.id,
    companyName: brief.title || brief.id,
    executiveSummary: brief.summaryMarkdown || brief.summary || 'No summary available.',
    initiatives: brief.topActions?.map((action) => ({
      title: action.action || 'Recommended next move',
      description: action.whyNow || 'No rationale available.',
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
    recommendedNextSteps: brief.topActions?.map((action) => action.action || 'Review report') || [],
    generatedAt: brief.generatedAt || new Date().toISOString(),
    confidence: 'high' as const,
  } : null;

  return (
    <AppPageFrame
      breadcrumbs={[
        { label: 'Intel', href: '/intelligence' },
        { label: 'Reports' },
      ]}
    >
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
            <p className="text-muted-foreground">
              Company intelligence, initiatives, risks.
            </p>
          </div>

          {report ? (
            <OSINTReportView report={report} />
          ) : (
             <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl border border-dashed border-muted-foreground/25">
               <Search className="size-10 text-muted-foreground/50 mb-4" />
               <p className="text-muted-foreground">No reports yet. Run a brief first.</p>
             </div>
          )}
    </AppPageFrame>
  )
}
