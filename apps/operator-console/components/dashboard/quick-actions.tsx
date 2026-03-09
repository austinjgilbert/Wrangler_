'use client'

import { useState } from 'react'
import { Search, Upload, FileText, Sparkles, Globe, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

export function QuickActions() {
  const [url, setUrl] = useState('')
  const [isScanning, setIsScanning] = useState(false)

  const handleScan = async () => {
    if (!url) return
    setIsScanning(true)
    // Simulate scan - in production this would call the API
    await new Promise((resolve) => setTimeout(resolve, 2000))
    setIsScanning(false)
    setUrl('')
  }

  return (
    <Card className="bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="size-5 text-primary" />
          Quick Scan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Enter website URL to scan..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="pl-9 bg-background"
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            />
          </div>
          <Button onClick={handleScan} disabled={!url || isScanning}>
            {isScanning ? (
              <>
                <Spinner className="mr-2" />
                Scanning
              </>
            ) : (
              <>
                Scan
                <ArrowRight className="ml-2 size-4" />
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" size="sm" className="justify-start">
            <Upload className="mr-2 size-4" />
            Batch Upload
          </Button>
          <Button variant="outline" size="sm" className="justify-start">
            <FileText className="mr-2 size-4" />
            OSINT Report
          </Button>
          <Button variant="outline" size="sm" className="justify-start">
            <Sparkles className="mr-2 size-4" />
            Enrich Account
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
