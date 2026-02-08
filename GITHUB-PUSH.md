# Push this repo to GitHub (private)

Your code is committed locally. The remote is set to:

**https://github.com/austinjgilbert/-website-scanner-worker.git**

---

## If push says "Permission denied" or "Authentication failed"

GitHub no longer accepts account passwords over HTTPS. Use a **Personal Access Token (PAT)** as the password.

### 1. Create a token

1. Open **https://github.com/settings/tokens**
2. Click **Generate new token** → **Generate new token (classic)**
3. Name it (e.g. `website-scanner-worker`), set an expiry, check **repo**
4. Click **Generate token** and **copy the token** (you won’t see it again)

### 2. Push using the token

In Terminal (in this project folder):

```bash
cd /Users/austin.gilbert/website-scanner-worker
git push -u origin main
```

- **Username:** `austinjgilbert`
- **Password:** paste the token (not your GitHub password)

macOS may save the token in Keychain so you don’t have to enter it every time.

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
