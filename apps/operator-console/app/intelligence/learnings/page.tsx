'use client'

import { AppPageFrame } from '@/components/app-page-frame'
import { useSnapshot } from '@/lib/hooks/use-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Loader2 } from 'lucide-react'

export default function LearningsPage() {
  const { data: snapshot, error } = useSnapshot()

  if (error) {
    return (
      <AppPageFrame
        breadcrumbs={[
          { label: 'Intelligence', href: '/intelligence' },
          { label: 'Learnings' },
        ]}
      >
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </AppPageFrame>
    )
  }

  if (!snapshot) {
    return (
      <AppPageFrame
        breadcrumbs={[
          { label: 'Intelligence', href: '/intelligence' },
          { label: 'Learnings' },
        ]}
      >
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppPageFrame>
    )
  }

  const patterns = snapshot.patterns?.active || []
  const learningMode = (snapshot as any).systemLab?.learningMode

  return (
    <AppPageFrame
      breadcrumbs={[
        { label: 'Intelligence', href: '/intelligence' },
        { label: 'Learnings' },
      ]}
    >
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">System Learnings</h1>
        <p className="text-muted-foreground">
          Live operator feedback, pattern reinforcement, and the strongest reusable learnings currently in the system.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Active Learnings</CardTitle>
            <CardDescription>Patterns currently being reinforced by the real dataset.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {patterns.slice(0, 10).map((pattern: any) => (
              <div key={pattern.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{pattern.type}</p>
                  <Badge variant="outline">{pattern.lifecycleState}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{pattern.summary || 'No summary available.'}</p>
                {!!pattern.recommendedMoves?.length && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pattern.recommendedMoves.slice(0, 4).map((move: string) => (
                      <Badge key={move} variant="secondary">{move}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Learning Loop</CardTitle>
            <CardDescription>Current learning metrics from the live operator feedback pipeline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground">Feedback captured</p>
              <p className="text-2xl font-semibold">{learningMode?.operatorFeedbackCaptured || 0}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground">Patterns strengthened</p>
              <p className="text-2xl font-semibold">{learningMode?.patternsStrengthened || 0}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground">Patterns weakened</p>
              <p className="text-2xl font-semibold">{learningMode?.patternsWeakened || 0}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground">Signal weights updated</p>
              <p className="text-2xl font-semibold">{learningMode?.signalWeightsUpdated || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppPageFrame>
  )
}
