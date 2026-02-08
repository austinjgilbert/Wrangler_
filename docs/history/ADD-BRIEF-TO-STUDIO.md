# Add Brief Schema to Sanity Studio

## Quick Setup Guide

### If you DON'T have a Sanity Studio project:

**No action needed!** The Worker creates brief documents automatically. You can view them in Sanity's hosted Studio at https://www.sanity.io/manage → Open Studio.

However, to get a better editing experience, you can initialize a Studio:

```bash
cd /Users/austin.gilbert/website-scanner-worker
./setup-sanity-studio.sh
```

### If you DO have a Sanity Studio project:

#### Option A: Add to existing Studio

1. **Copy the brief schema** to your Studio's schema directory:
   ```bash
   # If your Studio is in a different directory
   cp schemas/brief.js /path/to/your/studio/schemas/brief.js
   ```

2. **Import it in your `schemas/index.js`**:
   ```js
   import brief from './brief';
   
   export default [
     // ... your existing schemas
     brief,
   ];
   ```

3. **Deploy**:
   ```bash
   cd /path/to/your/studio
   sanity deploy
   ```

#### Option B: Use Sanity's API to add schema (no Studio needed)

The Worker automatically creates documents. To add the schema definition via API:

```bash
# Get your project ID and token
PROJECT_ID="your-project-id"
TOKEN="your-api-token"

# The schema will be inferred from documents, but you can also
# use Sanity's schema API to define it explicitly
```

**Note**: Sanity accepts documents without pre-defined schemas. The schema is mainly for:
- Better editing experience in Studio
- Validation rules
- Field descriptions and help text

### Verify Brief Documents

After storing a brief:

1. Go to https://www.sanity.io/manage
2. Select your project
3. Click **"Open Studio"**
4. Navigate to **Content**
5. Look for `brief` documents

Even without the schema, documents will appear. The schema just makes them easier to edit.

