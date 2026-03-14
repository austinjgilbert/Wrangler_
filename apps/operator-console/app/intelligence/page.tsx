import Link from 'next/link'
import { AppPageFrame } from '@/components/app-page-frame'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { FileText, Building2, BrainCircuit, ArrowRight } from 'lucide-react'

const intelligenceTools = [
  { title: 'Reports', description: 'Reports, initiatives, risks.', href: '/intelligence/osint', icon: FileText },
  { title: 'Competitors', description: 'Competitor discovery and comparison.', href: '/intelligence/competitors', icon: Building2 },
  { title: 'Learnings', description: 'Insights from past interactions.', href: '/intelligence/learnings', icon: BrainCircuit },
]

export default function IntelligencePage() {
  return (
    <AppPageFrame
      breadcrumbs={[{ label: 'Intel' }]}
    >
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Intel</h1>
            <p className="text-muted-foreground">
              Reports, competitors, learnings.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {intelligenceTools.map((tool) => (
              <Link key={tool.title} href={tool.href}>
                <Card className="h-full transition-all hover:shadow-md hover:border-primary/50 cursor-pointer group">
                  <CardHeader>
                    <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 mb-4">
                      <tool.icon className="size-6 text-primary" />
                    </div>
                    <CardTitle className="flex items-center gap-2">
                      {tool.title}
                      <ArrowRight className="size-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </CardTitle>
                    <CardDescription>{tool.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
    </AppPageFrame>
  )
}
