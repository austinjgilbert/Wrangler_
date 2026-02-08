# Update Your GPT - Quick Guide

## ✅ What's Already Done

1. **Worker Deployed** ✅
   - All features are live at: `https://website-scanner.austin-gilbert.workers.dev`
   - Health check: `/health`
   - Single scan: `/scan?url=...`
   - Batch scan: `/scan-batch?urls=...`

2. **OpenAPI Schema Updated** ✅
   - All new endpoints and fields are in `openapi.yaml`

## 🔄 What You Need to Update

### Step 1: Update ChatGPT Custom GPT Actions

1. **Open your Custom GPT** in ChatGPT
2. **Go to "Actions"** (or "Configure" → "Actions")
3. **Click "Import from URL"** or **"Update Schema"**
4. **Paste this URL:**
   ```
   https://website-scanner.austin-gilbert.workers.dev/openapi.yaml
   ```
   
   OR upload the local file:
   - Use the `openapi.yaml` file from this directory
   - Click "Upload" and select `openapi.yaml`

5. **Save** the GPT configuration

### Step 2: Update GPT Instructions (Optional but Recommended)

1. **Go to "Instructions"** in your GPT configuration
2. **Copy the contents** of `gpt-instructions.md`
3. **Paste into the Instructions field**
4. **Save**

### Step 3: Test It

Try these prompts in your GPT:

```
Scan this website: https://example.com
```

```
What's the performance score for https://example.com?
```

```
What's the business scale for https://example.com?
```

```
Scan these accounts: https://example.com, https://example2.com
```

## 📋 New Features Available

### 1. Enhanced AI Readiness
- Detailed justifications for each factor
- Mismatch detection
- Educational content

### 2. Business Scale Analysis
- Traffic indicators (analytics platforms)
- Revenue indicators (e-commerce, payment processors)
- Cost indicators (infrastructure, CDN)
- Scale estimates

### 3. Performance Analysis
- Performance score (0-100)
- Speed indicators & issues
- Industry benchmarks
- Conversation starters

### 4. Batch Scanning
- Scan up to 20 URLs at once
- Stack ranking by AI Readiness Score
- Deep dive capability

## 🧪 Quick Test

Test the worker directly:

```bash
# Health check
curl "https://website-scanner.austin-gilbert.workers.dev/health"

# Single scan
curl "https://website-scanner.austin-gilbert.workers.dev/scan?url=https://example.com"

# Batch scan
curl "https://website-scanner.austin-gilbert.workers.dev/scan-batch?urls=https://example.com,https://example2.com"
```

## ⚠️ Common Issues

### Issue: "Action not found"
**Solution**: Make sure you imported the updated `openapi.yaml` schema

### Issue: "Invalid URL"
**Solution**: Ensure URLs start with `http://` or `https://`

### Issue: "Timeout"
**Solution**: Some sites may be slow. Try a different URL or check if the site is accessible

### Issue: GPT doesn't use the new features
**Solution**: 
1. Re-import the OpenAPI schema
2. Update the GPT instructions
3. Try being explicit: "Use the scan action to analyze..."

## 📖 Documentation

- `BUSINESS-SCALE.md` - Business scale analysis details
- `PERFORMANCE-ANALYSIS.md` - Performance analysis details
- `BATCH-SCANNING.md` - Batch scanning guide
- `AI-READINESS.md` - AI readiness score details

---

**That's it!** Once you update the GPT Actions with the new schema, everything should work.

