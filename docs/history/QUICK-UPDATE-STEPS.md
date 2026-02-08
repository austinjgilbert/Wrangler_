# Quick Update Steps: GPT + Worker

## 🎯 What You Need to Do

### Part 1: Update ChatGPT Custom GPT (5 minutes)

#### Step 1: Update Instructions
1. Go to https://chat.openai.com → Your Custom GPT → **Configure** (gear icon)
2. Scroll to **Instructions** field
3. **Delete** all existing text
4. **Copy** entire contents of: `gpt-instructions.md`
5. **Paste** into Instructions field
6. **Save**

#### Step 2: Update Actions (OpenAPI)
1. In same **Configure** tab → **Actions**
2. **Delete** old action (if exists)
3. Click **"Create new action"**
4. Click **"Upload file"**
5. **Upload**: `openapi.yaml`
6. **Save**

#### Step 3: Update Server URL
1. In **Actions** → Find your action
2. Check **Server URL** field
3. Update to: `https://YOUR_WORKER_URL.workers.dev`
   (Replace with your actual Worker URL after deployment)
4. **Save**

---

### Part 2: Deploy Worker (2 minutes)

#### Step 1: Navigate to Project
```bash
cd /Users/austin.gilbert/website-scanner-worker
```

#### Step 2: Set Sanity Secrets (if not done)
```bash
wrangler secret put SANITY_PROJECT_ID
wrangler secret put SANITY_API_TOKEN
```

#### Step 3: Deploy
```bash
wrangler deploy
```

#### Step 4: Copy Worker URL
After deployment, copy the URL shown (e.g., `https://website-scanner.xxx.workers.dev`)

#### Step 5: Update GPT Server URL
Go back to ChatGPT → Update Server URL with the URL from Step 4

---

## ✅ Verification

### Test Worker:
```bash
curl https://YOUR_WORKER_URL.workers.dev/health
```

### Test GPT:
In ChatGPT, try:
```
Scan https://example.com
```

---

## 📋 Files Reference

- **GPT Instructions**: `gpt-instructions.md` (5474 chars ✅)
- **OpenAPI Schema**: `openapi.yaml` (includes all 13 endpoints ✅)
- **Full Checklist**: `GPT-WORKER-UPDATE-CHECKLIST.md`
