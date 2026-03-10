/**
 * PHI detector: rule-based detection of names, address, and birthday (DOB) only.
 * Takes OCR result (text + word/line boxes) and returns list of { bbox, type } to redact.
 * No AI; all logic is local and deterministic.
 */

(function (global) {
  'use strict';

  // Words that are often not patient names (reduce false positives)
  var NAME_BLOCKLIST = [
    'patient', 'name', 'date', 'birth', 'address', 'phone', 'social', 'security',
    'number', 'medical', 'record', 'mr', 'mrn', 'id', 'department', 'hospital',
    'clinic', 'doctor', 'physician', 'nurse', 'the', 'and', 'of', 'for', 'to',
    'insurance', 'policy', 'group', 'subscriber', 'member', 'id', 'ssn', 'dob'
  ];

  // Label prefixes: name, address, and birthday (DOB) only
  var PHI_LABELS = [
    'name:', 'patient:', 'patient name:', 'patient\'s name:', 'patient\'s name',
    'dob:', 'date of birth:', 'birth date:',
    'address:', 'street:', 'city:', 'zip:'
  ];

  // Street-like: number + word + St/Ave/Blvd/Dr etc. (for address redaction)
  var STREET_REGEX = /\b\d+\s+[A-Za-z0-9\s]+(?:Street|St\.?|Avenue|Ave\.?|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Road|Rd\.?|Way|Court|Ct\.?|Place|Pl\.?)\b/gi;

  function normalizeLabel(s) {
    return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function isBlocklisted(word) {
    return NAME_BLOCKLIST.indexOf(normalizeLabel(word)) !== -1;
  }

  /**
   * OCR word/line structure: { text, bbox: { x0, y0, x1, y1 } } (or similar)
   * Tesseract.js returns words with bbox in image coordinates.
   */
  function getBbox(item) {
    var b = item.bbox;
    if (!b) return null;
    return {
      x0: b.x0 != null ? b.x0 : b.left,
      y0: b.y0 != null ? b.y0 : b.top,
      x1: b.x1 != null ? b.x1 : (b.left + b.width),
      y1: b.y1 != null ? b.y1 : (b.top + b.height)
    };
  }

  /**
   * Merge overlapping or adjacent boxes (within a few pixels).
   */
  function mergeBoxes(boxes, padding) {
    padding = padding || 2;
    var merged = [];
    var used = {};
    for (var i = 0; i < boxes.length; i++) {
      if (used[i]) continue;
      var b = boxes[i].bbox;
      var combined = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
      used[i] = true;
      for (var j = i + 1; j < boxes.length; j++) {
        if (used[j]) continue;
        var c = boxes[j].bbox;
        if (combined.x1 + padding >= c.x0 && c.x1 + padding >= combined.x0 &&
            combined.y1 + padding >= c.y0 && c.y1 + padding >= combined.y0) {
          combined.x0 = Math.min(combined.x0, c.x0);
          combined.y0 = Math.min(combined.y0, c.y0);
          combined.x1 = Math.max(combined.x1, c.x1);
          combined.y1 = Math.max(combined.y1, c.y1);
          used[j] = true;
        }
      }
      merged.push({ bbox: combined, type: boxes[i].type });
    }
    return merged;
  }

  /**
   * Find words in OCR data that match a regex. Return array of { bbox, type }.
   * words: array of { text, bbox }
   */
  function findWordsByRegex(words, regex, type) {
    var results = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var text = (w.text || '').trim();
      if (!text) continue;
      regex.lastIndex = 0;
      if (regex.test(text)) {
        var bbox = getBbox(w);
        if (bbox) results.push({ bbox: bbox, type: type });
      }
    }
    return results;
  }

  /**
   * Find consecutive word ranges in lines that match a regex over the combined line text.
   */
  function findLineRangesByRegex(lines, regex, type) {
    var results = [];
    for (var l = 0; l < lines.length; l++) {
      var line = lines[l];
      var words = line.words || [];
      var lineText = words.map(function (w) { return w.text || ''; }).join(' ');
      regex.lastIndex = 0;
      var match;
      while ((match = regex.exec(lineText)) !== null) {
        var start = match.index;
        var end = start + match[0].length;
        var charIdx = 0;
        var startWordIdx = -1, endWordIdx = -1;
        for (var i = 0; i < words.length; i++) {
          var len = (words[i].text || '').length + (i < words.length - 1 ? 1 : 0);
          if (startWordIdx < 0 && start < charIdx + (words[i].text || '').length) startWordIdx = i;
          if (endWordIdx < 0 && end <= charIdx + (words[i].text || '').length) { endWordIdx = i; break; }
          charIdx += len;
        }
        if (endWordIdx < 0) endWordIdx = words.length - 1;
        if (startWordIdx < 0) startWordIdx = 0;
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (var j = startWordIdx; j <= endWordIdx; j++) {
          var b = getBbox(words[j]);
          if (b) {
            x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
            x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
          }
        }
        if (x0 !== Infinity) results.push({ bbox: { x0: x0, y0: y0, x1: x1, y1: y1 }, type: type });
      }
    }
    return results;
  }

  /**
   * Given normalized line text and a label (e.g. "patient's name:" or "history no."),
   * return the character index where the value starts (after label and any : spaces).
   * Returns -1 if label not found. Handles OCR spacing like "NAME : value".
   */
  function findValueStartAfterLabel(lineNorm, label) {
    var idx = lineNorm.indexOf(label);
    if (idx === -1) return -1;
    var valueStart = idx + label.length;
    while (valueStart < lineNorm.length && /[\s:]/.test(lineNorm[valueStart])) valueStart++;
    return valueStart;
  }

  /**
   * Label-based: find lines that contain a PHI label and redact the value part (from end of label to end of line).
   * Works when label is at start or in the middle (e.g. "PATIENT'S NAME: HOFFMAN, Laura", "HISTORY NO.: 223 02 48").
   * Tolerates extra spaces around colons (OCR: "NAME : value").
   */
  function findLabelBasedPhi(lines) {
    var results = [];
    for (var l = 0; l < lines.length; l++) {
      var line = lines[l];
      var words = line.words || [];
      var lineText = words.map(function (w) { return w.text || ''; }).join(' ').trim();
      var lower = normalizeLabel(lineText);
      var valueStartChar = -1;
      for (var li = 0; li < PHI_LABELS.length; li++) {
        var label = PHI_LABELS[li];
        var v = findValueStartAfterLabel(lower, label);
        if (v !== -1 && (valueStartChar === -1 || v < valueStartChar)) valueStartChar = v;
      }
      if (valueStartChar === -1 || valueStartChar >= lower.length) continue;
      var charCount = 0;
      var startWordIdx = -1;
      var endWordIdx = words.length - 1;
      for (var i = 0; i < words.length; i++) {
        var wlen = (words[i].text || '').length;
        var space = i < words.length - 1 ? 1 : 0;
        if (startWordIdx < 0 && valueStartChar < charCount + wlen) startWordIdx = i;
        charCount += wlen + space;
      }
      if (startWordIdx < 0) startWordIdx = 0;
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var j = startWordIdx; j <= endWordIdx; j++) {
        var b = getBbox(words[j]);
        if (b) {
          x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
          x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
        }
      }
      if (x0 !== Infinity) results.push({ bbox: { x0: x0, y0: y0, x1: x1, y1: y1 }, type: 'label_value' });
    }
    return results;
  }

  /**
   * Heuristic names: 2–4 consecutive capitalized words, not blocklisted.
   * Allows trailing comma (e.g. "HOFFMAN," "Laura") for "Last, First" format.
   */
  function findHeuristicNames(words) {
    var results = [];
    var run = [];
    function flushRun() {
      if (run.length >= 2 && run.length <= 4) {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (var r = 0; r < run.length; r++) {
          var b = getBbox(run[r]);
          if (b) {
            x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
            x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
          }
        }
        if (x0 !== Infinity) results.push({ bbox: { x0: x0, y0: y0, x1: x1, y1: y1 }, type: 'name' });
      }
      run = [];
    }
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var t = (w.text || '').trim();
      if (!t) { flushRun(); continue; }
      var tForBlocklist = t.replace(/,$/, '');
      var capitalized = t.length > 0 && t[0] === t[0].toUpperCase() && /^[A-Za-z\-',]+$/.test(t);
      if (capitalized && !isBlocklisted(tForBlocklist)) {
        run.push(w);
      } else {
        flushRun();
      }
    }
    flushRun();
    return results;
  }

  /**
   * Address lines: lines containing Address:, Street, Ave, ZIP pattern, etc.
   */
  function findAddressLines(lines) {
    var results = [];
    var addressLineRegex = /(?:address|street|st\.?|avenue|ave\.?|blvd|drive|dr\.?|lane|ln\.?|road|rd\.?|zip|city|state)/i;
    for (var l = 0; l < lines.length; l++) {
      var line = lines[l];
      var words = line.words || [];
      var lineText = words.map(function (w) { return w.text || ''; }).join(' ');
      if (!addressLineRegex.test(lineText)) continue;
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var i = 0; i < words.length; i++) {
        var b = getBbox(words[i]);
        if (b) {
          x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
          x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
        }
      }
      if (x0 !== Infinity) results.push({ bbox: { x0: x0, y0: y0, x1: x1, y1: y1 }, type: 'address' });
    }
    return results;
  }

  /**
   * Find lines containing custom name phrases (e.g. "Hoff Laura"); return bboxes for those spans.
   * customNames: array of strings like ["Hoff Laura", "John Smith"]
   */
  function findCustomNames(lines, customNames) {
    if (!customNames || customNames.length === 0) return [];
    var results = [];
    for (var l = 0; l < lines.length; l++) {
      var line = lines[l];
      var words = line.words || [];
      var lineText = words.map(function (w) { return w.text || ''; }).join(' ');
      var lineNorm = normalizeLabel(lineText);
      for (var c = 0; c < customNames.length; c++) {
        var phrase = (customNames[c] || '').trim();
        if (!phrase) continue;
        var phraseNorm = normalizeLabel(phrase);
        var idx = lineNorm.indexOf(phraseNorm);
        if (idx === -1) continue;
        var endIdx = idx + phraseNorm.length;
        var charIdx = 0;
        var startWordIdx = -1, endWordIdx = -1;
        for (var i = 0; i < words.length; i++) {
          var wlen = (words[i].text || '').length;
          if (startWordIdx < 0 && idx < charIdx + wlen) startWordIdx = i;
          if (endIdx <= charIdx + wlen) { endWordIdx = i; break; }
          charIdx += wlen + 1;
        }
        if (endWordIdx < 0) endWordIdx = words.length - 1;
        if (startWordIdx < 0) startWordIdx = 0;
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (var j = startWordIdx; j <= endWordIdx; j++) {
          var b = getBbox(words[j]);
          if (b) {
            x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
            x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
          }
        }
        if (x0 !== Infinity) results.push({ bbox: { x0: x0, y0: y0, x1: x1, y1: y1 }, type: 'custom_name' });
      }
    }
    return results;
  }

  /**
   * Flatten Tesseract blocks/paragraphs/lines into words and lines arrays.
   */
  function flattenBlocks(data) {
    var words = [];
    var lines = [];
    var blocks = data.blocks || [];
    for (var bi = 0; bi < blocks.length; bi++) {
      var block = blocks[bi];
      var paragraphs = block.paragraphs || [];
      for (var pi = 0; pi < paragraphs.length; pi++) {
        var para = paragraphs[pi];
        var lineList = para.lines || [];
        for (var li = 0; li < lineList.length; li++) {
          var line = lineList[li];
          var lineWords = line.words || [];
          lines.push({ words: lineWords });
          for (var wi = 0; wi < lineWords.length; wi++) words.push(lineWords[wi]);
        }
      }
    }
    return { words: words, lines: lines };
  }

  /**
   * Public API.
   * ocrResult: { data: { words: [...], lines: [...] } or data.blocks } (Tesseract.js format)
   * customNames: optional array of strings to redact (e.g. ["Hoff Laura"])
   * Returns array of { bbox: { x0, y0, x1, y1 }, type: string }.
   */
  function detectPHI(ocrResult, customNames) {
    var data = (ocrResult && ocrResult.data) || ocrResult;
    var words = (data.words || []).slice();
    var lines = (data.lines || []).slice();
    if (words.length === 0 && lines.length === 0 && (data.blocks || []).length > 0) {
      var flat = flattenBlocks(data);
      words = flat.words;
      lines = flat.lines;
    }

    var all = [];

    all = all.concat(findLabelBasedPhi(lines));
    all = all.concat(findHeuristicNames(words));
    all = all.concat(findAddressLines(lines));
    all = all.concat(findLineRangesByRegex(lines, STREET_REGEX, 'address'));

    if (customNames && customNames.length > 0) {
      all = all.concat(findCustomNames(lines, customNames));
    }

    return mergeBoxes(all, 4);
  }

  // Regexes for redacting label values in plain text (name, address, birthday only)
  var LABEL_VALUE_REDACT_REGEXES = [
    /(patient'?s?\s+name\s*:?\s*)([^\n\r]+)/gi,
    /(dob\s*:?|date\s+of\s+birth\s*:?|birth\s+date\s*:?)([^\n\r]+)/gi,
    /(address\s*:?\s*)([^\n\r]+)/gi,
    /(street\s*:?\s*)([^\n\r]+)/gi,
    /(city\s*:?\s*)([^\n\r]+)/gi,
    /(zip\s*:?\s*)([^\n\r]+)/gi
  ];

  /**
   * Replace PHI in plain text with [REDACTED]. Name, address, and birthday only.
   * customNames: optional array of strings to redact (e.g. ["Hoffman, Laura"])
   */
  function redactText(text, customNames) {
    if (!text || typeof text !== 'string') return '';
    var out = text;
    out = out.replace(STREET_REGEX, '[REDACTED]');
    LABEL_VALUE_REDACT_REGEXES.forEach(function (regex) {
      out = out.replace(regex, '$1[REDACTED]');
    });
    if (customNames && customNames.length > 0) {
      customNames.forEach(function (name) {
        var phrase = (name || '').trim();
        if (!phrase) return;
        var escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var re = new RegExp(escaped.replace(/\s+/g, '\\s+'), 'gi');
        out = out.replace(re, '[REDACTED]');
      });
    }
    return out;
  }

  global.PHIDetector = { detectPHI: detectPHI, redactText: redactText };
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
