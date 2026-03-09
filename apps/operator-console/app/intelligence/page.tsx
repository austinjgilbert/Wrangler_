import Link from 'next/link'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { FileText, Building2, BrainCircuit, ArrowRight } from 'lucide-react'

const intelligenceTools = [
  {
    title: 'OSINT Reports',
    description: 'Generate year-ahead intelligence reports with initiatives, risks, and recommendations.',
    href: '/intelligence/osint',
    icon: FileText,
  },
  {
    title: 'Competitor Research',
    description: 'Automated competitor discovery and comparative analysis.',
    href: '/intelligence/competitors',
    icon: Building2,
  },
  {
    title: 'Learnings',
    description: 'AI-derived insights and context from previous interactions.',
    href: '/intelligence/learnings',
    icon: BrainCircuit,
  },
]

export default function IntelligencePage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader
          breadcrumbs={[
            { label: 'Intelligence' },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Intelligence Hub</h1>
            <p className="text-muted-foreground">
              AI-powered intelligence gathering, analysis, and insights for your accounts.
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
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
