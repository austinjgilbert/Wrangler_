'use client'

import { useState, useEffect, useCallback } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { ScanForm } from '@/components/research/scan-form'
import { ScanResults } from '@/components/research/scan-results'
import { useStartScan, useScan } from '@/lib/hooks/use-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import type { ScanResult } from '@/lib/types'

// Transform API response to ScanResult format
function transformScanResponse(response: {
  id: string;
  url: string;
  result?: {
    companyInfo?: {
      name?: string;
      description?: string;
    };
    techStack?: Array<{
      category: string;
      technologies: string[];
    }>;
    performance?: {
      loadTime?: number;
      pageSize?: string;
      requests?: number;
      score?: number;
    };
    aiSignals?: Array<{
      signal: string;
      confidence: number;
      insight: string;
    }>;
  };
  createdAt: string;
}): ScanResult {
  const result = response.result
  return {
    url: response.url,
    title: result?.companyInfo?.name || response.url,
    description: result?.companyInfo?.description || '',
    techStack: result?.techStack?.flatMap((cat) =>
      cat.technologies.map((tech) => ({
        name: tech,
        category: cat.category,
        confidence: 0.9,
      }))
    ) || [],
    businessUnits: [],
    performance: {
      loadTime: result?.performance?.loadTime || 0,
      ttfb: 0,
      cls: 0,
      lcp: result?.performance?.loadTime || 0,
    },
    aiSignals: result?.aiSignals?.map((s) => ({
      type: s.signal,
      description: s.insight,
      confidence: s.confidence,
      source: 'AI Analysis',
    })) || [],
    timestamp: response.createdAt,
  }
}

export default function ScanPage() {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [currentScanId, setCurrentScanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { trigger: startScan, isMutating: isStarting } = useStartScan()
  const { data: scanData, isLoading: isFetching } = useScan(currentScanId)

  const isScanning = isStarting || (scanData?.status === 'pending' || scanData?.status === 'scanning')

  // Handle scan completion
  useEffect(() => {
    if (scanData?.status === 'completed' && scanData.result) {
      setScanResult(transformScanResponse(scanData))
      setCurrentScanId(null)
    } else if (scanData?.status === 'failed') {
      setError('Scan failed. Please try again.')
      setCurrentScanId(null)
    }
  }, [scanData])

  const handleScan = useCallback(async (url: string) => {
    setError(null)
    setScanResult(null)
    
    try {
      const response = await startScan({ url, depth: 'standard' })
      setCurrentScanId(response.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scan')
    }
  }, [startScan])

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader
          breadcrumbs={[
            { label: 'Research', href: '/research' },
            { label: 'Website Scan' },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Website Scanner</h1>
            <p className="text-muted-foreground">
              Analyze any website to detect tech stack, business intelligence, and AI readiness signals.
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
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
