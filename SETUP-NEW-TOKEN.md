# Setup New Sanity Token for Austin_SDR Project

Your configuration is now pointing to your **Austin_SDR** project (`vhtd9y80`).

You need to create a new API token for this project and update both local and production.

---

## Step 1: Create API Token

1. Go to https://www.sanity.io/manage/project/vhtd9y80
2. Click **API** → **Tokens**
3. Click **Add API token**
4. Settings:
   - **Name:** `Website Scanner Production`
   - **Permissions:** **Editor**
   - **Scope:** This project (Austin_SDR)
5. Click **Add token**
6. **Copy the token** (you only see it once!)

---

## Step 2: Update Local Token

Edit `.dev.vars` and replace the `SANITY_TOKEN` line with your new token:

```bash
SANITY_TOKEN=<paste your new token here>
```

---

## Step 3: Update Production Token

```bash
wrangler secret put SANITY_TOKEN --env=production
```

Paste your new token when prompted.

---

## Step 4: Test

### Test locally:
```bash
npm run sanity:check
```

Should show: `OK Sanity reachable (projectId=***, dataset=production)`

### Test production:
```bash
curl -s https://website-scanner.austin-gilbert.workers.dev/sanity/status
```

Should show: `"reachable": true`

---

## Step 5: Deploy Studio

Now you can deploy the Studio:

```bash
cd sanity
npm run deploy
```

This will give you a public URL like: `https://austin-sdr.sanity.studio`

---

## Quick Commands

```bash
# 1. Create token at: https://www.sanity.io/manage/project/vhtd9y80

# 2. Update .dev.vars
# SANITY_TOKEN=<your new token>

# 3. Update production
wrangler secret put SANITY_TOKEN --env=production

# 4. Test
npm run sanity:check
curl -s https://website-scanner.austin-gilbert.workers.dev/sanity/status

# 5. Deploy Studio
cd sanity && npm run deploy
```

---

**Current Status:**
- ✅ Project ID updated to `vhtd9y80` (Austin_SDR)
- ✅ Production project ID set
- ⏳ Need new API token for this project
- ⏳ Need to update local and production tokens
