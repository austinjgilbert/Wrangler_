'use client'

import { useState } from 'react'
import { AppPageFrame } from '@/components/app-page-frame'
import { AccountsGrid } from '@/components/accounts/accounts-grid'
import { AccountFilters } from '@/components/accounts/account-filters'
import { useAccounts, useSnapshot } from '@/lib/hooks/use-api'
import type { Account } from '@/lib/types'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function AccountsPage() {
  const { data: accountsData, error } = useAccounts()
  const { data: snapshot } = useSnapshot()
  const accounts = (accountsData?.accounts || []) as Account[]
  const [filteredAccounts, setFilteredAccounts] = useState<Account[] | null>(null)
  const [view, setView] = useState<'grid' | 'table'>('grid')
  const serviceHealth = snapshot?.serviceHealth

  if (error) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Accounts' }]}>
          <div className="flex flex-1 items-center justify-center p-6">
            <Alert variant="destructive" className="max-w-xl">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error.message || 'Failed to load accounts.'}
              </AlertDescription>
            </Alert>
          </div>
      </AppPageFrame>
    )
  }

  if (!accountsData) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Accounts' }]}>
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
      </AppPageFrame>
    )
  }

  const displayAccounts = filteredAccounts || accounts;

  return (
    <AppPageFrame
      breadcrumbs={[
        { label: 'Accounts' },
      ]}
    >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
              <p className="text-muted-foreground">
                Target accounts. Open one to run research.
              </p>
            </div>
          </div>

          {serviceHealth?.status === 'degraded' ? (
            <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-100">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {serviceHealth.message} {serviceHealth.action}
              </AlertDescription>
            </Alert>
          ) : null}

          <AccountFilters
            accounts={accounts}
            onFilter={setFilteredAccounts}
            view={view}
            onViewChange={setView}
          />

          <AccountsGrid accounts={displayAccounts} view={view} />
    </AppPageFrame>
  )
}
