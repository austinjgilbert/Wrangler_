# Create Internal Studio Hostname (sanity.studio)

Sanity now requires **sanity.studio** hostnames to be created as **"internal"** in the project dashboard before you can deploy. Here’s how.

---

## Step 1: Open Your Project in Sanity Manage

1. Go to **https://www.sanity.io/manage**
2. Open the project **nlqb7zmk** (or use: https://www.sanity.io/manage/project/nlqb7zmk)

---

## Step 2: Create an Internal Studio Hostname

1. In the project, go to **Studios** (or **Deployments** / **Hosting**, depending on the UI).
2. Look for an option to **Add studio** or **Create studio hostname**.
3. When creating the hostname:
   - Choose type: **Internal** (required for *.sanity.studio).
   - Enter the hostname (e.g. `molt-content-os` or `website-scanner`).  
     It must start with letters; no numbers or symbols.
4. Save / create the hostname.

Exact labels may vary; if you don’t see “Internal”, look for “Studio hostname” or “Deployments” and any type/visibility option that matches “internal” or “sanity.studio”.

---

## Step 3: Deploy from the CLI

After the hostname exists as **internal**:

```bash
cd /Users/austin.gilbert/website-scanner-worker/sanity
npm run deploy
```

When prompted for **Studio hostname**, enter the **same** hostname you created (e.g. `molt-content-os`). The deploy should then succeed.

---

## Optional: Set Hostname in Config

To avoid typing it every time, set it in `sanity.cli.js`:

```javascript
export default defineCliConfig({
  api: {
    projectId: 'nlqb7zmk',
    dataset: 'production'
  },
  studioHost: 'molt-content-os'   // same as in dashboard
});
```

Then run `npm run deploy` again; it will use this hostname.

---

## Reference

- Deployment docs: https://www.sanity.io/docs/studio/deployment  
- Project manage: https://www.sanity.io/manage/project/nlqb7zmk  

If the dashboard doesn’t show an “internal” or “studio hostname” option, check the latest deployment docs or contact Sanity support, as the UI may have changed.
