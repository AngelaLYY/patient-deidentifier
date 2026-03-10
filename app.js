(function () {
  'use strict';

  var fileInput = document.getElementById('file-input');
  var thumbnailContainer = document.getElementById('thumbnail-container');
  var deidentifyBtn = document.getElementById('deidentify-btn');
  var progressSection = document.getElementById('progress-section');
  var progressText = document.getElementById('progress-text');
  var progressFill = document.getElementById('progress-fill');
  var errorSection = document.getElementById('error-section');
  var errorMessage = document.getElementById('error-message');
  var reviewSection = document.getElementById('review-section');
  var redactedTextOutput = document.getElementById('redacted-text-output');
  var downloadTextBtn = document.getElementById('download-text-btn');

  var currentImage = null;
  var currentImageCanvas = null;
  var currentFiles = null;
  var lastRedactedText = null;
  var lastBatchResults = null;
  var customNamesToRedact = [];
  var fileCountEl = document.getElementById('file-count');
  var downloadZipBtn = document.getElementById('download-zip-btn');
  var reviewHeading = document.getElementById('review-heading');

  function isTIFFFile(file) {
    if (!file) return false;
    if (file.type === 'image/tiff') return true;
    return /\.tiff?$/i.test(file.name);
  }

  function decodeTIFFToCanvas(buffer, callback) {
    if (typeof UTIF === 'undefined') {
      callback(new Error('TIFF support not loaded'));
      return;
    }
    try {
      var ifds = UTIF.decode(buffer);
      if (!ifds || ifds.length === 0) {
        callback(new Error('No image in TIFF file'));
        return;
      }
      UTIF.decodeImages(buffer, ifds);
      var ifd = ifds[0];
      var w = ifd.width;
      var h = ifd.height;
      var rgba = UTIF.toRGBA8(ifd);
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      var imageData = ctx.createImageData(w, h);
      imageData.data.set(rgba);
      ctx.putImageData(imageData, 0, 0);
      callback(null, canvas);
    } catch (e) {
      callback(e);
    }
  }

  function showError(msg) {
    errorSection.hidden = false;
    errorMessage.textContent = msg;
  }

  function hideError() {
    errorSection.hidden = true;
  }

  function setProgress(percent, text) {
    progressSection.hidden = false;
    progressFill.style.width = (percent || 0) + '%';
    progressText.textContent = text || 'Processing…';
  }

  function hideProgress() {
    progressSection.hidden = true;
  }

  var customNameInput = document.getElementById('custom-name-input');
  var addNameBtn = document.getElementById('add-name-btn');
  var customNamesList = document.getElementById('custom-names-list');

  addNameBtn.addEventListener('click', function () {
    var name = (customNameInput.value || '').trim();
    if (!name) return;
    if (customNamesToRedact.indexOf(name) !== -1) return;
    customNamesToRedact.push(name);
    customNameInput.value = '';
    renderCustomNamesList();
  });
  customNameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); addNameBtn.click(); }
  });
  function renderCustomNamesList() {
    customNamesList.innerHTML = '';
    customNamesToRedact.forEach(function (name, i) {
      var li = document.createElement('li');
      li.textContent = name;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'remove-name-btn';
      btn.setAttribute('aria-label', 'Remove ' + name);
      btn.textContent = '×';
      btn.addEventListener('click', function () {
        customNamesToRedact.splice(i, 1);
        renderCustomNamesList();
      });
      li.appendChild(btn);
      customNamesList.appendChild(li);
    });
  }

  fileInput.addEventListener('change', function () {
    hideError();
    var files = fileInput.files;
    if (!files || files.length === 0) {
      thumbnailContainer.innerHTML = '';
      if (fileCountEl) { fileCountEl.hidden = true; fileCountEl.textContent = ''; }
      deidentifyBtn.disabled = true;
      currentImage = null;
      currentImageCanvas = null;
      currentFiles = null;
      return;
    }
    if (files.length > 1) {
      currentImage = null;
      currentImageCanvas = null;
      currentFiles = Array.from(files);
      thumbnailContainer.innerHTML = '';
      if (fileCountEl) {
        fileCountEl.hidden = false;
        fileCountEl.textContent = files.length + ' file' + (files.length !== 1 ? 's' : '') + ' selected';
      }
      deidentifyBtn.disabled = false;
      reviewSection.hidden = true;
      return;
    }
    var file = files[0];
    currentFiles = null;
    currentImage = file;
    if (fileCountEl) fileCountEl.hidden = true;
    if (isTIFFFile(file)) {
      currentImageCanvas = null;
      var reader = new FileReader();
      reader.onload = function () {
        decodeTIFFToCanvas(reader.result, function (err, canvas) {
          if (err) {
            showError('Could not read TIFF: ' + (err.message || String(err)));
            currentImage = null;
            deidentifyBtn.disabled = true;
            thumbnailContainer.innerHTML = '';
            return;
          }
          currentImageCanvas = canvas;
          thumbnailContainer.innerHTML = '<img src="' + canvas.toDataURL('image/png') + '" alt="Selected scan" />';
          deidentifyBtn.disabled = false;
        });
      };
      reader.onerror = function () {
        showError('Could not read file.');
        currentImage = null;
        deidentifyBtn.disabled = true;
      };
      reader.readAsArrayBuffer(file);
      thumbnailContainer.innerHTML = '<p class="loading-tip">Loading TIFF…</p>';
      deidentifyBtn.disabled = true;
      reviewSection.hidden = true;
      return;
    }
    currentImageCanvas = null;
    var url = URL.createObjectURL(file);
    thumbnailContainer.innerHTML = '<img src="' + url + '" alt="Selected scan" />';
    deidentifyBtn.disabled = false;
    reviewSection.hidden = true;
  });

  deidentifyBtn.addEventListener('click', function () {
    if (currentFiles && currentFiles.length > 1) {
      hideError();
      lastBatchResults = null;
      runBatch(currentFiles);
      return;
    }
    if (!currentImage && !currentImageCanvas) return;
    hideError();
    lastBatchResults = null;
    if (downloadZipBtn) downloadZipBtn.hidden = true;
    if (downloadTextBtn) downloadTextBtn.hidden = false;
    setProgress(0, 'Loading OCR engine…');
    deidentifyBtn.disabled = true;

    if (currentImageCanvas) {
      runOCRAndRedact(currentImageCanvas, null);
      return;
    }

    var img = new Image();
    var objectUrl = URL.createObjectURL(currentImage);
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      runOCRAndRedact(img, objectUrl);
    };
    img.onerror = function () {
      URL.revokeObjectURL(objectUrl);
      setProgress(0, '');
      hideProgress();
      deidentifyBtn.disabled = false;
      showError('Could not load the image.');
    };
    img.src = objectUrl;
  });

  /**
   * Load a File as Image or Canvas (for TIFF). Returns a Promise.
   */
  function loadFileAsImageOrCanvas(file) {
    return new Promise(function (resolve, reject) {
      if (isTIFFFile(file)) {
        var reader = new FileReader();
        reader.onload = function () {
          decodeTIFFToCanvas(reader.result, function (err, canvas) {
            if (err) return reject(err);
            resolve(canvas);
          });
        };
        reader.onerror = function () { reject(new Error('Could not read file')); };
        reader.readAsArrayBuffer(file);
      } else {
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function () {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('Could not load image'));
        };
        img.src = url;
      }
    });
  }

  /**
   * Run OCR and redaction on an image or canvas. Returns Promise<string> (redacted text).
   * options: optional { logger: function(m) } for Tesseract progress.
   */
  function runOCROnImage(imgOrCanvas, options) {
    var ocrInput = preprocessForOCR(imgOrCanvas);
    var opts = { tessedit_pageseg_mode: 3 };
    if (options && options.logger) opts.logger = options.logger;
    return Tesseract.recognize(ocrInput, 'eng', opts).then(function (result) {
      var rawText = (result.data && result.data.text) ? result.data.text : '';
      var ocrText = sanitizeForLatinText(cleanOCRText(rawText));
      var customNames = customNamesToRedact.length ? customNamesToRedact.slice() : undefined;
      return typeof PHIDetector !== 'undefined' && PHIDetector.redactText
        ? PHIDetector.redactText(ocrText, customNames)
        : ocrText;
    });
  }

  /**
   * Process multiple files sequentially; resolve with array of { name, text }.
   */
  function runBatch(files) {
    var total = files.length;
    var results = [];
    var customNames = customNamesToRedact.length ? customNamesToRedact.slice() : undefined;

    function safeName(filename) {
      var base = filename.replace(/\.[^.]+$/, '').replace(/[\/\\]/g, '');
      return (base || 'document') + '-redacted.txt';
    }

    function processNext(index) {
      if (index >= total) {
        hideProgress();
        deidentifyBtn.disabled = false;
        lastBatchResults = results;
        lastRedactedText = null;
        reviewSection.hidden = false;
        if (reviewHeading) reviewHeading.textContent = 'Processed ' + total + ' image' + (total !== 1 ? 's' : '') + '. Download all as ZIP.';
        if (redactedTextOutput) redactedTextOutput.textContent = 'Batch complete. Use "Download all as ZIP" below.';
        if (downloadTextBtn) downloadTextBtn.hidden = true;
        if (downloadZipBtn) { downloadZipBtn.hidden = false; downloadZipBtn.focus(); }
        return;
      }
      var file = files[index];
      var pct = Math.round((index / total) * 100);
      setProgress(pct, 'Processing ' + (index + 1) + ' of ' + total + ': ' + file.name);
      loadFileAsImageOrCanvas(file).then(function (imgOrCanvas) {
        setProgress(pct + 2, 'OCR ' + (index + 1) + ' of ' + total + '…');
        return runOCROnImage(imgOrCanvas);
      }).then(function (text) {
        results.push({ name: safeName(file.name), text: text });
        processNext(index + 1);
      }).catch(function (err) {
        hideProgress();
        deidentifyBtn.disabled = false;
        showError('Error on "' + file.name + '": ' + (err && err.message ? err.message : String(err)));
      });
    }

    setProgress(0, 'Starting batch…');
    processNext(0);
  }

  /**
   * Preprocess image for better OCR: scale to a good resolution.
   * Accepts HTMLImageElement or HTMLCanvasElement (e.g. from decoded TIFF).
   */
  function preprocessForOCR(imgOrCanvas) {
    var minSide = 1000;
    var maxSide = 2400;
    var w = (imgOrCanvas.naturalWidth != null ? imgOrCanvas.naturalWidth : imgOrCanvas.width) || 0;
    var h = (imgOrCanvas.naturalHeight != null ? imgOrCanvas.naturalHeight : imgOrCanvas.height) || 0;
    var scale = 1;
    if (w < minSide || h < minSide) {
      scale = minSide / Math.min(w, h);
    }
    if (scale * Math.max(w, h) > maxSide) {
      scale = maxSide / Math.max(w, h);
    }
    var tw = Math.round(w * scale);
    var th = Math.round(h * scale);
    var canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(imgOrCanvas, 0, 0, w, h, 0, 0, tw, th);
    return canvas;
  }

  /**
   * Clean common OCR noise: stray symbols, broken words across lines, extra spaces.
   * Keeps line breaks so document structure is preserved.
   */
  function cleanOCRText(text) {
    if (!text || typeof text !== 'string') return '';
    var out = text
      .replace(/\s*\|\s*/g, ' ')
      .replace(/\s*§\s*/g, ' ')
      .replace(/\s*[=*]+\s*/g, ' ');
    out = out.replace(/([a-zA-Z])-\s*\n\s*([a-zA-Z])/g, '$1$2');
    out = out.split('\n').map(function (line) {
      return line.replace(/\s+/g, ' ').trim();
    }).join('\n');
    return out.replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * Keep only ASCII printable + newline/tab. Replaces any other character (e.g. from
   * dust/specs mis-OCR'd as CJK or symbols) with space so the file stays Latin and
   * is not detected as Chinese encoding.
   */
  function sanitizeForLatinText(text) {
    if (!text || typeof text !== 'string') return '';
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if ((c >= 0x20 && c <= 0x7E) || c === 0x0A || c === 0x0D || c === 0x09) out += text[i];
      else out += ' ';
    }
    return out.replace(/\n +/g, '\n').replace(/ +\n/g, '\n').replace(/ {2,}/g, ' ').trim();
  }

  function runOCRAndRedact(img, objectUrl) {
    setProgress(5, 'Preparing image…');
    function cleanup() {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
    setProgress(8, 'Running OCR…');
    runOCROnImage(img, {
      logger: function (m) {
        if (m.status === 'recognizing text') {
          var p = m.progress && m.progress < 1 ? Math.round(m.progress * 85) + 8 : 93;
          setProgress(p, 'Recognizing text…');
        }
      }
    }).then(function (text) {
      lastRedactedText = text;
      cleanup();
      hideProgress();
      deidentifyBtn.disabled = false;
      reviewSection.hidden = false;
      if (reviewHeading) reviewHeading.textContent = 'Extracted text (redacted)';
      if (redactedTextOutput) redactedTextOutput.textContent = lastRedactedText || '(No text extracted)';
      if (downloadTextBtn) downloadTextBtn.focus();
    }).catch(function (err) {
      cleanup();
      hideProgress();
      deidentifyBtn.disabled = false;
      showError('OCR failed: ' + (err && err.message ? err.message : String(err)));
    });
  }

  if (downloadTextBtn) {
    downloadTextBtn.addEventListener('click', function () {
      if (lastRedactedText == null) return;
      var blob = new Blob([lastRedactedText], { type: 'text/plain;charset=us-ascii' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'deidentified-text.txt';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (downloadZipBtn && typeof JSZip !== 'undefined') {
    downloadZipBtn.addEventListener('click', function () {
      if (!lastBatchResults || lastBatchResults.length === 0) return;
      var zip = new JSZip();
      for (var i = 0; i < lastBatchResults.length; i++) {
        var item = lastBatchResults[i];
        zip.file(item.name, item.text, { createFolders: false });
      }
      zip.generateAsync({ type: 'blob' }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'deidentified-batch.zip';
        a.click();
        URL.revokeObjectURL(url);
      });
    });
  }
})();
