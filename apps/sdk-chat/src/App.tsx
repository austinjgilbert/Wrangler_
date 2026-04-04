/**
 * App — Entry point for the Sanity SDK App.
 *
 * Wraps the chat interface in SanityApp (auth) + ThemeProvider (dark theme).
 * This is a standalone app, not a Studio plugin.
 */

import { SanityApp } from '@sanity/sdk-react'
import { ThemeProvider, studioTheme } from '@sanity/ui'
import { ChatView } from './ChatView'
import './tokens.css'

const config = [{ projectId: 'nlqb7zmk', dataset: 'production' }]

export default function App() {
  return (
    <ThemeProvider theme={studioTheme} scheme="dark">
      <SanityApp config={config} fallback={<LoadingScreen />}>
        <ChatView />
      </SanityApp>
    </ThemeProvider>
  )
}

function LoadingScreen() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#101112',
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '16px',
      }}
    >
      Loading Wrangler_...
    </div>
  )
}
