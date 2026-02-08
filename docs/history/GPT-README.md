# 🤖 Website Scanner GPT - Complete Setup

Your Custom GPT is ready to build! All files are prepared and your API is live.

## 📦 What You Have

### ✅ Live API
- **URL**: `https://website-scanner.austin-gilbert.workers.dev`
- **Status**: ✅ Deployed and working
- **Endpoints**: 20+ endpoints including `/scan`, `/osint/queue`, `/osint/report`, `/store`, `/query`, and more

### ✅ GPT Configuration Files

1. **`gpt-instructions.md`** - System instructions for your GPT
   - Tells the GPT how to use the scanner
   - Explains what insights to provide
   - Sets the personality and behavior

2. **`openapi.yaml`** - API schema for ChatGPT Actions
   - Defines the `/scan` and `/health` endpoints
   - Ready to import into ChatGPT
   - Already configured with your Worker URL

3. **`gpt-setup-guide.md`** - Detailed setup instructions
   - Step-by-step walkthrough
   - Troubleshooting tips
   - Advanced configuration

4. **`QUICKSTART.md`** - Fast setup guide
   - 5-minute quick start
   - Essential steps only
   - Quick reference

5. **`gpt-config.json`** - Reference configuration
   - Shows all settings in one place
   - Not uploaded, just for reference

## 🚀 Next Steps

### Option 1: Quick Start (Recommended)
👉 Open `QUICKSTART.md` and follow the 5-minute setup

### Option 2: Detailed Guide
👉 Open `gpt-setup-guide.md` for comprehensive instructions

## 🎯 What Your GPT Will Do

Once configured, your GPT can:

- ✅ Scan any website and identify its tech stack
- ✅ Detect CMS platforms (WordPress, Drupal, etc.)
- ✅ Identify web servers (nginx, Apache, etc.)
- ✅ Find CDN usage (Cloudflare, Vercel, AWS, etc.)
- ✅ Analyze frameworks and libraries from script sources
- ✅ Check for robots.txt and sitemaps
- ✅ Compare tech stacks between multiple sites
- ✅ Explain technical findings in plain language
- ✅ **Generate year-ahead company intelligence (OSINT)** - Comprehensive reports on company initiatives, risks, and opportunities
- ✅ **Analyze LinkedIn profiles** - Work patterns, network mapping, career trajectory
- ✅ **Extract evidence** - Structured data extraction from web pages
- ✅ **Generate research briefs** - Action-ready research with citations
- ✅ **Store and query data** - Persistent storage in Sanity CMS with querying capabilities

## 📝 Example Conversations

**User:** "What technology does stripe.com use?"

**GPT:** [Calls scanHomepage] "Based on my scan, Stripe uses:
- Web Server: nginx
- CDN: Cloudflare
- Framework: React (detected from script sources)
- Security: HSTS enabled
..."

**User:** "Compare wordpress.com and drupal.org"

**GPT:** [Scans both] "Here's a comparison:
- WordPress.com: Uses WordPress CMS, Cloudflare CDN...
- Drupal.org: Uses Drupal CMS, different CDN setup..."

## 🔧 Files Overview

```
website-scanner-worker/
├── src/index.js              # Worker code (already deployed)
├── openapi.yaml              # ⭐ Upload this to ChatGPT Actions
├── gpt-instructions.md        # ⭐ Copy this to GPT Instructions
├── QUICKSTART.md             # ⭐ Start here!
├── gpt-setup-guide.md        # Detailed guide
├── gpt-config.json           # Reference only
└── README.md                 # Project overview
```

## ✨ Quick Test

Before building the GPT, verify your API works:

```bash
curl https://website-scanner.austin-gilbert.workers.dev/health
# Should return: {"ok":true}

curl "https://website-scanner.austin-gilbert.workers.dev/scan?url=https://example.com"
# Should return full scan data
```

## 🎓 Tips for Best Results

1. **Be explicit in instructions**: The GPT instructions already tell it to use `scanHomepage` action
2. **Test with various sites**: Try different types of websites
3. **Refine instructions**: Adjust `gpt-instructions.md` based on how the GPT responds
4. **Add knowledge files**: Optionally add web technology docs to improve responses

## 🆘 Need Help?

1. **API not working?** Check Worker deployment status
2. **GPT not calling actions?** Verify OpenAPI schema uploaded correctly
3. **Wrong responses?** Refine the instructions in `gpt-instructions.md`

## 🎉 Ready to Build!

Everything is prepared. Just follow `QUICKSTART.md` and you'll have your GPT running in 5 minutes!

---

**Your Worker URL**: `https://website-scanner.austin-gilbert.workers.dev`  
**Status**: ✅ Live and ready

