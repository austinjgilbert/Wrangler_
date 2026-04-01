'use client';

import type { ReactNode } from 'react';
import { Sidebar, type SidebarItem } from './sidebar';
import { CommandBar } from './command-bar';
import { AssistantPanel } from './assistant-panel';

type SectionId = string;

export function AppShell(props: {
  sidebarItems: SidebarItem[];
  activeSection: SectionId;
  onSectionChange: (id: SectionId) => void;
  sidebarBadges?: Partial<Record<SectionId, number | string>>;
  main: ReactNode;
  assistant?: ReactNode;
  assistantOpen: boolean;
  onAssistantToggle: () => void;
  onCommandBarSearch: () => void;
  statusMessage?: string | null;
  lastSynced?: string | null;
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}) {
  return (
    <div className="flex h-screen flex-col bg-[var(--background)] text-[var(--text)]">
      <CommandBar
        onSearchClick={props.onCommandBarSearch}
        statusMessage={props.statusMessage}
        lastSynced={props.lastSynced}
        searchQuery={props.searchQuery}
        onSearchQueryChange={props.onSearchQueryChange}
        onRefresh={props.onRefresh}
        onAssistantToggle={props.onAssistantToggle}
        assistantOpen={props.assistantOpen}
        isLoading={props.isLoading}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          items={props.sidebarItems}
          activeSection={props.activeSection}
          onSectionChange={props.onSectionChange}
          badges={props.sidebarBadges}
        />
        <main className="min-w-0 flex-1 overflow-auto">
          {props.main}
        </main>
        {props.assistantOpen && props.assistant != null ? (
          <AssistantPanel onClose={props.onAssistantToggle}>
            {props.assistant}
          </AssistantPanel>
        ) : null}
      </div>
    </div>
  );
}
