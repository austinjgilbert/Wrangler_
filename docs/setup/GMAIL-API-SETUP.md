# Gmail API setup

The worker uses the Gmail API for read (list/get messages), create drafts, and send. You need OAuth 2.0 credentials and a **refresh token** in `.dev.vars` (local) or Wrangler secrets (production).

## 1. Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project or select an existing one.
3. **Enable the Gmail API:** APIs & Services → **Library** → search “Gmail API” → **Enable**.

## 2. OAuth consent screen

1. **APIs & Services** → **OAuth consent screen**.
2. Choose **External** (or Internal if using a Google Workspace org).
3. Fill App name, User support email, Developer contact. Save.
4. **Scopes** → **Add or remove scopes** → add:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/gmail.send`  
   (Or add `https://www.googleapis.com/auth/gmail.modify` to cover all three.)
5. **Test users** (if External): add the Gmail address you’ll use. Save.

## 3. OAuth client credentials

1. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
2. Application type: **Web application** (required for the helper script’s redirect).
3. Name it (e.g. “Website scanner worker”).
4. Under **Authorized redirect URIs** add: `http://localhost:3456/callback`
5. Create and copy the **Client ID** and **Client secret** (you’ll put these in `.dev.vars`).

## 4. Get a refresh token (one-time)

1. Put **Client ID** and **Client secret** in `.dev.vars`:
   ```bash
   GMAIL_CLIENT_ID=your_client_id.apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=your_client_secret
   ```
2. From project root, run:
   ```bash
   npm run gmail:auth
   ```
   (or `node scripts/gmail-oauth-helper.js`)
3. A browser opens to Google sign-in. Sign in with the Gmail account the worker should use and allow the requested scopes.
4. After redirect, the script prints **GMAIL_REFRESH_TOKEN**. Add it to `.dev.vars`:
   ```bash
   GMAIL_REFRESH_TOKEN=pasted_refresh_token
   ```

If the browser shows “redirect_uri_mismatch”, ensure the OAuth client is **Web application** with redirect URI exactly `http://localhost:3456/callback`.

## 5. Set variables

**Local (`.dev.vars`):**

```bash
GMAIL_CLIENT_ID=your_client_id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your_client_secret
GMAIL_REFRESH_TOKEN=the_refresh_token_from_step_4
# Optional: signature appended to every sent/draft (use \n for newlines in the value)
# GMAIL_SIGNATURE=--\nYour Name\nYour Title
# Optional: From display name so recipients see "Austin @ Sanity" instead of raw address
# GMAIL_FROM_NAME=Austin @ Sanity
# GMAIL_FROM_EMAIL=austin.gilbert@sanity.io
```
If you set these and the From still shows only the email, set the name in Gmail: **Settings → Accounts and Import → Send mail as → Edit** your address → set **Name** to "Austin @ Sanity".

**Production (Wrangler secrets):**

```bash
npx wrangler secret put GMAIL_CLIENT_ID --env=production
npx wrangler secret put GMAIL_CLIENT_SECRET --env=production
npx wrangler secret put GMAIL_REFRESH_TOKEN --env=production
```

## 6. Verify

- Restart the worker (`npm run dev`).
- Use a route that uses Gmail (e.g. Gmail tool, or `/gmail/review` if you have UI).  
  If the three vars are set and the refresh token is valid, the worker can read/draft/send with that account.

## Scopes reference

| Scope | Use in this worker |
|-------|---------------------|
| `gmail.readonly` | List messages, get message metadata |
| `gmail.compose` | Create drafts |
| `gmail.send` | Send messages |

Using `gmail.modify` is equivalent to read + compose + send (plus labels) for this app.
