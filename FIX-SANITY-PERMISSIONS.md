# Fix Sanity Studio Deploy Permissions

## The Issue

You're logged in to Sanity, but your account doesn't have permission to deploy to the project `kvxbss3j`.

This happens when:
1. The project was created with a different Sanity account
2. Your current account isn't added as a member
3. You need admin/deploy permissions

---

## Solution 1: Add Yourself to the Project (Recommended)

### If you created the project with a different account:

1. Go to [sanity.io/manage](https://www.sanity.io/manage)
2. Find the project with ID `kvxbss3j`
3. Go to **Settings** → **Members**
4. Add your current Google account (the one you just logged in with)
5. Give it **Administrator** role
6. Try deploying again: `npm run deploy`

---

## Solution 2: Use the Correct Account

If the project belongs to a different account:

1. Log out of Sanity CLI:
   ```bash
   npx sanity logout
   ```

2. Log in with the account that owns the project:
   ```bash
   npx sanity login
   ```

3. Choose the account that created the project
4. Deploy: `npm run deploy`

---

## Solution 3: Create a New Project

If you can't access the existing project, create a new one:

### 1. Create a new Sanity project

```bash
npx sanity init
```

Follow the prompts:
- Create new project? **Yes**
- Project name: **Molt Content OS** (or your choice)
- Use default dataset? **Yes**
- Output path: **Skip** (we already have the studio)

This will give you a new project ID.

### 2. Update the configuration

Update `sanity/sanity.config.ts`:
```typescript
projectId: 'YOUR_NEW_PROJECT_ID',  // Replace kvxbss3j with the new ID
```

Update `sanity/sanity.cli.js`:
```javascript
projectId: 'YOUR_NEW_PROJECT_ID',  // Replace kvxbss3j with the new ID
```

### 3. Update worker secrets

```bash
# Set the new project ID for production
wrangler secret put SANITY_PROJECT_ID --env=production
# Enter your new project ID when prompted

# Update .dev.vars
# Change SANITY_PROJECT_ID=kvxbss3j to your new project ID
```

### 4. Create a new API token

1. Go to [sanity.io/manage](https://www.sanity.io/manage)
2. Open your new project
3. Go to **API** → **Tokens**
4. Click **Add API token**
5. Name: `Website Scanner Production`
6. Permissions: **Editor**
7. Copy the token

### 5. Update tokens

```bash
# Update .dev.vars
SANITY_TOKEN=<paste new token>

# Update production
wrangler secret put SANITY_TOKEN --env=production
# Paste the new token when prompted
```

### 6. Deploy the Studio

```bash
npm run deploy
```

---

## Quick Check: Which Account Am I Using?

```bash
npx sanity debug --secrets
```

This shows which Sanity account you're logged in with.

---

## Recommended: Solution 1

The easiest fix is to add your current account to the existing project:

1. Go to https://www.sanity.io/manage
2. Find project `kvxbss3j`
3. Add your Google account as Administrator
4. Run `npm run deploy`

If you don't see the project in the dashboard, it was created with a different account — use Solution 2 or 3.
