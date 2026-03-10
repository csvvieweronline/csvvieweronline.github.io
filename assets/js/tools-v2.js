(() => {
  const bodyTool = document.body.getAttribute("data-tool") || "";

  const SAMPLE_CSV = `name,email,team,score\n Ava , ava@example.com ,Alpha,92\n\nNoah,noah@example.com,Beta,85\nMia,mia@example.com,Alpha,97`;
  const SAMPLE_TSV = `name\temail\tteam\tscore\nAva\tava@example.com\tAlpha\t92\nNoah\tnoah@example.com\tBeta\t85`;
  const SAMPLE_JSON = `[
  {"name":"Ava","email":"ava@example.com","team":"Alpha","score":92},
  {"name":"Noah","email":"noah@example.com","team":"Beta","score":85}
]`;

  const DELIMITER_MAP = {
    comma: ",",
    tab: "\t",
    semicolon: ";",
    pipe: "|"
  };

  const formatNumber = (num) => new Intl.NumberFormat().format(num);

  const setMessage = (el, message, isError = false) => {
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error", isError);
  };

  const readFileText = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read the selected file."));
      reader.readAsText(file);
    });

  const readFileArrayBuffer = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read the selected file."));
      reader.readAsArrayBuffer(file);
    });

  const sanitizeHeader = (value, index) => {
    const clean = String(value || "").trim();
    return clean || `Column ${index + 1}`;
  };

  const uniqueHeaders = (headers) => {
    const seen = new Map();
    return headers.map((header, index) => {
      const clean = sanitizeHeader(header, index);
      const count = seen.get(clean) || 0;
      seen.set(clean, count + 1);
      return count === 0 ? clean : `${clean}_${count + 1}`;
    });
  };

  const parseDelimited = (rawText, delimiter = ",") => {
    const text = String(rawText || "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];

      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (char === "\r") {
        if (text[i + 1] === "\n") i += 1;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    row.push(field);
    rows.push(row);

    while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell === "")) {
      rows.pop();
    }

    if (rows.length === 0) {
      return { headers: [], rows: [] };
    }

    const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
    const normalized = rows.map((r) => {
      const copy = r.slice();
      while (copy.length < width) copy.push("");
      return copy;
    });

    const headers = uniqueHeaders(normalized[0]);
    const dataRows = normalized.slice(1);
    return { headers, rows: dataRows };
  };

  const toDelimited = (headers, rows, delimiter = ",") => {
    const escape = (value) => {
      const text = String(value ?? "");
      if (text.includes('"') || text.includes("\n") || text.includes("\r") || text.includes(delimiter)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const lines = [headers.map(escape).join(delimiter)];
    rows.forEach((row) => lines.push(row.map(escape).join(delimiter)));
    return lines.join("\n");
  };

  const countDelimiterInLine = (line, delimiter) => {
    let inQuotes = false;
    let count = 0;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes && char === delimiter) {
        count += 1;
      }
    }
    return count;
  };

  const detectDelimiter = (text) => {
    const candidates = [",", "\t", ";", "|"];
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 12);

    if (lines.length === 0) return ",";

    let best = { delimiter: ",", score: -1 };
    candidates.forEach((delimiter) => {
      const score = lines.reduce((sum, line) => sum + countDelimiterInLine(line, delimiter), 0);
      if (score > best.score) {
        best = { delimiter, score };
      }
    });

    return best.score > 0 ? best.delimiter : ",";
  };

  const downloadText = (filename, content, type = "text/plain;charset=utf-8") => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const copyText = async (text) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  };

  const attachDropzone = (dropzone, fileInput, onFile) => {
    if (!dropzone || !fileInput) return;

    const stop = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    dropzone.addEventListener("click", () => fileInput.click());

    ["dragenter", "dragover"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        stop(event);
        dropzone.classList.add("dragging");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        stop(event);
        dropzone.classList.remove("dragging");
      });
    });

    dropzone.addEventListener("drop", (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file) onFile(file);
    });

    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) onFile(file);
    });
  };

  const setupCopyDownloadClear = ({ outputEl, statusEl, copyBtn, downloadBtn, clearBtn, filename, clearFn }) => {
    copyBtn?.addEventListener("click", async () => {
      const text = outputEl?.value || outputEl?.textContent || "";
      if (!text.trim()) {
        setMessage(statusEl, "Nothing to copy yet.", true);
        return;
      }
      const ok = await copyText(text);
      setMessage(statusEl, ok ? "Copied to clipboard." : "Clipboard access is blocked in this browser.", !ok);
    });

    downloadBtn?.addEventListener("click", () => {
      const text = outputEl?.value || outputEl?.textContent || "";
      if (!text.trim()) {
        setMessage(statusEl, "Nothing to download yet.", true);
        return;
      }
      downloadText(filename, text, "text/plain;charset=utf-8");
      setMessage(statusEl, `Downloaded ${filename}.`);
    });

    clearBtn?.addEventListener("click", () => {
      if (typeof clearFn === "function") clearFn();
      if (outputEl instanceof HTMLTextAreaElement) outputEl.value = "";
      if (outputEl instanceof HTMLElement && !(outputEl instanceof HTMLTextAreaElement)) outputEl.textContent = "";
      setMessage(statusEl, "Cleared.");
    });
  };

  const initExcelToCsv = () => {
    const fileInput = document.getElementById("x2cFileInput");
    const dropzone = document.getElementById("x2cDropzone");
    const pasteInput = document.getElementById("x2cPasteInput");
    const runBtn = document.getElementById("x2cRun");
    const sampleBtn = document.getElementById("x2cSample");
    const copyBtn = document.getElementById("x2cCopy");
    const downloadBtn = document.getElementById("x2cDownload");
    const clearBtn = document.getElementById("x2cClear");
    const output = document.getElementById("x2cOutput");
    const statusEl = document.getElementById("x2cStatus");

    const setOutput = (csvText, sourceLabel) => {
      output.value = csvText;
      const parsed = parseDelimited(csvText, ",");
      setMessage(statusEl, `Converted ${sourceLabel}. ${formatNumber(parsed.rows.length)} rows ready for CSV workflows.`);
    };

    const convertTabularTextToCsv = (text, sourceLabel) => {
      const delimiter = detectDelimiter(text);
      const parsed = parseDelimited(text, delimiter);
      if (parsed.headers.length === 0) {
        output.value = "";
        setMessage(statusEl, "No rows found in input.", true);
        return;
      }
      setOutput(toDelimited(parsed.headers, parsed.rows, ","), sourceLabel);
    };

    const loadFile = async (file) => {
      const name = file.name.toLowerCase();
      const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");

      try {
        if (isExcel) {
          if (!window.XLSX) {
            setMessage(statusEl, "Excel parser not loaded. Paste tabular data instead.", true);
            return;
          }
          const buffer = await readFileArrayBuffer(file);
          const workbook = window.XLSX.read(buffer, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const csvText = window.XLSX.utils.sheet_to_csv(worksheet, { FS: ",", RS: "\n" });
          convertTabularTextToCsv(csvText, file.name);
          return;
        }

        const text = await readFileText(file);
        convertTabularTextToCsv(text, file.name);
      } catch (error) {
        setMessage(statusEl, error.message || "Could not convert this file.", true);
      }
    };

    attachDropzone(dropzone, fileInput, loadFile);

    runBtn?.addEventListener("click", () => {
      const text = pasteInput?.value || "";
      if (!text.trim()) {
        setMessage(statusEl, "Paste spreadsheet-style data first.", true);
        return;
      }
      convertTabularTextToCsv(text, "pasted content");
    });

    sampleBtn?.addEventListener("click", () => {
      if (pasteInput) pasteInput.value = SAMPLE_TSV;
      convertTabularTextToCsv(SAMPLE_TSV, "sample sheet data");
    });

    setupCopyDownloadClear({
      outputEl: output,
      statusEl,
      copyBtn,
      downloadBtn,
      clearBtn,
      filename: "excel-converted.csv",
      clearFn: () => {
        if (pasteInput) pasteInput.value = "";
        if (fileInput) fileInput.value = "";
      }
    });
  };

  const initCsvCleaner = () => {
    const fileInput = document.getElementById("clnFileInput");
    const dropzone = document.getElementById("clnDropzone");
    const pasteInput = document.getElementById("clnPasteInput");
    const runBtn = document.getElementById("clnRun");
    const sampleBtn = document.getElementById("clnSample");
    const copyBtn = document.getElementById("clnCopy");
    const downloadBtn = document.getElementById("clnDownload");
    const clearBtn = document.getElementById("clnClear");
    const output = document.getElementById("clnOutput");
    const statusEl = document.getElementById("clnStatus");

    const trimCheckbox = document.getElementById("clnTrim");
    const removeBlankCheckbox = document.getElementById("clnRemoveBlank");
    const normalizeBreaksCheckbox = document.getElementById("clnNormalizeBreaks");
    const collapseSpaceCheckbox = document.getElementById("clnCollapseSpaces");

    const cleanFromText = (text, sourceLabel) => {
      const delimiter = detectDelimiter(text);
      const parsed = parseDelimited(text, delimiter);
      if (parsed.headers.length === 0) {
        output.value = "";
        setMessage(statusEl, "No CSV rows found in input.", true);
        return;
      }

      const cleanCell = (raw) => {
        let value = String(raw ?? "");
        if (normalizeBreaksCheckbox?.checked) value = value.replace(/\r\n?/g, "\n");
        if (trimCheckbox?.checked) value = value.trim();
        if (collapseSpaceCheckbox?.checked) value = value.replace(/[ \t]{2,}/g, " ");
        return value;
      };

      const headers = parsed.headers.map((header) => cleanCell(header));
      let rows = parsed.rows.map((row) => row.map((cell) => cleanCell(cell)));

      if (removeBlankCheckbox?.checked) {
        rows = rows.filter((row) => row.some((cell) => cell.trim() !== ""));
      }

      output.value = toDelimited(headers, rows, ",");
      setMessage(statusEl, `Cleaned ${sourceLabel}. ${formatNumber(rows.length)} rows in output.`);
    };

    const loadFile = async (file) => {
      try {
        const text = await readFileText(file);
        cleanFromText(text, file.name);
      } catch (error) {
        setMessage(statusEl, error.message || "Could not clean this file.", true);
      }
    };

    attachDropzone(dropzone, fileInput, loadFile);

    runBtn?.addEventListener("click", () => {
      const text = pasteInput?.value || "";
      if (!text.trim()) {
        setMessage(statusEl, "Paste CSV data first.", true);
        return;
      }
      cleanFromText(text, "pasted CSV");
    });

    sampleBtn?.addEventListener("click", () => {
      if (pasteInput) pasteInput.value = SAMPLE_CSV;
      cleanFromText(SAMPLE_CSV, "sample CSV");
    });

    setupCopyDownloadClear({
      outputEl: output,
      statusEl,
      copyBtn,
      downloadBtn,
      clearBtn,
      filename: "cleaned.csv",
      clearFn: () => {
        if (pasteInput) pasteInput.value = "";
        if (fileInput) fileInput.value = "";
      }
    });
  };

  const initCsvFormatter = () => {
    const fileInput = document.getElementById("fmtFileInput");
    const dropzone = document.getElementById("fmtDropzone");
    const pasteInput = document.getElementById("fmtPasteInput");
    const runBtn = document.getElementById("fmtRun");
    const sampleBtn = document.getElementById("fmtSample");
    const copyBtn = document.getElementById("fmtCopy");
    const downloadBtn = document.getElementById("fmtDownload");
    const clearBtn = document.getElementById("fmtClear");
    const output = document.getElementById("fmtOutput");
    const statusEl = document.getElementById("fmtStatus");

    const sourceDelimiterSelect = document.getElementById("fmtSourceDelimiter");
    const normalizeHeadersCheckbox = document.getElementById("fmtNormalizeHeaders");

    const formatFromText = (text, sourceLabel) => {
      const sourceKey = sourceDelimiterSelect?.value || "auto";
      const delimiter = sourceKey === "auto" ? detectDelimiter(text) : DELIMITER_MAP[sourceKey] || ",";
      const parsed = parseDelimited(text, delimiter);

      if (parsed.headers.length === 0) {
        output.value = "";
        setMessage(statusEl, "No CSV rows found in input.", true);
        return;
      }

      const headers = normalizeHeadersCheckbox?.checked
        ? parsed.headers.map((header, index) => sanitizeHeader(header, index).replace(/\s+/g, " "))
        : parsed.headers.slice();

      const rows = parsed.rows.map((row) => {
        const copy = row.slice();
        while (copy.length < headers.length) copy.push("");
        return copy;
      });

      output.value = toDelimited(headers, rows, ",");
      setMessage(statusEl, `Formatted ${sourceLabel}. ${formatNumber(rows.length)} rows standardized.`);
    };

    const loadFile = async (file) => {
      try {
        const text = await readFileText(file);
        formatFromText(text, file.name);
      } catch (error) {
        setMessage(statusEl, error.message || "Could not format this file.", true);
      }
    };

    attachDropzone(dropzone, fileInput, loadFile);

    runBtn?.addEventListener("click", () => {
      const text = pasteInput?.value || "";
      if (!text.trim()) {
        setMessage(statusEl, "Paste delimited data first.", true);
        return;
      }
      formatFromText(text, "pasted data");
    });

    sampleBtn?.addEventListener("click", () => {
      if (pasteInput) pasteInput.value = SAMPLE_CSV;
      formatFromText(SAMPLE_CSV, "sample CSV");
    });

    setupCopyDownloadClear({
      outputEl: output,
      statusEl,
      copyBtn,
      downloadBtn,
      clearBtn,
      filename: "formatted.csv",
      clearFn: () => {
        if (pasteInput) pasteInput.value = "";
        if (fileInput) fileInput.value = "";
      }
    });
  };

  const initDelimiterConverter = () => {
    const fileInput = document.getElementById("dcvFileInput");
    const dropzone = document.getElementById("dcvDropzone");
    const pasteInput = document.getElementById("dcvPasteInput");
    const runBtn = document.getElementById("dcvRun");
    const sampleBtn = document.getElementById("dcvSample");
    const copyBtn = document.getElementById("dcvCopy");
    const downloadBtn = document.getElementById("dcvDownload");
    const clearBtn = document.getElementById("dcvClear");
    const output = document.getElementById("dcvOutput");
    const statusEl = document.getElementById("dcvStatus");

    const sourceSelect = document.getElementById("dcvSource");
    const targetSelect = document.getElementById("dcvTarget");

    const convertFromText = (text, sourceLabel) => {
      const sourceKey = sourceSelect?.value || "auto";
      const targetKey = targetSelect?.value || "comma";
      const sourceDelimiter = sourceKey === "auto" ? detectDelimiter(text) : DELIMITER_MAP[sourceKey] || ",";
      const targetDelimiter = DELIMITER_MAP[targetKey] || ",";

      const parsed = parseDelimited(text, sourceDelimiter);
      if (parsed.headers.length === 0) {
        output.value = "";
        setMessage(statusEl, "No delimited rows found in input.", true);
        return;
      }

      output.value = toDelimited(parsed.headers, parsed.rows, targetDelimiter);
      setMessage(statusEl, `Converted ${sourceLabel} from ${sourceKey} to ${targetKey}. ${formatNumber(parsed.rows.length)} rows ready.`);
    };

    const loadFile = async (file) => {
      try {
        const text = await readFileText(file);
        convertFromText(text, file.name);
      } catch (error) {
        setMessage(statusEl, error.message || "Could not convert this file.", true);
      }
    };

    attachDropzone(dropzone, fileInput, loadFile);

    runBtn?.addEventListener("click", () => {
      const text = pasteInput?.value || "";
      if (!text.trim()) {
        setMessage(statusEl, "Paste delimited data first.", true);
        return;
      }
      convertFromText(text, "pasted text");
    });

    sampleBtn?.addEventListener("click", () => {
      if (pasteInput) pasteInput.value = SAMPLE_TSV;
      if (sourceSelect) sourceSelect.value = "tab";
      if (targetSelect) targetSelect.value = "comma";
      convertFromText(SAMPLE_TSV, "sample TSV");
    });

    setupCopyDownloadClear({
      outputEl: output,
      statusEl,
      copyBtn,
      downloadBtn,
      clearBtn,
      filename: "converted-delimiter.txt",
      clearFn: () => {
        if (pasteInput) pasteInput.value = "";
        if (fileInput) fileInput.value = "";
      }
    });
  };

  if (bodyTool === "excel-to-csv") initExcelToCsv();
  if (bodyTool === "csv-cleaner") initCsvCleaner();
  if (bodyTool === "csv-formatter") initCsvFormatter();
  if (bodyTool === "delimiter-converter") initDelimiterConverter();
})();
