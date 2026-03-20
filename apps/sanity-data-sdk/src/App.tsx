import { type SanityConfig } from '@sanity/sdk';
import { SanityApp } from '@sanity/sdk-react';
import { Suspense, useEffect, useState } from 'react';
import { AccountExplorer } from './components/AccountExplorer';
import { DashboardView } from './components/DashboardView';
import { EnrichmentView } from './components/EnrichmentView';
import { ActivityView } from './components/ActivityView';
import { PeopleListView } from './components/PeopleListView';
import { TechnologiesListView } from './components/TechnologiesListView';
import { CommandCenter } from './components/command-center';
import { SANITY_DATASET, SANITY_PROJECT_ID } from './lib/app-env';
import { NAV, readViewFromSearch, type View } from './lib/view-state';
import './App.css';

const config: SanityConfig[] = [
  {
    projectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
  },
];

function readInitialView(): View {
  if (typeof window === 'undefined') return 'command-center'
  return readViewFromSearch(window.location.search)
}

export default function App() {
  const [view, setView] = useState<View>(() => readInitialView());

  const navigateToView = (nextView: View) => {
    if (nextView === view) return
    setView(nextView)

    if (typeof window === 'undefined') return
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.set('view', nextView)
    window.history.pushState({ view: nextView }, '', nextUrl)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const onPopState = () => {
      setView(readInitialView())
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, []);

  return (
    <div className="app-shell">
      <div className="app-header">
        <div>
          <h1>⚡ Wrangler</h1>
          <p className="lede">Sales intelligence command center</p>
        </div>
      </div>

      <nav className="app-nav">
        <button
          type="button"
          className={`nav-tab nav-tab--primary ${view === 'command-center' ? 'active' : ''}`}
          onClick={() => navigateToView('command-center')}
        >
          ⚡ Command Center
        </button>
        <span className="nav-divider" />
        {NAV.filter(item => item.id !== 'command-center').map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-tab nav-tab--secondary ${view === item.id ? 'active' : ''}`}
            onClick={() => navigateToView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <main className="app-main">
        <SanityApp
          config={config}
          fallback={<div className="loading-state">Connecting to Sanity…</div>}
        >
          <Suspense fallback={<div className="loading-state panel">Loading…</div>}>
            {view === 'command-center' && <CommandCenter />}
            {view === 'dashboard' && <DashboardView />}
            {view === 'accounts' && <AccountExplorer />}
            {view === 'enrichment' && <EnrichmentView />}
            {view === 'activity' && <ActivityView />}
            {view === 'people' && <PeopleListView />}
            {view === 'technologies' && <TechnologiesListView />}
          </Suspense>
        </SanityApp>
      </main>
    </div>
  );
}
