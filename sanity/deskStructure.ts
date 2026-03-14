/**
 * Custom Desk Structure for Sanity Studio
 *
 * Organizes all 37+ document types into a navigable dashboard:
 *
 *   Sales Intelligence
 *   ├── Accounts           (with completeness score preview)
 *   ├── People             (with role/seniority badges)
 *   ├── Technologies       (with account count)
 *   └── Opportunities
 *
 *   Enrichment Pipeline
 *   ├── Enrichment Jobs    (pending → running → done)
 *   ├── Enrichment Proposals
 *   ├── DQ Rules
 *   └── DQ Findings
 *
 *   Activity & Events
 *   ├── Events (molt.event)
 *   ├── Sessions
 *   ├── Interactions
 *   └── Signals
 *
 *   Molt Growth Loop
 *   ├── Jobs
 *   ├── Approvals
 *   ├── Patterns
 *   ├── Notifications
 *   └── Strategy Briefs
 *
 *   Calls & Coaching
 *   ├── Call Sessions
 *   ├── Call Insights
 *   ├── Call Tasks
 *   └── Call Coaching
 *
 *   Network
 *   ├── Network People
 *   ├── Daily Briefings
 *   ├── Conversation Starters
 *   └── Touches
 *
 *   Community
 *   ├── Sources
 *   ├── Raw Posts
 *   └── Sanitized Posts
 *
 *   Config
 *   └── MoltBot Config
 */

import type {
  StructureBuilder,
  DefaultDocumentNodeResolver,
  DefaultDocumentNodeContext,
} from 'sanity/structure';
import { AccountPage } from './components/AccountPage';
import { AccountTreeExplorer } from './components/AccountTreeExplorer';
import { StorageGovernanceDashboard } from './components/StorageGovernanceDashboard';

export const getDefaultDocumentNode: DefaultDocumentNodeResolver = (
  S: StructureBuilder,
  options: DefaultDocumentNodeContext,
) => {
  if (options.schemaType === 'accountTreeExplorer') {
    return S.document().views([
      S.view.component(AccountTreeExplorer).title('Explorer'),
      S.view.form(),
    ]);
  }
  if (options.schemaType === 'storageDashboard') {
    return S.document().views([
      S.view.component(StorageGovernanceDashboard).title('Dashboard'),
      S.view.form(),
    ]);
  }
  if (options.schemaType === 'account') {
    return S.document().views([
      S.view.component(AccountPage).title('Account Page'),
      S.view.form(),
    ]);
  }
  return S.document().views([S.view.form()]);
};

export const deskStructure = (S: StructureBuilder) =>
  S.list()
    .title('Account DataSet')
    .items([
      S.listItem()
        .title('Account Tree')
        .id('accountTreeExplorer')
        .schemaType('accountTreeExplorer')
        .child(
          S.editor()
            .id('accountTreeExplorer')
            .schemaType('accountTreeExplorer')
            .documentId('accountTreeExplorer')
        ),

      S.divider(),

      S.listItem()
        .title('Storage Governance')
        .id('storageDashboard')
        .schemaType('storageDashboard')
        .child(
          S.editor()
            .id('storageDashboard')
            .schemaType('storageDashboard')
            .documentId('storageDashboard')
        ),

      S.divider(),

      // ═══════════════════════════════════════════════════════════
      // Sales Intelligence
      // ═══════════════════════════════════════════════════════════
      S.listItem()
        .title('Sales Intelligence')
        .child(
          S.list()
            .title('Sales Intelligence')
            .items([
              S.listItem()
                .title('Accounts')
                .schemaType('account')
                .child(
                  S.documentTypeList('account')
                    .title('Accounts')
                    .defaultOrdering([{ field: 'updatedAt', direction: 'desc' }])
                ),
              S.listItem()
                .title('People')
                .schemaType('person')
                .child(
                  S.documentTypeList('person')
                    .title('People')
                    .defaultOrdering([{ field: 'updatedAt', direction: 'desc' }])
                ),
              S.listItem()
                .title('Technologies')
                .schemaType('technology')
                .child(
                  S.documentTypeList('technology')
                    .title('Technologies')
                    .defaultOrdering([{ field: 'accountCount', direction: 'desc' }])
                ),
              S.listItem()
                .title('Opportunities')
                .schemaType('opportunity')
                .child(
                  S.documentTypeList('opportunity')
                    .title('Opportunities')
                    .defaultOrdering([{ field: '_createdAt', direction: 'desc' }])
                ),
              S.listItem()
                .title('Opportunity Briefs')
                .schemaType('opportunityBrief')
                .child(
                  S.documentTypeList('opportunityBrief')
                    .title('Opportunity Briefs')
                ),
            ])
        ),

      S.divider(),

      // ═══════════════════════════════════════════════════════════
      // Enrichment Pipeline
      // ═══════════════════════════════════════════════════════════
      S.listItem()
        .title('Enrichment Pipeline')
        .child(
          S.list()
            .title('Enrichment Pipeline')
            .items([
              S.listItem()
                .title('Enrichment Jobs')
                .schemaType('enrich.job')
                .child(
                  S.documentTypeList('enrich.job')
                    .title('Enrichment Jobs')
                    .defaultOrdering([{ field: '_createdAt', direction: 'desc' }])
                ),
              S.listItem()
                .title('Enrichment Proposals')
                .schemaType('enrich.proposal')
                .child(
                  S.documentTypeList('enrich.proposal')
                    .title('Enrichment Proposals')
                ),
              S.listItem()
                .title('DQ Rules')
                .schemaType('dq.rule')
                .child(
                  S.documentTypeList('dq.rule').title('DQ Rules')
                ),
              S.listItem()
                .title('DQ Findings')
                .schemaType('dq.finding')
                .child(
                  S.documentTypeList('dq.finding')
                    .title('DQ Findings')
                    .defaultOrdering([{ field: '_createdAt', direction: 'desc' }])
                ),
              S.listItem()
                .title('Crawl Snapshots')
                .schemaType('crawl.snapshot')
                .child(
                  S.documentTypeList('crawl.snapshot')
                    .title('Crawl Snapshots')
                    .defaultOrdering([{ field: '_createdAt', direction: 'desc' }])
                ),
            ])
        ),

      S.divider(),

      // ═══════════════════════════════════════════════════════════
      // Activity & Events
      // ═══════════════════════════════════════════════════════════
      S.listItem()
        .title('Activity & Events')
        .child(
          S.list()
            .title('Activity & Events')
            .items([
              S.listItem()
                .title('Events')
                .schemaType('molt.event')
                .child(
                  S.documentTypeList('molt.event')
                    .title('Events')
                    .defaultOrdering([{ field: '_createdAt', direction: 'desc' }])
                ),
              S.listItem()
                .title('Sessions')
                .schemaType('session')
                .child(
                  S.documentTypeList('session')
                    .title('Sessions')
                    .defaultOrdering([{ field: '_createdAt', direction: 'desc' }])
                ),
              S.listItem()
                .title('Interactions')
                .schemaType('interaction')
                .child(
                  S.documentTypeList('interaction')
                    .title('Interactions')
                    .defaultOrdering([{ field: '_createdAt', direction: 'desc' }])
                ),
              S.listItem()
                .title('Signals')
                .schemaType('signal')
                .child(
                  S.documentTypeList('signal').title('Signals')
                ),
              S.listItem()
                .title('Learning Patterns')
                .schemaType('learning')
                .child(
                  S.documentTypeList('learning').title('Learning Patterns')
                ),
            ])
        ),

      S.divider(),

      // ═══════════════════════════════════════════════════════════
      // Molt Growth Loop
      // ═══════════════════════════════════════════════════════════
      S.listItem()
        .title('Molt Growth Loop')
        .child(
          S.list()
            .title('Molt Growth Loop')
            .items([
              S.listItem()
                .title('Jobs')
                .schemaType('molt.job')
                .child(
                  S.documentTypeList('molt.job')
                    .title('Jobs')
                    .defaultOrdering([{ field: '_createdAt', direction: 'desc' }])
                ),
              S.listItem()
                .title('Approvals')
                .schemaType('molt.approval')
                .child(
                  S.documentTypeList('molt.approval').title('Approvals')
                ),
              S.listItem()
                .title('Draft Actions')
                .schemaType('draftAction')
                .child(
                  S.documentTypeList('draftAction').title('Draft Actions')
                ),
              S.listItem()
                .title('Patterns')
                .schemaType('molt.pattern')
                .child(
                  S.documentTypeList('molt.pattern').title('Patterns')
                ),
              S.listItem()
                .title('Strategy Briefs')
                .schemaType('molt.strategyBrief')
                .child(
                  S.documentTypeList('molt.strategyBrief').title('Strategy Briefs')
                ),
              S.listItem()
                .title('Notifications')
                .schemaType('molt.notification')
                .child(
                  S.documentTypeList('molt.notification').title('Notifications')
                ),
              S.listItem()
                .title('Metric Snapshots')
                .schemaType('molt.metricSnapshot')
                .child(
                  S.documentTypeList('molt.metricSnapshot').title('Metric Snapshots')
                ),
            ])
        ),

      S.divider(),

      // ═══════════════════════════════════════════════════════════
      // Calls & Coaching
      // ═══════════════════════════════════════════════════════════
      S.listItem()
        .title('Calls & Coaching')
        .child(
          S.list()
            .title('Calls & Coaching')
            .items([
              S.listItem()
                .title('Call Sessions')
                .schemaType('call.session')
                .child(
                  S.documentTypeList('call.session')
                    .title('Call Sessions')
                    .defaultOrdering([{ field: '_createdAt', direction: 'desc' }])
                ),
              S.listItem()
                .title('Call Insights')
                .schemaType('call.insight')
                .child(
                  S.documentTypeList('call.insight').title('Call Insights')
                ),
              S.listItem()
                .title('Call Tasks')
                .schemaType('call.task')
                .child(
                  S.documentTypeList('call.task').title('Call Tasks')
                ),
              S.listItem()
                .title('Call Coaching')
                .schemaType('call.coaching')
                .child(
                  S.documentTypeList('call.coaching').title('Call Coaching')
                ),
              S.listItem()
                .title('Follow-up Drafts')
                .schemaType('call.followupDraft')
                .child(
                  S.documentTypeList('call.followupDraft').title('Follow-up Drafts')
                ),
            ])
        ),

      S.divider(),

      // ═══════════════════════════════════════════════════════════
      // Network
      // ═══════════════════════════════════════════════════════════
      S.listItem()
        .title('Network')
        .child(
          S.list()
            .title('Network')
            .items([
              S.listItem()
                .title('Network People')
                .schemaType('networkPerson')
                .child(
                  S.documentTypeList('networkPerson').title('Network People')
                ),
              S.listItem()
                .title('Daily Briefings')
                .schemaType('networkDailyBriefing')
                .child(
                  S.documentTypeList('networkDailyBriefing')
                    .title('Daily Briefings')
                    .defaultOrdering([{ field: '_createdAt', direction: 'desc' }])
                ),
              S.listItem()
                .title('Conversation Starters')
                .schemaType('conversationStarter')
                .child(
                  S.documentTypeList('conversationStarter').title('Conversation Starters')
                ),
              S.listItem()
                .title('Touches')
                .schemaType('touch')
                .child(
                  S.documentTypeList('touch')
                    .title('Touches')
                    .defaultOrdering([{ field: '_createdAt', direction: 'desc' }])
                ),
            ])
        ),

      // ═══════════════════════════════════════════════════════════
      // Community
      // ═══════════════════════════════════════════════════════════
      S.listItem()
        .title('Community')
        .child(
          S.list()
            .title('Community')
            .items([
              S.listItem()
                .title('Sources')
                .schemaType('communitySource')
                .child(
                  S.documentTypeList('communitySource').title('Sources')
                ),
              S.listItem()
                .title('Raw Posts')
                .schemaType('communityPostRaw')
                .child(
                  S.documentTypeList('communityPostRaw').title('Raw Posts')
                ),
              S.listItem()
                .title('Sanitized Posts')
                .schemaType('communityPostSanitized')
                .child(
                  S.documentTypeList('communityPostSanitized').title('Sanitized Posts')
                ),
            ])
        ),

      S.divider(),

      // ═══════════════════════════════════════════════════════════
      // Config
      // ═══════════════════════════════════════════════════════════
      S.listItem()
        .title('Config')
        .child(
          S.list()
            .title('Configuration')
            .items([
              S.listItem()
                .title('MoltBot Config')
                .schemaType('moltbot.config')
                .child(
                  S.documentTypeList('moltbot.config').title('MoltBot Config')
                ),
              S.listItem()
                .title('Companies')
                .schemaType('company')
                .child(
                  S.documentTypeList('company').title('Companies')
                ),
            ])
        ),
    ]);
