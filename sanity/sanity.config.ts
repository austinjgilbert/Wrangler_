/**
 * Sanity Studio Configuration
 *
 * This configures a Sanity Studio embedded alongside the worker project.
 * Run with: npx sanity dev  (from the /sanity directory)
 *
 * The Studio provides a visual dashboard for browsing and editing
 * all Content OS data: accounts, people, technologies, events, etc.
 */

import React from 'react';
import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemas';
import { deskStructure, getDefaultDocumentNode } from './deskStructure';
import { chatTool } from './plugins/chat-tool';

/** Simple static icon for Dashboard; must be serializable (no hooks/external deps). */
function AccountDataSetIcon() {
  return React.createElement(
    'svg',
    { width: '1em', height: '1em', viewBox: '0 0 25 25', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' },
    React.createElement('rect', { x: 4, y: 4, width: 17, height: 17, rx: 2, stroke: 'currentColor', strokeWidth: 1.5, fill: 'none' }),
    React.createElement('path', { d: 'M8 9h9M8 13h9M8 17h5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' })
  );
}

export default defineConfig({
  name: 'account-dataset',
  title: 'Account DataSet',
  icon: AccountDataSetIcon,

  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'nlqb7zmk',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',

  plugins: [
    structureTool({
      structure: deskStructure,
      defaultDocumentNode: getDefaultDocumentNode,
    }),
    visionTool({
      defaultApiVersion: '2024-01-01',
    }),
    chatTool(),
  ],

  schema: {
    types: schemaTypes,
  },
});
