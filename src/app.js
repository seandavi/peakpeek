// app.js: wires the page together (SPEC.md §3). Owned by issue 6.
//
// The only file that touches the page's elements. Every file gets a card at once and
// loads on its own, so one failure stays on its own card. Parsed peaks stay in memory:
// the histogram bins are shared by every loaded file (ADR-0006), so whenever a file
// arrives, goes or is re-read, the bins are recomputed and every file re-summarised.
window.PeakPeek = window.PeakPeek || {};

(function (PeakPeek) {
  "use strict";

  const HISTOGRAM_BINS = 30; // ADR-0006
  const REJECTED_SHOWN = 20; // SPEC.md §3.2
  const BIG_FILE_LINES = 1000000; // ADR-0010
  const REJECTED_TEXT_CHARS = 80;
  // ADR-0008: stripped from the end of a name, repeatedly, to make the default label.
  const LABEL_EXTENSION = /\.(gz|bgz|bed|narrowpeak|broadpeak|csv|tsv|txt|tab)$/i;

  // Format → [name shown, why the page thinks so].
  const FORMATS = {
    bed3: ["BED3", "most lines have 3 columns: chromosome, start, end"],
    bed4: ["BED4", "most lines have 4 columns: BED3 plus a name"],
    bed5: ["BED5", "most lines have 5 columns: BED4 plus a score"],
    bed6: ["BED6", "most lines have 6 columns (BED5 plus strand), or more that aren't narrowPeak or broadPeak"],
    narrowPeak: ["narrowPeak", "most lines have 10 columns: BED6 plus signalValue, pValue, qValue and the summit"],
    broadPeak: ["broadPeak", "most lines have 9 columns: BED6 plus signalValue, pValue and qValue"],
    csv: ["CSV", "comma-separated, with a header naming the chromosome, start and end columns"],
    tsv: ["TSV", "tab-separated, with a header naming the chromosome, start and end columns"],
  };
  const CHROM_STYLES = { chr: "with chr", bare: "without chr", mixed: "mixed" };
  const SCORE_FIELDS = [["signal", "signalValue"], ["p", "pValue"], ["q", "qValue"]];

  // The side-by-side table and the summary CSV, one definition (SPEC.md §3.3, §3.4).
  // kind: how a value is shown; csvOnly: in the CSV but too wide for the page.
  const COLUMNS = [
    { head: "Label", kind: "text", get: (e) => labelOf(e) },
    { head: "Source", kind: "text", csvOnly: true, get: (e) => e.source },
    { head: "Format", kind: "text", get: (e) => FORMATS[e.parsed.format][0] },
    { head: "Coordinates", kind: "text", get: (e) => coordinatesName(e) },
    { head: "Peaks", kind: "int", get: (e) => e.summary.n },
    { head: "Min", kind: "int", get: (e) => e.summary.widths.min },
    { head: "Median", kind: "median", get: (e) => e.summary.widths.median },
    { head: "Mean", kind: "mean", get: (e) => e.summary.widths.mean },
    { head: "Max", kind: "int", get: (e) => e.summary.widths.max },
    { head: "Sum of widths", kind: "int", get: (e) => e.summary.widths.sum },
    { head: "Merged bp", kind: "int", get: (e) => e.summary.mergedBp },
    { head: "Chromosomes", kind: "int", get: (e) => e.summary.chromosomes },
    { head: "Off main chromosomes", kind: "int", get: (e) => e.summary.offMain },
    { head: "Duplicates", kind: "int", get: (e) => e.summary.duplicates },
    { head: "Overlapping", kind: "int", get: (e) => e.summary.overlapping },
    { head: "Over 100 kb", kind: "int", get: (e) => e.summary.over100kb },
    { head: "Lines skipped", kind: "int", get: (e) => e.parsed.skipped },
    { head: "Lines rejected", kind: "int", get: (e) => e.parsed.rejected.length },
    { head: "Chromosome style", kind: "text", get: (e) => CHROM_STYLES[e.summary.chromStyle] || "" },
  ].concat(
    ...SCORE_FIELDS.map(([field, name]) => [
      { head: name + " min", kind: "score", csvOnly: true, get: (e) => scoreEnd(e, field, 0) },
      { head: name + " max", kind: "score", csvOnly: true, get: (e) => scoreEnd(e, field, 1) },
    ])
  );

  const CSV_SETTINGS =
    "widths are end - start on 0-based half-open coordinates; BED is 0-based; CSV/TSV " +
    "coordinates as in the Coordinates column (ADR-0002); zero-width peaks rejected " +
    "(ADR-0001); exact duplicates counted (ADR-0003); merged bp joins overlapping and " +
    "touching peaks (ADR-0004); off main chromosomes means not numbered/X/Y/M/MT with or without chr";

  const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const ONE_DECIMAL = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
  const SCORE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

  const entries = [];
  let nextId = 1;
  const chartSVG = new WeakMap(); // chart element → the SVG text drawn in it, for download

  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const urlInput = document.getElementById("url-input");
  const cardsEl = document.getElementById("file-cards");
  const sideEl = document.getElementById("side-by-side");

  // ---- Adding files ----------------------------------------------------------------

  function addFile(file) {
    addEntry({
      source: file.name,
      sourceNote: fmtBytes(file.size),
      defaultLabel: labelFromName(file.name),
      read: () => PeakPeek.readFile(file),
    });
  }

  function addURL(url) {
    addEntry({ source: url, isURL: true, defaultLabel: labelFromURL(url), read: () => PeakPeek.readURL(url) });
  }

  function addEntry(options) {
    const entry = Object.assign(
      { id: nextId++, label: "", status: "loading", oneBased: false, text: null, parsed: null, summary: null },
      options
    );
    entries.push(entry);
    cardsEl.appendChild(buildCard(entry));
    renderCard(entry);
    entry.read().then(
      (text) => {
        if (!entries.includes(entry)) return;
        entry.text = text;
        parseEntry(entry);
        // Only a table can be re-read (the 1-based toggle), so only a table keeps its text.
        if (!isTable(entry)) entry.text = null;
        entry.status = "ready";
        refresh();
      },
      (err) => {
        if (!entries.includes(entry)) return;
        entry.status = "error";
        entry.error = err && err.message ? err.message : String(err);
        renderCard(entry);
      }
    );
  }

  function removeEntry(entry) {
    entries.splice(entries.indexOf(entry), 1);
    entry.card.remove();
    refresh();
  }

  /** Parses entry.text, and keeps what the card needs beyond summarise(). */
  function parseEntry(entry) {
    const parsed = PeakPeek.parsePeaks(entry.text, { oneBased: entry.oneBased });
    let minWidth = Infinity, maxWidth = 0, withChr = 0;
    const notGiven = { signal: 0, p: 0, q: 0 };
    for (const p of parsed.peaks) {
      const w = p.end - p.start;
      if (w < minWidth) minWidth = w;
      if (w > maxWidth) maxWidth = w;
      if (/^chr/i.test(p.chrom)) withChr++;
      // parse.js stores narrowPeak's -1 ("not given") as null.
      for (const [field] of SCORE_FIELDS) if (p[field] === null) notGiven[field]++;
    }
    entry.parsed = parsed;
    entry.lines = parsed.peaks.length + parsed.skipped + parsed.rejected.length;
    entry.minWidth = minWidth;
    entry.maxWidth = maxWidth;
    entry.withChr = withChr;
    entry.notGiven = notGiven;
  }

  /** Shared bins over every loaded file's widths (ADR-0006), then every file re-summarised. */
  function refresh() {
    const ready = readyEntries();
    let min = Infinity, max = 0;
    for (const e of ready) {
      if (!e.parsed.peaks.length) continue;
      min = Math.min(min, e.minWidth);
      max = Math.max(max, e.maxWidth);
    }
    const bins = max > 0 ? PeakPeek.logBins(min, max, HISTOGRAM_BINS) : undefined;
    for (const e of ready) e.summary = PeakPeek.summarise(e.parsed.peaks, { bins });
    renderAll();
  }

  function readyEntries() {
    return entries.filter((e) => e.status === "ready");
  }

  // ---- Rendering ---------------------------------------------------------------------

  function renderAll() {
    entries.forEach(renderCard);
    renderSideBySide();
  }

  /** The parts of a card that persist: label, remove button, source, 1-based toggle. */
  function buildCard(entry) {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.id = String(entry.id);
    card.innerHTML =
      '<div class="card-head">' +
      '<input class="card-label" type="text" data-action="label" spellcheck="false" aria-label="Label">' +
      '<button type="button" class="button-quiet" data-action="remove">Remove</button>' +
      "</div>" +
      '<p class="card-source muted"></p>' +
      '<div class="card-coords" hidden><label><input type="checkbox" data-action="one-based"> ' +
      "This table's coordinates are 1-based</label></div>" +
      '<div class="card-body"></div>';
    card.querySelector(".card-label").value = entry.defaultLabel;
    const source = card.querySelector(".card-source");
    if (entry.isURL) {
      source.innerHTML = '<a target="_blank" rel="noopener noreferrer"></a>';
      source.firstChild.href = entry.source;
      source.firstChild.textContent = entry.source;
    } else {
      source.textContent = entry.source + " · " + entry.sourceNote;
    }
    entry.card = card;
    return card;
  }

  function renderCard(entry) {
    const card = entry.card;
    card.classList.toggle("is-error", entry.status === "error");
    card.setAttribute("aria-label", labelOf(entry));
    card.querySelector(".card-coords").hidden = !(entry.status === "ready" && isTable(entry));
    card.querySelector('[data-action="one-based"]').checked = entry.oneBased;
    const body = card.querySelector(".card-body");
    if (entry.status === "loading") {
      body.innerHTML = '<p class="muted card-status">Loading…</p>' +
        '<progress aria-label="Loading ' + esc(labelOf(entry)) + '"></progress>';
    } else if (entry.status === "error") {
      body.innerHTML = '<p class="error" role="alert">' + esc(entry.error) + "</p>";
    } else {
      body.innerHTML = cardHTML(entry);
      drawCharts(body);
    }
  }

  function cardHTML(e) {
    const s = e.summary, w = s.widths, parsed = e.parsed;
    const format = FORMATS[parsed.format];
    let html = "";
    if (e.lines > BIG_FILE_LINES) {
      html += '<p class="warning">This file has ' + fmtInt(e.lines) + " lines, more than " +
        fmtInt(BIG_FILE_LINES) + ". It's been read in full, but the page may be slow and use a lot of memory.</p>";
    }

    html += '<div class="facts">';
    html += factsTable("File", [
      ["Format", esc(format[0]) + ' <span class="muted">(' + esc(format[1]) + ")</span>"],
      ["Chromosome style", chromStyleHTML(e)],
      ["Coordinates", esc(coordinatesText(e))],
      ["Lines", fmtInt(e.lines)],
    ]);
    html += factsTable("Counts", [
      ["Peaks accepted", fmtInt(s.n), true],
      ["Lines skipped", fmtInt(parsed.skipped), true, "headers, track, browser, # and blank lines"],
      ["Lines rejected", fmtInt(parsed.rejected.length), true],
    ]);
    html += factsTable("Widths (bp)", [
      ["Min", fmtInt(w.min), true],
      ["Median", fmtMedian(w.median), true],
      ["Mean", fmtMean(w.mean), true],
      ["Max", fmtInt(w.max), true],
      ["Sum of widths", fmtInt(w.sum), true],
      ["Merged bp", fmtInt(s.mergedBp), true, "overlapping and touching peaks joined"],
    ]);
    if (parsed.format === "narrowPeak" || parsed.format === "broadPeak") {
      html += factsTable("Scores", SCORE_FIELDS.map(([field, name]) => [name, scoreHTML(e, field)]));
    }
    html += "</div>";

    html += "<h3>Problems</h3>";
    const problems = problemList(e);
    html += problems.length
      ? '<ul class="problems">' + problems.map((p) => "<li>" + p + "</li>").join("") + "</ul>"
      : '<p class="muted">None found.</p>';
    if (parsed.rejected.length) html += rejectedHTML(parsed.rejected);

    html += '<div class="charts">' + chartFigure("histogram") + chartFigure("chromosomes") + "</div>";
    html += '<p class="downloads"><button type="button" class="button-quiet" data-action="download-csv">Download summary (CSV)</button></p>';
    return html;
  }

  /** A titled two-column table; rows are [name, html, isNumber?, note?]. */
  function factsTable(title, rows) {
    return '<section class="facts-group"><h3>' + esc(title) + "</h3><table><tbody>" +
      rows.map(([name, html, isNumber, note]) =>
        "<tr><th scope=\"row\">" + esc(name) +
        (note ? ' <span class="muted facts-note">' + esc(note) + "</span>" : "") +
        "</th><td" + (isNumber ? ' class="number"' : "") + ">" + html + "</td></tr>"
      ).join("") + "</tbody></table></section>";
  }

  function chromStyleHTML(e) {
    const style = e.summary.chromStyle;
    if (style === "chr") return "<code>chr1</code>";
    if (style === "bare") return "<code>1</code> (no <code>chr</code>)";
    if (style === "mixed") return '<span class="warning-text">mixed <code>chr1</code> and <code>1</code></span>';
    return '<span class="muted">none: no peaks</span>';
  }

  function scoreHTML(e, field) {
    const range = e.summary.scores && e.summary.scores[field];
    const missing = e.notGiven[field];
    if (!range) {
      return '<span class="muted">not given' + (missing === e.summary.n ? " (−1 in every peak)" : "") + "</span>";
    }
    let html = fmtScore(range[0]) + " – " + fmtScore(range[1]);
    if (missing) {
      html += ' <span class="muted">(−1, “not given”, in ' + fmtInt(missing) + " " + plural(missing, "peak") + ": left out)</span>";
    }
    return html;
  }

  /** ADR-0011: each problem says how many peaks (or lines) it affects. */
  function problemList(e) {
    const s = e.summary, out = [];
    const count = (n, word) => "<strong>" + fmtInt(n) + "</strong> " + plural(n, word);
    if (e.parsed.rejected.length) {
      out.push(count(e.parsed.rejected.length, "line") + " rejected, so not counted as peaks (listed below)");
    }
    if (s.duplicates) {
      out.push(count(s.duplicates, "peak") + " " + verb(s.duplicates, "is an exact duplicate", "are exact duplicates") +
        " of another: counted, not dropped");
    }
    if (s.overlapping) {
      out.push(count(s.overlapping, "peak") + " " + verb(s.overlapping, "overlaps", "overlap") +
        " another peak: sum of widths " + fmtInt(s.widths.sum) +
        " bp, merged " + fmtInt(s.mergedBp) + " bp");
    }
    if (s.chromStyle === "mixed") {
      out.push("Chromosome names are mixed: " + count(e.withChr, "peak") + " written like <code>chr1</code>, " +
        count(s.n - e.withChr, "peak") + " like <code>1</code>");
    }
    if (s.offMain) {
      out.push(count(s.offMain, "peak") + " off the main chromosomes (numbered, X, Y, M), shown as “other”");
    }
    if (s.over100kb) out.push(count(s.over100kb, "peak") + " wider than 100 kb");
    return out;
  }

  function rejectedHTML(rejected) {
    const shown = rejected.slice(0, REJECTED_SHOWN);
    let html = '<div class="table-scroll"><table class="rejected"><caption>Rejected lines' +
      (rejected.length > shown.length ? ": the first " + shown.length + " of " + fmtInt(rejected.length) : "") +
      '</caption><thead><tr><th class="number" scope="col">Line</th><th scope="col">Reason</th>' +
      '<th scope="col">Text</th></tr></thead><tbody>';
    for (const r of shown) {
      const text = r.text.length > REJECTED_TEXT_CHARS ? r.text.slice(0, REJECTED_TEXT_CHARS - 1) + "…" : r.text;
      html += '<tr><td class="number">' + fmtInt(r.line) + "</td><td>" + esc(r.reason) + "</td><td><code>" +
        esc(text.replace(/\t/g, " ⇥ ")) + "</code></td></tr>";
    }
    html += "</tbody></table></div>";
    if (rejected.length > shown.length) {
      html += '<p class="muted">…and ' + fmtInt(rejected.length - shown.length) + " more.</p>";
    }
    return html;
  }

  function chartFigure(kind) {
    return '<figure class="chart-figure"><div class="chart" data-chart="' + kind + '"></div>' +
      '<button type="button" class="button-quiet" data-action="download-svg">Download SVG</button></figure>';
  }

  function renderSideBySide() {
    const ready = readyEntries();
    sideEl.hidden = ready.length < 2;
    if (ready.length < 2) {
      sideEl.innerHTML = "";
      return;
    }
    const columns = COLUMNS.filter((c) => !c.csvOnly);
    let html = "<h2>Side by side</h2>" +
      '<p class="muted">Widths in bp; means rounded. The charts share their axes and show each ' +
      "file's share of its own peaks. Chromosomes line up by name without <code>chr</code>.</p>";
    html += '<div class="table-scroll"><table class="side-table"><thead><tr>' +
      columns.map((c) => '<th scope="col"' + (isNumeric(c) ? ' class="number"' : "") + ">" + esc(c.head) + "</th>").join("") +
      "</tr></thead><tbody>" +
      ready.map((e) => "<tr>" + columns.map((c, i) => {
        const cell = cellHTML(c, c.get(e));
        return i === 0 ? '<th scope="row">' + cell + "</th>" : "<td" + (isNumeric(c) ? ' class="number"' : "") + ">" + cell + "</td>";
      }).join("") + "</tr>").join("") +
      "</tbody></table></div>";
    html += '<p class="downloads"><button type="button" class="button-quiet" data-action="download-csv">Download summary (CSV)</button></p>';
    html += '<div class="charts charts-wide">' + chartFigure("histogram") + chartFigure("chromosomes") + "</div>";
    sideEl.innerHTML = html;
    drawCharts(sideEl);
  }

  // ---- Charts ------------------------------------------------------------------------

  function drawCharts(container) {
    container.querySelectorAll("[data-chart]").forEach(drawChart);
  }

  /** On a card: that file, in peaks. Side by side: every loaded file, as fractions. */
  function drawChart(el) {
    const card = el.closest(".card");
    const files = card ? [entryOf(card)] : readyEntries();
    const summaries = files.map((e) => ({
      label: labelOf(e), n: e.summary.n, histogram: e.summary.histogram, perChrom: e.summary.perChrom,
    }));
    const draw = el.dataset.chart === "histogram" ? PeakPeek.histogramSVG : PeakPeek.chromBarsSVG;
    const svg = draw(summaries, { width: el.clientWidth || undefined, y: card ? "count" : "fraction" });
    el.innerHTML = svg;
    chartSVG.set(el, svg);
  }

  // Charts are drawn to their container's width, so a changed window redraws them.
  let resizeTimer = 0;
  let drawnWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth === drawnWidth) return;
      drawnWidth = window.innerWidth;
      document.querySelectorAll("[data-chart]").forEach(drawChart);
    }, 150);
  });

  // ---- Downloads ---------------------------------------------------------------------

  function downloadSVG(button) {
    const chart = button.closest(".chart-figure").querySelector("[data-chart]");
    const card = button.closest(".card");
    const what = chart.dataset.chart === "histogram" ? "widths" : "chromosomes";
    const name = card ? fileSafe(labelOf(entryOf(card))) : "peakpeek-side-by-side";
    saveFile(name + "-" + what + ".svg", chartSVG.get(chart), "image/svg+xml");
  }

  function downloadCSV(button) {
    const card = button.closest(".card");
    const files = card ? [entryOf(card)] : readyEntries();
    const name = card ? fileSafe(labelOf(files[0])) + "-summary.csv" : "peakpeek-summary.csv";
    saveFile(name, summaryCSV(files), "text/csv");
  }

  /** SPEC.md §3.4: one row per file; the first line starts with # and gives the date and settings. */
  function summaryCSV(files) {
    const lines = ["# PeakPeek summary; created " + new Date().toISOString() + "; " + CSV_SETTINGS];
    lines.push(COLUMNS.map((c) => csvField(c.head)).join(","));
    for (const e of files) lines.push(COLUMNS.map((c) => csvField(csvValue(c, c.get(e)))).join(","));
    return lines.join("\n") + "\n";
  }

  function saveFile(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---- Events ------------------------------------------------------------------------

  function hasFiles(event) {
    return Boolean(event.dataTransfer) && Array.from(event.dataTransfer.types).includes("Files");
  }

  let dragDepth = 0; // dragenter/dragleave fire for every child the pointer crosses
  dropZone.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth++;
    dropZone.classList.add("is-dragover");
  });
  dropZone.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  dropZone.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropZone.classList.remove("is-dragover");
  });
  dropZone.addEventListener("drop", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    dropZone.classList.remove("is-dragover");
    Array.from(event.dataTransfer.files).forEach(addFile);
  });
  // A file dropped beside the zone would otherwise replace the page with the file.
  window.addEventListener("dragover", (event) => {
    if (!hasFiles(event) || dropZone.contains(event.target)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "none";
  });
  window.addEventListener("drop", (event) => {
    if (hasFiles(event) && !dropZone.contains(event.target)) event.preventDefault();
  });

  fileInput.addEventListener("change", () => {
    Array.from(fileInput.files).forEach(addFile);
    fileInput.value = ""; // so choosing the same file again still loads it
  });

  document.getElementById("url-load").addEventListener("click", () => {
    urlInput.value.split(/\r\n|\n|\r/).map((u) => u.trim()).filter(Boolean).forEach(addURL);
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "remove") removeEntry(entryOf(button.closest(".card")));
    else if (action === "download-svg") downloadSVG(button);
    else if (action === "download-csv") downloadCSV(button);
  });

  cardsEl.addEventListener("input", (event) => {
    if (event.target.dataset.action !== "label") return;
    const entry = entryOf(event.target.closest(".card"));
    entry.label = event.target.value;
    renderCard(entry);
    renderSideBySide();
  });

  cardsEl.addEventListener("change", (event) => {
    if (event.target.dataset.action !== "one-based") return;
    const entry = entryOf(event.target.closest(".card"));
    entry.oneBased = event.target.checked;
    parseEntry(entry);
    refresh();
  });

  // ---- Small helpers -----------------------------------------------------------------

  function entryOf(card) {
    return entries.find((e) => String(e.id) === card.dataset.id);
  }

  function labelOf(entry) {
    return entry.label.trim() || entry.defaultLabel;
  }

  function isTable(entry) {
    return entry.parsed.format === "csv" || entry.parsed.format === "tsv";
  }

  function coordinatesName(e) {
    return isTable(e) ? (e.oneBased ? "1-based" : "0-based") : "0-based (BED)";
  }

  function coordinatesText(e) {
    if (!isTable(e)) return "0-based, half-open: BED always is";
    return e.oneBased
      ? "1-based, as you've said: each start has 1 taken off"
      : "0-based, half-open: assumed, because tables don't say (tick the box above if it's 1-based)";
  }

  function scoreEnd(e, field, end) {
    const range = e.summary.scores && e.summary.scores[field];
    return range ? range[end] : null;
  }

  /** ADR-0008: the file name without its extensions. */
  function labelFromName(name) {
    let label = name;
    while (LABEL_EXTENSION.test(label)) label = label.replace(LABEL_EXTENSION, "");
    return label || name;
  }

  /** ADR-0008: a URL's last path segment, without its extensions. */
  function labelFromURL(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      return url;
    }
    const segment = parsed.pathname.split("/").filter(Boolean).pop();
    if (!segment) return parsed.host || url;
    let name = segment;
    try {
      name = decodeURIComponent(segment);
    } catch (err) {
      // A malformed %-escape: keep the segment as written.
    }
    return labelFromName(name);
  }

  function isNumeric(column) {
    return column.kind !== "text";
  }

  function cellHTML(column, value) {
    if (value === null || value === undefined) return "";
    if (column.kind === "int") return fmtInt(value);
    if (column.kind === "median") return fmtMedian(value);
    if (column.kind === "mean") return fmtMean(value);
    if (column.kind === "score") return fmtScore(value);
    return esc(value);
  }

  function csvValue(column, value) {
    if (value === null || value === undefined) return "";
    if (column.kind === "mean") return value.toFixed(2);
    return String(value);
  }

  function csvField(value) {
    return /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
  }

  function fmtInt(n) {
    return n === null || n === undefined ? "–" : INT.format(n);
  }

  // A median of an even count can end in .5.
  function fmtMedian(n) {
    return n === null || n === undefined ? "–" : ONE_DECIMAL.format(n);
  }

  // SPEC.md §2: means are rounded. The exact value is in the tooltip.
  function fmtMean(n) {
    return n === null || n === undefined ? "–" : '<span title="' + n.toFixed(2) + '">' + INT.format(n) + "</span>";
  }

  function fmtScore(n) {
    return SCORE.format(n);
  }

  function fmtBytes(bytes) {
    if (bytes < 1024) return bytes + " bytes";
    if (bytes < 1024 * 1024) return ONE_DECIMAL.format(bytes / 1024) + " KB";
    return ONE_DECIMAL.format(bytes / (1024 * 1024)) + " MB";
  }

  function plural(n, word) {
    return n === 1 ? word : word + "s";
  }

  function verb(n, singular, pluralForm) {
    return n === 1 ? singular : pluralForm;
  }

  function fileSafe(name) {
    return name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "peakpeek";
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
})(window.PeakPeek);
