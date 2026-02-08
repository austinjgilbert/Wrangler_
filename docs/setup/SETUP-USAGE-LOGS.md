# Setup Usage Logs in Sanity

## Quick Setup

The usage logging system is already integrated into the worker. You just need to add the schema to your Sanity project.

## Option 1: Add Schema to Existing Sanity Studio

If you have a Sanity Studio project:

1. **Copy the schema file**:
   ```bash
   cp schemas/usageLog.js /path/to/your/sanity-studio/schemas/usageLog.js
   ```

2. **Import it in your `schemas/index.js`** (or `schemas/index.ts`):
   ```js
   import usageLog from './usageLog';
   
   export default [
     // ... your existing schemas
     usageLog,
   ];
   ```

3. **Deploy the Studio**:
   ```bash
   cd /path/to/your/sanity-studio
   sanity deploy
   ```

## Option 2: No Studio Needed (Documents Work Without Schema)

**Good news**: Sanity will accept `usageLog` documents even without a pre-defined schema! The schema is mainly for:
- Better editing experience in Studio
- Field validation
- Helpful descriptions

The worker will create usage log documents automatically. You can view them in Sanity's hosted Studio:
1. Go to https://www.sanity.io/manage
2. Select your project
3. Click **"Open Studio"**
4. Navigate to **Content**
5. Look for `usageLog` documents

## Verify Logging is Working

1. **Make a test request with user headers**:
   ```bash
   curl "https://website-scanner.austin-gilbert.workers.dev/health" \
     -H "X-Sanity-User-Id: test-user-123" \
     -H "X-Sanity-User-Email: test@example.com"
   ```

2. **Check logs** (wait a few seconds for async logging):
   ```bash
   ./view-usage-logs.sh --recent 5
   ```

3. **Or query directly**:
   ```bash
   curl -X POST "https://website-scanner.austin-gilbert.workers.dev/query" \
     -H "Content-Type: application/json" \
     -d '{"query": "*[_type == \"usageLog\"] | order(timestamp desc) [0...10]"}'
   ```

## Troubleshooting

### No logs appearing?

1. **Check Sanity is configured**:
   ```bash
   curl "https://website-scanner.austin-gilbert.workers.dev/health" | jq '.dependencies.sanity'
   ```
   Should show `"configured": true`

2. **Check worker logs** (if you have access):
   - Look for "Usage logging failed" errors
   - Logging failures are silent and won't break the API

3. **Verify schema exists**:
   - Go to Sanity Studio → Schema
   - Look for "Usage Log" document type
   - If missing, add the schema (see Option 1 above)

4. **Test with explicit user ID**:
   ```bash
   curl "https://website-scanner.austin-gilbert.workers.dev/scan?url=https://example.com" \
     -H "X-Sanity-User-Id: test-user-$(date +%s)"
   ```

### Logs show "anonymous" users?

The system extracts user IDs from these headers (in order):
- `X-Sanity-User-Id`
- `X-User-Id`
- `X-Sanity-User`
- Authorization header (if it contains user ID)

If none are present, it defaults to `'anonymous'`.

## Viewing Logs

Use the provided script:
```bash
./view-usage-logs.sh              # Default dashboard
./view-usage-logs.sh --recent 50  # Last 50 logs
./view-usage-logs.sh --stats      # Summary statistics
./view-usage-logs.sh --by-user    # Grouped by user
./view-usage-logs.sh --by-endpoint # Grouped by endpoint
```

Or query directly via the API (see examples in `USAGE-LOGGING.md`).
