'use client'

import { useState } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { AccountsGrid } from '@/components/accounts/accounts-grid'
import { AccountFilters } from '@/components/accounts/account-filters'
import { mockAccounts } from '@/lib/mock-data'
import type { Account } from '@/lib/types'

export default function AccountsPage() {
  const [filteredAccounts, setFilteredAccounts] = useState<Account[]>(mockAccounts)
  const [view, setView] = useState<'grid' | 'table'>('grid')

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
            accounts={mockAccounts}
            onFilter={setFilteredAccounts}
            view={view}
            onViewChange={setView}
          />

          <AccountsGrid accounts={filteredAccounts} view={view} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
