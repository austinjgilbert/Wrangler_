# ✅ ChatGPT Custom GPT Setup Checklist

Follow this checklist step-by-step as you build your GPT in ChatGPT.

## 🔗 Step 1: Open ChatGPT GPT Builder

- [ ] Go to: https://chat.openai.com/gpts
- [ ] Click the **"Create"** button (top right)
- [ ] You should see the GPT builder interface with "Create" and "Preview" tabs

---

## 📝 Step 2: Configure Basic Settings (Create Tab)

### Name
- [ ] In the "Name" field, enter:
  ```
  Website Scanner
  ```

### Description
- [ ] In the "Description" field, enter:
  ```
  Expert at analyzing websites and identifying their technology stack, infrastructure, and technical characteristics. Scans websites to detect CMS platforms, web servers, CDNs, frameworks, and more.
  ```

### Instructions
- [ ] Click in the "Instructions" field
- [ ] Open the file: `gpt-instructions.md`
- [ ] Select ALL text (Cmd+A / Ctrl+A)
- [ ] Copy it (Cmd+C / Ctrl+C)
- [ ] Paste into the Instructions field (Cmd+V / Ctrl+V)
- [ ] ✅ Verify it pasted correctly (should be several paragraphs)

### Conversation Starters
- [ ] Click "Add conversation starter" (add all 4):
  1. `Scan example.com and tell me what technology it uses`
  2. `Analyze the tech stack of my website`
  3. `What CMS is this site running?`
  4. `Check if a website has a sitemap`

---

## 🔌 Step 3: Add Actions (Actions Tab)

- [ ] Click the **"Actions"** tab (left sidebar)
- [ ] Click **"Create new action"** button
- [ ] You should see options for "Import from URL" or "Upload file"
- [ ] Click **"Import"** or **"Upload"** button
- [ ] Select the file: `openapi.yaml`
- [ ] Wait for it to import
- [ ] ✅ Verify you see:
  - Base URL: `https://website-scanner.austin-gilbert.workers.dev`
  - 2 endpoints listed: `/health` and `/scan`
  - Operation IDs: `healthCheck` and `scanHomepage`

---

## 🧪 Step 4: Test Your GPT (Preview Panel)

- [ ] Look at the **Preview** panel on the right side
- [ ] In the chat input, type:
  ```
  Scan https://example.com and tell me what technology it uses
  ```
- [ ] Press Enter
- [ ] ✅ Watch for:
  - GPT should say it's calling the scanner
  - You might see "Calling scanHomepage..." or similar
  - GPT should return analysis of example.com
  - Should mention server, headers, scripts, etc.

### If it works:
- [ ] ✅ Great! Your GPT is working!

### If it doesn't work:
- [ ] Check the Actions tab - is the schema imported correctly?
- [ ] Verify the Worker URL is correct in the schema
- [ ] Try asking more explicitly: "Use the scanHomepage action to scan..."

---

## 💾 Step 5: Save Your GPT

- [ ] Click **"Save"** button (top right)
- [ ] Choose visibility:
  - [ ] **"Only me"** (recommended for personal use)
  - [ ] OR **"Anyone with a link"** (if you want to share)
  - [ ] OR **"Public"** (if you want it in the GPT store - requires review)
- [ ] Click **"Confirm"** or **"Save"**

---

## 🎉 Step 6: Start Using Your GPT!

- [ ] Close the builder (or click "Done")
- [ ] Your GPT should appear in your GPTs list
- [ ] Click on it to start a new conversation
- [ ] Try: `What web server does github.com use?`
- [ ] ✅ Enjoy your new Website Scanner GPT!

---

## 🆘 Troubleshooting

### GPT not calling the action?
- Make sure instructions mention using `scanHomepage`
- Try being explicit: "Use the scanner API to..."
- Check Actions tab - is the schema there?

### Action fails with error?
- Test the API directly: `curl https://website-scanner.austin-gilbert.workers.dev/health`
- Check the error message in ChatGPT
- Verify the Worker is still deployed

### Can't import OpenAPI schema?
- Make sure you're uploading `openapi.yaml` (not .md or .json)
- Try copying the contents and pasting if upload doesn't work
- Check the file is valid YAML

---

## 📋 Quick Reference

**Files you need:**
- ✅ `gpt-instructions.md` → Copy to Instructions field
- ✅ `openapi.yaml` → Upload in Actions tab

**Your API:**
- ✅ URL: `https://website-scanner.austin-gilbert.workers.dev`
- ✅ Status: Live and working

**ChatGPT GPT Builder:**
- ✅ URL: https://chat.openai.com/gpts

---

**Ready? Start with Step 1!** 🚀

