# How to Update Server URL in ChatGPT Custom GPT

## Step-by-Step Instructions

### Step 1: Open Your Custom GPT
1. Go to https://chat.openai.com
2. Click on your Custom GPT (in the left sidebar or from "Explore GPTs")
3. Click the **"Edit"** button (pencil icon) or **"Configure"** (gear icon)

### Step 2: Navigate to Actions
1. In the configuration panel, scroll down to find **"Actions"** section
2. You should see your action(s) listed there
3. Click on the action you want to update (or the only action if you have one)

### Step 3: Find Server URL Field
1. After clicking on the action, you'll see the action details
2. Look for a field labeled **"Server URL"** or **"API Endpoint"**
3. It might be at the top of the action configuration, or in a "Server" or "API" section

### Step 4: Update the URL
1. Click in the **Server URL** field
2. **Delete** the old URL (if any)
3. **Enter** your Worker URL:
   ```
   https://website-scanner.your-account.workers.dev
   ```
   (Replace with your actual Worker URL from deployment)

### Step 5: Save
1. Click **"Save"** button (usually at the bottom right)
2. Or click outside the field (auto-saves in some cases)

---

## Visual Guide (What to Look For)

The Server URL field typically looks like one of these:

**Option A: In the action card**
```
┌─────────────────────────────────┐
│ Action: Website Scanner API     │
│                                  │
│ Server URL: [text field]        │ ← Click here
│                                  │
│ [Upload schema] [Delete]         │
└─────────────────────────────────┘
```

**Option B: In action details**
```
Action Details
├─ Name: Website Scanner API
├─ Server URL: [https://...]      ← Update this
├─ Schema: openapi.yaml
└─ [Save] [Cancel]
```

**Option C: In API configuration**
```
API Configuration
├─ Base URL: [https://...]        ← Update this
├─ Authentication: None
└─ [Save]
```

---

## Finding Your Worker URL

If you don't remember your Worker URL, you can find it:

### Method 1: From Deployment Output
When you ran `wrangler deploy`, you should have seen:
```
✨ Deployed to https://website-scanner.your-account.workers.dev
```

### Method 2: From Cloudflare Dashboard
1. Go to https://dash.cloudflare.com
2. Click **Workers & Pages**
3. Find your worker (likely named "website-scanner")
4. Click on it
5. The URL is shown at the top

### Method 3: Check wrangler.toml
```bash
cd /Users/austin.gilbert/website-scanner-worker
cat wrangler.toml | grep -A 2 "\[env.production\]"
```

The URL format is usually:
```
https://[worker-name].[account-subdomain].workers.dev
```

---

## Common Issues

### Issue: Can't find "Server URL" field
**Solution:**
- Make sure you've uploaded the OpenAPI schema first
- The field might be labeled "API Endpoint" or "Base URL"
- Try clicking "Edit" on the action to see more options

### Issue: Field is grayed out / disabled
**Solution:**
- You might need to delete and recreate the action
- Or the schema might need to be re-uploaded

### Issue: Don't see Actions section
**Solution:**
- Make sure you're in "Configure" mode (gear icon)
- Scroll down - Actions is usually near the bottom
- If you don't have any actions, create one first

---

## Quick Checklist

- [ ] Opened Custom GPT → Configure
- [ ] Found Actions section
- [ ] Clicked on the action
- [ ] Found Server URL field
- [ ] Updated with Worker URL
- [ ] Saved changes

---

## Example Worker URLs

Your Worker URL will look like one of these formats:

```
https://website-scanner.austin-gilbert.workers.dev
https://website-scanner-abc123.workers.dev
https://website-scanner.your-account.workers.dev
```

**Important:** 
- Must start with `https://`
- Must end with `.workers.dev`
- No trailing slash

---

## After Updating

Test that it works:
1. Go back to the chat interface
2. Try: `Scan https://example.com`
3. The GPT should call your Worker successfully

If you get errors, check:
- Worker URL is correct (no typos)
- Worker is deployed and accessible
- Test Worker directly: `curl https://YOUR_URL/health`

