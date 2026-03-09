'use client'

import { AppPageFrame } from '@/components/app-page-frame'
import { useSnapshot } from '@/lib/hooks/use-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Loader2 } from 'lucide-react'

export default function TeamPage() {
  const { data: snapshot, error } = useSnapshot()

  if (error) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Team' }]}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </AppPageFrame>
    )
  }

  if (!snapshot) {
    return (
      <AppPageFrame breadcrumbs={[{ label: 'Team' }]}>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppPageFrame>
    )
  }

  const people = snapshot.entities?.people || []

  return (
    <AppPageFrame breadcrumbs={[{ label: 'Team' }]}>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-muted-foreground">
          Live people and contact intelligence currently available inside the system.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>People Index</CardTitle>
          <CardDescription>Real contacts currently attached to tracked accounts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {people.map((person: any) => (
            <div key={person.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{person.name}</p>
                  <p className="text-sm text-muted-foreground">{person.title || 'Unknown title'}</p>
                </div>
                {person.seniority && <Badge variant="outline">{person.seniority}</Badge>}
              </div>
              {person.accountName && (
                <p className="mt-2 text-xs text-muted-foreground">{person.accountName}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </AppPageFrame>
  )
}
