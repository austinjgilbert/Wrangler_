# 🚀 Update Your ChatGPT Custom GPT

Follow these steps to update your Custom GPT with all the new features.

## ✅ What's New

Your GPT now includes:
- ✅ **60+ CMS Detection** (Legacy & Modern)
- ✅ **PIM/DAM/LMS Detection**
- ✅ **System Duplication Detection**
- ✅ **ROI Insights** (8 categories)
- ✅ **Business Unit Detection** (14+ areas)
- ✅ **Digital Goals Analysis**
- ✅ **Job Posting Analysis**
- ✅ **Role Baselines** (C-level, VP, Director, Manager)
- ✅ **Recent Hires Detection**

## 📋 Step-by-Step Update

### Step 1: Open Your GPT

1. Go to: https://chat.openai.com/gpts
2. Find your **"Website Scanner"** GPT
3. Click on it to edit

### Step 2: Update Actions (OpenAPI Schema)

1. Click the **"Actions"** tab (left sidebar)
2. You should see your existing action
3. Click **"Edit"** or **"Delete"** the old action
4. Click **"Create new action"**
5. Click **"Import"** button
6. Upload the updated file: `openapi.yaml`
7. ✅ Verify it shows all the new fields:
   - `technologyStack` (with pimSystems, damSystems, lmsSystems, roiInsights)
   - `businessUnits` (detectedAreas, subdomains, siloIndicators)
   - `digitalGoals` (initiatives, technologyFocus, growthIndicators)
   - `jobAnalysis` (recentHires, digitalContentRoles, roleBaselines)

### Step 3: Update Instructions

1. Click the **"Create"** tab
2. Scroll to the **"Instructions"** field
3. Open the file: `gpt-instructions.md`
4. Select ALL text (Cmd+A / Ctrl+A)
5. Copy it (Cmd+C / Ctrl+C)
6. **Delete the old instructions** in ChatGPT
7. Paste the new instructions (Cmd+V / Ctrl+V)
8. ✅ Verify it includes mentions of:
   - Business units
   - Digital goals
   - Job analysis
   - Role baselines

### Step 4: Test Your Updated GPT

In the **Preview** panel, try these prompts:

```
Scan https://example.com and tell me what you find
```

```
Is https://example.com a good prospect for headless CMS?
```

```
What business units does this company have?
```

```
Are they actively hiring for digital roles?
```

### Step 5: Save

1. Click **"Save"** (top right)
2. Choose your visibility preference
3. Click **"Confirm"**

## 🧪 Verification Checklist

After updating, verify:

- [ ] Actions tab shows updated OpenAPI schema
- [ ] Instructions include business units, digital goals, job analysis
- [ ] Preview panel can scan websites
- [ ] GPT returns technology stack information
- [ ] GPT mentions ROI insights when relevant
- [ ] GPT can identify business units
- [ ] GPT can analyze job postings (if careers page exists)

## 🎯 Quick Test Prompts

Try these to verify everything works:

1. **Basic Scan:**
   ```
   Scan https://example.com
   ```

2. **ROI Focus:**
   ```
   What's the ROI opportunity for https://example.com?
   ```

3. **Business Units:**
   ```
   How many business units does this company have?
   ```

4. **Digital Goals:**
   ```
   What are their digital transformation goals?
   ```

5. **Job Analysis:**
   ```
   Are they hiring for digital content roles?
   ```

6. **Decision Makers:**
   ```
   Who are the decision makers for content management?
   ```

## 🆘 Troubleshooting

### Action Not Updating?
- Delete the old action completely
- Create a new action
- Import `openapi.yaml` fresh

### GPT Not Using New Fields?
- Make sure instructions mention the new fields
- Try being explicit: "Use the jobAnalysis field to..."
- Check that the OpenAPI schema imported correctly

### Missing Data in Responses?
- Some sites may not have careers pages (jobAnalysis will be empty)
- Some sites may not have multiple business units
- This is normal - the scanner only reports what it finds

## 📁 Files You Need

- ✅ `openapi.yaml` - Upload in Actions tab
- ✅ `gpt-instructions.md` - Copy to Instructions field

## 🎉 You're Ready!

Once updated, your GPT will have all the new sales intelligence features!

---

**Need help?** Check the other documentation files:
- `SALES-INTELLIGENCE.md` - ROI features
- `BUSINESS-UNITS-AND-GOALS.md` - Business unit detection
- `JOB-ANALYSIS.md` - Job posting analysis
- `CMS-DETECTION-LIST.md` - All detected systems

