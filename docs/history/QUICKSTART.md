# 🚀 Quick Start: Build Your Website Scanner GPT

## ✅ Pre-flight Checklist

- [x] Cloudflare Worker deployed
- [x] Worker URL: `https://website-scanner.austin-gilbert.workers.dev`
- [x] OpenAPI schema ready
- [ ] ChatGPT Plus/Enterprise account
- [ ] Ready to create Custom GPT

## 🎯 5-Minute Setup

### 1. Open ChatGPT GPT Builder
👉 Go to: https://chat.openai.com/gpts
👉 Click **"Create"**

### 2. Configure GPT (Create Tab)

**Name:**
```
Website Scanner
```

**Description:**
```
Expert at analyzing websites and identifying their technology stack, infrastructure, and technical characteristics.
```

**Instructions:**
👉 Open `gpt-instructions.md` and copy ALL contents → Paste into Instructions field

**Conversation Starters:**
1. "Scan example.com and tell me what technology it uses"
2. "Analyze the tech stack of my website"
3. "What CMS is this site running?"
4. "Check if a website has a sitemap"

### 3. Add Actions (Actions Tab)

1. Click **"Actions"** tab
2. Click **"Create new action"**
3. Click **"Import"** button
4. Upload `openapi.yaml` file
5. ✅ Verify it shows:
   - Base URL: `https://website-scanner.austin-gilbert.workers.dev`
   - 2 endpoints: `/health` and `/scan`

### 4. Test It! (Preview Panel)

Try this in the preview:
```
Scan https://example.com and tell me what technology it uses
```

Expected: GPT calls the API and returns analysis.

### 5. Save Your GPT

- Click **"Save"** (top right)
- Choose **"Only me"** (or share if you want)
- Click **"Confirm"**

## 🧪 Test Your GPT

After saving, start a new conversation and try:

```
What web server does github.com use?
```

```
Compare the tech stacks of wordpress.com and drupal.org
```

```
Does https://example.com have a sitemap?
```

## 📁 Files Reference

- `gpt-instructions.md` → GPT Instructions (copy into Create tab)
- `openapi.yaml` → Actions schema (upload in Actions tab)
- `gpt-setup-guide.md` → Detailed setup guide
- `gpt-config.json` → Reference config (not uploaded, just for reference)

## 🆘 Troubleshooting

**Action not working?**
- Check Worker is live: `curl https://website-scanner.austin-gilbert.workers.dev/health`
- Verify OpenAPI schema uploaded correctly
- Check ChatGPT action logs for errors

**GPT not calling actions?**
- Be explicit: "Use the scanner to analyze..."
- Check instructions mention using `scanHomepage` action
- Verify action is enabled in Actions tab

## 🎉 You're Done!

Your GPT is ready to scan websites and identify tech stacks!

