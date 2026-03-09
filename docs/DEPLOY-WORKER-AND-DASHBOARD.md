# Deploy: Worker + Dashboard (Cloudflare + Vercel)

Deploy the **worker** to Cloudflare and the **dashboard** (operator console) to Vercel, with the dashboard pointing at your worker API.

---

## 1. Deploy the Worker (Cloudflare)

From the repo root:

```bash
# Login if needed
npx wrangler login

# Set production secrets (required: SANITY_PROJECT_ID, SANITY_TOKEN)
# Optional: ADMIN_TOKEN, MOLT_API_KEY, etc.
./scripts/set-production-secrets.sh

# Deploy
npm run deploy
```

Your worker will be at:  
`https://<worker-name>.<subdomain>.workers.dev`  
(e.g. `https://website-scanner.austin-gilbert.workers.dev`)

---

## 2. Deploy the Dashboard (Vercel)

The dashboard is the Next.js app in `apps/operator-console/`. Deploy it to Vercel and point it at your worker.

### Option A: Vercel dashboard (recommended)

1. Go to [vercel.com](https://vercel.com) → Add New → Project.
2. Import your Git repo (this repo).
3. **Root Directory:** set to **`apps/operator-console`** (so Vercel builds the Next app, not the worker).
4. **Framework Preset:** Next.js (auto-detected).
5. **Environment variables:** add:

   | Name | Value |
   |------|--------|
   | `NEXT_PUBLIC_API_URL` | Your worker URL, e.g. `https://website-scanner.austin-gilbert.workers.dev` |

6. Deploy. Your dashboard will be at `https://<project>-<team>.vercel.app`.

### Option B: Vercel CLI

From the repo root:

```bash
cd apps/operator-console
npx vercel
# Follow prompts; set Root Directory to . (current folder) if linking from monorepo root
# Add NEXT_PUBLIC_API_URL when prompted or in Vercel project Settings → Environment Variables
```

For production:

```bash
npx vercel --prod
```

### v0.dev design

If you have a v0.dev project with a different UI design:

- Export or copy the components/pages from v0 into `apps/operator-console` (e.g. replace or merge into `app/` and `components/`).
- Keep the existing API routes under `app/api/console/` and `lib/server-proxy.ts` so the app still talks to your worker.
- Set `NEXT_PUBLIC_API_URL` in Vercel to your worker URL so the v0 UI uses your API.

---

## 3. After deploy

- **Worker:** `https://<your-worker>.workers.dev`
- **Dashboard:** `https://<your-project>.vercel.app`  
  The dashboard will call the worker using `NEXT_PUBLIC_API_URL`. No CORS change is needed if the dashboard only uses server-side proxy routes (`/api/console/*`).

---

## 4. Optional: same repo, two Vercel projects

- One Vercel project with **Root Directory** = `apps/operator-console` (dashboard).
- Worker is deployed separately via Wrangler (Cloudflare).  
  No need for a second Vercel project unless you want a separate preview app.
