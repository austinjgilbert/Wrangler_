# Complete Update Checklist: GPT + Worker

## ✅ What's Already Done

- [x] Sanity two-way sync implemented in Worker
- [x] New endpoints: `/store/{type}`, `/query`, `/update/{docId}`, `/delete/{docId}`
- [x] Auto-save functionality added to `/scan`
- [x] Account-based document model (account + accountPack)
- [x] ADMIN_TOKEN security guard
- [x] GPT instructions updated with Sanity endpoints
- [x] OpenAPI schema includes all Sanity endpoints

---

## 📋 Step 1: Update ChatGPT Custom GPT

### 1.1 Update Instructions Field

1. Go to https://chat.openai.com
2. Click your Custom GPT → **Configure** (gear icon)
3. Scroll to **Instructions** field
4. **Delete** all existing instructions
5. **Copy** the entire contents of `gpt-instructions.md`
6. **Paste** into the Instructions field
7. **Save**

**File to copy from:**
```bash
cat /Users/austin.gilbert/website-scanner-worker/gpt-instructions.md
```

### 1.2 Update Actions (OpenAPI Schema)

1. In the same **Configure** tab, scroll to **Actions**
2. **Delete** the existing action (if it exists)
3. Click **"Create new action"**
4. Click **"Import from URL"** or **"Upload file"**
5. **Upload** the `openapi.yaml` file
6. **Save**

**File to upload:**
```
/Users/austin.gilbert/website-scanner-worker/openapi.yaml
```

### 1.3 Verify Actions Are Loaded

After uploading, you should see these operations:
- `scanHomepage`
- `scanBatchAccounts`
- `scanLinkedInProfile`
- `extractEvidence`
- `searchWeb`
- `discoverPages`
- `crawlPages`
- `verifyClaims`
- `generateBrief`
- `storeData` ⭐ NEW
- `queryData` ⭐ NEW
- `updateDocument` ⭐ NEW
- `deleteDocument` ⭐ NEW

---

## 📋 Step 2: Deploy Worker to Cloudflare

### 2.1 Navigate to Project Directory

```bash
cd /Users/austin.gilbert/website-scanner-worker
```

### 2.2 Set Sanity Secrets (if not already done)

```bash
# Required
wrangler secret put SANITY_PROJECT_ID
wrangler secret put SANITY_API_TOKEN

# Optional
wrangler secret put SANITY_DATASET
wrangler secret put SANITY_API_VERSION
wrangler secret put ADMIN_TOKEN
```

### 2.3 Deploy Worker

```bash
npm run deploy
```

Or:
```bash
wrangler deploy
```

### 2.4 Note Your Worker URL

After deployment, you'll see:
```
✨ Deployed to https://website-scanner.your-account.workers.dev
```

**Save this URL** - you'll need it for the GPT configuration.

---

## 📋 Step 3: Update GPT with Worker URL

### 3.1 Update Server URL in GPT Actions

1. In ChatGPT → Your Custom GPT → **Configure** → **Actions**
2. Find the action you just uploaded
3. Check the **Server URL** field
4. Update it to your Worker URL:
   ```
   https://website-scanner.your-account.workers.dev
   ```
5. **Save**

---

## 📋 Step 4: Test Everything

### 4.1 Test Worker Directly

```bash
# Health check
curl https://YOUR_WORKER_URL.workers.dev/health

# Test scan with auto-save
curl "https://YOUR_WORKER_URL.workers.dev/scan?url=https://example.com&store=true"

# Test query
curl "https://YOUR_WORKER_URL.workers.dev/query?type=companies&limit=5"
```

### 4.2 Test GPT Integration

In ChatGPT, try these commands:

1. **Basic scan:**
   ```
   Scan https://example.com
   ```

2. **Scan with auto-save:**
   ```
   Scan https://example.com and store it
   ```

3. **Query stored companies:**
   ```
   Show me top companies by opportunity score
   ```

4. **Store data manually:**
   ```
   Store this scan result: [paste scan data]
   ```

---

## 🔍 Verification Checklist

### Worker Verification
- [ ] Worker deploys successfully (`wrangler deploy`)
- [ ] Health endpoint works (`/health`)
- [ ] Scan endpoint works (`/scan?url=...`)
- [ ] Store endpoint works (`POST /store/scan`)
- [ ] Query endpoint works (`GET /query?type=companies`)
- [ ] Sanity secrets are set (`wrangler secret list`)

### GPT Verification
- [ ] Instructions updated (check character count < 8000)
- [ ] OpenAPI schema uploaded
- [ ] All 13 operations visible in Actions
- [ ] Server URL points to your Worker
- [ ] GPT can call `scanHomepage`
- [ ] GPT can call `storeData`
- [ ] GPT can call `queryData`

### Integration Verification
- [ ] GPT successfully calls Worker endpoints
- [ ] Scan results are returned correctly
- [ ] Data is stored in Sanity (check Sanity Studio)
- [ ] Query returns stored data

---

## 🚨 Common Issues & Fixes

### Issue: "Could not parse valid OpenAPI spec"

**Fix:**
- Check `openapi.yaml` is valid YAML
- Ensure `openapi: 3.0.0` (not 3.1.1)
- All object schemas have `properties: {}`
- No apostrophes in descriptions

### Issue: "GPT instructions cannot be longer than 8000 characters"

**Fix:**
- Check character count: `wc -c gpt-instructions.md`
- Condense descriptions if needed
- Remove redundant examples

### Issue: "Sanity not configured"

**Fix:**
- Set secrets: `wrangler secret put SANITY_PROJECT_ID`
- Verify: `wrangler secret list`
- Redeploy: `wrangler deploy`

### Issue: "UNAUTHORIZED" on write operations

**Fix:**
- Set `ADMIN_TOKEN` secret
- Include header: `X-Admin-Token: your-token`
- Or remove `ADMIN_TOKEN` to disable guard

### Issue: GPT can't call Worker

**Fix:**
- Verify Server URL in GPT Actions matches your Worker URL
- Check Worker is deployed and accessible
- Test Worker URL directly with curl
- Check Worker logs: `wrangler tail`

---

## 📝 Quick Reference

### Files to Update in GPT
1. **Instructions**: Copy from `gpt-instructions.md`
2. **Actions**: Upload `openapi.yaml`
3. **Server URL**: Update to your Worker URL

### Commands to Run
```bash
# Navigate to project
cd /Users/austin.gilbert/website-scanner-worker

# Deploy worker
wrangler deploy

# Check secrets
wrangler secret list

# View logs
wrangler tail

# Test health
curl https://YOUR_WORKER_URL.workers.dev/health
```

### GPT Test Commands
```
Scan https://example.com
Scan https://example.com and store it
Show me top companies by opportunity score
Query stored data for "WordPress"
```

---

## ✅ Final Checklist

Before you're done, verify:

- [ ] GPT Instructions updated (< 8000 chars)
- [ ] OpenAPI schema uploaded to GPT
- [ ] Server URL updated in GPT Actions
- [ ] Worker deployed successfully
- [ ] Sanity secrets configured
- [ ] Worker health check passes
- [ ] GPT can call Worker endpoints
- [ ] Data is stored in Sanity
- [ ] Query returns stored data

**You're all set! 🎉**

