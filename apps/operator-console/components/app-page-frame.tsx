'use client'

import type { ReactNode } from 'react'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { LiveActivityStrip } from '@/components/live-activity-strip'

interface AppPageFrameProps {
  breadcrumbs?: { label: string; href?: string }[]
  children: ReactNode
}

export function AppPageFrame({ breadcrumbs, children }: AppPageFrameProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader breadcrumbs={breadcrumbs} />
        <LiveActivityStrip />
        <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
