# Our Budget — Setup Guide

You'll do four things: (1) create the Google Sheet database, (2) deploy the
Apps Script backend, (3) host the app so it can be installed on your iPhone,
(4) get a free Gemini key for receipt scanning. About 20–25 minutes total,
one time only.

**Already set this up before and just came back for the new features
(Food Fund / IOUs / receipt scanner)?** Jump to "Updating an existing setup"
at the bottom.

## 1. Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank sheet.
   Name it something like "Our Budget Data".
2. Go to **Extensions → Apps Script**. Delete the placeholder code in `Code.gs`
   and paste in the entire contents of the `Code.gs` file provided.
3. At the top of the file, change this line to a passcode only you two know:
   ```
   const PASSCODE = "CHANGE_ME";
   ```
4. In the toolbar, select the function dropdown (next to "Debug") and choose
   **`initialize`**, then click **Run** (▶). The first time, Google will ask you
   to authorize the script — click through **Advanced → Go to project (unsafe)**
   (this warning is normal for your own scripts). This creates the
   `Transactions`, `Categories`, `SavingsGoals`, `Settings`, `FoodFund`, and
   `Debts` tabs in your Sheet.
5. Check your Sheet — you should now see those 6 tabs with headers filled in.

## 2. Deploy the backend as a Web App

1. Still in the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**, authorize again if asked, then **copy the Web App URL**
   (ends in `/exec`). Save it — you'll paste it into the app's Settings screen.

> Whenever you edit `Code.gs` later, you must do **Deploy → Manage deployments
> → Edit (pencil) → New version → Deploy** for changes to go live.

## 3. Host the frontend so it installs on iPhone

Apps Script alone can't reliably serve an installable PWA, so the frontend
(`index.html`, `manifest.json`, `sw.js`, icons) needs a normal static host.
**GitHub Pages is free and takes 5 minutes:**

1. Create a free GitHub account if you don't have one.
2. Create a new repository, e.g. `our-budget` (Public is fine — there's no
   sensitive data in these files; your data lives in your private Sheet, and
   your passcode/Gemini key are only ever stored on your own phone).
3. Upload `index.html`, `manifest.json`, `sw.js`, `icon-192.png`, and
   `icon-512.png` to the repo root.
4. Go to the repo's **Settings → Pages**, set **Source: Deploy from branch**,
   branch `main`, folder `/ (root)`, then **Save**.
5. After a minute, GitHub gives you a URL like
   `https://yourname.github.io/our-budget/`. Open it on your iPhone in Safari.

*(Alternative: Netlify Drop at [app.netlify.com/drop](https://app.netlify.com/drop)
— just drag the folder in, no account needed.)*

## 4. Get a free Gemini API key (for receipt scanning)

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and
   sign in with a Google account.
2. Click **Create API key** → **Create key in new project**. No credit card
   needed — this is Gemini's free tier.
3. Copy the key.

## 5. Connect the app

1. Open the hosted URL on your iPhone in **Safari**.
2. Go to the **Settings** tab in the app.
3. Paste your Apps Script Web App URL and your passcode → **Save & connect**,
   then **Test connection** to confirm.
4. Set your two names.
5. Paste your Gemini API key → **Save key**.

## 6. Install on your iPhone home screen

1. In Safari, tap the **Share** icon at the bottom.
2. Scroll down, tap **Add to Home Screen**, then **Add**.

Do this on both of your phones, pointing at the same hosted URL and Sheet.
For the Gemini key: you can use the same key on both phones, or each of you
can create your own free key — either works.

## What's new in this update (v1.0.4)

- **Add / remove category budgets**: the Budgets tab now has an "Add a
  category" form, and each category row has a ✕ to remove it. Removing a
  category just stops it from having a budget — past transactions keep their
  category label.
- **Personal spending**: the Add screen now has a Household / Personal
  toggle. Personal expenses are tracked per person under Budgets → Personal,
  with an optional monthly personal spending limit — and they're excluded
  entirely from the household category budgets and from the "who paid what"
  split on the dashboard.
- **In-app version + changelog**: Settings → About now shows the app version
  and a "View changelog" list of every release. This tracks the app
  (`index.html`) itself — `Code.gs` has its own separate version number and
  changelog in its header comment, which only moves when the backend script
  changes.
- **Safari standalone polish**: smoother touch handling (no accidental
  callouts/zoom on buttons), the whole-page bounce is suppressed so it plays
  nicely with pull-to-refresh, and first-time Safari visitors who haven't
  installed the app yet see a one-time "Add to Home Screen" reminder.

## What's new in the previous update

- **Auto refresh**: the app quietly re-syncs with your Sheet every 30 seconds
  while open, and instantly whenever you switch back into it.
- **Pull to refresh**: on the dashboard (or any screen), pull down from the
  top and release to force an immediate refresh — same gesture as Mail or
  Instagram.
- **Food Fund as a payment method**: "Paid by" on the Add screen now includes
  **Food Fund** — pick it and the amount is deducted straight from the fund
  balance (shown live under the dropdown), same as logging it from the
  Shared → Food Fund screen, just faster. Deleting that transaction later
  automatically puts the money back in the fund.

## How the features work

- **Food Fund**: a ring-fenced shared pot. Contributing counts as a real
  expense against the contributor's income (money left their pocket into the
  pot), logged under its own "Food Fund" category. Spending from the fund
  logs an expense under the real category (e.g. Groceries) so it still shows
  in your monthly budget view, but it's tagged so it does *not* count against
  income a second time — that money was already accounted for when it went
  into the fund.
- **IOUs**: add one manually anytime ("Add IOU" under Shared → IOUs), or tick
  **"This was actually for [name]'s share"** when logging a transaction — it
  auto-creates the IOU for you, linked to that transaction.
- **Receipt scanner**: Add → Scan receipt → snap a photo (or pick a PDF) →
  Gemini reads the items → tag each one Payer / Other partner / Shared →
  Save. Items tagged for the other partner automatically become an IOU, same
  as the manual toggle.

## Notes

- **Your data**: 100% lives in your Google Sheet.
- **Security**: Shared passcode is casual protection — fine for a couple's
  private tool, not bank-grade. Don't share the URL, passcode, or Gemini key.
- **Costs**: Google Sheets, Apps Script, GitHub Pages, and Gemini's free tier
  are all free for this kind of personal usage.
- **Receipt accuracy**: Always double-check the extracted items and prices
  before saving — OCR/AI reading of receipts isn't perfect, especially with
  faded thermal-paper receipts.

---

## Updating an existing setup

If you already have this running and just want the new features:

1. Open your Sheet → **Extensions → Apps Script**.
2. Select all the old code and replace it with the new `Code.gs` (update your
   passcode line again if you changed it before).
3. Run **`initialize`** again — it only adds what's missing (new tabs, the
   `scope` column on Transactions, and the personal-budget settings), your
   existing data is untouched.
4. **Deploy → Manage deployments → Edit (pencil) → New version → Deploy.**
   (Your Web App URL stays the same — no need to reconnect the app.)
5. Re-upload the new `index.html`, `sw.js`, and any other changed files to
   your GitHub repo (or wherever you hosted it), overwriting the old ones.
   Each release bumps the cache name inside `sw.js`, so your phone will pick
   up the new version automatically instead of serving a stale cached copy.
6. On your iPhone, close the app fully and reopen it from the home screen icon
   to pick up the update (or pull down to refresh in Safari first, then
   re-add to home screen if it looks stale).
7. Go to Settings in the app and paste in a free Gemini key to enable the
   receipt scanner (step 4 above).
