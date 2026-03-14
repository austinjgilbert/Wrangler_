import { defineCliConfig } from 'sanity/cli'

export default defineCliConfig({
  app: {
    organizationId: 'of8nbhG8g',
    entry: './src/App.tsx',
  },
  deployment: {
    appId: 'fhba58obwhfounyb1893q6ea',
  },
})
