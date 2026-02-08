# Push this repo to GitHub (private)

Your code is committed locally. To save it on GitHub as a **private** repo:

---

## Option A: GitHub website + terminal

### 1. Create a new private repo on GitHub

1. Go to **https://github.com/new**
2. **Repository name:** e.g. `website-scanner-worker` (or any name you like)
3. Set visibility to **Private**
4. **Do not** add a README, .gitignore, or license (you already have these)
5. Click **Create repository**

### 2. Add the remote and push

GitHub will show you commands. Use these (replace `YOUR_USERNAME` and `REPO_NAME` with yours):

```bash
cd /Users/austin.gilbert/website-scanner-worker

git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
git branch -M main
git push -u origin main
```

If GitHub suggests **SSH** instead of HTTPS, use:

```bash
git remote add origin git@github.com:YOUR_USERNAME/REPO_NAME.git
git push -u origin main
```

---

## Option B: GitHub CLI (if installed)

If you have [GitHub CLI](https://cli.github.com/) (`gh`) installed:

```bash
cd /Users/austin.gilbert/website-scanner-worker
gh repo create website-scanner-worker --private --source=. --push
```

This creates a private repo named `website-scanner-worker` and pushes your code in one step.

---

## What’s not in the repo (on purpose)

- **`.dev.vars`** – local secrets (ignored)
- **`node_modules/`** – dependencies (ignored)
- **`sanity/node_modules/`**, **`sanity/dist/`** – Sanity build (ignored)
- **`test-results/`**, **`playwright-report/`** – test artifacts (ignored)

After cloning elsewhere, run `npm install` in the project root and in `sanity/`, and add your own `.dev.vars` from `.env.example`.
