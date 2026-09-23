// parse.js: text → peaks, skipped, rejected, format (SPEC.md §4). Owned by issue 3.
//
// Coordinates come out 0-based half-open, whatever the input. Lines that are legal but
// not peaks (track, browser, #, blank, a table's header) are skipped and counted; lines
// that should be peaks but can't be are rejected with a 1-based line number and a reason.
window.PeakPeek = window.PeakPeek || {};

(function (PeakPeek) {
  "use strict";

  // ADR-0005: the first matching column wins. Lower case, because any case is accepted.
  var CHROM_NAMES = ["chr", "chrom", "chromosome", "seqnames"];
  var START_NAMES = ["start", "chromstart"];
  var END_NAMES = ["end", "chromend"];
  var NO_HEADER_REASON =
    "no header naming the chromosome, start and end columns (looked for chr, chrom, " +
    "chromosome or seqnames; start or chromStart; end or chromEnd, in any case)";

  var BED_FORMATS = { 3: "bed3", 4: "bed4", 5: "bed5", 6: "bed6" };
  var ITEM_RGB = /^\d{1,3},\d{1,3},\d{1,3}$/;

  /** track, browser, # and blank lines are legal in BED, and not peaks (SPEC.md §5). */
  function isSkippable(line) {
    return line.trim() === "" || line.charAt(0) === "#" || /^(track|browser)(\s|$)/.test(line);
  }

  /** Splits on `delimiter`, honouring double quotes ("" is a quote), as R writes them. */
  function splitDelimited(line, delimiter) {
    if (line.indexOf('"') < 0) return line.split(delimiter);
    var fields = [];
    var field = "";
    var quoted = false;
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (quoted) {
        if (c === '"' && line.charAt(i + 1) === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === delimiter) { fields.push(field); field = ""; }
      else field += c;
    }
    fields.push(field);
    return fields;
  }

  /** BED is tab-separated; a line with no tabs may use runs of spaces instead. */
  function splitBedLine(line) {
    return line.indexOf("\t") >= 0 ? line.split("\t") : line.trim().split(/ +/);
  }

  function findColumn(header, names) {
    for (var i = 0; i < header.length; i++) {
      if (names.indexOf(header[i]) >= 0) return i;
    }
    return -1;
  }

  /** The chrom/start/end column indexes if `header` names all three, else null. */
  function tableColumns(header) {
    var names = header.map(function (h) { return h.trim().toLowerCase(); });
    var columns = {
      chrom: findColumn(names, CHROM_NAMES),
      start: findColumn(names, START_NAMES),
      end: findColumn(names, END_NAMES),
    };
    return columns.chrom < 0 || columns.start < 0 || columns.end < 0 ? null : columns;
  }

  /**
   * A coordinate: a non-negative whole number, written plainly or in scientific notation
   * with a whole mantissa and a non-negative exponent (1e+03, 1E5). Returns
   * {value} or {reason}. 1.5e2 is refused even though it's whole (SPEC.md §5).
   */
  function parseCoordinate(field, what) {
    var text = field.trim();
    if (text === "") return { reason: what + " is empty" };
    var value;
    if (/^\d+$/.test(text)) value = Number(text);
    else if (/^\d+[eE]\+?\d+$/.test(text)) value = Number(text);
    else if (/^-\d/.test(text)) return { reason: what + " is negative: " + text };
    else if (/^\d*\.?\d+([eE][+-]?\d+)?$/.test(text)) {
      return { reason: what + " is not a whole number: " + text };
    } else return { reason: what + " is not a number: " + text };
    if (!Number.isSafeInteger(value)) return { reason: what + " is too large: " + text };
    return { value: value };
  }

  /** An optional numeric column; "." and junk become null. */
  function parseScore(field) {
    var value = Number(field);
    return field.trim() === "" || isNaN(value) ? null : value;
  }

  /** narrowPeak/broadPeak write -1 for "not given" (SPEC.md §5): stored as null. */
  function parseSignal(field) {
    var value = parseScore(field);
    return value === -1 ? null : value;
  }

  /**
   * Checks chrom, start and end, and shifts a 1-based start to 0-based. Returns
   * {chrom, start, end} or {reason}.
   */
  function parseInterval(chromField, startField, endField, oneBased) {
    var chrom = chromField.trim();
    if (chrom === "") return { reason: "chromosome is empty" };
    var start = parseCoordinate(startField, "start");
    if (start.reason) return start;
    var end = parseCoordinate(endField, "end");
    if (end.reason) return end;
    if (oneBased && start.value === 0) return { reason: "start is 0, but the file is read as 1-based" };
    var s = oneBased ? start.value - 1 : start.value;
    if (end.value === s) return { reason: "zero width" }; // ADR-0001
    if (end.value < s) return { reason: "end before start" };
    return { chrom: chrom, start: s, end: end.value };
  }

  /** A BED-like line's fields, named by its own column count. */
  function bedPeak(interval, fields) {
    var peak = { chrom: interval.chrom, start: interval.start, end: interval.end };
    var n = fields.length;
    if (n >= 4) peak.name = fields[3];
    if (n >= 5) peak.score = parseScore(fields[4]);
    if (n === 10 || (n === 9 && !ITEM_RGB.test(fields[8].trim()))) {
      peak.signal = parseSignal(fields[6]);
      peak.p = parseSignal(fields[7]);
      peak.q = parseSignal(fields[8]);
    }
    return peak;
  }

  /**
   * The format of a BED-like file, from its accepted lines' column counts: the most
   * common count wins. 9 columns is broadPeak unless column 9 is an itemRgb (BED9).
   * More than 6 columns that isn't narrowPeak or broadPeak is BED6 plus extras.
   */
  function bedFormat(columnCounts, sawItemRgb) {
    var best = 3;
    var bestCount = 0;
    Object.keys(columnCounts).forEach(function (n) {
      if (columnCounts[n] > bestCount) { best = Number(n); bestCount = columnCounts[n]; }
    });
    if (best === 10) return "narrowPeak";
    if (best === 9 && !sawItemRgb) return "broadPeak";
    return BED_FORMATS[Math.min(best, 6)];
  }

  function splitLines(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // a byte-order mark
    var lines = text.split(/\r\n|\n|\r/);
    if (lines[lines.length - 1] === "") lines.pop(); // the final newline ends a line
    return lines;
  }

  /**
   * Three or more comma-separated fields, no tabs, and not a space-separated BED line:
   * a table without the header it needs (ADR-0005), so every line is rejected.
   */
  function looksLikeHeaderlessCsv(line) {
    if (line.indexOf("\t") >= 0 || splitDelimited(line, ",").length < 3) return false;
    var fields = splitBedLine(line);
    return fields.length < 3 || Boolean(parseInterval(fields[0], fields[1], fields[2], false).reason);
  }

  /**
   * The first line that isn't skippable, if it's a table's header, as
   * {index, delimiter, columns}; columns is null for a table with no usable header.
   * Null for a BED-like file.
   */
  function findTableHeader(lines) {
    for (var i = 0; i < lines.length; i++) {
      if (isSkippable(lines[i])) continue;
      var delimiters = [",", "\t"];
      for (var d = 0; d < delimiters.length; d++) {
        var columns = tableColumns(splitDelimited(lines[i], delimiters[d]));
        if (columns) return { index: i, delimiter: delimiters[d], columns: columns };
      }
      if (looksLikeHeaderlessCsv(lines[i])) return { index: i, delimiter: ",", columns: null };
      return null;
    }
    return null;
  }

  /**
   * PeakPeek.parsePeaks(text, {oneBased}) → {format, peaks, skipped, rejected}
   * (SPEC.md §4). oneBased applies to CSV/TSV only; BED is always 0-based (ADR-0002).
   */
  PeakPeek.parsePeaks = function (text, options) {
    var oneBased = Boolean(options && options.oneBased);
    var lines = splitLines(text);
    var peaks = [];
    var rejected = [];
    var skipped = 0;
    var table = findTableHeader(lines);

    if (table) {
      var c = table.columns;
      var needed = c ? Math.max(c.chrom, c.start, c.end) + 1 : 0;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (i < table.index || isSkippable(line)) { skipped++; continue; }
        if (!c) { rejected.push({ line: i + 1, text: line, reason: NO_HEADER_REASON }); continue; }
        if (i === table.index) { skipped++; continue; }
        var fields = splitDelimited(line, table.delimiter);
        if (fields.length < needed) {
          rejected.push({ line: i + 1, text: line, reason: "too few columns (" + fields.length + ")" });
          continue;
        }
        var interval = parseInterval(fields[c.chrom], fields[c.start], fields[c.end], oneBased);
        if (interval.reason) rejected.push({ line: i + 1, text: line, reason: interval.reason });
        else peaks.push(interval);
      }
      return {
        format: table.delimiter === "," ? "csv" : "tsv",
        peaks: peaks,
        skipped: skipped,
        rejected: rejected,
      };
    }

    var columnCounts = {};
    var sawItemRgb = false;
    for (var j = 0; j < lines.length; j++) {
      var bedLine = lines[j];
      if (isSkippable(bedLine)) { skipped++; continue; }
      var bedFields = splitBedLine(bedLine.replace(/\s+$/, ""));
      if (bedFields.length < 3) {
        rejected.push({ line: j + 1, text: bedLine, reason: "too few columns (" + bedFields.length + ")" });
        continue;
      }
      var bedInterval = parseInterval(bedFields[0], bedFields[1], bedFields[2], false);
      if (bedInterval.reason) {
        rejected.push({ line: j + 1, text: bedLine, reason: bedInterval.reason });
        continue;
      }
      var n = bedFields.length;
      columnCounts[n] = (columnCounts[n] || 0) + 1;
      if (n === 9 && ITEM_RGB.test(bedFields[8].trim())) sawItemRgb = true;
      peaks.push(bedPeak(bedInterval, bedFields));
    }
    return {
      format: bedFormat(columnCounts, sawItemRgb),
      peaks: peaks,
      skipped: skipped,
      rejected: rejected,
    };
  };
})(window.PeakPeek);
