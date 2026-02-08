# Sanity Brief Schema Setup

## Quick Setup

Add the `brief` document type to your Sanity Studio schema.

### Option 1: If you have a Sanity Studio project

1. **Locate your schema directory** (usually `schemas/` or `src/schemas/`)

2. **Create or update `schemas/brief.js`**:
   ```js
   export default {
     name: 'brief',
     title: 'Brief',
     type: 'document',
     fields: [
       {
         name: 'account',
         type: 'reference',
         to: [{ type: 'account' }],
         validation: Rule => Rule.required(),
       },
       {
         name: 'data',
         type: 'object',
         fields: [
           { name: 'executiveSummary', type: 'array', of: [{ type: 'string' }] },
           { name: 'scores', type: 'object' },
           { name: 'justifications', type: 'array', of: [{ type: 'string' }] },
           { name: 'roiPlays', type: 'array', of: [{ type: 'object' }] },
           { name: 'nextStep', type: 'text' },
         ],
       },
       { name: 'source', type: 'string', initialValue: 'website-scanner' },
       { name: 'createdAt', type: 'datetime', initialValue: () => new Date().toISOString() },
     ],
   };
   ```

3. **Import it in `schemas/index.js`**:
   ```js
   import brief from './brief';
   
   export default [
     // ... your other schemas
     brief,
   ];
   ```

4. **Deploy to Sanity**:
   ```bash
   sanity deploy
   ```

### Option 2: If you DON'T have a Sanity Studio project

**No action needed!** The Worker will create `brief` documents automatically when you store data. Sanity will accept the documents without a pre-defined schema.

However, to view/edit them in Sanity Studio later, you'll need to add the schema.

## Verify Brief Documents

After storing a brief via the Worker:

1. Go to https://www.sanity.io/manage
2. Select your project → **Open Studio**
3. Navigate to **Content**
4. You should see `brief` documents with:
   - Account reference
   - Brief data (executiveSummary, scores, roiPlays, etc.)
   - Metadata (source, createdAt, etc.)

## Test Brief Storage

```bash
curl -X POST "https://website-scanner.austin-gilbert.workers.dev/store/brief" \
  -H "Content-Type: application/json" \
  -d '{
    "account": {
      "companyName": "H-E-B",
      "domain": "heb.com"
    },
    "data": {
      "executiveSummary": ["Test summary"],
      "scores": {"opportunity": 85},
      "roiPlays": [{"title": "Test play"}],
      "nextStep": "Verify in Sanity Studio"
    }
  }'
```

Expected response:
```json
{
  "ok": true,
  "data": {
    "stored": true,
    "id": "brief-abc123-1234567890",
    "type": "brief"
  }
}
```

