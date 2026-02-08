/**
 * Sanity CLI configuration
 * Used for deploy and other CLI commands
 */

import { defineCliConfig } from 'sanity/cli';

export default defineCliConfig({
  api: {
    projectId: 'nlqb7zmk',
    dataset: 'production'
  },
  deployment: {
    appId: 'mp0a9q411nmg41051upk14rc',
  },
  // Must match an "internal" studio hostname created in https://www.sanity.io/manage/project/nlqb7zmk
  studioHost: process.env.SANITY_STUDIO_HOSTNAME || 'molt-content-os'
});
