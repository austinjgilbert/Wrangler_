'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react'
import { AppPageFrame } from '@/components/app-page-frame'
import { ModuleCard } from '@/components/battle-card/module-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  useAccountDetail,
  useEnrichmentStatus,
  useResearchSet,
  useQueueEnrichment,
  useSnapshot,
  type EnrichmentStatusState,
} from '@/lib/hooks/use-api'
import { BATTLE_CARD_MODULES, ENRICHMENT_STAGE_LABELS } from '@/lib/battle-card-modules'

function buildModuleSummary(researchSet: Record<string, unknown> | null, resultKeys: string[]): string {
  if (!researchSet || typeof researchSet !== 'object') return ''
  const parts: string[] = []
  for (const key of resultKeys) {
    const v = (researchSet as Record<string, unknown>)[key]
    if (v == null) continue
    if (typeof v === 'string' && v) parts.push(v)
    if (Array.isArray(v) && v.length) {
      const preview = v.slice(0, 5).map((x) => (typeof x === 'string' ? x : (x as { name?: string })?.name ?? String(x)))
      parts.push(`${key}: ${preview.join(', ')}`)
    }
    if (typeof v === 'object' && !Array.isArray(v) && key === 'technologyStack') {
      const ts = v as Record<string, unknown>
      const items: string[] = []
      if (Array.isArray(ts.cms)) items.push(`CMS: ${(ts.cms as string[]).join(', ') || '—'}`)
      if (Array.isArray(ts.frameworks)) items.push(`Frameworks: ${(ts.frameworks as string[]).join(', ') || '—'}`)
      if (Array.isArray(ts.hosting)) items.push(`Hosting: ${(ts.hosting as string[]).join(', ') || '—'}`)
      if (items.length) parts.push(items.join(' · '))
    }
  }
  return parts.slice(0, 6).join('\n') || 'Research completed. View full details in the account.'
}

export default function AccountBattleCardPage() {
  const params = useParams()
  const accountId = (params?.accountId as string) || ''
  const { data: account, error: accountError } = useAccountDetail(accountId)
  const accountKey = account?.accountKey || accountId
  const { data: statusResp, mutate: mutateStatus } = useEnrichmentStatus(accountKey || null)
  const { data: researchSet, mutate: mutateResearch } = useResearchSet(accountKey || null)
  const { trigger: queueEnrichment, isMutating: isQueueing } = useQueueEnrichment()
  const { data: snapshot } = useSnapshot()

  const status: EnrichmentStatusState | null =
    (statusResp && 'status' in statusResp ? statusResp.status : statusResp) ?? null
  const currentStageLabel =
    status === 'in_progress' && statusResp && typeof statusResp === 'object' && 'currentStage' in statusResp
      ? ENRICHMENT_STAGE_LABELS[String((statusResp as { currentStage?: string }).currentStage)] ||
        String((statusResp as { currentStage?: string }).currentStage) ||
        'Running…'
      : undefined

  const queuedCount = snapshot?.jobs?.queued ?? 0
  const runResearch = () => {
    if (!accountKey) return
    queueEnrichment({
      accountKey,
      accountId: account?.id || accountId,
      canonicalUrl: account?.canonicalUrl || undefined,
    }).then(() => {
      mutateStatus()
      mutateResearch()
    })
  }

  const refreshData = () => {
    mutateStatus()
    mutateResearch()
  }

  if (!accountId) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Accounts' }, { label: 'Research' }]}>
        <Alert variant="destructive">
          <AlertDescription>Missing account.</AlertDescription>
        </Alert>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/accounts"><ArrowLeft className="mr-2 size-4" /> Back to Accounts</Link>
        </Button>
      </AppPageFrame>
    )
  }

  if (accountError) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Accounts' }, { label: 'Research' }]}>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{accountError.message || 'Account not found.'}</AlertDescription>
        </Alert>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/accounts"><ArrowLeft className="mr-2 size-4" /> Back to Accounts</Link>
        </Button>
      </AppPageFrame>
    )
  }

  if (!account) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Accounts' }, { label: 'Research' }]}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </AppPageFrame>
    )
  }

  const accountName = account?.name || accountId

  return (
    <AppPageFrame
      breadcrumbs={[
        { label: 'Accounts', href: '/accounts' },
        { label: accountName, href: `/accounts/${accountId}` },
        { label: 'Research' },
      ]}
    >
        <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Research</h1>
            <p className="text-muted-foreground">
              {accountName}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/accounts">
              <ArrowLeft className="mr-2 size-4" />
              Back to Accounts
            </Link>
          </Button>
        </div>

        {queuedCount > 0 && (
          <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>{queuedCount} job{queuedCount !== 1 ? 's' : ''} in queue.</strong>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
          {BATTLE_CARD_MODULES.map((mod) => (
            <ModuleCard
              key={mod.id}
              module={mod}
              status={status}
              currentStageLabel={currentStageLabel}
              onRunResearch={runResearch}
              isQueueing={isQueueing}
              resultsSummary={
                status === 'complete' && researchSet
                  ? buildModuleSummary(researchSet as Record<string, unknown>, mod.resultKeys)
                  : null
              }
              onRefresh={refreshData}
            />
          ))}
        </div>
      </div>
    </AppPageFrame>
  )
}
