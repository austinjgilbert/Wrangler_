# ChatGPT Custom GPT Setup Guide

This guide will walk you through creating a Custom GPT that uses the Website Scanner API.

## Prerequisites

✅ Your Cloudflare Worker is deployed and working  
✅ You have a ChatGPT Plus or Enterprise subscription (required for Custom GPTs)

## Step-by-Step Setup

### Step 1: Access Custom GPT Creation

1. Go to [chat.openai.com](https://chat.openai.com)
2. Click on your profile/name in the bottom left
3. Select **"Create a GPT"** or go to [chat.openai.com/gpts](https://chat.openai.com/gpts)
4. Click **"Create"** button

### Step 2: Configure Basic Settings

In the **"Create"** tab:

**Name:**
```
Website Scanner
```

**Description:**
```
Expert at analyzing websites and identifying their technology stack, infrastructure, and technical characteristics. Scans websites to detect CMS platforms, web servers, CDNs, frameworks, and more.
```

**Instructions:**
Copy and paste the contents from `gpt-instructions.md` into the instructions field.

### Step 3: Add Conversation Starters (Optional but Recommended)

Add these conversation starters in the **"Create"** tab:

1. "Scan example.com and tell me what technology it uses"
2. "Analyze the tech stack of my website"
3. "What CMS is this site running?"
4. "Check if a website has a sitemap"

### Step 4: Configure Actions

1. Click on the **"Actions"** tab
2. Click **"Create new action"**
3. Click **"Import from URL"** or **"Upload file"**
4. Upload or paste the contents of `openapi.yaml`
5. The API should automatically configure with:
   - **Base URL**: `https://website-scanner.austin-gilbert.workers.dev`
   - **Endpoints**: `/health` and `/scan`

### Step 5: Test the Integration

1. Go to the **"Preview"** panel on the right
2. Try asking: "Scan https://example.com and tell me what you find"
3. The GPT should call the `scanHomepage` action and return results

### Step 6: Save Your GPT

1. Click **"Save"** in the top right
2. Choose visibility:
   - **Only me**: Private (recommended for personal use)
   - **Anyone with a link**: Shareable link
   - **Public**: Listed in GPT store (requires review)

## Testing Your Custom GPT

### Test Cases

Try these prompts to verify everything works:

1. **Basic Scan:**
   ```
   Scan https://example.com
   ```

2. **Specific Question:**
   ```
   What web server does github.com use?
   ```

3. **Comparison:**
   ```
   Compare the tech stacks of wordpress.com and drupal.org
   ```

4. **Sitemap Check:**
   ```
   Does https://example.com have a sitemap?
   ```

## Troubleshooting

### Action Not Working

- **Check API URL**: Verify the Worker URL in `openapi.yaml` is correct
- **Test manually**: Use `curl` to verify the API works
- **Check logs**: In ChatGPT, check if there are error messages in the action calls

### GPT Not Calling Actions

- **Be explicit**: Ask "Use the scanner to..." or "Scan the website..."
- **Check instructions**: Make sure the instructions mention using the `scanHomepage` action
- **Verify action setup**: Go back to Actions tab and confirm the OpenAPI schema imported correctly

### Rate Limits

- Cloudflare Workers free tier has generous limits
- If you hit limits, wait a few minutes and try again
- Consider upgrading to paid tier for higher limits if needed

## Advanced Configuration

### Custom Branding (Optional)

In the **"Create"** tab, you can:
- Upload a profile picture (square, at least 512x512px)
- Add a welcome message
- Customize the GPT's personality further

### Knowledge Base (Optional)

You can add knowledge files in the **"Knowledge"** tab:
- Add documentation about web technologies
- Include examples of tech stack analysis
- Add troubleshooting guides

## Next Steps

Once your GPT is set up:

1. **Test thoroughly** with various websites
2. **Refine instructions** based on how it responds
3. **Share with others** if you made it public
4. **Iterate** - improve the instructions based on usage

## Example Conversation

**User:** What technology does stripe.com use?

**GPT:** Let me scan Stripe's website to identify their technology stack.

[GPT calls scanHomepage action]

Based on my scan of stripe.com, here's what I found:

**Web Server:** [Server from headers]
**CDN:** [CDN info from headers]
**Frameworks/Libraries:** [From script sources]
**CMS:** [If detected from generator tag]
**Caching:** [Cache headers]
**Security:** [Security headers]

[Additional insights based on the data]

---

## Support

If you encounter issues:
1. Check the Worker is deployed and accessible
2. Verify the OpenAPI schema is correctly formatted
3. Test the API endpoints directly with curl
4. Review ChatGPT's action execution logs

