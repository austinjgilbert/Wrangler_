# Step-by-step: Connect Sanity to the Website Scanner Worker

Follow these steps to connect your Sanity project so the worker can read/write account intelligence, context, and OSINT data.

---

## Step 1: Have a Sanity project

1. Go to [sanity.io](https://www.sanity.io) and sign in (or create an account).
2. Open the [Sanity Manage](https://www.sanity.io/manage) dashboard.
3. Either:
   - **Use an existing project** – click it, or  
   - **Create a new project** – click **Create project**, pick a name and (optionally) a dataset name (e.g. `production`).

You’ll need the **Project ID** and an **API token** from this project.

---

## Step 2: Get your Project ID

1. In [Sanity Manage](https://www.sanity.io/manage), open your project.
2. In the left sidebar, click **API** (or go to **Project settings** → **API**).
3. Under **Project ID**, copy the value (e.g. `abc123xyz`).

Save this as `SANITY_PROJECT_ID` in the next steps.

---

## Step 3: Create an API token

1. In the same **API** section, find **Tokens** (or **API tokens**).
2. Click **Add API token** (or **Create token**).
3. Give it a name (e.g. `Website Scanner Worker`).
4. Set permissions:
   - **Editor** (or **Viewer** + **Editor** if you prefer) so the worker can read and write.
   - Restrict to the dataset you use (e.g. `production`) if you use multiple.
5. Create the token and **copy it immediately** (it’s shown only once).

Save this as `SANITY_TOKEN` (or `SANITY_API_TOKEN`) in the next steps.

---

## Step 4: Note your dataset name

1. In **Sanity Manage** → your project, check **Datasets**.
2. Default is usually `production`. If you use another (e.g. `staging`), note it.

You’ll use this as `SANITY_DATASET` only if it’s not `production`.

---

## Step 5: Configure the worker locally (`.dev.vars`)

1. In your project root (same folder as `wrangler.toml`), create or edit `.dev.vars`.
2. Add (replace with your real values):

```bash
SANITY_PROJECT_ID=your_project_id_here
SANITY_TOKEN=your_token_here
```

If your dataset is not `production`:

```bash
SANITY_DATASET=your_dataset_name
```

3. Save the file. **Do not commit `.dev.vars`** (it should be in `.gitignore`).

---

## Step 6: Configure the worker in production (Wrangler secrets)

For the deployed worker, set secrets with Wrangler (you’ll be prompted to paste each value):

```bash
wrangler secret put SANITY_PROJECT_ID
# Paste your project ID when prompted

wrangler secret put SANITY_TOKEN
# Paste your API token when prompted
```

If you use a non-default dataset:

```bash
wrangler secret put SANITY_DATASET
# Paste e.g. production or staging
```

---

## Step 7: Verify the connection

**Local**

From the **project root** (the folder with `package.json` and `wrangler.toml`—e.g. `cd ~/website-scanner-worker`):

```bash
npm run sanity:check
# or: node scripts/check-sanity.js
```

- Success: `OK Sanity reachable (projectId=***, dataset=production)` and exit code 0.
- Failure: Message like “Sanity not configured” or “Sanity unreachable” and non-zero exit code.

**Deployed worker**

- **Health:**  
  `GET https://<your-worker-url>/health`  
  Check `dependencies.sanity.configured` and `dependencies.sanity.reachable` are `true`.
- **Sanity status only:**  
  `GET https://<your-worker-url>/sanity/status`  
  Check `configured: true` and `reachable: true`.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| “Sanity not configured” | `SANITY_PROJECT_ID` and `SANITY_TOKEN` (or `SANITY_API_TOKEN`) are set in `.dev.vars` or as Wrangler secrets. |
| “Sanity unreachable” / `reachable: false` | Token permissions (read + write), correct project ID, correct dataset. Check token hasn’t been revoked. |
| 401 from Sanity | Invalid or expired token; create a new token in Sanity Manage. |
| Wrong dataset | Set `SANITY_DATASET` to the dataset you use in Sanity (default is `production`). |

For more detail, see [SANITY-CONNECTIONS.md](../SANITY-CONNECTIONS.md) in the project root.
