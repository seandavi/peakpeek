// Tests for src/parse.js (issue 3). The fixture's answers come from PeakPeek.EXPECTED
// (examples/fixture.js), written by a person; everything else is built here.

(function () {
  var test = PeakPeek.test;
  var assert = PeakPeek.assert;
  var parse = PeakPeek.parsePeaks;

  function reasons(result) {
    return result.rejected.map(function (r) { return r.line + ": " + r.reason; });
  }

  // The fixture (SPEC.md §7).

  test("parse: fixture format", function () {
    assert.equal(parse(PeakPeek.FIXTURE).format, PeakPeek.EXPECTED.format);
  });

  test("parse: fixture accepted names, in file order", function () {
    var names = parse(PeakPeek.FIXTURE).peaks.map(function (p) { return p.name; });
    assert.deepEqual(names, PeakPeek.EXPECTED.accepted);
  });

  test("parse: fixture peak k, written 1e+03", function () {
    var k = parse(PeakPeek.FIXTURE).peaks.filter(function (p) { return p.name === "k"; })[0];
    var expected = PeakPeek.EXPECTED.k;
    assert.deepEqual({ chrom: k.chrom, start: k.start, end: k.end }, expected);
  });

  test("parse: fixture skipped count", function () {
    assert.equal(parse(PeakPeek.FIXTURE).skipped, PeakPeek.EXPECTED.skipped);
  });

  test("parse: fixture rejected lines and reasons", function () {
    var rejected = parse(PeakPeek.FIXTURE).rejected;
    var expected = PeakPeek.EXPECTED.rejected;
    assert.deepEqual(
      rejected.map(function (r) { return r.line; }),
      expected.map(function (r) { return r.line; }),
      "rejected line numbers"
    );
    expected.forEach(function (e, i) {
      assert.equal(e.reason.test(rejected[i].reason), true,
        "line " + e.line + ": reason " + JSON.stringify(rejected[i].reason) + " should match " + e.reason);
    });
  });

  test("parse: fixture peaks are 0-based half-open, as written", function () {
    var a = parse(PeakPeek.FIXTURE).peaks[0];
    assert.deepEqual(a, { chrom: "chr1", start: 100, end: 200, name: "a" });
  });

  test("parse: rejected entries carry the line's text", function () {
    var rejected = parse(PeakPeek.FIXTURE).rejected;
    assert.equal(rejected[0].text, "chr1\t300\t300\th");
    assert.equal(rejected[3].text, "chr3\t2000");
  });

  test("parse: specific reasons", function () {
    var result = parse(PeakPeek.FIXTURE);
    assert.deepEqual(reasons(result), [
      "11: zero width",
      "12: end before start",
      "13: start is not a number: abc",
      "17: too few columns (2)",
    ]);
  });

  // BED formats, by column count.

  test("parse: bed3, bed5, bed6", function () {
    assert.equal(parse("chr1\t0\t10\n").format, "bed3");
    assert.deepEqual(parse("chr1\t0\t10\n").peaks[0], { chrom: "chr1", start: 0, end: 10 });
    var bed5 = parse("chr1\t0\t10\tx\t500\n");
    assert.equal(bed5.format, "bed5");
    assert.deepEqual(bed5.peaks[0], { chrom: "chr1", start: 0, end: 10, name: "x", score: 500 });
    assert.equal(parse("chr1\t0\t10\tx\t500\t+\n").format, "bed6");
  });

  test("parse: more than 6 columns, not narrowPeak or broadPeak, is bed6", function () {
    assert.equal(parse("chr1\t0\t10\tx\t0\t+\t0\t10\n").format, "bed6");
    var bed12 = "chr1\t0\t10\tx\t0\t+\t0\t10\t0\t2\t4,4\t0,6\n";
    assert.equal(parse(bed12).format, "bed6");
  });

  test("parse: format follows the most common column count", function () {
    var result = parse("chr1\t0\t10\nchr1\t0\t10\ta\nchr1\t5\t10\tb\n");
    assert.equal(result.format, "bed4");
    assert.equal(result.peaks[0].name, undefined);
  });

  test("parse: narrowPeak names its columns, and -1 is null", function () {
    var text =
      "chr10\t100015855\t100016677\tPeak_21634\t23\t.\t4.76064\t12.91286\t10.60798\t110\n" +
      "chr1\t0\t100\tPeak_2\t0\t.\t-1\t-1\t-1\t-1\n";
    var result = parse(text);
    assert.equal(result.format, "narrowPeak");
    assert.deepEqual(result.peaks[0], {
      chrom: "chr10", start: 100015855, end: 100016677, name: "Peak_21634", score: 23,
      signal: 4.76064, p: 12.91286, q: 10.60798,
    });
    assert.equal(result.peaks[1].signal, null);
    assert.equal(result.peaks[1].p, null);
    assert.equal(result.peaks[1].q, null);
  });

  test("parse: broadPeak has 9 columns", function () {
    var result = parse("chr1\t0\t100\tb1\t0\t.\t2.5\t-1\t3\n");
    assert.equal(result.format, "broadPeak");
    assert.equal(result.peaks[0].signal, 2.5);
    assert.equal(result.peaks[0].p, null);
    assert.equal(result.peaks[0].q, 3);
  });

  test("parse: 9 columns ending in an itemRgb is BED, not broadPeak", function () {
    var result = parse("chr1\t0\t100\tb1\t0\t+\t0\t100\t255,0,0\n");
    assert.equal(result.format, "bed6");
    assert.equal(result.peaks[0].signal, undefined);
  });

  test("parse: runs of spaces are tolerated when a line has no tabs", function () {
    var result = parse("chr1  100 200   a\nchr2 5 9 b\n");
    assert.equal(result.format, "bed4");
    assert.deepEqual(result.peaks[0], { chrom: "chr1", start: 100, end: 200, name: "a" });
    assert.equal(result.rejected.length, 0);
  });

  test("parse: oneBased doesn't touch BED", function () {
    assert.equal(parse("chr1\t100\t200\n", { oneBased: true }).peaks[0].start, 100);
  });

  // Numbers.

  test("parse: whole numbers in scientific notation are accepted", function () {
    var result = parse("chr1\t1e+03\t1E5\nchr1\t2e3\t3e+3\n");
    assert.deepEqual(result.peaks.map(function (p) { return [p.start, p.end]; }), [[1000, 100000], [2000, 3000]]);
    assert.equal(result.rejected.length, 0);
  });

  test("parse: 1.5e2, 1e-3, negatives, hex, decimals, empty and junk are rejected", function () {
    var result = parse(
      "chr1\t1.5e2\t400\n" +
      "chr1\t1e-3\t400\n" +
      "chr1\t-5\t400\n" +
      "chr1\t0x10\t400\n" +
      "chr1\t10.0\t400\n" +
      "chr1\t\t400\n" +
      "chr1\t10\tNA\n" +
      "\t10\t400\n" +
      "chr1\t99999999999999999999\t400\n"
    );
    assert.equal(result.peaks.length, 0);
    assert.deepEqual(reasons(result), [
      "1: start is not a whole number: 1.5e2",
      "2: start is not a whole number: 1e-3",
      "3: start is negative: -5",
      "4: start is not a number: 0x10",
      "5: start is not a whole number: 10.0",
      "6: start is empty",
      "7: end is not a number: NA",
      "8: chromosome is empty",
      "9: start is too large: 99999999999999999999",
    ]);
  });

  // Tables (ADR-0005, ADR-0002).

  test("parse: CSV with a header", function () {
    var result = parse("peak_id,chr,start,end,padj\n1,12,100,200,0.1\n2,2,5,50,0\n");
    assert.equal(result.format, "csv");
    assert.equal(result.skipped, 1, "the header is skipped");
    assert.deepEqual(result.peaks, [
      { chrom: "12", start: 100, end: 200 },
      { chrom: "2", start: 5, end: 50 },
    ]);
  });

  test("parse: CSV column names, in any case", function () {
    ["Chromosome,ChromStart,CHROMEND", "SEQNAMES,Start,End", "chrom,chromStart,chromEnd"].forEach(function (header) {
      var result = parse(header + "\nchr1,10,20\n");
      assert.equal(result.format, "csv", header);
      assert.deepEqual(result.peaks, [{ chrom: "chr1", start: 10, end: 20 }], header);
    });
  });

  test("parse: CSV columns in any order; the first matching column wins", function () {
    var result = parse("end,x,start,seqnames,chr\n200,x,100,chrA,chrB\n");
    assert.deepEqual(result.peaks, [{ chrom: "chrA", start: 100, end: 200 }]);
  });

  test("parse: quoted CSV, as R's write.csv writes it", function () {
    var result = parse('"","seqnames","start","end"\n"1","chr1",1e+05,200000\n');
    assert.equal(result.format, "csv");
    assert.deepEqual(result.peaks, [{ chrom: "chr1", start: 100000, end: 200000 }]);
  });

  test("parse: CSV rejections", function () {
    var result = parse("chr,start,end\nchr1,10\nchr1,abc,20\nchr1,20,10\n");
    assert.deepEqual(reasons(result), [
      "2: too few columns (2)",
      "3: start is not a number: abc",
      "4: end before start",
    ]);
  });

  test("parse: a CSV without the columns it needs rejects every line, saying what was looked for", function () {
    var result = parse("id,from,to\na,1,2\n");
    assert.equal(result.format, "csv");
    assert.equal(result.peaks.length, 0);
    assert.deepEqual(result.rejected.map(function (r) { return r.line; }), [1, 2]);
    assert.equal(/seqnames/.test(result.rejected[0].reason), true, result.rejected[0].reason);
    assert.equal(/chromStart/.test(result.rejected[0].reason), true, result.rejected[0].reason);
  });

  test("parse: TSV with a header", function () {
    var result = parse("name\tchrom\tstart\tend\np1\tchr1\t10\t20\n");
    assert.equal(result.format, "tsv");
    assert.equal(result.skipped, 1);
    assert.deepEqual(result.peaks, [{ chrom: "chr1", start: 10, end: 20 }]);
  });

  test("parse: tables are 0-based by default; oneBased subtracts 1 from start", function () {
    var csv = "chr,start,end\n1,100,200\n1,1,1\n";
    var zero = parse(csv);
    assert.deepEqual(zero.peaks, [{ chrom: "1", start: 100, end: 200 }]);
    assert.deepEqual(reasons(zero), ["3: zero width"]);
    var one = parse(csv, { oneBased: true });
    assert.deepEqual(one.peaks, [{ chrom: "1", start: 99, end: 200 }, { chrom: "1", start: 0, end: 1 }]);
    assert.equal(one.rejected.length, 0);
    var tsv = parse("chrom\tstart\tend\n1\t100\t200\n", { oneBased: true });
    assert.equal(tsv.peaks[0].start, 99);
  });

  test("parse: oneBased rejects a start of 0", function () {
    var result = parse("chr,start,end\n1,0,10\n", { oneBased: true });
    assert.equal(result.peaks.length, 0);
    assert.equal(/1-based/.test(result.rejected[0].reason), true, result.rejected[0].reason);
  });

  // Line endings and edges.

  test("parse: CRLF line endings", function () {
    var result = parse(PeakPeek.FIXTURE.replace(/\n/g, "\r\n"));
    assert.equal(result.format, PeakPeek.EXPECTED.format);
    assert.deepEqual(result.peaks.map(function (p) { return p.name; }), PeakPeek.EXPECTED.accepted);
    assert.equal(result.skipped, PeakPeek.EXPECTED.skipped);
    assert.equal(result.rejected[3].text, "chr3\t2000", "no stray \\r");
    var csv = parse("chr,start,end\r\n1,10,20\r\n");
    assert.deepEqual(csv.peaks, [{ chrom: "1", start: 10, end: 20 }]);
  });

  test("parse: no trailing newline", function () {
    var result = parse("chr1\t0\t10\nchr1\t20\t30");
    assert.equal(result.peaks.length, 2);
    assert.equal(result.skipped, 0);
    assert.deepEqual(parse("chr,start,end\n1,10,20").peaks, [{ chrom: "1", start: 10, end: 20 }]);
  });

  test("parse: the final newline isn't a blank line, but blank lines are skipped", function () {
    assert.equal(parse("chr1\t0\t10\n").skipped, 0);
    assert.equal(parse("chr1\t0\t10\n\n").skipped, 1);
  });

  test("parse: header-only files", function () {
    assert.deepEqual(parse("chr,start,end\n"), { format: "csv", peaks: [], skipped: 1, rejected: [] });
    assert.deepEqual(parse("chrom\tstart\tend"), { format: "tsv", peaks: [], skipped: 1, rejected: [] });
    var bed = parse("track name=x\n# nothing here\n");
    assert.equal(bed.peaks.length, 0);
    assert.equal(bed.skipped, 2);
    assert.equal(bed.rejected.length, 0);
  });

  test("parse: empty text", function () {
    var result = parse("");
    assert.equal(result.peaks.length, 0);
    assert.equal(result.skipped, 0);
    assert.equal(result.rejected.length, 0);
  });

  test("parse: skippable lines before a CSV header", function () {
    var result = parse("# from R\n\nchr,start,end\n1,10,20\n");
    assert.equal(result.format, "csv");
    assert.equal(result.skipped, 3);
    assert.equal(result.peaks.length, 1);
  });

  test("parse: a chromosome named like 'track1' isn't a track line", function () {
    assert.equal(parse("track1\t0\t10\n").peaks.length, 1);
  });

  test("parse: a byte-order mark before a CSV header", function () {
    assert.equal(parse("\ufeffchr,start,end\n1,10,20\n").format, "csv");
  });
})();
