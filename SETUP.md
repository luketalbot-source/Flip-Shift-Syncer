# Flip Shift Sync — Setup & Distribution

An Excel Office Add-in that syncs shift plans from spreadsheets into Flip.

---

## Prerequisites

- **Node.js** 18+ and **npm** 9+
- **Git**
- **Microsoft Excel** (Desktop or Office 365 Web)

---

## 1. Quick Start (Development)

```bash
# Clone the repo
git clone https://github.com/luketalbot-source/Flip-Shift-Syncer.git
cd Flip-Shift-Syncer

# Install dependencies
npm install

# Start the dev server (https://localhost:3000)
npm run dev-server
```

The first time you run the dev server, it will generate self-signed certificates for HTTPS (required by Office Add-ins).

### Sideload the Add-in for Development

Once the dev server is running, sideload `manifest.xml` into Excel using one of the methods below.

---

## 2. Sideloading Instructions

### Excel Desktop — Windows

**Option A: Upload My Add-in**
1. Open Excel
2. Go to **Insert** > **My Add-ins** (or **Get Add-ins**)
3. Click **Upload My Add-in** in the top-right corner
4. Browse to and select the `manifest.xml` file from this project
5. Click **Upload**

**Option B: Network Share (persistent)**
1. Copy `manifest.xml` to a shared folder (e.g. `\\server\addins\`)
2. In Excel, go to **File** > **Options** > **Trust Center** > **Trust Center Settings** > **Trusted Add-in Catalogs**
3. Add the shared folder URL as a catalog
4. Restart Excel — the add-in will appear under **My Add-ins**

### Excel Desktop — Mac

1. Open Excel
2. Go to **Insert** > **Add-ins** > **My Add-ins**
3. Click **Upload My Add-in**
4. Browse to and select the `manifest.xml` file
5. Click **Upload**

### Excel for the Web (Office 365)

1. Open a workbook in Excel Online
2. Go to **Insert** > **Office Add-ins**
3. Click **Upload My Add-in** (top-right of the dialog)
4. Browse to and select the `manifest.xml` file
5. Click **Upload**

> **Note:** For development, the manifest points to `https://localhost:3000`, so the dev server must be running on the machine where the browser is open. For production (GitHub Pages), see below.

---

## 3. Deploy to GitHub Pages (Production)

The add-in is already deployed at:
**https://luketalbot-source.github.io/Flip-Shift-Syncer/**

Users can download the `manifest.xml` from that page and sideload it — no local dev server needed.

### Redeploying after changes

```bash
npm run build
# Then manually push dist/ contents to the gh-pages branch,
# or use: npx gh-pages -d dist
```

---

## 4. CORS Proxy Setup (Required for hosted deployment)

When the add-in is hosted on GitHub Pages (not localhost), it needs a CORS proxy to communicate with the Flip API. We use a **Cloudflare Worker** for this (free tier: 100k requests/day).

### Step 1: Create a Cloudflare account

Sign up at https://dash.cloudflare.com/sign-up (free, no credit card needed).

### Step 2: Install Wrangler CLI

```bash
npm install -g wrangler
```

### Step 3: Authenticate

```bash
wrangler login
```

### Step 4: Deploy the worker

```bash
cd worker
npx wrangler deploy
```

This will output a URL like:
```
https://flip-shift-proxy.your-subdomain.workers.dev
```

### Step 5: Configure the add-in

In the add-in's **Settings** tab, paste the worker URL into the **Proxy URL** field, then click **Save** and **Test Connection**.

> **Note:** For local development (`npm run dev-server`), leave the Proxy URL field blank — the webpack dev server handles proxying automatically.

---

## 5. Configuration

Once the add-in is loaded in Excel:

1. Click **Shift Sync** on the Home tab to open the task pane
2. Go to the **Settings** tab
3. Enter your Flip tenant details:
   - **Base URL** — Your Flip instance URL (e.g. `https://yourtenant.flip-app.com`)
   - **Organization** — Your system ID (e.g. `mycompany`)
   - **Client ID** — API Client ID (from Flip admin portal)
   - **Client Secret** — API Client Secret
   - **Proxy URL** — Your Cloudflare Worker URL (only needed for hosted deployment, leave blank for local dev)
4. Click **Save**, then **Test Connection** to verify

---

## 6. Usage

1. On the **Sync** tab, click **Generate Template** to create a properly formatted worksheet
2. Fill in your shift data (use the `username` column for automatic employee ID lookup)
3. Click **Read Sheet** to preview and validate the data
4. Click **Sync to Flip** to push the shifts

---

## Project Structure

```
Flip-Shift-Syncer/
  assets/            — Icon images (Flip logo at various sizes)
  src/
    taskpane/
      components/    — React UI components
      services/      — API, Excel, and sync logic
      types/         — TypeScript interfaces
      config.ts      — Local storage config management
    commands/        — Office ribbon command handlers
  worker/            — Cloudflare Worker CORS proxy
    index.ts         — Worker source code
    wrangler.toml    — Wrangler deployment config
  manifest.xml       — Office Add-in manifest (dev)
  webpack.config.js  — Build config with CORS proxy (dev)
  SETUP.md           — This file
```
