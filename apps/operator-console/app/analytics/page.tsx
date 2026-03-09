'use client'

import { AppPageFrame } from '@/components/app-page-frame'
import { useSnapshot } from '@/lib/hooks/use-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Loader2 } from 'lucide-react'

export default function AnalyticsPage() {
  const { data: snapshot, error } = useSnapshot()

  if (error) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Analytics' }]}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </AppPageFrame>
    )
  }

  if (!snapshot) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Analytics' }]}>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppPageFrame>
    )
  }

  const driftMetrics = (snapshot as any).metrics?.drift || []
  const overview = snapshot.overview?.intelligenceStatus || {}

  return (
    <AppPageFrame breadcrumbs={[{ label: 'Analytics' }]}>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Live operational analytics driven by the worker snapshot, drift metrics, and recent pipeline activity.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Accounts Indexed</p><p className="text-2xl font-semibold">{overview.accountsIndexed || 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Signals Today</p><p className="text-2xl font-semibold">{overview.signalsToday || 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Active Opportunities</p><p className="text-2xl font-semibold">{overview.activeOpportunities || 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">System Completion</p><p className="text-2xl font-semibold">{Math.round(Number(overview.systemCompletion || 0))}%</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Drift Monitoring</CardTitle>
          <CardDescription>Latest live drift and reliability cards from the operator snapshot.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {driftMetrics.map((metric: any) => (
            <div key={metric.label} className="rounded-lg border p-4">
              <p className="text-sm font-medium">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold">{Math.round(Number(metric.value || 0))}</p>
              <p className="mt-1 text-xs text-muted-foreground">{metric.severity || 'low'} severity</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </AppPageFrame>
  )
}
