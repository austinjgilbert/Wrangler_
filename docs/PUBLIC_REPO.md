# Publishing a public copy of this repo (no keys)

This project can be published as a **separate public GitHub repo** with no secrets or sensitive data.

## What’s safe in the public copy

- All source code (worker, operator console, Sanity schemas, scripts).
- `.env.example` and `apps/operator-console/.env.example` (placeholders only).
- Docs under `docs/` (no secrets).
- The `data/` folder is **not** included; only `data/README.md` is in the public branch so no account lists or local paths are published.

## What never goes in the repo

- `.env`, `.dev.vars`, `.env.local`, and any real keys (already in `.gitignore`).
- `data/*` (except `data/README.md`) on the `public` branch.

## How to create the public repo

### 1. Create a new repo on GitHub

- Go to [GitHub New Repository](https://github.com/new).
- Name it e.g. `website-scanner-worker-public`.
- Set visibility to **Public**.
- Do **not** add a README, .gitignore, or license (this repo already has them).
- Create the repository.

### 2. Push the `public` branch to the new repo

From this repo’s root:

```bash
# Add the new repo as a remote (replace USER and REPO with your GitHub user and repo name)
git remote add public https://github.com/USER/website-scanner-worker-public.git

# Push the public branch as the main branch of the new repo
git push public public:main
```

### 3. Optional: use the GitHub CLI

```bash
gh repo create website-scanner-worker-public --public --source=. --remote=public --push
```

(Then push the `public` branch: `git push public public:main`.)

## Keeping the public copy updated

When you want to refresh the public repo from your private one:

1. Merge or rebase your latest work into `public` (or recreate `public` from `main` and repeat the data/ and .gitignore steps if needed).
2. Push: `git push public public:main`.

## Branch summary

- **main**: Full project, may track `data/` and internal-only files (private repo).
- **public**: Same codebase but `data/` contents untracked (only `data/README.md`), safe to push to a public repo.
