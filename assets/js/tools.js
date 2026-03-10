(() => {
  const SAMPLE_CSV = `name,email,team,score\nAva,ava@example.com,Alpha,92\nNoah,noah@example.com,Beta,85\nMia,mia@example.com,Alpha,97\nLiam,liam@example.com,Gamma,88`;

  const SAMPLE_TSV = `name\temail\tteam\tscore\nAva\tava@example.com\tAlpha\t92\nNoah\tnoah@example.com\tBeta\t85\nMia\tmia@example.com\tAlpha\t97\nLiam\tliam@example.com\tGamma\t88`;

  const SAMPLE_JSON = `[
  {
    "name": "Ava",
    "email": "ava@example.com",
    "team": "Alpha",
    "score": 92
  },
  {
    "name": "Noah",
    "email": "noah@example.com",
    "team": "Beta",
    "score": 85
  }
]`;

  const PREVIEW_LIMIT = 50000;

  const bodyTool = document.body.getAttribute("data-tool") || "";

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
    rows.forEach((row) => {
      lines.push(row.map(escape).join(delimiter));
    });

    return lines.join("\n");
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

  class TableController {
    constructor({ tableHost, metaEl, pageEl, prevEl, nextEl, searchEl, editable = false, onEdit = null }) {
      this.tableHost = tableHost;
      this.metaEl = metaEl;
      this.pageEl = pageEl;
      this.prevEl = prevEl;
      this.nextEl = nextEl;
      this.searchEl = searchEl;
      this.editable = editable;
      this.onEdit = onEdit;

      this.headers = [];
      this.rows = [];
      this.search = "";
      this.page = 1;
      this.pageSize = 100;
      this.sortColumn = -1;
      this.sortDirection = "asc";

      this.bindEvents();
      this.renderEmpty();
    }

    bindEvents() {
      this.searchEl?.addEventListener("input", () => {
        this.search = this.searchEl.value.trim().toLowerCase();
        this.page = 1;
        this.render();
      });

      this.prevEl?.addEventListener("click", () => {
        if (this.page > 1) {
          this.page -= 1;
          this.render();
        }
      });

      this.nextEl?.addEventListener("click", () => {
        const totalPages = this.getTotalPages();
        if (this.page < totalPages) {
          this.page += 1;
          this.render();
        }
      });
    }

    setData(headers, rows) {
      this.headers = headers;
      this.rows = rows;
      this.page = 1;
      this.sortColumn = -1;
      this.search = this.searchEl ? this.searchEl.value.trim().toLowerCase() : "";
      this.render();
    }

    getData() {
      return { headers: this.headers.slice(), rows: this.rows.map((row) => row.slice()) };
    }

    clear() {
      this.headers = [];
      this.rows = [];
      if (this.searchEl) this.searchEl.value = "";
      this.search = "";
      this.page = 1;
      this.sortColumn = -1;
      this.renderEmpty();
      this.updateMeta(0, 0);
    }

    rowMatchesSearch(row) {
      if (!this.search) return true;
      return row.some((cell) => String(cell).toLowerCase().includes(this.search));
    }

    compareRows(aIndex, bIndex) {
      if (this.sortColumn < 0) return 0;
      const a = String(this.rows[aIndex][this.sortColumn] ?? "");
      const b = String(this.rows[bIndex][this.sortColumn] ?? "");
      const aNum = Number(a);
      const bNum = Number(b);
      const bothNumeric = Number.isFinite(aNum) && Number.isFinite(bNum) && a.trim() !== "" && b.trim() !== "";
      let result = 0;
      if (bothNumeric) {
        result = aNum - bNum;
      } else {
        result = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
      }
      return this.sortDirection === "asc" ? result : -result;
    }

    getVisibleIndices() {
      const indices = [];
      for (let i = 0; i < this.rows.length; i += 1) {
        if (this.rowMatchesSearch(this.rows[i])) indices.push(i);
      }

      if (this.sortColumn >= 0) {
        indices.sort((a, b) => this.compareRows(a, b));
      }

      return indices;
    }

    getTotalPages(count = null) {
      const total = count === null ? this.getVisibleIndices().length : count;
      return Math.max(1, Math.ceil(total / this.pageSize));
    }

    renderEmpty(message = "Load a file, paste data, or use the sample dataset to preview rows here.") {
      if (this.tableHost) {
        this.tableHost.innerHTML = `<div class="card card-pad"><p class="section-intro">${message}</p></div>`;
      }
      if (this.pageEl) this.pageEl.textContent = "Page 1 of 1";
      if (this.prevEl) this.prevEl.disabled = true;
      if (this.nextEl) this.nextEl.disabled = true;
    }

    updateMeta(totalRows, visibleRows) {
      if (!this.metaEl) return;
      if (totalRows === 0) {
        this.metaEl.textContent = "No rows loaded yet.";
      } else {
        this.metaEl.textContent = `${formatNumber(visibleRows)} matching rows from ${formatNumber(totalRows)} total.`;
      }
    }

    render() {
      if (this.headers.length === 0) {
        this.renderEmpty();
        this.updateMeta(0, 0);
        return;
      }

      const indices = this.getVisibleIndices();
      const totalVisible = indices.length;
      const totalRows = this.rows.length;
      this.updateMeta(totalRows, totalVisible);

      if (totalVisible === 0) {
        this.renderEmpty("No matching rows for the current search.");
        return;
      }

      const totalPages = this.getTotalPages(totalVisible);
      if (this.page > totalPages) this.page = totalPages;
      const start = (this.page - 1) * this.pageSize;
      const end = Math.min(start + this.pageSize, totalVisible);
      const pageIndices = indices.slice(start, end);

      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");

      this.headers.forEach((header, columnIndex) => {
        const th = document.createElement("th");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sort-btn";
        button.textContent = header;
        if (columnIndex === this.sortColumn) {
          button.dataset.dir = this.sortDirection;
        }
        button.addEventListener("click", () => {
          if (this.sortColumn === columnIndex) {
            this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
          } else {
            this.sortColumn = columnIndex;
            this.sortDirection = "asc";
          }
          this.render();
        });
        th.appendChild(button);
        headRow.appendChild(th);
      });

      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      pageIndices.forEach((rowIndex) => {
        const tr = document.createElement("tr");
        this.rows[rowIndex].forEach((cell, colIndex) => {
          const td = document.createElement("td");
          td.textContent = cell;
          if (this.editable) {
            td.setAttribute("contenteditable", "true");
            td.addEventListener("input", () => {
              this.rows[rowIndex][colIndex] = td.textContent || "";
              if (typeof this.onEdit === "function") {
                this.onEdit({ rowIndex, colIndex, value: this.rows[rowIndex][colIndex] });
              }
            });
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      this.tableHost.innerHTML = "";
      this.tableHost.appendChild(table);

      if (this.pageEl) this.pageEl.textContent = `Page ${this.page} of ${totalPages}`;
      if (this.prevEl) this.prevEl.disabled = this.page <= 1;
      if (this.nextEl) this.nextEl.disabled = this.page >= totalPages;
    }
  }

  const applyPreviewLimit = (headers, rows) => {
    if (rows.length <= PREVIEW_LIMIT) {
      return { headers, rows, truncated: false, totalRows: rows.length };
    }
    return {
      headers,
      rows: rows.slice(0, PREVIEW_LIMIT),
      truncated: true,
      totalRows: rows.length
    };
  };

  const initViewerBase = ({
    prefix,
    delimiter,
    sampleData,
    downloadFilename,
    emptyMessage,
    editable = false
  }) => {
    const tableHost = document.getElementById(`${prefix}Table`);
    const metaEl = document.getElementById(`${prefix}Meta`);
    const pageEl = document.getElementById(`${prefix}Page`);
    const prevEl = document.getElementById(`${prefix}Prev`);
    const nextEl = document.getElementById(`${prefix}Next`);
    const searchEl = document.getElementById(`${prefix}Search`);
    const statusEl = document.getElementById(`${prefix}Status`);

    const fileInput = document.getElementById(`${prefix}FileInput`);
    const dropzone = document.getElementById(`${prefix}Dropzone`);
    const pasteInput = document.getElementById(`${prefix}PasteInput`);
    const parsePasteBtn = document.getElementById(`${prefix}RunPaste`);
    const sampleBtn = document.getElementById(`${prefix}Sample`);
    const clearBtn = document.getElementById(`${prefix}Clear`);
    const downloadBtn = document.getElementById(`${prefix}Download`);

    let current = { headers: [], rows: [], delimiter };

    const controller = new TableController({
      tableHost,
      metaEl,
      pageEl,
      prevEl,
      nextEl,
      searchEl,
      editable
    });

    const loadText = (text, sourceLabel = "data") => {
      const parsed = parseDelimited(text, delimiter);
      if (parsed.headers.length === 0) {
        controller.clear();
        setMessage(statusEl, "No rows were found in the input.", true);
        return;
      }

      const limited = applyPreviewLimit(parsed.headers, parsed.rows);
      current = {
        headers: limited.headers,
        rows: limited.rows,
        delimiter
      };

      controller.setData(limited.headers, limited.rows);
      if (limited.truncated) {
        setMessage(
          statusEl,
          `Loaded ${sourceLabel}. Showing the first ${formatNumber(PREVIEW_LIMIT)} rows for speed (from ${formatNumber(limited.totalRows)} total).`
        );
      } else {
        setMessage(statusEl, `Loaded ${sourceLabel}. ${formatNumber(limited.rows.length)} rows ready.`);
      }
    };

    const loadFile = async (file) => {
      try {
        const text = await readFileText(file);
        loadText(text, file.name);
      } catch (error) {
        setMessage(statusEl, error.message || "Could not parse file.", true);
      }
    };

    attachDropzone(dropzone, fileInput, loadFile);

    parsePasteBtn?.addEventListener("click", () => {
      const text = pasteInput?.value || "";
      if (!text.trim()) {
        setMessage(statusEl, "Paste some data first.", true);
        return;
      }
      loadText(text, "pasted content");
    });

    sampleBtn?.addEventListener("click", () => {
      if (pasteInput) pasteInput.value = sampleData;
      loadText(sampleData, "sample dataset");
    });

    clearBtn?.addEventListener("click", () => {
      current = { headers: [], rows: [], delimiter };
      controller.clear();
      if (pasteInput) pasteInput.value = "";
      if (fileInput) fileInput.value = "";
      setMessage(statusEl, emptyMessage || "Cleared.");
    });

    downloadBtn?.addEventListener("click", () => {
      if (current.headers.length === 0) {
        setMessage(statusEl, "Load data before exporting.", true);
        return;
      }
      const data = controller.getData();
      const content = toDelimited(data.headers, data.rows, delimiter);
      downloadText(downloadFilename, content, "text/plain;charset=utf-8");
      setMessage(statusEl, `Exported ${downloadFilename}.`);
    });
  };

  const initCsvViewer = () => {
    initViewerBase({
      prefix: "viewer",
      delimiter: ",",
      sampleData: SAMPLE_CSV,
      downloadFilename: "csv-view.csv",
      emptyMessage: "Viewer reset."
    });
  };

  const initCsvEditor = () => {
    initViewerBase({
      prefix: "editor",
      delimiter: ",",
      sampleData: SAMPLE_CSV,
      downloadFilename: "edited.csv",
      emptyMessage: "Editor reset.",
      editable: true
    });
  };

  const initTsvViewer = () => {
    initViewerBase({
      prefix: "tsv",
      delimiter: "\t",
      sampleData: SAMPLE_TSV,
      downloadFilename: "preview.tsv",
      emptyMessage: "TSV viewer reset."
    });
  };

  const initCsvToJson = () => {
    const fileInput = document.getElementById("c2jFileInput");
    const dropzone = document.getElementById("c2jDropzone");
    const pasteInput = document.getElementById("c2jPasteInput");
    const parseBtn = document.getElementById("c2jRun");
    const sampleBtn = document.getElementById("c2jSample");
    const copyBtn = document.getElementById("c2jCopy");
    const downloadBtn = document.getElementById("c2jDownload");
    const clearBtn = document.getElementById("c2jClear");
    const output = document.getElementById("c2jOutput");
    const statusEl = document.getElementById("c2jStatus");

    const convert = (text, source = "input") => {
      const parsed = parseDelimited(text, ",");
      if (parsed.headers.length === 0) {
        output.textContent = "";
        setMessage(statusEl, "No rows found in CSV input.", true);
        return;
      }

      const result = parsed.rows
        .filter((row) => row.some((cell) => String(cell).trim() !== ""))
        .map((row) => {
          const entry = {};
          parsed.headers.forEach((header, index) => {
            entry[header] = row[index] ?? "";
          });
          return entry;
        });

      output.textContent = JSON.stringify(result, null, 2);
      setMessage(statusEl, `Converted ${formatNumber(result.length)} rows from ${source}.`);
    };

    const loadFile = async (file) => {
      try {
        const text = await readFileText(file);
        convert(text, file.name);
      } catch (error) {
        setMessage(statusEl, error.message || "Could not read file.", true);
      }
    };

    attachDropzone(dropzone, fileInput, loadFile);

    parseBtn?.addEventListener("click", () => {
      const text = pasteInput?.value || "";
      if (!text.trim()) {
        setMessage(statusEl, "Paste CSV input first.", true);
        return;
      }
      convert(text, "pasted CSV");
    });

    sampleBtn?.addEventListener("click", () => {
      if (pasteInput) pasteInput.value = SAMPLE_CSV;
      convert(SAMPLE_CSV, "sample CSV");
    });

    clearBtn?.addEventListener("click", () => {
      if (pasteInput) pasteInput.value = "";
      if (output) output.textContent = "";
      if (fileInput) fileInput.value = "";
      setMessage(statusEl, "Converter reset.");
    });

    copyBtn?.addEventListener("click", async () => {
      const text = output?.textContent || "";
      if (!text.trim()) {
        setMessage(statusEl, "Nothing to copy yet.", true);
        return;
      }
      const ok = await copyText(text);
      setMessage(statusEl, ok ? "JSON copied to clipboard." : "Clipboard access is blocked in this browser.", !ok);
    });

    downloadBtn?.addEventListener("click", () => {
      const text = output?.textContent || "";
      if (!text.trim()) {
        setMessage(statusEl, "Nothing to download yet.", true);
        return;
      }
      downloadText("converted.json", text, "application/json;charset=utf-8");
      setMessage(statusEl, "Downloaded converted.json.");
    });
  };

  const initJsonToCsv = () => {
    const fileInput = document.getElementById("j2cFileInput");
    const dropzone = document.getElementById("j2cDropzone");
    const pasteInput = document.getElementById("j2cPasteInput");
    const parseBtn = document.getElementById("j2cRun");
    const sampleBtn = document.getElementById("j2cSample");
    const copyBtn = document.getElementById("j2cCopy");
    const downloadBtn = document.getElementById("j2cDownload");
    const clearBtn = document.getElementById("j2cClear");
    const output = document.getElementById("j2cOutput");
    const statusEl = document.getElementById("j2cStatus");

    const convert = (text, source = "input") => {
      let parsedJson;
      try {
        parsedJson = JSON.parse(text);
      } catch (error) {
        setMessage(statusEl, "Invalid JSON. Please check syntax.", true);
        output.value = "";
        return;
      }

      let records;
      if (Array.isArray(parsedJson)) {
        records = parsedJson;
      } else if (parsedJson && typeof parsedJson === "object") {
        records = [parsedJson];
      } else {
        setMessage(statusEl, "JSON must be an object or an array of objects.", true);
        output.value = "";
        return;
      }

      if (records.length === 0) {
        output.value = "";
        setMessage(statusEl, "JSON array is empty.", true);
        return;
      }

      const primitiveMode = records.every((item) => item === null || typeof item !== "object");
      const headers = primitiveMode ? ["value"] : [];
      const headerSet = new Set(headers);

      if (!primitiveMode) {
        records.forEach((item) => {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            Object.keys(item).forEach((key) => {
              if (!headerSet.has(key)) {
                headerSet.add(key);
                headers.push(key);
              }
            });
          }
        });
      }

      const rows = records.map((item) => {
        if (primitiveMode) return [item == null ? "" : String(item)];
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return headers.map(() => "");
        }
        return headers.map((header) => {
          const value = item[header];
          if (value == null) return "";
          if (typeof value === "object") return JSON.stringify(value);
          return String(value);
        });
      });

      output.value = toDelimited(headers, rows, ",");
      setMessage(statusEl, `Converted ${formatNumber(rows.length)} records from ${source}.`);
    };

    const loadFile = async (file) => {
      try {
        const text = await readFileText(file);
        convert(text, file.name);
      } catch (error) {
        setMessage(statusEl, error.message || "Could not read file.", true);
      }
    };

    attachDropzone(dropzone, fileInput, loadFile);

    parseBtn?.addEventListener("click", () => {
      const text = pasteInput?.value || "";
      if (!text.trim()) {
        setMessage(statusEl, "Paste JSON input first.", true);
        return;
      }
      convert(text, "pasted JSON");
    });

    sampleBtn?.addEventListener("click", () => {
      if (pasteInput) pasteInput.value = SAMPLE_JSON;
      convert(SAMPLE_JSON, "sample JSON");
    });

    clearBtn?.addEventListener("click", () => {
      if (pasteInput) pasteInput.value = "";
      if (output) output.value = "";
      if (fileInput) fileInput.value = "";
      setMessage(statusEl, "Converter reset.");
    });

    copyBtn?.addEventListener("click", async () => {
      const text = output?.value || "";
      if (!text.trim()) {
        setMessage(statusEl, "Nothing to copy yet.", true);
        return;
      }
      const ok = await copyText(text);
      setMessage(statusEl, ok ? "CSV copied to clipboard." : "Clipboard access is blocked in this browser.", !ok);
    });

    downloadBtn?.addEventListener("click", () => {
      const text = output?.value || "";
      if (!text.trim()) {
        setMessage(statusEl, "Nothing to download yet.", true);
        return;
      }
      downloadText("converted.csv", text, "text/csv;charset=utf-8");
      setMessage(statusEl, "Downloaded converted.csv.");
    });
  };

  if (bodyTool === "csv-viewer") initCsvViewer();
  if (bodyTool === "csv-editor") initCsvEditor();
  if (bodyTool === "csv-to-json") initCsvToJson();
  if (bodyTool === "json-to-csv") initJsonToCsv();
  if (bodyTool === "tsv-viewer") initTsvViewer();
})();
