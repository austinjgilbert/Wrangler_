import { type SanityConfig } from '@sanity/sdk';
import { SanityApp } from '@sanity/sdk-react';
import { Suspense, useEffect, useState } from 'react';
import { AccountExplorer } from './components/AccountExplorer';
import { DashboardView } from './components/DashboardView';
import { EnrichmentView } from './components/EnrichmentView';
import { ActivityView } from './components/ActivityView';
import { PeopleListView } from './components/PeopleListView';
import { TechnologiesListView } from './components/TechnologiesListView';
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
  if (typeof window === 'undefined') return 'dashboard'
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
          <p className="eyebrow">Sanity SDK App</p>
          <h1>DataViewer</h1>
          <p className="lede">
            Full system view: dashboard, accounts, research jobs, activity, people, and technologies from Sanity and the worker.
          </p>
        </div>
      </div>

      <nav className="app-nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-tab ${view === item.id ? 'active' : ''}`}
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
