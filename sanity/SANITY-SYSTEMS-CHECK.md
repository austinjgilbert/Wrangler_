# Sanity Studio — Systems Check & Optimization

Run this whenever you want to verify the studio is healthy, or after schema or dependency changes.

---

## Quick check (one command)

From the `sanity/` directory:

```bash
npm run check
```

This runs **schema validate** then **build**. Both must pass for the studio to be deployable and Dashboard-compatible.

---

## Full systems check (manual)

### 1. Schema validation

```bash
cd sanity
npx sanity schema validate --format pretty
```

- **Expect:** `Errors: 0`, `Warnings: 0`.
- Fix any schema errors (e.g. missing `fields` on object types, invalid `to` in references) before deploying.

### 2. Deployed schemas

```bash
npx sanity schema list
```

- Confirms the workspace `account-dataset` is deployed to the `production` dataset.
- After first deploy you should see `_.schemas.account-dataset`.

### 3. Dependencies

```bash
npm outdated
npm audit
```

- **outdated:** No output = all deps current. Optional: `npm update` for minor/patch bumps.
- **audit:** Aim for **0 vulnerabilities**. Run `npm audit fix` only if you understand the changes.

### 4. Build

```bash
npm run build
```

- Must complete without errors. Required for `sanity deploy` and Dashboard manifest extraction.

### 5. Deploy (when ready)

```bash
npm run deploy
```

- Builds, extracts manifest, deploys schemas, and uploads to https://molt-content-os.sanity.studio/
- For CI/CD with a deploy token: `SANITY_AUTH_TOKEN=<token> npx sanity schema deploy` (and build/deploy host separately if self-hosted).

---

## Current status (last run)

| Check              | Result |
|--------------------|--------|
| Schema validate    | ✓ 0 errors, 0 warnings |
| Schema list        | ✓ 1 workspace deployed |
| npm outdated       | ✓ All current |
| npm audit          | ✓ 0 vulnerabilities |
| Build              | ✓ Success |
| Sanity version     | ^5.1.0 (Dashboard compatible) |
| React              | ^19.0.0 |

---

## Optional optimizations already in place

- **TypeScript:** `strict: true` in `tsconfig.json`.
- **Dashboard:** Studio name, icon, and v5 + manifest/schema deploy for full Dashboard compatibility.
- **CLI:** `sanity.cli.js` has `projectId`, `dataset`, `deployment.appId`, and `studioHost` set so deploy and schema commands work without prompts.

---

## Known non-blockers

- **`motion() is deprecated. Use motion.create() instead`** — Comes from Sanity/framer-motion internals, not this repo. No action needed; will be fixed in a future Sanity release.
- **`npm warn Unknown env config "devdir"`** — npm config warning; safe to ignore.

---

## Troubleshooting

- **Validation errors:** Fix schema (e.g. add `fields` to object types, fix reference `to`).
- **Build fails:** Check Node version (v18+), run `rm -rf node_modules dist && npm install && npm run build`.
- **Deploy 401 / wrong project:** Ensure `SANITY_PROJECT_ID` / `sanity.cli.js` `api.projectId` match the project you’re logged into and that your token has access.
- **Dashboard “Partially compatible”:** Ensure Sanity is v5.1+ and you’ve run `npm run deploy` so manifest and schema are deployed.
