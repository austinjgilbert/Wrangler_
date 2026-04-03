/**
 * Chat Tool Plugin for Sanity Studio v5
 *
 * Adds a "Chat" tool to the Studio top navigation bar.
 * Provides a full conversational interface to the Wrangler_ chat backend.
 *
 * Usage in sanity.config.ts:
 *   import { chatTool } from './plugins/chat-tool';
 *   plugins: [ chatTool() ]
 */

import React from 'react';
import { definePlugin } from 'sanity';
import { ChatToolComponent } from './ChatTool';

// ---------------------------------------------------------------------------
// Icon — inline SVG, no external dependencies
// ---------------------------------------------------------------------------

function ChatIcon() {
  return React.createElement(
    'svg',
    {
      width: '1em',
      height: '1em',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('path', {
      d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    }),
  );
}

// ---------------------------------------------------------------------------
// Plugin Definition
// ---------------------------------------------------------------------------

export const chatTool = definePlugin({
  name: 'chat-tool',
  tools: [
    {
      name: 'chat',
      title: 'Chat',
      icon: ChatIcon,
      component: ChatToolComponent,
    },
  ],
});
