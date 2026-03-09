'use client'

import { useState, useEffect } from 'react'
import { Search, Filter, LayoutGrid, TableIcon, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Account } from '@/lib/types'

interface AccountFiltersProps {
  accounts: Account[]
  onFilter: (filtered: Account[]) => void
  view: 'grid' | 'table'
  onViewChange: (view: 'grid' | 'table') => void
}

const industries = [
  'All Industries',
  'Technology',
  'Manufacturing',
  'Financial Services',
  'Healthcare & Biotech',
  'Aerospace & Defense',
]

const enrichmentStatuses = [
  { value: 'all', label: 'All Status' },
  { value: 'complete', label: 'Complete' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending', label: 'Pending' },
]

export function AccountFilters({
  accounts,
  onFilter,
  view,
  onViewChange,
}: AccountFiltersProps) {
  const [search, setSearch] = useState('')
  const [industry, setIndustry] = useState('All Industries')
  const [status, setStatus] = useState('all')

  useEffect(() => {
    let filtered = accounts

    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(
        (account) =>
          account.companyName.toLowerCase().includes(searchLower) ||
          account.domain.toLowerCase().includes(searchLower)
      )
    }

    if (industry !== 'All Industries') {
      filtered = filtered.filter((account) => account.industry === industry)
    }

    if (status !== 'all') {
      filtered = filtered.filter((account) => account.enrichmentStatus === status)
    }

    onFilter(filtered)
  }, [search, industry, status, accounts, onFilter])

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={industry} onValueChange={setIndustry}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Industry" />
          </SelectTrigger>
          <SelectContent>
            {industries.map((ind) => (
              <SelectItem key={ind} value={ind}>
                {ind}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {enrichmentStatuses.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && onViewChange(v as 'grid' | 'table')}
          className="border rounded-lg"
        >
          <ToggleGroupItem value="grid" size="sm">
            <LayoutGrid className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="table" size="sm">
            <TableIcon className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>

        <Button variant="outline" size="sm">
          <Upload className="mr-2 size-4" />
          Import
        </Button>

        <Button size="sm">
          <Plus className="mr-2 size-4" />
          Add Account
        </Button>
      </div>
    </div>
  )
}
