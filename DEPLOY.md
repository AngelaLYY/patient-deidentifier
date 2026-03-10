# Deploy to GitHub Pages (so your friend can use it in her browser)

Follow these steps to put the app on GitHub and get a public URL.

---

## 1. Create a GitHub repository

1. Go to [github.com](https://github.com) and sign in.
2. Click the **+** (top right) → **New repository**.
3. **Repository name:** e.g. `patient-deidentifier` (or any name you like).
4. Choose **Public**.
5. **Do not** check "Add a README" (you already have one).
6. Click **Create repository**.

---

## 2. Push your code from your computer

Open Terminal, go to your project folder, then run:

```bash
cd /Users/angelaliang/patient-deidentifier

# Initialize Git (if not already)
git init

# Add all files
git add .

# First commit
git commit -m "Initial commit: patient deidentifier app"

# Add your GitHub repo as remote (replace YOUR_USERNAME and YOUR_REPO with yours)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Push (main branch)
git branch -M main
git push -u origin main
```

When prompted, sign in with your GitHub account (or use a [Personal Access Token](https://github.com/settings/tokens) if you use 2FA).

---

## 3. Turn on GitHub Pages

1. On GitHub, open your repo.
2. Click **Settings** → **Pages** (left sidebar).
3. Under **Source**, choose **Deploy from a branch**.
4. Under **Branch**, select **main** and **/ (root)**.
5. Click **Save**.

Wait 1–2 minutes. GitHub will show a message like: *Your site is live at `https://YOUR_USERNAME.github.io/YOUR_REPO/`*.

---

## 4. Share the link with your friend

Send her:

**`https://YOUR_USERNAME.github.io/YOUR_REPO/`**

Example: if your username is `jane` and the repo is `patient-deidentifier`, the link is:

**`https://jane.github.io/patient-deidentifier/`**

She can open that URL in Chrome, Firefox, Safari, or Edge and use the app. No install, no code—everything runs in the browser. Images and data never leave her device.

---

## Updating the app later

After you change the code:

```bash
cd /Users/angelaliang/patient-deidentifier
git add .
git commit -m "Describe your change"
git push
```

GitHub Pages will redeploy automatically; the same URL will show the new version after a short delay.
