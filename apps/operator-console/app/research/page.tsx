import Link from 'next/link'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { DashboardHeader } from '@/components/dashboard-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Globe, Upload, Search, ArrowRight } from 'lucide-react'

const researchTools = [
  {
    title: 'Website Scan',
    description: 'Analyze any website for tech stack, performance, and business intelligence signals.',
    href: '/research/scan',
    icon: Globe,
  },
  {
    title: 'Batch Scan',
    description: 'Upload a CSV of URLs to scan multiple websites at once.',
    href: '/research/batch',
    icon: Upload,
  },
  {
    title: 'Web Search',
    description: 'Search the web for company news, announcements, and intelligence.',
    href: '/research/search',
    icon: Search,
  },
]

export default function ResearchPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader
          breadcrumbs={[
            { label: 'Research' },
          ]}
        />
        <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Research Tools</h1>
            <p className="text-muted-foreground">
              Powerful tools to gather intelligence on companies, websites, and markets.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {researchTools.map((tool) => (
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
