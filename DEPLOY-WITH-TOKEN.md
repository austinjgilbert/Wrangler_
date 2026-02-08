# Deploy Sanity Studio with Deploy Token

You have a deploy token! You can use it to deploy the Studio without interactive login.

---

## Option 1: Deploy with Environment Variable (Recommended)

Set the token as an environment variable and deploy:

```bash
cd sanity
SANITY_AUTH_TOKEN="your-deploy-token-here" npm run deploy
```

Replace `your-deploy-token-here` with your actual deploy token.

---

## Option 2: Save Token to Config

Create a file `sanity/.env` (not committed):

```bash
cd sanity
echo "SANITY_AUTH_TOKEN=your-deploy-token-here" > .env
```

Then deploy:

```bash
npm run deploy
```

The Sanity CLI will automatically use the token from `.env`.

---

## Option 3: Use --token Flag

```bash
cd sanity
npx sanity deploy --token="your-deploy-token-here"
```

---

## After Deploy

You'll get a public URL like:
```
https://molt-content-os.sanity.studio
```

Open it in your browser and sign in with your Sanity account to access the Studio from anywhere.

---

## Quick Command

```bash
cd sanity
SANITY_AUTH_TOKEN="paste-your-token" npm run deploy
```

This is the fastest way — just replace `paste-your-token` with your deploy token and run it.
