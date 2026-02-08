# ChatGPT Custom GPT Update Instructions

## What's New (Latest Update: Jan 5, 2026)

### ✅ OSINT Year-Ahead Intelligence (NEW)
- **`queueOsintJob`**: Queue an OSINT job to generate comprehensive year-ahead company intelligence reports
- **`getOsintStatus`**: Check the status of a queued OSINT job with real-time progress
- **`getOsintReport`**: Retrieve generated OSINT reports with initiatives, risks, signals, and recommendations
- **`runOsintSync`**: Run OSINT pipeline synchronously for immediate results (admin/debug)

**OSINT Features**:
- Automatically discovers company pages
- Searches web for company news, roadmaps, and initiatives
- Ranks and extracts evidence from top sources
- Generates comprehensive reports with:
  - Executive summary
  - Ranked initiatives with importance scores, confidence levels, and time horizons
  - Identified risks
  - Hiring signals
  - Digital transformation signals
  - Recommended next steps
  - Source citations

### ✅ Sanity CMS Integration
- `POST /store/{type}` - Store scan results, LinkedIn profiles, evidence, briefs, or OSINT reports
- `GET/POST /query` - Query stored companies, search documents, or execute custom GROQ
- `PUT /update/{docId}` - Update existing documents
- `DELETE /delete/{docId}` - Delete documents

### ✅ Auto-save
Existing endpoints (`scanHomepage`, `scanLinkedInProfile`, `extractEvidence`, `generateBrief`, `queueOsintJob`) now automatically save to Sanity

## What You Need to Update in ChatGPT

### Step 1: Update Instructions Field
1. Open your Custom GPT in ChatGPT
2. Go to **Configure** → **Instructions**
3. **Delete** the existing instructions
4. **Copy and paste** the entire contents of `gpt-instructions.md` (5474 characters, well under 8000 limit)
5. **Save**

### Step 2: Update Actions (OpenAPI Schema)
1. In the same **Configure** tab, go to **Actions**
2. **Delete** the existing action (if it exists)
3. Click **Create new action**
4. Click **Import from URL** or **Upload file**
5. **Upload** the `openapi.yaml` file (now includes all 12 endpoints + 4 new Sanity endpoints)
6. **Save**

### Step 3: Verify
Test the new endpoints:
- "Generate year-ahead intelligence for example.com" → should call `queueOsintJob`, then poll `getOsintStatus`, then `getOsintReport`
- "What are example.com's plans for 2027?" → should queue OSINT job and return initiatives
- "Show me top companies by opportunity score" → should call `queryData`
- "Scan https://example.com" → should auto-save to Sanity
- "Search stored data for 'headless CMS'" → should call `queryData` with search
- "Get OSINT report for company X" → should call `getOsintReport` or queue a job if needed

## File Locations
- **GPT Instructions**: `/Users/austin.gilbert/website-scanner-worker/gpt-instructions.md`
- **OpenAPI Schema**: `/Users/austin.gilbert/website-scanner-worker/openapi.yaml`

## Character Counts
- GPT Instructions: **5474 characters** (✅ well under 8000 limit, includes all features)
- OpenAPI Schema: Valid YAML 3.1.0, all 20+ endpoints documented including OSINT

## Next Steps After Update
1. **Set up Sanity** (if not already done):
   - See `SANITY-SETUP.md` for instructions
   - Configure secrets: `wrangler secret put SANITY_PROJECT_ID` and `SANITY_API_TOKEN`
2. **Deploy Worker**: `npm run deploy`
3. **Test**: Use the GPT to scan a website and verify it auto-saves to Sanity

