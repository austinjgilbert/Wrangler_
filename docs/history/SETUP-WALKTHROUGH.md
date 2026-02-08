# Step-by-Step Setup Guide: Sanity Two-Way Sync

## Prerequisites Checklist

Before starting, ensure you have:
- [ ] A Sanity.io account (sign up at https://www.sanity.io)
- [ ] A Sanity project created
- [ ] Cloudflare account with Workers access
- [ ] `wrangler` CLI installed (`npm install -g wrangler`)
- [ ] Node.js installed

---

## Step 1: Set Up Sanity Project

### 1.1 Create Sanity Project

1. Go to https://www.sanity.io/manage
2. Click **"Create project"**
3. Choose a project name (e.g., "website-scanner-data")
4. Choose a dataset name (default: "production")
5. Note your **Project ID** (visible in project settings)

### 1.2 Get API Token

1. In your Sanity project, go to **API** → **Tokens**
2. Click **"Add API token"**
3. Name it (e.g., "Website Scanner Worker")
4. Select **"Editor"** permissions (or "Admin" for full access)
5. **Copy the token** (you'll need it in Step 2)

### 1.3 (Optional) Set Up Schema

The Worker will create documents automatically, but you can pre-define schemas in Sanity Studio if desired. The Worker uses these document types:
- `account` (summary)
- `accountPack` (full data)

**Note**: The Worker will create these automatically on first use, so schema setup is optional.

---

## Step 2: Configure Environment Variables

### 2.1 Set Sanity Secrets in Cloudflare

Open your terminal and navigate to your project directory:

```bash
cd /Users/austin.gilbert/website-scanner-worker
```

Set the required secrets:

```bash
# Required: Your Sanity Project ID
wrangler secret put SANITY_PROJECT_ID
# When prompted, paste your Project ID (e.g., "abc123xyz")

# Required: Your Sanity API Token
wrangler secret put SANITY_API_TOKEN
# When prompted, paste your API token

# Optional: Dataset name (defaults to "production" if not set)
wrangler secret put SANITY_DATASET
# When prompted, enter "production" (or your dataset name)

# Optional: API Version (defaults to "2023-10-01" if not set)
wrangler secret put SANITY_API_VERSION
# When prompted, enter "2023-10-01"

# Optional: Admin token for write operation protection
wrangler secret put ADMIN_TOKEN
# When prompted, enter a secure random string (e.g., generate with: openssl rand -hex 32)
```

**Tip**: To generate a secure admin token:
```bash
openssl rand -hex 32
```

### 2.2 Verify Secrets Are Set

List your secrets (note: values are hidden):
```bash
wrangler secret list
```

You should see:
- `SANITY_PROJECT_ID`
- `SANITY_API_TOKEN`
- `SANITY_DATASET` (if set)
- `SANITY_API_VERSION` (if set)
- `ADMIN_TOKEN` (if set)

---

## Step 3: Test Locally (Optional but Recommended)

### 3.1 Install Dependencies

```bash
npm install
```

### 3.2 Create `.dev.vars` File for Local Testing

Create a file named `.dev.vars` in your project root:

```bash
cat > .dev.vars << EOF
SANITY_PROJECT_ID=your-project-id-here
SANITY_API_TOKEN=your-api-token-here
SANITY_DATASET=production
SANITY_API_VERSION=2023-10-01
ADMIN_TOKEN=your-admin-token-here
EOF
```

**Important**: Add `.dev.vars` to `.gitignore` to avoid committing secrets:
```bash
echo ".dev.vars" >> .gitignore
```

### 3.3 Run Local Dev Server

```bash
wrangler dev
```

The server will start at `http://localhost:8787`

### 3.4 Test Health Endpoint

In another terminal:
```bash
curl http://localhost:8787/health
```

Expected response:
```json
{"ok":true,"ts":"2024-01-01T00:00:00.000Z","version":"1.0.0"}
```

### 3.5 Test Sanity Integration

Test storing a scan:
```bash
curl -X POST "http://localhost:8787/scan?url=https://example.com&store=true"
```

Check if it was stored:
```bash
curl "http://localhost:8787/query?type=companies&limit=5"
```

---

## Step 4: Deploy to Cloudflare

### 4.1 Build and Deploy

```bash
npm run deploy
```

Or manually:
```bash
wrangler deploy
```

### 4.2 Note Your Worker URL

After deployment, you'll see output like:
```
✨  Deployed to https://website-scanner.your-account.workers.dev
```

**Save this URL** - you'll use it for API calls.

---

## Step 5: Verify Deployment

### 5.1 Test Health Endpoint

```bash
curl https://your-worker-url.workers.dev/health
```

Expected: `{"ok":true,...}`

### 5.2 Test Sanity Connection

Test storing a scan:
```bash
curl -X POST "https://your-worker-url.workers.dev/scan?url=https://example.com&store=true"
```

The response should include a `stored` field:
```json
{
  "ok": true,
  "data": {
    "input": "https://example.com",
    "finalUrl": "https://example.com",
    ...
    "stored": {
      "accountKey": "abc123...",
      "packId": "accountPack-abc123..."
    }
  }
}
```

### 5.3 Query Stored Data

```bash
curl "https://your-worker-url.workers.dev/query?type=companies&limit=5"
```

Expected: Array of account documents if any were stored.

---

## Step 6: Test All Endpoints

### 6.1 Store a Scan

```bash
curl -X POST "https://your-worker-url.workers.dev/scan?url=https://example.com&store=true"
```

### 6.2 Store via /store Endpoint

```bash
curl -X POST "https://your-worker-url.workers.dev/store/scan" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: your-admin-token" \
  -d '{
    "account": {
      "canonicalUrl": "https://example.com",
      "companyName": "Example Corp"
    },
    "data": {
      "input": "https://example.com",
      "finalUrl": "https://example.com",
      "status": 200,
      "technologyStack": {
        "cms": ["WordPress"],
        "opportunityScore": 75
      }
    }
  }'
```

### 6.3 Query Companies

```bash
curl "https://your-worker-url.workers.dev/query?type=companies&minScore=50&limit=10"
```

### 6.4 Search Documents

```bash
curl "https://your-worker-url.workers.dev/query?type=search&q=WordPress&types=account"
```

### 6.5 Update a Document

First, get a document ID from a query, then:
```bash
curl -X PUT "https://your-worker-url.workers.dev/update/account-abc123" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: your-admin-token" \
  -d '{
    "set": {
      "notes": "High priority account"
    }
  }'
```

### 6.6 Delete a Document

```bash
curl -X DELETE "https://your-worker-url.workers.dev/delete/account-abc123?cascade=true" \
  -H "X-Admin-Token: your-admin-token"
```

---

## Step 7: Verify in Sanity Studio

1. Go to https://www.sanity.io/manage
2. Select your project
3. Click **"Open Studio"**
4. Navigate to **"Content"** or **"Data"**
5. You should see:
   - `account` documents (summaries)
   - `accountPack` documents (full data)

---

## Troubleshooting

### Issue: "Sanity not configured" error

**Solution**: 
- Verify secrets are set: `wrangler secret list`
- Re-set secrets if needed: `wrangler secret put SANITY_PROJECT_ID`
- For local dev, check `.dev.vars` file exists and has correct values

### Issue: "UNAUTHORIZED" error on write operations

**Solution**:
- Check if `ADMIN_TOKEN` is set
- Verify you're sending the token in headers:
  - `X-Admin-Token: your-token` OR
  - `Authorization: Bearer your-token`
- If you don't want auth, remove `ADMIN_TOKEN` secret

### Issue: Documents not appearing in Sanity Studio

**Solution**:
- Wait a few seconds (Sanity may take a moment to index)
- Refresh the Studio page
- Check Sanity project dashboard for API errors
- Verify API token has write permissions

### Issue: "Failed to store account pack" error

**Solution**:
- Check Sanity API token permissions (needs "Editor" or "Admin")
- Verify project ID is correct
- Check dataset name matches (default: "production")
- Review Sanity project dashboard for API errors

### Issue: Local dev server not working

**Solution**:
- Ensure `.dev.vars` file exists in project root
- Check file format (no quotes around values)
- Restart dev server: `wrangler dev`
- Check for syntax errors in `.dev.vars`

---

## Quick Reference

### Required Secrets
```bash
SANITY_PROJECT_ID=your-project-id
SANITY_API_TOKEN=your-api-token
```

### Optional Secrets
```bash
SANITY_DATASET=production
SANITY_API_VERSION=2023-10-01
ADMIN_TOKEN=your-secure-token
```

### Key Endpoints
- `GET /health` - Health check
- `GET /scan?url=...&store=true` - Scan and auto-save
- `POST /store/{type}` - Store data manually
- `GET /query?type=companies` - Query companies
- `PUT /update/{docId}` - Update document
- `DELETE /delete/{docId}` - Delete document

### Useful Commands
```bash
# List secrets
wrangler secret list

# Update a secret
wrangler secret put SECRET_NAME

# Delete a secret
wrangler secret delete SECRET_NAME

# Deploy
wrangler deploy

# Local dev
wrangler dev
```

---

## Next Steps

1. ✅ Set up Sanity project and get credentials
2. ✅ Configure Cloudflare secrets
3. ✅ Deploy worker
4. ✅ Test endpoints
5. ✅ Verify data in Sanity Studio
6. 🎉 Start scanning and storing data!

For detailed API documentation, see `SANITY-SYNC-README.md`

