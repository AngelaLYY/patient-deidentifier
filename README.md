# Patient Deidentifier

A browser-only web app that deidentifies scanned images of patient documents. All processing runs locally; no data is uploaded to the internet or sent to any server.

## Deploy to GitHub Pages (share with others)

To put the app online so someone can use it in their browser (e.g. `https://yourusername.github.io/patient-deidentifier/`), see **[DEPLOY.md](DEPLOY.md)** for step-by-step instructions.

## How to run

1. Open `index.html` in a modern browser (Chrome, Firefox, Safari, Edge), or serve the folder with a local static server (e.g. `npx serve .` or `python3 -m http.server 8000`) and open the given URL.
2. Choose a scanned image (PNG or JPEG) using the file input.
3. Click **Deidentify**. OCR runs in the browser (Tesseract.js); detected PHI (names, SSN, dates, MRN, addresses) is redacted on the image.
4. Review the redacted image, then use **Download deidentified image** to save the redacted image, or **Download redacted text** to save a text version with `[REDACTED]` placeholders.

## Privacy

- No server: everything runs in your browser.
- No uploads: the image and OCR results stay in memory and are not stored unless you explicitly download the redacted image or text.
- No AI or cloud: PHI detection uses local rule-based patterns (regex and heuristics only).

## What is redacted

- **SSN**: XXX-XX-XXXX patterns  
- **Dates**: Common formats (MM/DD/YYYY, Month DD YYYY, etc.)  
- **MRN**: Numeric IDs near “MRN” or “Medical Record”  
- **Names**: Label-based (e.g. after “Name:”, “Patient:”) and heuristic (2–4 consecutive capitalized words)  
- **Addresses**: Lines with “Address:”, street suffixes (St, Ave, Blvd, etc.), and US ZIP codes  

## Offline use

The app loads Tesseract.js from a CDN by default. For fully offline use, download [Tesseract.js](https://github.com/naptha/tesseract.js) and the English language data, host them locally, and update the script and worker paths in `index.html`.

## Files

- `index.html` – Entry point and UI
- `app.js` – OCR (Tesseract.js), redaction drawing, download actions
- `phi-detector.js` – Rule-based PHI detection and text redaction
- `styles.css` – Layout and accessibility
