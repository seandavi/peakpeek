// Statistics: peaks → numbers (SPEC.md §4, issue 4).
// Input is parsePeaks's peaks array: [{chrom, start, end, name?, score?, signal?, p?, q?}],
// 0-based half-open, with null (or a missing field) meaning "not given".
window.PeakPeek = window.PeakPeek || {};

(function () {
  // chr1–chr19 (and chr20–22 for human), X, Y, M/MT, with or without "chr" (SPEC §2).
  var MAIN_CHROM = /^(chr)?([0-9]+|X|Y|M|MT)$/i;
  var WIDE_PEAK = 100000; // "widths over 100 kb" (ADR-0011)

  // Sort key for a chromosome name: [rank, number, rest]. Main chromosomes rank 0–3;
  // anything else ranks 4 and falls back to a natural sort of the whole name.
  function chromKey(name) {
    var m = MAIN_CHROM.exec(name);
    if (!m) return [4, 0, name];
    var core = m[2].toUpperCase();
    if (core === "X") return [1, 0, name];
    if (core === "Y") return [2, 0, name];
    if (core === "M" || core === "MT") return [3, 0, name];
    return [0, Number(core), name];
  }

  // Natural sort for names that aren't main chromosomes: digit runs compare as numbers,
  // so "chrUn_2" < "chrUn_10".
  function naturalCompare(a, b) {
    var ra = a.match(/\d+|\D+/g) || [];
    var rb = b.match(/\d+|\D+/g) || [];
    for (var i = 0; i < ra.length && i < rb.length; i++) {
      var x = ra[i], y = rb[i];
      var dx = /^\d/.test(x), dy = /^\d/.test(y);
      if (dx && dy) {
        var d = Number(x) - Number(y);
        if (d !== 0) return d;
      } else if (x !== y) {
        return x < y ? -1 : 1;
      }
    }
    return ra.length - rb.length;
  }

  function naturalChromOrder(a, b) {
    var ka = chromKey(a), kb = chromKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    if (ka[0] === 4) {
      var c = naturalCompare(a, b);
      if (c !== 0) return c;
    }
    // Same chromosome written two ways ("chr1" and "1", "chrM" and "MT"): keep it stable.
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function logBins(minWidth, maxWidth, n) {
    if (n === undefined) n = 30;
    if (!(minWidth > 0) || !isFinite(maxWidth) || !(n >= 1)) {
      throw new RangeError("logBins needs 0 < minWidth, a finite maxWidth and n ≥ 1");
    }
    // One width only: widen so the edges still increase.
    if (maxWidth <= minWidth) maxWidth = minWidth + 1;
    var lo = Math.log(minWidth), step = (Math.log(maxWidth) - lo) / n;
    var edges = [minWidth];
    for (var i = 1; i < n; i++) edges.push(Math.exp(lo + i * step));
    edges.push(maxWidth);
    return edges;
  }

  // Index of the bin holding w: the last edge ≤ w, clamped to the end bins, so a width
  // equal to the top edge (or outside the edges) lands in the first or last bin.
  function binIndex(edges, w) {
    var lo = 0, hi = edges.length - 2;
    if (w < edges[1]) return 0;
    if (w >= edges[hi]) return hi;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (edges[mid] <= w) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // Range of one score field, leaving out null/missing and narrowPeak's -1 ("not given").
  function scoreRange(peaks, field) {
    var min = Infinity, max = -Infinity;
    for (var i = 0; i < peaks.length; i++) {
      var v = peaks[i][field];
      if (v == null || v === -1) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return min === Infinity ? null : [min, max];
  }

  function summarise(peaks, options) {
    var bins = options && options.bins;
    var n = peaks.length;
    var widths = new Float64Array(n);
    var sum = 0, over100kb = 0;
    var byChrom = new Map(); // chrom → indices into peaks
    for (var i = 0; i < n; i++) {
      var p = peaks[i];
      var w = p.end - p.start;
      widths[i] = w;
      sum += w;
      if (w > WIDE_PEAK) over100kb++;
      var list = byChrom.get(p.chrom);
      if (list) list.push(i); else byChrom.set(p.chrom, [i]);
    }
    widths.sort();

    // Per chromosome, sorted by start then end: merged bp (overlapping and touching peaks
    // join, ADR-0004), exact duplicates (ADR-0003) and peaks overlapping another peak
    // (touching doesn't count; each copy of a duplicate counts, ADR-0011).
    var mergedBp = 0, duplicates = 0, overlapping = 0;
    byChrom.forEach(function (idx) {
      var iv = idx.map(function (k) { return [peaks[k].start, peaks[k].end]; });
      iv.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      var runStart = iv[0][0], runEnd = iv[0][1];
      var maxEnd = -Infinity;
      for (var j = 0; j < iv.length; j++) {
        var s = iv[j][0], e = iv[j][1];
        if (j > 0 && s === iv[j - 1][0] && e === iv[j - 1][1]) duplicates++;
        if (s <= runEnd) {
          if (e > runEnd) runEnd = e;
        } else {
          mergedBp += runEnd - runStart;
          runStart = s;
          runEnd = e;
        }
        // Overlaps an earlier-sorted peak, or the next one (which starts no earlier).
        var overlapsEarlier = s < maxEnd;
        var overlapsLater = j + 1 < iv.length && iv[j + 1][0] < e;
        if (overlapsEarlier || overlapsLater) overlapping++;
        if (e > maxEnd) maxEnd = e;
      }
      mergedBp += runEnd - runStart;
    });

    var names = Array.from(byChrom.keys());
    var withChr = names.filter(function (c) { return /^chr/i.test(c); }).length;
    var chromStyle = n === 0 ? null
      : withChr === names.length ? "chr" : withChr === 0 ? "bare" : "mixed";

    var perChrom = [], offMain = 0;
    names.sort(naturalChromOrder).forEach(function (c) {
      var count = byChrom.get(c).length;
      if (MAIN_CHROM.test(c)) perChrom.push({ chrom: c, n: count });
      else offMain += count;
    });
    if (offMain > 0) perChrom.push({ chrom: "other", n: offMain });

    var edges = bins || (n > 0 ? logBins(Math.max(widths[0], 1), widths[n - 1]) : null);
    var histogram = [];
    if (edges) {
      for (var b = 0; b + 1 < edges.length; b++) {
        histogram.push({ from: edges[b], to: edges[b + 1], n: 0 });
      }
      for (var h = 0; h < n; h++) histogram[binIndex(edges, widths[h])].n++;
    }

    var summary = {
      n: n,
      widths: n === 0
        ? { min: null, median: null, mean: null, max: null, sum: 0 }
        : {
          min: widths[0],
          median: n % 2 ? widths[(n - 1) / 2] : (widths[n / 2 - 1] + widths[n / 2]) / 2,
          mean: sum / n,
          max: widths[n - 1],
          sum: sum,
        },
      mergedBp: mergedBp,
      duplicates: duplicates,
      chromStyle: chromStyle,
      perChrom: perChrom,
      histogram: histogram,
      // For the Problems list (ADR-0011) and the §2 table's "Chromosomes" column.
      chromosomes: names.length,
      offMain: offMain,
      overlapping: overlapping,
      over100kb: over100kb,
    };

    var scores = {};
    ["signal", "p", "q"].forEach(function (field) {
      var range = scoreRange(peaks, field);
      if (range) scores[field] = range;
    });
    if (Object.keys(scores).length) summary.scores = scores;
    return summary;
  }

  PeakPeek.logBins = logBins;
  PeakPeek.summarise = summarise;
  PeakPeek.naturalChromOrder = naturalChromOrder;
})();
