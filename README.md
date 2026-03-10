# Patient Deidentifier

A browser-only web app that extracts text from scanned patient documents and redacts names, addresses, and birth dates. All processing runs locally; no data is uploaded to the internet or sent to any server.

**Using the app?** See **[How to use this app](#how-to-use-this-app)** below. (Developers: see [How to run](#how-to-run) and [Deploy](#deploy-to-github-pages-share-with-others).)

---

## How to use this app

*For anyone opening the app in a browser (link: `https://AngelaLYY.github.io/patient-deidentifier/`).*

1. **Open the app** in your browser (Chrome, Firefox, Safari, or Edge).
2. **Choose your file(s):** Click “Choose one or more images” and select the scanned document(s) you want to deidentify (PNG, JPEG, or TIFF). You can select one file or many at once.
3. **Optional — add names to redact:** If you want a specific name (e.g. “Angie” or "Hall, Angie) redacted everywhere it appears, type it in the “Custom names to redact” box and click **Add**. You can add several names.
4. **Run deidentification:** Click the blue **Deidentify** button. The app will read the text from your image(s) and redact names, addresses, and birth dates. This may take a minute per image.
5. **Download the result:**
   - **One file:** Use **Download redacted text** to save a single `.txt` file.
   - **Many files:** Use **Download all as ZIP** to save a ZIP containing one redacted `.txt` per image.

Your images and the extracted text never leave your device; everything runs in your browser.

*A one-page guide is in [USAGE.md](USAGE.md) — you can share that link (e.g. `.../patient-deidentifier/blob/main/USAGE.md`) with people who will use the app.*

---

## Deploy to GitHub Pages (share with others)

To put the app online so someone can use it in their browser (e.g. `https://AngelaLYY.github.io/patient-deidentifier/`), see **[DEPLOY.md](DEPLOY.md)** for step-by-step instructions.

## How to run (developers)

1. Open `index.html` in a modern browser, or serve the folder with a local static server (e.g. `npx serve .` or `python3 -m http.server 8000`) and open the given URL.
2. Use the app as described in [How to use this app](#how-to-use-this-app) above.

## Privacy

- **No server:** everything runs in your browser.
- **No uploads:** images and OCR results stay in memory and are not stored unless you explicitly download the redacted text.
- **No AI or cloud:** PHI detection uses local rule-based patterns (regex and heuristics only).

## What is redacted

- **Names:** After labels like “Patient’s Name:”, “Name:”, and heuristic detection of capitalized name-like phrases (e.g. “Last, First”). You can also add custom names to redact anywhere in the text.
- **Addresses:** After “Address:”, “Street:”, “City:”, “Zip:”, and street-style patterns (e.g. “123 Main St”).
- **Birthday (DOB):** After “DOB:”, “Date of birth:”, “Birth date:”.

Only name, address, and birthday are redacted; other fields (e.g. visit dates, MRN, clinical text) are left as-is.

## Batch processing

Select multiple images at once, then click **Deidentify**. The app processes them one by one and, when finished, offers **Download all as ZIP** so you get one ZIP file containing a redacted `.txt` per image (e.g. `document-name-redacted.txt`).

## Offline use

The app loads Tesseract.js, UTIF (TIFF support), and JSZip from CDNs by default. For fully offline use, download those libraries and the English language data, host them locally, and update the script paths in `index.html`.

**Using the app via GitHub Pages (or any host) does not leak patient data.** Only the app code is loaded from the network; images and extracted text never leave the user’s device.

## Files

- `index.html` – Entry point and UI
- `app.js` – OCR (Tesseract.js), TIFF decoding, image preprocessing, batch processing, text download and ZIP
- `phi-detector.js` – Rule-based PHI detection and text redaction (name, address, birthday)
- `styles.css` – Layout and accessibility

---

## Copyright & contact

© 2026 Patient Deidentifier. All rights reserved. This software is provided as-is for deidentification of patient documents. Redistribution or modification without permission may be restricted.

**Questions or feedback?** Contact the developer: [angelaliangyy@gmail.com](mailto:angelaliangyy@gmail.com)
