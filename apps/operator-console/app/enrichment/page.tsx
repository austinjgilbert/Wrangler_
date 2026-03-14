'use client'

import { AppPageFrame } from '@/components/app-page-frame'
import { EnrichmentPipeline } from '@/components/enrichment/enrichment-pipeline'
import { useEnrichments, useAccounts } from '@/lib/hooks/use-api'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function EnrichmentPage() {
  const { data: enrichmentsData, error: enrichmentsError } = useEnrichments()
  const { data: accountsData, error: accountsError } = useAccounts()

  const error = enrichmentsError || accountsError

  if (error) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Enrichment' }]}>
          <div className="flex flex-1 items-center justify-center p-6">
            <Alert variant="destructive" className="max-w-xl">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error.message || 'Failed to load live enrichment data.'}
              </AlertDescription>
            </Alert>
          </div>
      </AppPageFrame>
    )
  }

  if (!enrichmentsData || !accountsData) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Enrichment' }]}>
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
      </AppPageFrame>
    )
  }

  return (
    <AppPageFrame
      breadcrumbs={[{ label: 'Research' }]}
    >
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Research</h1>
            <p className="text-muted-foreground">
              Queue and track research jobs by account.
            </p>
          </div>

          <EnrichmentPipeline jobs={enrichmentsData} accounts={accountsData.accounts} />
    </AppPageFrame>
  )
}
