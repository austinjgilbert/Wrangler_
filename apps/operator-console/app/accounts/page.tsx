'use client'

import { useState } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { AccountsGrid } from '@/components/accounts/accounts-grid'
import { AccountFilters } from '@/components/accounts/account-filters'
import { useAccounts } from '@/lib/hooks/use-api'
import type { Account } from '@/lib/types'
import { Loader2 } from 'lucide-react'

export default function AccountsPage() {
  const { data: accountsData } = useAccounts()
  const accounts = (accountsData?.accounts || []) as Account[]
  const [filteredAccounts, setFilteredAccounts] = useState<Account[] | null>(null)
  const [view, setView] = useState<'grid' | 'table'>('grid')

  if (!accountsData) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <DashboardHeader breadcrumbs={[{ label: 'Accounts' }]} />
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const displayAccounts = filteredAccounts || accounts;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader
          breadcrumbs={[
            { label: 'Accounts' },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
              <p className="text-muted-foreground">
                Manage and track your target accounts with AI-powered intelligence.
              </p>
            </div>
          </div>

          <AccountFilters
            accounts={accounts}
            onFilter={setFilteredAccounts}
            view={view}
            onViewChange={setView}
          />

          <AccountsGrid accounts={displayAccounts} view={view} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
