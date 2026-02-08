# Fix: Deploy Error

## Problem
You're in the wrong directory. You need to be in the project directory.

## Solution

### Step 1: Navigate to Project Directory
```bash
cd /Users/austin.gilbert/website-scanner-worker
```

### Step 2: Verify You're in the Right Place
```bash
pwd
# Should show: /Users/austin.gilbert/website-scanner-worker

ls -la wrangler.toml
# Should show the file exists
```

### Step 3: Deploy
```bash
npm run deploy
```

Or directly:
```bash
wrangler deploy
```

## Quick One-Liner
```bash
cd /Users/austin.gilbert/website-scanner-worker && wrangler deploy
```
