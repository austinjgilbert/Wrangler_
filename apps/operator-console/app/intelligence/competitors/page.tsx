'use client'

import { AppPageFrame } from '@/components/app-page-frame'
import { useSnapshot } from '@/lib/hooks/use-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Loader2 } from 'lucide-react'

export default function CompetitorResearchPage() {
  const { data: snapshot, error } = useSnapshot()

  if (error) {
    return (
      <AppPageFrame
        breadcrumbs={[
          { label: 'Intelligence', href: '/intelligence' },
          { label: 'Competitor Research' },
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
          { label: 'Competitor Research' },
        ]}
      >
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppPageFrame>
    )
  }

  const accounts = (snapshot.entities?.accounts || []).slice(0, 12)
  const patterns = snapshot.patterns?.active || []

  return (
    <AppPageFrame
      breadcrumbs={[
        { label: 'Intelligence', href: '/intelligence' },
        { label: 'Competitor Research' },
      ]}
    >
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Competitor Research</h1>
        <p className="text-muted-foreground">
          Live competitive context derived from shared technologies, market patterns, and opportunity clustering in your current dataset.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Lookalike Accounts</CardTitle>
            <CardDescription>Accounts that currently share technology fingerprints and active opportunity signals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {accounts.map((account: any) => (
              <div key={account.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{account.name}</p>
                    <p className="text-xs text-muted-foreground">{account.domain || 'No domain'}</p>
                  </div>
                  <Badge variant="outline">Score {Math.round(Number(account.opportunityScore || 0))}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(account.technologies || []).slice(0, 6).map((tech: string) => (
                    <Badge key={tech} variant="secondary">{tech}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pattern Pressure</CardTitle>
            <CardDescription>Real active patterns that are driving timing and competitor motion.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {patterns.slice(0, 8).map((pattern: any) => (
              <div key={pattern.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{pattern.type}</p>
                  <Badge variant="outline">{pattern.lifecycleState}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{pattern.summary || 'No summary available.'}</p>
                <div className="mt-3 flex gap-2 text-xs text-muted-foreground">
                  <span>Matches {Math.round(Number(pattern.matchFrequency || 0))}</span>
                  <span>Conversion {Math.round(Number(pattern.conversionAssociation || 0))}%</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppPageFrame>
  )
}
