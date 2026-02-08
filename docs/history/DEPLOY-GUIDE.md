# How to Deploy/Update Cloudflare Workers

## 🚀 Quick Deploy

### Option 1: Using the Deployment Script (Easiest)
```bash
cd /Users/austin.gilbert/website-scanner-worker
./deploy.sh
```

This script will:
- ✅ Check if wrangler is installed
- ✅ Run syntax check
- ✅ Deploy to Cloudflare Workers
- ✅ Show next steps

### Option 2: Manual Deploy
```bash
cd /Users/austin.gilbert/website-scanner-worker
wrangler deploy
```

## 📋 Prerequisites

### 1. Install Wrangler CLI
```bash
npm install -g wrangler
```

### 2. Login to Cloudflare
```bash
wrangler login
```

This will open your browser to authenticate with Cloudflare.

### 3. Verify Configuration
Check `wrangler.toml` is configured correctly:
```toml
name = "website-scanner"
main = "src/index.js"
compatibility_date = "2024-01-01"
```

## 🔧 Deployment Steps

### Step 1: Check Your Code
```bash
# Syntax check
node -c src/index.js

# Should output: ✅ (no errors)
```

### Step 2: Deploy
```bash
wrangler deploy
```

### Step 3: Verify Deployment
```bash
# Get your worker URL from the deploy output, then:
curl https://YOUR-WORKER.workers.dev/health
```

Expected response:
```json
{
  "ok": true,
  "ts": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "requestId": "..."
}
```

## 🔄 Updating the Worker

### After Making Changes

1. **Make your code changes** in `src/index.js`

2. **Test locally** (optional):
```bash
wrangler dev
# Test at http://localhost:8787
```

3. **Deploy updates**:
```bash
wrangler deploy
```

That's it! The worker updates immediately.

## 📝 Common Commands

### Deploy to Production
```bash
wrangler deploy
```

### Deploy to Preview (Staging)
```bash
wrangler deploy --env preview
```

### Test Locally
```bash
wrangler dev
# Worker runs at http://localhost:8787
```

### View Logs
```bash
wrangler tail
# Shows real-time logs from production
```

### View Worker Info
```bash
wrangler whoami
# Shows your Cloudflare account info
```

## ⚙️ Configuration

### Update Worker Name
Edit `wrangler.toml`:
```toml
name = "your-worker-name"
```

### Add Environment Variables
```bash
# Add secret
wrangler secret put API_KEY

# Or in wrangler.toml for non-sensitive vars
[vars]
ENVIRONMENT = "production"
```

### Add KV Namespace (for caching)
```bash
# Create namespace
wrangler kv:namespace create "CACHE_KV"

# Get the namespace ID from output, then update wrangler.toml:
# kv_namespaces = [
#   { binding = "CACHE_KV", id = "your-namespace-id" }
# ]

# Deploy again
wrangler deploy
```

## 🐛 Troubleshooting

### Issue: "wrangler: command not found"
**Solution**: Install wrangler globally
```bash
npm install -g wrangler
```

### Issue: "Authentication required"
**Solution**: Login to Cloudflare
```bash
wrangler login
```

### Issue: "Worker name already exists"
**Solution**: Either:
- Use a different name in `wrangler.toml`
- Or deploy to your existing worker (updates it)

### Issue: "Build failed"
**Solution**: Check for syntax errors
```bash
node -c src/index.js
```

### Issue: "Deployment failed"
**Solution**: Check:
- You're logged in: `wrangler whoami`
- Your account has Workers access
- No syntax errors in code

## 📊 After Deployment

### 1. Update OpenAPI Server URL
Edit `openapi.yaml`:
```yaml
servers:
  - url: https://YOUR-WORKER.workers.dev
    description: Cloudflare Worker deployment URL
```

### 2. Test All Endpoints
```bash
# Run comprehensive tests
./test-comprehensive.sh https://YOUR-WORKER.workers.dev
```

### 3. Update ChatGPT Actions
- Upload updated `openapi.yaml` to ChatGPT Actions
- Test all endpoints from ChatGPT

## 🎯 Quick Reference

```bash
# Full deployment workflow
cd /Users/austin.gilbert/website-scanner-worker
node -c src/index.js                    # Check syntax
wrangler deploy                          # Deploy
curl https://YOUR-WORKER.workers.dev/health  # Verify
```

## 📚 Additional Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [Workers Dashboard](https://dash.cloudflare.com/)

---

**Status**: Ready to deploy!  
**Command**: `wrangler deploy` or `./deploy.sh`

