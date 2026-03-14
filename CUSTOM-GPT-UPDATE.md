# Custom GPT Update Instructions

Your worker is live at **https://website-scanner.austin-gilbert.workers.dev** and fully operational.

Follow these steps to update your Custom GPT:

---

## 1. Update the Schema (Actions)

1. Go to your Custom GPT → **Configure** → **Actions**
2. Delete the old schema
3. Copy the **entire contents** of `openapi-gpt.yaml` from this repo
4. Paste into the schema field
5. The server URL is already set to: `https://website-scanner.austin-gilbert.workers.dev`

**✅ Fixed:** All validation errors resolved (added `GenericResponse` schema with properties).

---

## 2. Update Instructions

1. In the same **Configure** page, go to **Instructions**
2. Copy the **entire contents** of `gpt-instructions.md`
3. Replace the existing instructions

**Current character count:** ~5,360 characters (well under the 8,000 limit).

---

## 3. Authentication (if using protected routes)

If you want to protect `/molt/*` routes with an API key:

1. Set the secret in production:
   ```bash
   wrangler secret put MOLT_API_KEY --env=production
   ```
   Enter a strong random key (e.g. `openssl rand -base64 32`).

2. In Custom GPT → **Configure** → **Authentication**:
   - Type: **API Key**
   - Auth Type: **Bearer**
   - API Key: Paste the same key you used in step 1

If you don't need protected routes, leave Authentication as **None**.

---

## 4. Test

After saving, test in the GPT chat:

```
Scan https://example.com
```

The GPT should call your live worker and return results.

---

## Summary of what's live

- ✅ Worker: https://website-scanner.austin-gilbert.workers.dev
- ✅ Sanity: Connected and reachable
- ✅ Health: Operational
- ✅ Schema: Fixed (30 operations, no validation errors)
- ✅ Instructions: Up to date (~5.4k chars)

**Next:** Copy `openapi-gpt.yaml` and `gpt-instructions.md` into your Custom GPT.

For enrichment pipeline details (queue POST, status, advance) and SDK app env, see **docs/GPT-AND-YAML-UPDATE.md**.
