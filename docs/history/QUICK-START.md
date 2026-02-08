# Quick Start Guide

## 1. Set Up Sanity (5 minutes)

1. Create account: https://www.sanity.io
2. Create project → Note Project ID
3. Get API token: API → Tokens → Add token (Editor permissions)

## 2. Configure Secrets (2 minutes)

```bash
cd /Users/austin.gilbert/website-scanner-worker

wrangler secret put SANITY_PROJECT_ID
# Paste your Project ID when prompted

wrangler secret put SANITY_API_TOKEN
# Paste your API token when prompted

# Optional: Admin token for write protection
wrangler secret put ADMIN_TOKEN
# Generate with: openssl rand -hex 32
```

## 3. Deploy (1 minute)

```bash
npm run deploy
# or
wrangler deploy
```

## 4. Test (30 seconds)

```bash
# Replace YOUR_WORKER_URL with your actual URL
curl "https://YOUR_WORKER_URL.workers.dev/scan?url=https://example.com&store=true"
```

## 5. Verify in Sanity

1. Go to https://www.sanity.io/manage
2. Open your project → Open Studio
3. Check Content → You should see `account` and `accountPack` documents

## Done! 🎉

For detailed walkthrough, see `SETUP-WALKTHROUGH.md`
