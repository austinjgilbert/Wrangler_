# Update Checklist - What You Need to Do

**Date**: January 5, 2026  
**Status**: System is production-ready, but configuration is needed

## ✅ Already Complete

- [x] Code deployed to production
- [x] All improvements implemented
- [x] Error handling enhanced
- [x] Health checks working
- [x] Documentation created

## ⚠️ Required Updates

### 1. Configure Sanity Secrets (REQUIRED for OSINT features)

**Status**: Check your current configuration:
```bash
curl https://website-scanner.austin-gilbert.workers.dev/health | jq '.dependencies.sanity'
```

**If `configured: false`, run:**
```bash
cd /Users/austin.gilbert/website-scanner-worker
wrangler secret put SANITY_PROJECT_ID
# Enter your Sanity project ID when prompted

wrangler secret put SANITY_API_TOKEN
# Enter your Sanity API token when prompted
```

**Optional Sanity settings:**
```bash
wrangler secret put SANITY_DATASET  # Default: "production"
wrangler secret put SANITY_API_VERSION  # Default: "2023-10-01"
```

**Verify:**
```bash
curl https://website-scanner.austin-gilbert.workers.dev/health | jq '.dependencies.sanity'
# Should show: "configured": true
```

### 2. Deploy Sanity Schemas (REQUIRED for OSINT storage)

**Location**: `/Users/austin.gilbert/website-scanner-worker/schemas/`

**Schemas to deploy:**
- `osint.js` - OSINT Report schema
- `osintJob.js` - OSINT Job tracking schema
- `account.js` - Account schema
- `accountPack.js` - Account Pack schema
- `brief.js` - Brief schema (if not already deployed)

**Steps:**
1. Copy schema files to your Sanity Studio project:
   ```bash
   # If you have a Sanity Studio project
   cp schemas/*.js /path/to/your/sanity-studio/schemas/
   ```

2. Update `sanity.config.ts` in your Sanity Studio:
   ```typescript
   import {defineConfig} from 'sanity'
   import {deskTool} from 'sanity/desk'
   
   import osintSchema from './schemas/osint'
   import osintJobSchema from './schemas/osintJob'
   import accountSchema from './schemas/account'
   import accountPackSchema from './schemas/accountPack'
   import briefSchema from './schemas/brief'
   
   export default defineConfig({
     name: 'default',
     title: 'Website Scanner CMS',
     projectId: 'your-project-id',
     dataset: 'production',
     plugins: [deskTool()],
     schema: {
       types: [
         osintSchema,
         osintJobSchema,
         accountSchema,
         accountPackSchema,
         briefSchema,
         // ... other schemas
       ],
     },
   })
   ```

3. Deploy Sanity Studio:
   ```bash
   cd /path/to/your/sanity-studio
   sanity deploy
   ```

**See**: `SANITY-OSINT-SCHEMA-SETUP.md` for detailed instructions

### 3. Update Custom GPT (REQUIRED for GPT integration)

**Files to update:**
- `gpt-instructions.md` - Copy to GPT Instructions
- `openapi.yaml` - Upload to GPT Actions

**Steps:**
1. Open your Custom GPT in ChatGPT
2. Go to **Configure** → **Instructions**
3. **Delete** existing instructions
4. **Copy and paste** entire contents of `gpt-instructions.md`
5. **Save**

6. Go to **Configure** → **Actions**
7. **Delete** existing action (if any)
8. Click **Create new action**
9. **Upload** `openapi.yaml` file
10. **Save**

**Verify:**
- Test with: "Generate year-ahead intelligence for example.com"
- GPT should call `queueOsintJob` action

**See**: `GPT-OSINT-UPDATE.md` for detailed instructions

### 4. Optional: Set Admin API Key (For /osint/run protection)

**If you want to protect the `/osint/run` endpoint:**
```bash
wrangler secret put ADMIN_API_KEY
# Enter a secure API key when prompted
```

**Usage:**
```bash
curl -X POST https://website-scanner.austin-gilbert.workers.dev/osint/run \
  -H "Content-Type: application/json" \
  -H "X-Admin-API-Key: YOUR_KEY_HERE" \
  -d '{"url": "https://example.com"}'
```

**Note**: If `ADMIN_API_KEY` is not set, the endpoint is unprotected (use with caution).

### 5. Optional: Configure OSINT Settings

**Optional environment variables:**
```bash
wrangler secret put OSINT_DEFAULT_RECENCY_DAYS  # Default: 365
wrangler secret put OSINT_MAX_SOURCES  # Default: 25
wrangler secret put OSINT_MAX_EXTRACT  # Default: 15
```

## 🔍 Verification Steps

### 1. Check Health Endpoint
```bash
curl https://website-scanner.austin-gilbert.workers.dev/health | jq
```

**Expected:**
- `ok: true`
- `dependencies.sanity.configured: true` (after setting secrets)
- `status: "operational"`

### 2. Test OSINT Queue Endpoint
```bash
curl -X POST https://website-scanner.austin-gilbert.workers.dev/osint/queue \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

**Expected (if queue not configured):**
- HTTP 503
- Error code: `CONFIGURATION_ERROR`
- Message suggesting to use `/osint/run`

**Expected (if Sanity not configured):**
- HTTP 503
- Error code: `CONFIGURATION_ERROR`
- Message with setup instructions

### 3. Test OSINT Status Endpoint
```bash
curl "https://website-scanner.austin-gilbert.workers.dev/osint/status?accountKey=test123"
```

**Expected (if Sanity not configured):**
- HTTP 503
- Error code: `CONFIGURATION_ERROR`
- Actionable error message

### 4. Test Scan Endpoint
```bash
curl "https://website-scanner.austin-gilbert.workers.dev/scan?url=https://example.com"
```

**Expected:**
- HTTP 200
- Full scan data returned
- Works without Sanity (but won't auto-save)

## 📋 Quick Status Check

Run this to see what's configured:
```bash
curl -s https://website-scanner.austin-gilbert.workers.dev/health | jq '{
  sanity: .dependencies.sanity.configured,
  queue: .dependencies.osintQueue.configured,
  do: .dependencies.osintJobsDO.configured,
  status: .status
}'
```

## 🚨 Common Issues

### Issue: OSINT endpoints return 503
**Solution**: Set Sanity secrets (see #1 above)

### Issue: "Sanity API error: 400"
**Solution**: 
- Check that schemas are deployed to Sanity Studio
- Verify `SANITY_DATASET` matches your dataset name
- Check that API token has write permissions

### Issue: GPT not calling OSINT actions
**Solution**: 
- Verify `openapi.yaml` is uploaded to GPT Actions
- Check that instructions include OSINT documentation
- Test with explicit prompt: "Generate year-ahead intelligence for example.com"

### Issue: Queue endpoint returns error
**Solution**: 
- This is expected on free plan
- Use `POST /osint/run` for synchronous execution
- Or upgrade to Workers Paid plan and uncomment queue bindings in `wrangler.toml`

## 📚 Documentation Reference

- **Sanity Setup**: `SANITY-OSINT-SCHEMA-SETUP.md`
- **GPT Integration**: `GPT-OSINT-UPDATE.md`
- **Deployment**: `DEPLOYMENT-COMPLETE.md`
- **Production Summary**: `PRODUCTION-READY-SUMMARY.md`
- **System Test**: `SYSTEM-TEST-REPORT.md`

## ✅ Completion Checklist

- [ ] Sanity secrets configured (`SANITY_PROJECT_ID`, `SANITY_API_TOKEN`)
- [ ] Sanity schemas deployed to Studio
- [ ] GPT instructions updated
- [ ] GPT actions updated with `openapi.yaml`
- [ ] Health endpoint shows `sanity.configured: true`
- [ ] OSINT endpoints return proper errors (not 500)
- [ ] Test scan endpoint works
- [ ] Test OSINT queue endpoint (should return helpful error if not configured)
- [ ] (Optional) Admin API key set
- [ ] (Optional) OSINT settings configured

---

**Last Updated**: January 5, 2026  
**Next Review**: After completing required updates
