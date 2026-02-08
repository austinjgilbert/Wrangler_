# Fix Sanity Secrets - Step by Step

## Current Status
✅ Secrets are listed (SANITY_PROJECT_ID, SANITY_API_TOKEN, SANITY_DATASET)
⚠️  But data is NOT being stored

## Possible Issues
1. Secrets have incorrect values
2. API token doesn't have write permissions
3. Worker needs redeploy (after code changes)

## Step-by-Step Fix

### Step 1: Get Your Sanity Credentials

1. **Get Project ID**:
   - Go to https://www.sanity.io/manage
   - Click your project
   - Go to Settings → Project ID
   - Copy the Project ID (e.g., `abc123xyz`)

2. **Get API Token**:
   - In same project, go to API → Tokens
   - Click "Add API token"
   - Name: "Website Scanner Worker"
   - Permissions: **Editor** or **Admin** (required for writes)
   - Copy the token (starts with `sk...`)

### Step 2: Update Secrets via CLI

```bash
cd /Users/austin.gilbert/website-scanner-worker

# Update Project ID
wrangler secret put SANITY_PROJECT_ID
# Paste your Project ID when prompted

# Update API Token
wrangler secret put SANITY_API_TOKEN
# Paste your API token when prompted

# Update Dataset (optional, defaults to "production")
wrangler secret put SANITY_DATASET
# Enter "production" or your dataset name
```

### Step 3: Verify Secrets

```bash
wrangler secret list | grep -i sanity
```

### Step 4: Redeploy Worker

```bash
wrangler deploy
```

### Step 5: Test

```bash
curl "https://website-scanner.austin-gilbert.workers.dev/scan?url=https://sanity.io" | jq '.data.stored'
```

Expected: `{"accountKey":"...","packId":"..."}`

## Quick Commands

```bash
# Interactive setup
./setup-sanity-secrets.sh

# Verify connection
./verify-sanity-connection.sh

# Test after setup
curl "https://website-scanner.austin-gilbert.workers.dev/scan?url=https://sanity.io" | jq '.data.stored'
```

