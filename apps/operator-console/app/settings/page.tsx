'use client'

import { AppPageFrame } from '@/components/app-page-frame'
import { useSnapshot } from '@/lib/hooks/use-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Loader2 } from 'lucide-react'

export default function SettingsPage() {
  const { data: snapshot, error } = useSnapshot()

  if (error) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Settings' }]}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </AppPageFrame>
    )
  }

  if (!snapshot) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Settings' }]}>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppPageFrame>
    )
  }

  const policyManagement = (snapshot as any).systemLab?.policyManagement || {}
  const capabilities = (snapshot as any).systemLab?.capabilities || []

  return (
    <AppPageFrame breadcrumbs={[{ label: 'Settings' }]}>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Live policy and capability state from the operator system snapshot.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Policy Versions</CardTitle>
            <CardDescription>Current scoring, drafting, strategy, and pattern policy metadata.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(policyManagement).map(([key, value]: [string, any]) => (
              <div key={key} className="rounded-lg border p-4">
                <p className="font-medium">{key}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {value?.versionId || 'No version available'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {value?.activationStatus || 'inactive'}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Capabilities</CardTitle>
            <CardDescription>Enabled system capabilities pulled from the live snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {capabilities.map((capability: any) => (
              <div key={capability.id} className="rounded-lg border p-4">
                <p className="font-medium">{capability.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {capability.enabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppPageFrame>
  )
}
