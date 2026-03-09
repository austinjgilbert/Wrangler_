'use client'

import { useState } from 'react'
import { Search, Globe, Zap, Shield, BarChart3 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

interface ScanFormProps {
  onScan: (url: string) => void
  isScanning: boolean
}

export function ScanForm({ onScan, isScanning }: ScanFormProps) {
  const [url, setUrl] = useState('')
  const suggestedUrls = ['https://stripe.com', 'https://vercel.com', 'https://linear.app']

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (url) {
      onScan(url)
    }
  }

  const features = [
    { icon: Zap, label: 'Tech Stack Detection', description: '50+ technologies' },
    { icon: BarChart3, label: 'Performance Analysis', description: 'Core Web Vitals' },
    { icon: Shield, label: 'Security Assessment', description: 'HTTPS, headers' },
  ]

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="grid lg:grid-cols-[1fr_auto]">
          <div className="p-6 lg:p-8 space-y-6">
            <form onSubmit={handleSubmit} className="flex gap-3">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
                <Input
                  type="url"
                  placeholder="Enter website URL (e.g., https://example.com)"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="pl-10 h-12 text-base"
                  disabled={isScanning}
                />
              </div>
              <Button
                type="submit"
                size="lg"
                disabled={!url || isScanning}
                className="h-12 px-8"
              >
                {isScanning ? (
                  <>
                    <Spinner className="mr-2" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 size-4" />
                    Scan Website
                  </>
                )}
              </Button>
            </form>

            <div className="flex flex-wrap gap-2">
              {suggestedUrls.map((suggestedUrl) => (
                <Button
                  key={suggestedUrl}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setUrl(suggestedUrl)}
                >
                  Try: {suggestedUrl.replace(/^https?:\/\//, '')}
                </Button>
              ))}
            </div>
          </div>

          <div className="bg-muted/30 p-6 lg:p-8 border-t lg:border-t-0 lg:border-l flex items-center">
            <div className="grid gap-4">
              {features.map((feature) => (
                <div key={feature.label} className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="size-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{feature.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
