'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import {
  ExternalLink,
  MoreHorizontal,
  FileText,
  Sparkles,
  Search,
  Globe,
  Clock,
  TrendingUp,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Empty } from '@/components/ui/empty'
import { EmptyContent, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import type { Account } from '@/lib/types'

interface AccountsGridProps {
  accounts: Account[]
  view: 'grid' | 'table'
}

const enrichmentStatusColors = {
  complete: 'bg-green-500/10 text-green-500 border-green-500/20',
  in_progress: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  pending: 'bg-muted text-muted-foreground border-muted',
  failed: 'bg-red-500/10 text-red-500 border-red-500/20',
}

const enrichmentStatusLabels = {
  complete: 'Complete',
  in_progress: 'In Progress',
  pending: 'Pending',
  failed: 'Failed',
}

function AccountCard({ account }: { account: Account }) {
  return (
    <Card className="group transition-all hover:shadow-md hover:border-primary/50">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-bold text-lg text-primary">
            {account.companyName.charAt(0)}
          </div>
          <div className="flex-1 space-y-1 min-w-0">
            <CardTitle className="text-base truncate">
              <Link href={`/accounts/${account._id}`} className="hover:underline">
                {account.companyName}
              </Link>
            </CardTitle>
            <CardDescription className="flex items-center gap-1 text-xs">
              <Globe className="size-3" />
              <a
                href={account.canonicalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors flex items-center gap-1"
              >
                {account.domain}
                <ExternalLink className="size-3" />
              </a>
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Search className="mr-2 size-4" />
                Re-scan Website
              </DropdownMenuItem>
              <DropdownMenuItem>
                <FileText className="mr-2 size-4" />
                Report
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/accounts/${account._id}`}>
                  <Sparkles className="mr-2 size-4" />
                  Research
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/accounts/${account._id}`}>Open</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline">{account.industry || 'Unknown'}</Badge>
          {account.enrichmentStatus && (
            <Badge variant="outline" className={enrichmentStatusColors[account.enrichmentStatus]}>
              {enrichmentStatusLabels[account.enrichmentStatus]}
            </Badge>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">AI Readiness</span>
            <span className="font-medium">{account.aiReadinessScore || 0}%</span>
          </div>
          <Progress value={account.aiReadinessScore || 0} className="h-2" />
        </div>

        <div className="flex flex-wrap gap-1">
          {account.techStack?.slice(0, 4).map((tech) => (
            <Badge key={tech} variant="secondary" className="text-xs">
              {tech}
            </Badge>
          ))}
          {account.techStack && account.techStack.length > 4 && (
            <Badge variant="secondary" className="text-xs">
              +{account.techStack.length - 4}
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-1">
            <Clock className="size-3" />
            {account.lastScanDate
              ? `Scanned ${formatDistanceToNow(new Date(account.lastScanDate), { addSuffix: true })}`
              : 'Never scanned'}
          </div>
          {account.tags && account.tags.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {account.tags[0]}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function AccountsTableView({ accounts }: { accounts: Account[] }) {
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Industry</TableHead>
            <TableHead>AI Readiness</TableHead>
            <TableHead>Tech Stack</TableHead>
            <TableHead>Enrichment</TableHead>
            <TableHead>Last Scan</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account._id} className="group">
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary text-sm">
                    {account.companyName.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium">{account.companyName}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>{account.domain}</span>
                      <ExternalLink className="size-3" />
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{account.industry || 'Unknown'}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress value={account.aiReadinessScore || 0} className="h-2 w-16" />
                  <span className="text-sm font-medium">{account.aiReadinessScore || 0}%</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1 max-w-[200px]">
                  {account.techStack?.slice(0, 3).map((tech) => (
                    <Badge key={tech} variant="secondary" className="text-xs">
                      {tech}
                    </Badge>
                  ))}
                  {account.techStack && account.techStack.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{account.techStack.length - 3}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {account.enrichmentStatus && (
                  <Badge variant="outline" className={enrichmentStatusColors[account.enrichmentStatus]}>
                    {enrichmentStatusLabels[account.enrichmentStatus]}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {account.lastScanDate
                  ? formatDistanceToNow(new Date(account.lastScanDate), { addSuffix: true })
                  : 'Never'}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Search className="mr-2 size-4" />
                      Re-scan Website
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <FileText className="mr-2 size-4" />
                      Report
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Sparkles className="mr-2 size-4" />
                      Run Enrichment
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>View Details</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

export function AccountsGrid({ accounts, view }: AccountsGridProps) {
  if (accounts.length === 0) {
    return (
      <Empty>
        <EmptyContent>
          <EmptyTitle>No accounts found</EmptyTitle>
          <EmptyDescription>Try adjusting your filters or add a new account</EmptyDescription>
          <Button size="sm">Add Account</Button>
        </EmptyContent>
      </Empty>
    )
  }

  if (view === 'table') {
    return <AccountsTableView accounts={accounts} />
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {accounts.map((account) => (
        <AccountCard key={account._id} account={account} />
      ))}
    </div>
  )
}
