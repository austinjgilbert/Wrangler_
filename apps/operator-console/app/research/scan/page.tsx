'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AppPageFrame } from '@/components/app-page-frame'
import { ScanForm } from '@/components/research/scan-form'
import { ScanResults } from '@/components/research/scan-results'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import type { ScanResult } from '@/lib/types'

function transformScanResponse(response: any): ScanResult {
  const result = response?.data || response
  const technologyStack = result?.technologyStack || result?.techStack || {}
  const categories = Object.entries(technologyStack).filter(
    ([key, value]) => Array.isArray(value) && value.length > 0 && key !== 'allDetected',
  )

  const flattenedStack = categories.flatMap(([category, technologies]) =>
    (technologies as string[]).map((tech) => ({
      name: tech,
      category: category.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()),
      confidence: 0.9,
    })),
  )

  const aiSignals = [
    ...((result?.digitalGoals?.initiatives || []).slice(0, 4).map((signal: string) => ({
      type: 'Initiative',
      description: signal,
      confidence: 0.8,
      source: 'Digital goals',
    })) || []),
    ...((result?.aiReadiness?.recommendations || []).slice(0, 3).map((signal: string) => ({
      type: 'AI Readiness',
      description: signal,
      confidence: 0.75,
      source: 'AI readiness analysis',
    })) || []),
  ]

  return {
    url: result?.finalUrl || result?.input || '',
    title: result?.companyName || result?.finalUrl || result?.input || 'Website scan',
    description: result?.aiReadiness?.summary || '',
    techStack: flattenedStack,
    businessUnits: result?.businessUnits?.detectedAreas || [],
    performance: {
      loadTime: result?.performance?.responseTime || 0,
      ttfb: 0,
      cls: 0,
      lcp: result?.performance?.responseTime || 0,
    },
    aiSignals,
    timestamp: result?.fetchedAt || new Date().toISOString(),
  }
}

export default function ScanPage() {
  const [autoUrl, setAutoUrl] = useState('')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoRanRef = useRef(false)

  const handleScan = useCallback(async (url: string) => {
    setError(null)
    setScanResult(null)
    setIsScanning(true)

    try {
      const res = await fetch('/api/research/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const payload = await res.json()
      if (!res.ok || payload?.ok === false) {
        throw new Error(payload?.error?.message || 'Failed to scan website')
      }
      setScanResult(transformScanResponse(payload))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scan')
    } finally {
      setIsScanning(false)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const nextUrl = new URLSearchParams(window.location.search).get('url') || ''
    setAutoUrl(nextUrl)
  }, [])

  useEffect(() => {
    if (autoUrl && !autoRanRef.current) {
      autoRanRef.current = true
      void handleScan(autoUrl)
    }
  }, [autoUrl, handleScan])

  return (
    <AppPageFrame
      breadcrumbs={[
        { label: 'Scan', href: '/research' },
        { label: 'Scan' },
      ]}
    >
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Scan</h1>
            <p className="text-muted-foreground">
              Enter a URL to detect tech stack and signals.
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <ScanForm onScan={handleScan} isScanning={isScanning} />

          {scanResult && <ScanResults result={scanResult} />}
    </AppPageFrame>
  )
}
