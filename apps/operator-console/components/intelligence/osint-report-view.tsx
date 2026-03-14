'use client'

import { formatDistanceToNow, format } from 'date-fns'
import {
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Users,
  Zap,
  Target,
  ArrowRight,
  Download,
  RefreshCw,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { OSINTReport, Initiative, Risk, HiringSignal } from '@/lib/types'

interface OSINTReportViewProps {
  report: OSINTReport
}

const confidenceColors = {
  low: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  medium: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  high: 'bg-green-500/10 text-green-500 border-green-500/20',
}

const statusColors = {
  happening: 'bg-green-500/10 text-green-500 border-green-500/20',
  being_decided: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  needing_execution: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  historical: 'bg-muted text-muted-foreground border-muted',
}

const statusLabels = {
  happening: 'Active',
  being_decided: 'Being Decided',
  needing_execution: 'Needs Execution',
  historical: 'Historical',
}

const severityColors = {
  low: 'text-blue-500',
  medium: 'text-amber-500',
  high: 'text-red-500',
}

function InitiativeCard({ initiative }: { initiative: Initiative }) {
  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold">{initiative.title}</h4>
              <Badge variant="outline" className={statusColors[initiative.status]}>
                {statusLabels[initiative.status]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{initiative.description}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-1">
              <span className="text-2xl font-bold text-primary">
                {initiative.importanceScore}
              </span>
              <span className="text-xs text-muted-foreground">/100</span>
            </div>
            <Badge variant="outline" className={confidenceColors[initiative.confidence]}>
              {initiative.confidence} confidence
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-4" />
            <span>{initiative.timeHorizon}</span>
          </div>
          {initiative.progress !== undefined && (
            <div className="flex items-center gap-2 flex-1">
              <Progress value={initiative.progress} className="h-2 flex-1" />
              <span className="text-xs font-medium">{initiative.progress}%</span>
            </div>
          )}
          {initiative.expectedCompletion && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="size-4" />
              <span>{format(new Date(initiative.expectedCompletion), 'MMM yyyy')}</span>
            </div>
          )}
        </div>

        {initiative.evidenceCitations.length > 0 && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="evidence" className="border-none">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                <span className="flex items-center gap-2">
                  <FileText className="size-4" />
                  {initiative.evidenceCitations.length} Evidence Source
                  {initiative.evidenceCitations.length > 1 ? 's' : ''}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pt-2">
                  {initiative.evidenceCitations.map((citation, index) => (
                    <div
                      key={index}
                      className="rounded-lg bg-muted/50 p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <a
                          href={citation.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium hover:text-primary flex items-center gap-1"
                        >
                          {citation.title || citation.url}
                          <ExternalLink className="size-3" />
                        </a>
                        {citation.isFirstParty && (
                          <Badge variant="secondary" className="text-xs">
                            First-party
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {citation.excerpt}
                      </p>
                      {citation.date && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(citation.date), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  )
}

function RiskCard({ risk }: { risk: Risk }) {
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className={`size-4 ${severityColors[risk.severity]}`} />
        <span className="font-medium">{risk.title}</span>
        <Badge variant="outline" className="ml-auto capitalize">
          {risk.severity}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{risk.description}</p>
      {risk.mitigationSuggestion && (
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Mitigation:</span> {risk.mitigationSuggestion}
          </p>
        </div>
      )}
    </div>
  )
}

function HiringSignalCard({ signal }: { signal: HiringSignal }) {
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{signal.role}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {signal.department && <span>{signal.department}</span>}
            {signal.seniorityLevel && (
              <>
                <span className="text-muted-foreground/50">|</span>
                <span>{signal.seniorityLevel}</span>
              </>
            )}
            {signal.location && (
              <>
                <span className="text-muted-foreground/50">|</span>
                <span>{signal.location}</span>
              </>
            )}
          </div>
        </div>
        {signal.postDate && (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(signal.postDate), { addSuffix: true })}
          </span>
        )}
      </div>
      {signal.insights.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {signal.insights.map((insight, index) => (
            <Badge key={index} variant="secondary" className="text-xs">
              {insight}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

export function OSINTReportView({ report }: OSINTReportViewProps) {
  return (
    <div className="space-y-6">
      {/* Report Header */}
      <Card className="bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 border-primary/20">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl">
                  {report.companyName.charAt(0)}
                </div>
                <div>
                  <CardTitle className="text-xl">{report.companyName}</CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <span>Report</span>
                    <Badge variant="outline" className={confidenceColors[report.confidence]}>
                      {report.confidence} confidence
                    </Badge>
                  </CardDescription>
                </div>
              </div>
            </div>
            <CardAction>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Download className="mr-2 size-4" />
                  Export PDF
                </Button>
                <Button variant="outline" size="sm">
                  <RefreshCw className="mr-2 size-4" />
                  Refresh
                </Button>
              </div>
            </CardAction>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Lightbulb className="size-4 text-primary" />
                Executive Summary
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {report.executiveSummary}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="size-3" />
              Generated{' '}
              {formatDistanceToNow(new Date(report.generatedAt), { addSuffix: true })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs defaultValue="initiatives" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="initiatives" className="gap-2">
            <Target className="size-4" />
            <span className="hidden sm:inline">Initiatives</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {report.initiatives.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="risks" className="gap-2">
            <AlertTriangle className="size-4" />
            <span className="hidden sm:inline">Risks</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {report.risks.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="hiring" className="gap-2">
            <Users className="size-4" />
            <span className="hidden sm:inline">Hiring</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {report.hiringSignals.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="signals" className="gap-2">
            <Zap className="size-4" />
            <span className="hidden sm:inline">Signals</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {report.digitalSignals.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Initiatives Tab */}
        <TabsContent value="initiatives" className="space-y-4">
          {report.initiatives.map((initiative, index) => (
            <InitiativeCard key={index} initiative={initiative} />
          ))}
        </TabsContent>

        {/* Risks Tab */}
        <TabsContent value="risks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Identified Risks</CardTitle>
              <CardDescription>
                Potential challenges and concerns with mitigation suggestions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {report.risks.map((risk, index) => (
                <RiskCard key={index} risk={risk} />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hiring Tab */}
        <TabsContent value="hiring" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Hiring Signals</CardTitle>
              <CardDescription>
                Job postings and recruitment indicators revealing strategic priorities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {report.hiringSignals.map((signal, index) => (
                <HiringSignalCard key={index} signal={signal} />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Digital Signals Tab */}
        <TabsContent value="signals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Digital Signals</CardTitle>
              <CardDescription>
                Technology changes and digital transformation indicators
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {report.digitalSignals.map((signal, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 rounded-lg border p-4"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Zap className="size-5 text-primary" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{signal.type}</p>
                      <Badge
                        variant="outline"
                        className={
                          signal.significance === 'high'
                            ? 'bg-green-500/10 text-green-500 border-green-500/20'
                            : signal.significance === 'medium'
                            ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                            : ''
                        }
                      >
                        {signal.significance}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {signal.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Detected{' '}
                      {formatDistanceToNow(new Date(signal.detectedAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recommended Next Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-5 text-primary" />
            Recommended Next Steps
          </CardTitle>
          <CardDescription>
            Actionable recommendations based on intelligence analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {report.recommendedNextSteps.map((step, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </div>
                <p className="text-sm flex-1">{step}</p>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
