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
git clone <your-repo-url>
cd flip-shift-sync

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

> **Note:** For development, the manifest points to `https://localhost:3000`, so the dev server must be running on the machine where the browser is open.

---

## 3. Deploy to GitHub Pages (Production)

To make the add-in accessible to anyone without running a local dev server:

### Step 1: Set your production URL

Edit `webpack.config.js` and update `urlProd` with your GitHub Pages URL:

```js
const urlProd = "https://your-username.github.io/flip-shift-sync/";
```

### Step 2: Deploy

```bash
npm run deploy
```

This builds the production bundle and pushes the `dist/` folder to the `gh-pages` branch of your repo.

### Step 3: Enable GitHub Pages

1. Go to your repo on GitHub
2. **Settings** > **Pages**
3. Under "Source", select the `gh-pages` branch
4. Click **Save**

Your add-in will be available at `https://your-username.github.io/flip-shift-sync/`.

### Step 4: Share the manifest

After deploying, run `npm run build` to generate a production `manifest.xml` in `dist/`. The URLs in this manifest will point to your GitHub Pages URL instead of localhost. Share this file with your users so they can sideload it.

---

## 4. Configuration

Once the add-in is loaded in Excel:

1. Click **Shift Sync** on the Home tab to open the task pane
2. Go to the **Settings** tab
3. Enter your Flip tenant details:
   - **Base URL** — Your Flip instance URL (e.g. `https://yourtenant.flip-app.com`)
   - **Organization** — Your system ID (e.g. `mycompany`)
   - **Client ID** — API Client ID (from Flip admin portal)
   - **Client Secret** — API Client Secret
4. Click **Save**, then **Test Connection** to verify

---

## 5. Usage

1. On the **Sync** tab, click **Generate Template** to create a properly formatted worksheet
2. Fill in your shift data (use the `username` column for automatic employee ID lookup)
3. Click **Read Sheet** to preview and validate the data
4. Click **Sync to Flip** to push the shifts

---

## Project Structure

```
flip-shift-sync/
  assets/            — Icon images (Flip logo at various sizes)
  src/
    taskpane/
      components/    — React UI components
      services/      — API, Excel, and sync logic
      types/         — TypeScript interfaces
      config.ts      — Local storage config management
    commands/        — Office ribbon command handlers
  manifest.xml       — Office Add-in manifest (dev)
  webpack.config.js  — Build config with CORS proxy
  SETUP.md           — This file
```
