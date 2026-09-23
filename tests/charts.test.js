// Tests for charts.js (SPEC.md §4, §8 issue 5). Inputs are built here, in the shape
// stats.js returns, so these tests don't depend on stats.js.
(function (PeakPeek) {
  "use strict";
  const { test, assert } = PeakPeek;

  // Parse an SVG string the way a browser opening the saved file would.
  function parse(svg) {
    assert.equal(typeof svg, "string", "returns a string");
    assert.equal(svg.includes("NaN"), false, "no NaN in the SVG");
    assert.equal(svg.includes("undefined"), false, "no undefined in the SVG");
    assert.equal(svg.includes("Infinity"), false, "no Infinity in the SVG");
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const error = doc.getElementsByTagName("parsererror")[0];
    assert.equal(error ? error.textContent : null, null, "parses as XML");
    assert.equal(doc.documentElement.localName, "svg");
    assert.equal(doc.documentElement.namespaceURI, "http://www.w3.org/2000/svg", "xmlns is set");
    return doc;
  }

  // Log-spaced bins like PeakPeek.logBins would give, with counts from fn(midpoint).
  function bins(lo, hi, fn, n = 30) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const from = lo * Math.pow(hi / lo, i / n), to = lo * Math.pow(hi / lo, (i + 1) / n);
      out.push({ from, to, n: fn(Math.sqrt(from * to)) });
    }
    return out;
  }

  const texts = (doc) => [...doc.querySelectorAll("text")].map((t) => t.textContent);
  const barsOf = (doc, file) => [...doc.querySelectorAll(`rect[data-file="${file}"]`)];
  const groups = (doc) => [...doc.querySelectorAll("g[data-chrom]")].map((g) => g.getAttribute("data-chrom"));

  const FIXTURE_CHROMS = [
    { chrom: "chr1", n: 4 }, { chrom: "chr2", n: 1 }, { chrom: "chr10", n: 1 },
    { chrom: "chrX", n: 1 }, { chrom: "chrM", n: 1 }, { chrom: "other", n: 1 },
  ];
  const WIDE = bins(20, 20000, (w) => (w > 100 && w < 5000 ? 10 : 0));

  test("histogramSVG returns standalone SVG with a log width axis and readable ticks", () => {
    const doc = parse(PeakPeek.histogramSVG([{ label: "one", histogram: WIDE }], { width: 640 }));
    assert.equal(doc.documentElement.getAttribute("width"), "640");
    const t = texts(doc);
    for (const tick of ["100", "1k", "10k"]) assert.equal(t.includes(tick), true, "tick " + tick);
    assert.equal(t.some((s) => /width.*log/i.test(s)), true, "width axis says it's log-scaled");
    assert.equal(t.some((s) => /% of each file's peaks/.test(s)), true, "y axis says what's counted");
    assert.equal(barsOf(doc, 0).length, WIDE.filter((b) => b.n > 0).length, "one bar per non-empty bin");
  });

  test("histogramSVG y: 'count' counts peaks", () => {
    const doc = parse(PeakPeek.histogramSVG([{ label: "one", histogram: WIDE }], { y: "count" }));
    assert.equal(texts(doc).includes("Peaks"), true);
  });

  test("histogramSVG draws several files on shared axes, each labelled", () => {
    const summaries = [
      { label: "H3K4me3", histogram: bins(21, 12358, (w) => (w > 160 ? Math.round(5000 / (1 + Math.abs(Math.log(w / 629)) * 4)) : 0)) },
      { label: "CTCF", histogram: bins(21, 12358, (w) => (w > 86 && w < 408 ? 2000 : 0)) },
      { label: "DNase", histogram: bins(21, 12358, (w) => (w < 1900 ? 6000 : 0)) },
    ];
    const doc = parse(PeakPeek.histogramSVG(summaries));
    const t = texts(doc);
    for (const s of summaries) assert.equal(t.includes(s.label), true, "label " + s.label);
    // Shared x axis: the same bin sits at the same x in every panel.
    const xOf = (file, from) => {
      const i = summaries[file].histogram.findIndex((b) => b.from === from);
      return barsOf(doc, file)[summaries[file].histogram.slice(0, i).filter((b) => b.n > 0).length].getAttribute("x");
    };
    const shared = summaries[1].histogram.find((b, i) => summaries.every((s) => s.histogram[i].n > 0)).from;
    assert.equal(xOf(0, shared), xOf(1, shared));
    assert.equal(xOf(2, shared), xOf(1, shared));
  });

  test("histogramSVG fraction mode compares files of different size by shape", () => {
    const both = [
      { label: "small", histogram: bins(10, 1000, () => 1) },
      { label: "big", histogram: bins(10, 1000, () => 100) },
    ];
    const height = (doc, file) => Number(barsOf(doc, file)[0].getAttribute("height"));
    const fraction = parse(PeakPeek.histogramSVG(both));
    assert.equal(height(fraction, 0), height(fraction, 1), "same shape, same height");
    const count = parse(PeakPeek.histogramSVG(both, { y: "count" }));
    assert.equal(height(count, 0) < height(count, 1), true, "counts: the small file is lower");
  });

  test("histogramSVG handles a file with one peak (every edge the same width)", () => {
    const one = Array.from({ length: 30 }, (_, i) => ({ from: 100, to: 100, n: i === 0 ? 1 : 0 }));
    const doc = parse(PeakPeek.histogramSVG([{ label: "single", histogram: one }]));
    const bars = barsOf(doc, 0);
    assert.equal(bars.length, 1);
    assert.equal(Number(bars[0].getAttribute("width")) > 0, true, "the bar is visible");
    assert.equal(Number(bars[0].getAttribute("height")) > 0, true, "the bar is visible");
  });

  test("histogramSVG handles all-zero bins, empty histograms and no files", () => {
    parse(PeakPeek.histogramSVG([{ label: "zeros", histogram: bins(10, 1000, () => 0) }]));
    parse(PeakPeek.histogramSVG([{ label: "zeros", histogram: bins(10, 1000, () => 0) }], { y: "count" }));
    parse(PeakPeek.histogramSVG([{ label: "empty", histogram: [] }]));
    parse(PeakPeek.histogramSVG([]));
  });

  test("labels are escaped", () => {
    const label = `a<b> & "c" 'd'`;
    const h = parse(PeakPeek.histogramSVG([{ label, histogram: WIDE }]));
    assert.equal(texts(h).includes(label), true, "histogram shows the label as written");
    const c = parse(PeakPeek.chromBarsSVG([{ label, perChrom: FIXTURE_CHROMS }]));
    assert.equal(texts(c).some((s) => s.startsWith(label)), true, "legend shows the label as written");
  });

  test("nine files: both charts parse, first eight colours distinct", () => {
    const summaries = Array.from({ length: 9 }, (_, i) => ({
      label: "file number " + (i + 1),
      histogram: bins(20, 2000, (w) => (w > 20 * (i + 1) ? i + 1 : 0)),
      perChrom: FIXTURE_CHROMS,
    }));
    const h = parse(PeakPeek.histogramSVG(summaries));
    const c = parse(PeakPeek.chromBarsSVG(summaries));
    for (const doc of [h, c]) {
      const fills = new Set(Array.from({ length: 8 }, (_, i) => barsOf(doc, i)[0].getAttribute("fill")));
      assert.equal(fills.size, 8, "eight distinct colours");
      assert.equal(barsOf(doc, 8).length > 0, true, "the ninth file is drawn");
    }
    for (const s of summaries) assert.equal(texts(c).some((t) => t.startsWith(s.label)), true, "legend has " + s.label);
  });

  test("chromBarsSVG draws the fixture's chromosomes in the order given", () => {
    const doc = parse(PeakPeek.chromBarsSVG([{ label: "fixture", perChrom: FIXTURE_CHROMS }]));
    assert.deepEqual(groups(doc), ["1", "2", "10", "X", "M", "other"]);
    const t = texts(doc);
    for (const name of ["chr1", "chr2", "chr10", "chrX", "chrM", "other"]) assert.equal(t.includes(name), true, "shows " + name + " as written");
    assert.equal(t.some((s) => /n = 9/.test(s)), true, "legend gives n");
    assert.equal(t.includes("% of each file's peaks"), true);
    assert.equal(parse(PeakPeek.chromBarsSVG([{ label: "fixture", perChrom: FIXTURE_CHROMS }], { y: "count" }))
      .querySelector("text[transform]").textContent, "Peaks");
  });

  test("chromBarsSVG aligns 1 with chr1 and MT with chrM", () => {
    const doc = parse(PeakPeek.chromBarsSVG([
      { label: "encode", perChrom: [{ chrom: "chr1", n: 5 }, { chrom: "chr2", n: 3 }, { chrom: "chrM", n: 1 }, { chrom: "other", n: 2 }] },
      { label: "csv", perChrom: [{ chrom: "1", n: 7 }, { chrom: "2", n: 1 }, { chrom: "3", n: 2 }, { chrom: "MT", n: 1 }] },
    ]));
    assert.deepEqual(groups(doc), ["1", "2", "3", "M", "other"]);
    const inGroup = (chrom) => [...doc.querySelectorAll(`g[data-chrom="${chrom}"] rect`)].map((r) => r.getAttribute("data-file"));
    assert.deepEqual(inGroup("1"), ["0", "1"], "chr1 and 1 in one group");
    assert.deepEqual(inGroup("M"), ["0", "1"], "chrM and MT in one group");
    assert.deepEqual(inGroup("3"), ["1"]);
    const names = [...doc.querySelectorAll("g[data-chrom] text")].map((t) => t.textContent);
    assert.deepEqual(names, ["1", "2", "3", "M", "other"], "spelled differently, so all shown without chr");
  });

  test("chromBarsSVG places a chromosome only one file has by its neighbours", () => {
    const doc = parse(PeakPeek.chromBarsSVG([
      { label: "a", perChrom: [{ chrom: "chr1", n: 1 }, { chrom: "chr2", n: 1 }, { chrom: "chrX", n: 1 }] },
      { label: "b", perChrom: [{ chrom: "chr3", n: 1 }] },
      { label: "c", perChrom: [{ chrom: "chr4", n: 1 }, { chrom: "chrY", n: 1 }, { chrom: "other", n: 1 }] },
    ]));
    assert.deepEqual(groups(doc), ["1", "2", "3", "4", "X", "Y", "other"]);
  });

  test("chromBarsSVG handles one chromosome, one peak, zeros and no files", () => {
    const one = parse(PeakPeek.chromBarsSVG([{ label: "one", perChrom: [{ chrom: "chr5", n: 1 }] }]));
    assert.deepEqual(groups(one), ["5"]);
    assert.equal(Number(barsOf(one, 0)[0].getAttribute("height")) > 0, true);
    parse(PeakPeek.chromBarsSVG([{ label: "zeros", perChrom: [{ chrom: "chr1", n: 0 }] }]));
    parse(PeakPeek.chromBarsSVG([{ label: "zeros", perChrom: [{ chrom: "chr1", n: 0 }] }], { y: "count" }));
    parse(PeakPeek.chromBarsSVG([{ label: "empty", perChrom: [] }]));
    parse(PeakPeek.chromBarsSVG([]));
  });

  test("chromBarsSVG fraction mode puts files of different size on one scale", () => {
    const doc = parse(PeakPeek.chromBarsSVG([
      { label: "small", perChrom: [{ chrom: "chr1", n: 1 }, { chrom: "chr2", n: 1 }] },
      { label: "big", perChrom: [{ chrom: "chr1", n: 100 }, { chrom: "chr2", n: 100 }] },
    ]));
    assert.equal(barsOf(doc, 0)[0].getAttribute("height"), barsOf(doc, 1)[0].getAttribute("height"));
  });
})(window.PeakPeek);
