# Deploy Sanity Studio

Your Sanity Studio is currently running locally at **http://localhost:3333/** and is fully functional.

To deploy it to a public URL (e.g. `https://molt-content-os.sanity.studio`), follow these steps:

---

## Option 1: Deploy via Sanity CLI (Recommended)

### 1. Login to Sanity

```bash
cd sanity
npx sanity login
```

Choose your login method (Google, GitHub, or Email) and authenticate in the browser that opens.

### 2. Deploy the Studio

```bash
npm run deploy
```

This will:
- Build the Studio for production
- Upload it to Sanity's hosting
- Give you a public URL like: `https://molt-content-os.sanity.studio`

### 3. Access Your Studio

After deployment, you'll get a URL. Open it and sign in with your Sanity account.

---

## Option 2: Use the Local Studio

The local Studio at **http://localhost:3333/** has all the same features:

- ✅ Browse all accounts, briefs, evidence
- ✅ Edit documents
- ✅ Run GROQ queries (Vision tool)
- ✅ See relationships
- ✅ Full admin access

**To keep it running:**
```bash
cd sanity
npm run dev
```

Leave that terminal open and access http://localhost:3333/ in your browser.

---

## What You Can Do in the Studio

### Browse Data
- **Accounts** — All scanned companies
- **Account Packs** — Full scan payloads
- **Briefs** — Research briefs
- **Evidence Packs** — Extracted evidence
- **People** — LinkedIn profiles
- **Interactions** — GPT conversations
- **Sessions** — Conversation threads
- **Learnings** — Derived insights
- **Enrichment Jobs** — Background job status

### Query with Vision
1. Click **Vision** in the top menu
2. Write GROQ queries like:
   ```groq
   *[_type == "account"] | order(_createdAt desc) [0...10] {
     companyName,
     domain,
     opportunityConfidence,
     techStack
   }
   ```
3. See results in real-time

### Edit Documents
- Click any document to edit
- Update fields, add notes
- Changes sync to the worker immediately

---

## Troubleshooting

### "Forbidden - User is missing required grant"
You need to log in first: `npx sanity login`

### "Project not found"
Check that `sanity.cli.js` has the correct project ID: `kvxbss3j`

### Studio won't start
Make sure you're in the `sanity/` directory and run: `npm run dev`

---

## Summary

- **Local Studio:** http://localhost:3333/ (already running)
- **Deploy command:** `cd sanity && npx sanity login && npm run deploy`
- **Public URL:** Will be provided after deploy (e.g. `https://molt-content-os.sanity.studio`)

Both local and deployed Studios connect to the same Sanity project, so your data is always in sync.
