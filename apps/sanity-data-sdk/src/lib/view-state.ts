export type View = 'dashboard' | 'accounts' | 'enrichment' | 'activity' | 'people' | 'technologies'

export const NAV: { id: View; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'enrichment', label: 'Research' },
  { id: 'activity', label: 'Activity' },
  { id: 'people', label: 'People' },
  { id: 'technologies', label: 'Technologies' },
]

export function isView(value: string | null): value is View {
  return NAV.some((item) => item.id === value)
}

export function readViewFromSearch(search: string): View {
  const params = new URLSearchParams(search)
  const view = params.get('view')
  return isView(view) ? view : 'dashboard'
}
