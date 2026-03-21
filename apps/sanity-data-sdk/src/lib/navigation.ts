/**
 * navigation.ts — NavigationContext for cross-page navigation.
 *
 * Provides `navigateToView()` and `currentView` to all child components
 * via React context. This replaces the pattern of passing navigation
 * callbacks through props and enables any component to navigate
 * (e.g., clicking an account name on Dashboard → Accounts page).
 *
 * Usage:
 *   import { useNavigation } from '../lib/navigation'
 *   const { navigateToView, currentView } = useNavigation()
 *   navigateToView('accounts')
 */

import { createContext, useContext } from 'react'
import type { View } from './view-state'

export interface NavigationContextValue {
  /** Navigate to a different view (updates URL + state) */
  navigateToView: (view: View) => void
  /** The currently active view */
  currentView: View
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export const NavigationProvider = NavigationContext.Provider

/**
 * Access navigation from any component in the tree.
 * Throws if used outside NavigationProvider — fail hard, not silent.
 */
export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext)
  if (!ctx) {
    throw new Error(
      'useNavigation() called outside NavigationProvider. ' +
      'Wrap your component tree with <NavigationProvider> in App.tsx.'
    )
  }
  return ctx
}
