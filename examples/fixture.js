// The hand-made fixture (SPEC.md §7) and its answers.
//
// The answers below were written by a person, from SPEC.md §7 and the decisions in adr/,
// before any code existed. NEVER edit them to make a test pass: a mismatch is a bug, or a
// decision to revisit with a new ADR. (Written by the orchestrating agent acting for
// Sean Davis, not yet reviewed by him.)
//
// This is a script rather than JSON because a double-clicked page can't fetch the files
// next to it (SPEC.md §4). examples/fixture.bed holds the same text for dropping into the
// page.
window.PeakPeek = window.PeakPeek || {};

PeakPeek.FIXTURE = `track name=fixture description="hand-made test file"
browser position chr1:1-1000
# a comment
chr1\t100\t200\ta
chr1\t150\t250\tb
chr2\t0\t1\tc
chr10\t5000\t6000\td
chrX\t10\t20\te
chrM\t0\t50\tf
chrUn_JH584304\t100\t400\tg
chr1\t300\t300\th
chr1\t500\t400\ti
chr1\tabc\t600\tj
chr1\t1e+03\t1100\tk

chr1\t100\t200\ta
chr3\t2000
`;

PeakPeek.EXPECTED = {
  format: "bed4",
  // Names of accepted peaks, in file order. The duplicate "a" is kept (ADR-0003).
  accepted: ["a", "b", "c", "d", "e", "f", "g", "k", "a"],
  // Peak "k" is written 1e+03: whole numbers in scientific notation are accepted.
  k: { chrom: "chr1", start: 1000, end: 1100 },
  skipped: 4, // lines 1, 2, 3 (track, browser, #) and 15 (blank)
  rejected: [
    { line: 11, reason: /zero/i },              // chr1 300 300 (ADR-0001)
    { line: 12, reason: /before|less than|smaller/i }, // end < start
    { line: 13, reason: /number|numeric|integer/i },   // start "abc"
    { line: 17, reason: /column/i },            // only two columns
  ],
  widths: { min: 1, median: 100, mean: 1761 / 9, max: 1000, sum: 1761 },
  mergedBp: 1611, // chr1: a, b and the duplicate a merge to [100, 250) = 150 bp (ADR-0004)
  duplicates: 1,
  chromStyle: "chr",
  // Natural order: chr2 before chr10. chrUn_JH584304 is grouped as "other".
  perChrom: [
    { chrom: "chr1", n: 4 },
    { chrom: "chr2", n: 1 },
    { chrom: "chr10", n: 1 },
    { chrom: "chrX", n: 1 },
    { chrom: "chrM", n: 1 },
    { chrom: "other", n: 1 },
  ],
};
