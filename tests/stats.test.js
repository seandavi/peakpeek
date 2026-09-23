// Tests for src/stats.js (issue 4). Peaks are written out here rather than parsed, so
// these tests don't depend on parse.js.
(function () {
  var test = PeakPeek.test, assert = PeakPeek.assert;

  function peak(chrom, start, end, extra) {
    var p = { chrom: chrom, start: start, end: end };
    for (var k in extra || {}) p[k] = extra[k];
    return p;
  }

  // The 9 accepted peaks of the fixture (SPEC.md §7), in file order: a b c d e f g k a.
  var FIXTURE_PEAKS = [
    peak("chr1", 100, 200, { name: "a" }),
    peak("chr1", 150, 250, { name: "b" }),
    peak("chr2", 0, 1, { name: "c" }),
    peak("chr10", 5000, 6000, { name: "d" }),
    peak("chrX", 10, 20, { name: "e" }),
    peak("chrM", 0, 50, { name: "f" }),
    peak("chrUn_JH584304", 100, 400, { name: "g" }),
    peak("chr1", 1000, 1100, { name: "k" }),
    peak("chr1", 100, 200, { name: "a" }),
  ];

  test("stats: fixture peaks written here are PeakPeek.EXPECTED's accepted peaks", function () {
    assert.deepEqual(FIXTURE_PEAKS.map(function (p) { return p.name; }), PeakPeek.EXPECTED.accepted);
    var k = FIXTURE_PEAKS[7];
    assert.deepEqual({ chrom: k.chrom, start: k.start, end: k.end }, PeakPeek.EXPECTED.k);
  });

  test("stats: fixture widths match PeakPeek.EXPECTED", function () {
    var s = PeakPeek.summarise(FIXTURE_PEAKS), want = PeakPeek.EXPECTED.widths;
    assert.equal(s.n, 9);
    assert.equal(s.widths.min, want.min, "min");
    assert.equal(s.widths.median, want.median, "median");
    assert.near(s.widths.mean, want.mean, 1e-9, "mean");
    assert.equal(s.widths.max, want.max, "max");
    assert.equal(s.widths.sum, want.sum, "sum");
  });

  test("stats: fixture mergedBp, duplicates, chromStyle, perChrom match PeakPeek.EXPECTED", function () {
    var s = PeakPeek.summarise(FIXTURE_PEAKS), want = PeakPeek.EXPECTED;
    assert.equal(s.mergedBp, want.mergedBp, "mergedBp");
    assert.equal(s.duplicates, want.duplicates, "duplicates");
    assert.equal(s.chromStyle, want.chromStyle, "chromStyle");
    assert.deepEqual(s.perChrom, want.perChrom, "perChrom");
  });

  test("stats: fixture Problems counts", function () {
    var s = PeakPeek.summarise(FIXTURE_PEAKS);
    assert.equal(s.chromosomes, 6, "distinct chromosome names");
    assert.equal(s.offMain, 1, "chrUn_JH584304");
    assert.equal(s.overlapping, 3, "a, b and the duplicate a");
    assert.equal(s.over100kb, 0);
    assert.equal(s.scores, undefined, "BED4 has no scores");
  });

  test("stats: summarise returns the §4 shape", function () {
    var s = PeakPeek.summarise(FIXTURE_PEAKS);
    ["n", "widths", "mergedBp", "duplicates", "chromStyle", "perChrom", "histogram"].forEach(function (k) {
      assert.equal(k in s, true, "has " + k);
    });
    assert.deepEqual(Object.keys(s.widths).sort(), ["max", "mean", "median", "min", "sum"]);
    assert.equal(s.histogram.length, 30);
    s.histogram.forEach(function (bin) {
      assert.deepEqual(Object.keys(bin).sort(), ["from", "n", "to"]);
    });
    assert.equal(s.histogram.reduce(function (t, bin) { return t + bin.n; }, 0), 9, "every peak binned");
  });

  test("stats: median of an even count is the mean of the middle two", function () {
    var s = PeakPeek.summarise([peak("chr1", 0, 10), peak("chr1", 100, 120), peak("chr1", 200, 230), peak("chr1", 300, 400)]);
    assert.equal(s.widths.median, 25);
    assert.equal(PeakPeek.summarise([peak("chr1", 0, 3), peak("chr2", 0, 4)]).widths.median, 3.5);
  });

  test("stats: mergedBp merges overlapping and touching peaks, per chromosome", function () {
    assert.equal(PeakPeek.summarise([peak("chr1", 0, 100), peak("chr1", 50, 150)]).mergedBp, 150, "overlapping");
    assert.equal(PeakPeek.summarise([peak("chr1", 0, 100), peak("chr1", 100, 200)]).mergedBp, 200, "touching");
    assert.equal(PeakPeek.summarise([peak("chr1", 0, 100), peak("chr1", 101, 200)]).mergedBp, 199, "1 bp gap");
    assert.equal(PeakPeek.summarise([peak("chr1", 0, 100), peak("chr2", 50, 150)]).mergedBp, 200, "other chromosome");
    assert.equal(PeakPeek.summarise([peak("chr1", 300, 400), peak("chr1", 0, 1000), peak("chr1", 10, 20)]).mergedBp, 1000, "contained, unsorted");
  });

  test("stats: overlapping counts peaks overlapping another; touching doesn't count", function () {
    assert.equal(PeakPeek.summarise([peak("chr1", 0, 100), peak("chr1", 100, 200)]).overlapping, 0, "touching");
    assert.equal(PeakPeek.summarise([peak("chr1", 0, 100), peak("chr2", 50, 150)]).overlapping, 0, "other chromosome");
    // [0,1000) holds the maximum end; [10,20) and [30,40) sit inside it but not each other.
    assert.equal(PeakPeek.summarise([peak("chr1", 0, 1000), peak("chr1", 10, 20), peak("chr1", 30, 40), peak("chr1", 2000, 2100)]).overlapping, 3);
    assert.equal(PeakPeek.summarise([peak("chr1", 0, 100), peak("chr1", 99, 200), peak("chr1", 200, 300)]).overlapping, 2);
  });

  test("stats: duplicates count repeats of an earlier peak", function () {
    var s = PeakPeek.summarise([peak("chr1", 0, 10), peak("chr1", 0, 10), peak("chr1", 0, 10), peak("chr2", 0, 10), peak("chr1", 0, 11)]);
    assert.equal(s.duplicates, 2);
  });

  test("stats: naturalChromOrder puts chr2 before chr10, then X, Y, M", function () {
    var order = PeakPeek.naturalChromOrder;
    assert.equal(order("chr2", "chr10") < 0, true, "chr2 < chr10");
    assert.equal(order("chr10", "chr2") > 0, true, "chr10 > chr2");
    assert.deepEqual(["chrM", "chr10", "chrY", "chr2", "chrX", "chr1", "chr19"].sort(order),
      ["chr1", "chr2", "chr10", "chr19", "chrX", "chrY", "chrM"]);
    assert.deepEqual(["MT", "10", "Y", "2", "X", "1"].sort(order), ["1", "2", "10", "X", "Y", "MT"]);
    assert.deepEqual(["chr22", "chr21", "chr9"].sort(order), ["chr9", "chr21", "chr22"], "human chr20–22");
  });

  test("stats: naturalChromOrder puts other names last, naturally sorted", function () {
    var order = PeakPeek.naturalChromOrder;
    assert.deepEqual(["chrUn_JH10", "chrM", "chr1_random", "chrUn_JH2", "chr1"].sort(order),
      ["chr1", "chrM", "chr1_random", "chrUn_JH2", "chrUn_JH10"]);
  });

  test("stats: bare names count as main chromosomes; style is chr, bare or mixed", function () {
    var bare = PeakPeek.summarise([peak("1", 0, 10), peak("10", 0, 10), peak("2", 0, 10), peak("MT", 0, 10), peak("GL456210.1", 0, 10)]);
    assert.equal(bare.chromStyle, "bare");
    assert.deepEqual(bare.perChrom, [{ chrom: "1", n: 1 }, { chrom: "2", n: 1 }, { chrom: "10", n: 1 }, { chrom: "MT", n: 1 }, { chrom: "other", n: 1 }]);
    assert.equal(bare.offMain, 1);
    assert.equal(PeakPeek.summarise([peak("chr1", 0, 10), peak("1", 0, 10)]).chromStyle, "mixed");
  });

  test("stats: logBins gives n + 1 increasing edges from min to max", function () {
    var edges = PeakPeek.logBins(10, 100000);
    assert.equal(edges.length, 31, "default n = 30");
    assert.equal(edges[0], 10);
    assert.equal(edges[30], 100000);
    for (var i = 1; i < edges.length; i++) assert.equal(edges[i] > edges[i - 1], true, "edge " + i + " increases");
    // Log-spaced: 4 decades in 4 bins.
    PeakPeek.logBins(1, 10000, 4).forEach(function (e, i) { assert.near(e, Math.pow(10, i), 1e-9); });
    var one = PeakPeek.logBins(50, 50, 5);
    assert.equal(one.length, 6, "one width only");
    for (var j = 1; j < one.length; j++) assert.equal(one[j] > one[j - 1], true, "still increasing");
    assert.throws(function () { PeakPeek.logBins(0, 100); }, /minWidth/);
  });

  test("stats: shared bins give comparable histograms; the max edge is in the last bin", function () {
    var bins = PeakPeek.logBins(1, 10000, 4); // 1, 10, 100, 1000, 10000
    var a = PeakPeek.summarise([peak("chr1", 0, 5), peak("chr1", 0, 50)], { bins: bins });
    var b = PeakPeek.summarise([peak("chr1", 0, 500), peak("chr1", 0, 10000)], { bins: bins });
    assert.deepEqual(a.histogram.map(function (x) { return x.from; }), b.histogram.map(function (x) { return x.from; }));
    assert.deepEqual(a.histogram.map(function (x) { return x.n; }), [1, 1, 0, 0]);
    assert.deepEqual(b.histogram.map(function (x) { return x.n; }), [0, 0, 1, 1], "10000 = max edge, last bin");
    // Widths outside the edges are clamped to the end bins.
    var c = PeakPeek.summarise([peak("chr1", 0, 1), peak("chr1", 0, 50000)], { bins: [10, 100, 1000] });
    assert.deepEqual(c.histogram.map(function (x) { return x.n; }), [1, 1]);
  });

  test("stats: score ranges leave out null and -1; empty types are omitted", function () {
    var s = PeakPeek.summarise([
      peak("chr1", 0, 10, { signal: 5.5, p: -1, q: null }),
      peak("chr1", 20, 30, { signal: 2, p: 12.3, q: null }),
      peak("chr1", 40, 50, { signal: null, p: 3, q: null }),
    ]);
    assert.deepEqual(s.scores, { signal: [2, 5.5], p: [3, 12.3] });
  });

  test("stats: widths over 100 kb are counted", function () {
    var s = PeakPeek.summarise([peak("chr1", 0, 100000), peak("chr1", 0, 100001)]);
    assert.equal(s.over100kb, 1);
  });

  test("stats: 100,000 random peaks summarise well under a second", function () {
    var peaks = [], chroms = ["chr1", "chr2", "chr10", "chrX", "chrUn_JH584304"];
    for (var i = 0; i < 100000; i++) {
      var start = Math.floor(Math.random() * 1e8);
      peaks.push(peak(chroms[i % chroms.length], start, start + 20 + Math.floor(Math.random() * 5000), { signal: Math.random() * 100 }));
    }
    var t0 = performance.now();
    var s = PeakPeek.summarise(peaks);
    var ms = performance.now() - t0;
    assert.equal(s.n, 100000);
    assert.equal(ms < 500, true, "took " + Math.round(ms) + " ms");
  });
})();
