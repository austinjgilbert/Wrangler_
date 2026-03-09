'use client'

import { formatDistanceToNow } from 'date-fns'
import { ExternalLink, MoreHorizontal, FileText, Sparkles, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card'
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
import type { Account } from '@/lib/types'

interface AccountsTableProps {
  accounts: Account[]
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

export function AccountsTable({ accounts }: AccountsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Accounts</CardTitle>
        <CardDescription>
          Your highest priority accounts by AI readiness score
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm">
            View all
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
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
                    <Progress
                      value={account.aiReadinessScore || 0}
                      className="h-2 w-16"
                    />
                    <span className="text-sm font-medium">
                      {account.aiReadinessScore || 0}%
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {account.techStack?.slice(0, 3).map((tech) => (
                      <Badge
                        key={tech}
                        variant="secondary"
                        className="text-xs"
                      >
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
                    <Badge
                      variant="outline"
                      className={
                        enrichmentStatusColors[account.enrichmentStatus]
                      }
                    >
                      {enrichmentStatusLabels[account.enrichmentStatus]}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {account.lastScanDate
                    ? formatDistanceToNow(new Date(account.lastScanDate), {
                        addSuffix: true,
                      })
                    : 'Never'}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Actions</span>
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
                        Generate OSINT Report
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
      </CardContent>
    </Card>
  )
}
