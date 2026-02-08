# GPT Update Checklist

## ✅ What to Update in ChatGPT Custom GPT

### 1. Update Instructions Field

**Location**: ChatGPT → Your Custom GPT → Configure → Instructions

**Action**: Copy the entire contents of `gpt-instructions.md` and paste into the Instructions field.

**File**: `/Users/austin.gilbert/website-scanner-worker/gpt-instructions.md`

**Key Updates**:
- ✅ LinkedIn endpoint documented
- ✅ 999 error handling guidance added
- ✅ Alternative approaches (web search, manual entry)
- ✅ All 12 endpoints documented

### 2. Update Actions (OpenAPI Schema)

**Location**: ChatGPT → Your Custom GPT → Configure → Actions

**Action**: 
1. Delete the old action (if exists)
2. Create new action → Import from file
3. Upload `openapi.yaml`

**File**: `/Users/austin.gilbert/website-scanner-worker/openapi.yaml`

**Important**: 
- Make sure server URL matches: `https://website-scanner.austin-gilbert.workers.dev`
- All 12 endpoints should appear after upload

## 📋 Step-by-Step

### Step 1: Open Your Custom GPT
1. Go to ChatGPT
2. Click on your Custom GPT
3. Click "Edit" or "Configure"

### Step 2: Update Instructions
1. Scroll to "Instructions" field
2. Select all existing text (Cmd+A / Ctrl+A)
3. Delete it
4. Open `gpt-instructions.md` in a text editor
5. Copy entire file contents (Cmd+A, Cmd+C)
6. Paste into Instructions field (Cmd+V)
7. Click "Save"

### Step 3: Update Actions
1. Scroll to "Actions" section
2. If an action exists, click "Delete" or "Remove"
3. Click "Create new action" or "Add action"
4. Click "Import from file"
5. Select `openapi.yaml` from `/Users/austin.gilbert/website-scanner-worker/`
6. Verify all endpoints appear in the list
7. Click "Save"

### Step 4: Verify
1. Check that Instructions field has LinkedIn guidance
2. Check that Actions shows all 12 endpoints
3. Test: "Analyze LinkedIn profile: https://www.linkedin.com/in/austinjgilbert"

## 🎯 What the GPT Should Do Now

### When LinkedIn Returns 999 Error:
1. **Acknowledge**: "LinkedIn blocked automated access to this profile"
2. **Explain**: "LinkedIn has strict bot protection that prevents automated scraping"
3. **Offer Alternatives**:
   - "I can search the web for public information about this person"
   - "You can provide profile data manually and I'll analyze it"
   - "Consider using LinkedIn's official API for automated access"
4. **Take Action**: If user wants info, use `searchWeb` to find public mentions

### Example Interaction:
**User**: "Analyze LinkedIn profile: https://www.linkedin.com/in/austinjgilbert"

**GPT** (after 999 error):
"I attempted to scan the LinkedIn profile, but LinkedIn blocked the request with their bot protection (999 error). This is common with LinkedIn's strict security measures.

I can help you in other ways:
1. **Web Search**: I can search for public information about this person (interviews, articles, GitHub, etc.)
2. **Manual Analysis**: If you can provide profile details, I can analyze work patterns, network, and career trajectory
3. **LinkedIn API**: For automated access, LinkedIn's official API is the recommended approach

Would you like me to search the web for public information about this person instead?"

## ✅ Verification Checklist

After updating:
- [ ] Instructions field contains LinkedIn 999 handling guidance
- [ ] Actions shows all 12 endpoints
- [ ] Server URL is correct in OpenAPI
- [ ] Test LinkedIn endpoint in ChatGPT
- [ ] Verify error handling works gracefully
- [ ] Confirm alternatives are suggested

---

**Status**: Ready to update!  
**Files**: `gpt-instructions.md` and `openapi.yaml`

