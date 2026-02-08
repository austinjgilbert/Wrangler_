# How to Restart Everything

## Quick Restart (Production Worker)

### 1. Redeploy the Worker
```bash
cd /Users/austin.gilbert/website-scanner-worker
npm run deploy
```

Or:
```bash
wrangler deploy
```

This will:
- Rebuild the worker
- Deploy to Cloudflare
- Make changes live immediately

### 2. Verify It's Running
```bash
curl https://YOUR_WORKER_URL.workers.dev/health
```

Expected: `{"ok":true,...}`

---

## Local Development Restart

### Stop Current Dev Server
If you have `wrangler dev` running:
- Press `Ctrl+C` in that terminal

### Restart Dev Server
```bash
cd /Users/austin.gilbert/website-scanner-worker
wrangler dev
```

### With Fresh Environment
```bash
# Stop dev server (Ctrl+C)
# Clear any cached data
rm -rf .wrangler/

# Restart
wrangler dev
```

---

## Full Reset (Nuclear Option)

### 1. Stop All Running Processes
```bash
# Kill any running wrangler processes
pkill -f wrangler

# Or find and kill manually
ps aux | grep wrangler
kill <PID>
```

### 2. Clear Local Cache
```bash
cd /Users/austin.gilbert/website-scanner-worker
rm -rf .wrangler/
rm -rf node_modules/.cache/
```

### 3. Reinstall Dependencies (if needed)
```bash
npm install
```

### 4. Redeploy
```bash
npm run deploy
```

---

## Restart Specific Components

### Restart Just the Worker (Redeploy)
```bash
wrangler deploy
```

### Restart Local Dev Server
```bash
# Stop: Ctrl+C
# Start: wrangler dev
```

### Clear Sanity Cache (if using KV)
The worker doesn't use KV for Sanity, but if you want to clear any in-memory caches, just redeploy:
```bash
wrangler deploy
```

---

## Troubleshooting: If Worker Won't Start

### 1. Check Secrets Are Set
```bash
wrangler secret list
```

If secrets are missing, set them:
```bash
wrangler secret put SANITY_PROJECT_ID
wrangler secret put SANITY_API_TOKEN
```

### 2. Check for Syntax Errors
```bash
# Try building locally first
wrangler dev --local
```

### 3. Check Cloudflare Status
- Go to https://dash.cloudflare.com
- Check Workers & Pages → Your worker
- Look for deployment errors

### 4. View Logs
```bash
wrangler tail
```

This shows real-time logs from your worker.

---

## Restart Checklist

- [ ] Stop local dev server (if running)
- [ ] Redeploy worker: `wrangler deploy`
- [ ] Test health endpoint
- [ ] Check logs: `wrangler tail`
- [ ] Verify in Cloudflare dashboard

---

## Quick Commands Reference

```bash
# Deploy (restarts production)
wrangler deploy

# Local dev (restarts local)
wrangler dev

# View logs
wrangler tail

# List secrets
wrangler secret list

# Clear local cache
rm -rf .wrangler/
```

