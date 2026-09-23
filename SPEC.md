# PeakPeek — a peak file at a glance: specification

**Status:** draft. Section 6 lists open questions; **no code gets written until each one
has an answer recorded in `adr/`**.

## 1. What this is

A single web page you open by **double-clicking a file**. Give it one or more peak files,
either uploaded from your computer or as URLs, and it tells you what's in them: how many
peaks, how wide, on which chromosomes, and what's wrong with the file. With more than one
file, it shows them side by side.

It answers the first questions anyone asks of a peak file they've just been handed: *is
this the file I think it is, and is it sane?* It's also the check you should run before
feeding peaks into anything else.

- **No server, no install, no account.** It works from a folder on your laptop. Git and
  GitHub are optional, and nothing in this spec needs them.
- **Uploaded files never leave the machine.** A URL is fetched by your browser directly
  from wherever the file lives. Nothing passes through anyone else's server.

### Non-goals

- No annotation: it doesn't know where genes are. That's
  [peakwhere](https://github.com/seandavi/peakwhere), this spec's big sibling.
- No signal (BAM, bigWig), no peak calling, no statistics beyond description.
- No genome browser, and no editing or saving of peak files.

## 2. Inputs

| Input | How | Formats |
|---|---|---|
| Peak files | Drag-and-drop or file picker, several at once | BED3+, narrowPeak, broadPeak; plain or `.gz` |
| Peak files | URLs, one per line | the same |
| Tables | Either way | CSV or TSV **with a header** naming the chromosome, start and end columns |

### Reference data

All public, all mm10, no account needed. Every URL was fetched **by a browser page opened
from a double-clicked file** on 2026-09-23, not just by `curl` (§5 says why that
distinction matters).

| Assay | URL | What to expect |
|---|---|---|
| H3K4me3 | `https://www.encodeproject.org/files/ENCFF674JZY/@@download/ENCFF674JZY.bed.gz` | Sharp promoter peaks |
| H3K36me3 | `https://www.encodeproject.org/files/ENCFF853BYO/@@download/ENCFF853BYO.bed.gz` | A broad mark called as narrow peaks: many small pieces |
| H3K27me3 | `https://www.encodeproject.org/files/ENCFF478UYW/@@download/ENCFF478UYW.bed.gz` | Also broad, also called narrow |
| CTCF | `https://www.encodeproject.org/files/ENCFF714WDP/@@download/ENCFF714WDP.bed.gz` | Point-source binding; ENCODE flags *extremely low read depth* |
| DNase-seq | `https://www.encodeproject.org/files/ENCFF979ULB/@@download/ENCFF979ULB.bed.gz` | Accessible chromatin |
| H3K27ac (Vahedi lab) | `https://raw.githubusercontent.com/golnazvahedi/epigenetics-agentic-workshop/main/track-a/data/differential_peaks.csv` | DESeq2 output: a CSV, chromosomes written `1` not `chr1` |

The ENCODE files are gzipped narrowPeak, adult mouse thymus; their experiment pages are
linked from [the other exercise's spec](../peak-overlap/SPEC.md#reference-data).

**The right answers** for the reference data, worked out with `awk`, Python and `bedtools`,
independently of any app (§7, test 6):

| File | Peaks | Min | Median | Mean | Max | Sum of widths | Merged bp | Chromosomes | Peaks off the main chromosomes | Exact duplicates |
|---|---|---|---|---|---|---|---|---|---|---|
| H3K4me3 | 25,099 | 160 | 629 | 768 | 12,358 | 19,267,844 | 19,267,844 | 24 | 6 | 0 |
| H3K36me3 | 91,474 | 95 | 205 | 262 | 7,445 | 23,997,445 | 23,997,445 | 22 | 1 | 0 |
| H3K27me3 | 16,586 | 85 | 160 | 197 | 1,564 | 3,273,733 | 3,273,733 | 21 | 1 | 0 |
| CTCF | 20,220 | 86 | 344 | 308 | 408 | 6,217,728 | **6,003,019** | 24 | 15 | **1** |
| DNase-seq | 67,929 | 21 | 200 | 212 | 1,900 | 14,423,756 | **14,146,163** | 21 | 0 | 0 |
| H3K27ac, read as 0-based | 49,781 | 180 | 1,385 | 2,512 | 93,567 | 125,028,695 | 125,028,695 | 21 | 0 | 0 |
| H3K27ac, read as 1-based | 49,781 | 181 | 1,386 | 2,513 | 93,568 | 125,078,476 | 125,078,476 | 21 | 0 | 0 |

"Main chromosomes" means `chr1`–`chr19`, `chrX`, `chrY` and `chrM`, with or without the
`chr`. Widths are `end − start` on 0-based half-open coordinates. Means are rounded.

Three things in that table are the reason it exists:

- **CTCF and DNase have overlapping peaks.** The sum of widths and the merged coverage
  differ. "How much genome do these peaks cover?" has two answers (Q4).
- **CTCF has an exact duplicate line.** Count it or not (Q3)?
- **The Vahedi CSV doesn't say which coordinate system it uses.** Every width moves by one
  depending on your answer (Q2).

## 3. What the page shows

### 3.1 Loading

- A drop zone and file picker (several files), and a box for URLs (one per line).
- Each file becomes a card as soon as it's read, with a label defaulting to the file name,
  editable (§6, Q8).
- Progress per file, and a clear, specific message when one fails (§5).

### 3.2 Per file

| Item | Detail |
|---|---|
| Format detected | BED3, BED6, narrowPeak, broadPeak, CSV, TSV, and why the page thinks so |
| Chromosome style | `chr1` or `1`, and a warning if a file mixes them |
| Counts | Peaks accepted; lines skipped (headers, `track`, `browser`, `#`, blank); lines rejected, each with a reason |
| Widths | Min, median, mean, max; sum of widths; merged coverage in bp |
| Width histogram | Log-scaled width axis (§6, Q6) |
| Peaks per chromosome | A bar chart in natural order: `chr1, chr2, … chr10, … chrX, chrY, chrM`, with everything else grouped as "other" |
| Scores | For narrowPeak/broadPeak: the range of `signalValue`, `pValue` and `qValue`, noting `-1`, which means "not given" |
| Problems | A short list: duplicates, overlaps, rejected lines, unusual chromosomes, suspicious widths |

The first 20 rejected lines are shown with their line numbers and reasons, so the user
can open the file and look.

### 3.3 Side by side

With two or more files: one table, a row per file and the §3.2 numbers as columns, and
the histograms and per-chromosome charts drawn on shared axes so they can be compared
by eye. Chromosomes are aligned by name after removing any `chr` prefix, so a `1` file
and a `chr1` file line up (§6, Q7).

### 3.4 Output

- **Download summary (CSV):** the side-by-side table. The first line starts with `#` and
  records the date and the settings in force.
- **Download a chart (SVG):** each chart has its own button.

## 4. How it's built

These follow from "double-click to open, nothing to install" and were checked in Chrome,
not assumed:

- **Classic scripts, not ES modules.** A page opened from a file has the origin `null`,
  and Chrome refuses to load `<script type="module">` imports from it. Plain
  `<script src="src/parse.js">` tags work. Each script adds its functions to one global
  object, `window.PeakPeek`.
- **No build step and no packages.** The charts are hand-written SVG: a histogram and a
  bar chart are about 60 lines each. If you want a charting library anyway, that's a
  decision (Q9), not a default.
- **Gzip via the browser's own `DecompressionStream`,** detected by the file's first two
  bytes (`1f 8b`), not by the `.gz` extension.
- **Tests in the browser.** `test.html` loads the scripts and the test files, runs them,
  and shows pass/fail on the page. No Node, no test runner. If you have Node, you may
  add one, but the page must keep working without it.

### Files and contracts

Fixed before any building starts, so several agents can work at the same time without
touching each other's files.

```
index.html            the page: layout, inputs, cards              (issue 1)
style.css                                                           (issue 1)
test.html             runs every file in tests/, shows results      (issue 1)
tests/assert.js       PeakPeek.test() and PeakPeek.assert (below)   (issue 1)
src/read.js           File or URL → text                            (issue 2)
src/parse.js          text → peaks, skipped, rejected, format       (issue 3)
src/stats.js          peaks → numbers                               (issue 4)
src/charts.js         numbers → SVG strings                         (issue 5)
src/app.js            wires it together; the only file that touches the page's elements  (issue 6)
tests/<name>.test.js  each issue's tests                            (issues 2–5)
examples/fixture.bed  the hand-made test file (§7), for dropping into the page
examples/fixture.js   the same text, and its answers written by a person, for test.html
```

**Why the fixture is also a script.** A double-clicked page can't `fetch` the file next
to it: Chrome blocks `file://` requests from a `file://` page, just as it blocks module
imports. So `test.html` can't read `fixture.bed` or a JSON file of answers. It *can* load
a script. `examples/fixture.js` sets `PeakPeek.FIXTURE` (the fixture's text, exactly as in
§7) and `PeakPeek.EXPECTED` (its answers). Issue 7 checks that dropping `fixture.bed` into
the page gives the same numbers, so the two copies can't drift unnoticed.

**`test.html` loads, in order:** every `src/*.js` except `app.js`, then
`examples/fixture.js`, `tests/assert.js`, and every `tests/*.test.js`. It lists them by
name, because a page can't list a folder. Then it runs the tests and shows the results.

```js
// read.js    PeakPeek.readFile(file: File) → Promise<string>
//            PeakPeek.readURL(url: string) → Promise<string>
//            Both gunzip if the first two bytes are 1f 8b. readURL throws an Error
//            whose message says which of §5's failures happened.
//
// parse.js   PeakPeek.parsePeaks(text: string, {oneBased = false} = {}) →
//              { format: "bed3" | "bed4" | "bed5" | "bed6" | "narrowPeak" | "broadPeak"
//                        | "csv" | "tsv",       // from the accepted lines' column count
//                peaks: [{chrom, start, end, name?, score?, signal?, p?, q?}],  // 0-based half-open
//                skipped: number,
//                rejected: [{line: number, text: string, reason: string}] }   // line is 1-based
//
// stats.js   PeakPeek.logBins(minWidth, maxWidth, n = 30) → number[]  // n + 1 edges
//            PeakPeek.summarise(peaks, {bins} = {}) →   // bins: edges, so several files
//                                                       // can share them (§3.3); default
//                                                       // logBins over this file's widths
//              { n, widths: {min, median, mean, max, sum}, mergedBp, duplicates,
//                chromStyle: "chr" | "bare" | "mixed",
//                perChrom: [{chrom, n}],            // natural order, then "other"
//                histogram: [{from, to, n}],        // log-scaled bins
//                scores?: {signal: [min, max], p: [min, max], q: [min, max]} }
//            PeakPeek.naturalChromOrder(a, b) → number  // for Array.prototype.sort
//
// charts.js  PeakPeek.histogramSVG(summaries: [{label, histogram}], {width}) → string
//            PeakPeek.chromBarsSVG(summaries: [{label, perChrom}], {width}) → string
//            Both return standalone SVG text, so "download SVG" is just saving the string.
//
// assert.js  PeakPeek.test(name: string, fn: () => void | Promise<void>)   // registers
//            PeakPeek.assert.equal(actual, expected, message?)
//            PeakPeek.assert.deepEqual(actual, expected, message?)
//            PeakPeek.assert.near(actual, expected, tolerance, message?)
//            PeakPeek.assert.throws(fn, pattern?: RegExp)    // pattern tested on the message
//            PeakPeek.assert.rejects(promise, pattern?: RegExp)
//            PeakPeek.runTests() → Promise<{passed, failed, results}>   // test.html calls it
```

## 5. The traps

Every one of these was hit or checked while writing this spec. Each should end up as a
test, a clear error message, or a decision.

| Trap | What happens | What the page should do |
|---|---|---|
| **The server doesn't allow it (CORS)** | ENCODE, UCSC, NCBI and raw GitHub send `Access-Control-Allow-Origin: *`, so a page can fetch from them. Zenodo, `example.com` and most lab servers don't, and the fetch fails with a bare `TypeError: Failed to fetch`. JavaScript can't tell this apart from "no internet". | Say so plainly: "That server doesn't allow web pages to read its files. Download it and drop it here instead." |
| **A share link returns a web page** | Dropbox and Google Drive share links usually return HTML, not the file. Not checked here. | If the text starts with `<`, say "this is a web page, not a peak file". |
| **Automated tests get blocked** | ENCODE returns **403, with no CORS header**, to any browser whose user agent says `HeadlessChrome`, which is what agents use to test pages. A real browser gets the file. An agent testing its own page will report "ENCODE blocks browsers", and it will be wrong. | Test URL loading against raw GitHub, or set a normal user agent. Try ENCODE by hand, in a real browser. |
| **Modules from a file** | `<script type="module">` fails from a double-clicked file (§4). The page loads blank, with the error only in the console. | Classic scripts. |
| **Gzip, and bgzip** | ENCODE's `.bed.gz` files are ordinary gzip. Files compressed with `bgzip` (common for indexed BEDs) are several gzip members end to end. Chrome 152's `DecompressionStream` hands over the first member's lines and *then* throws "Junk found after end of compressed data". Code that reads line by line and ignores the error keeps a truncated file. Code using `Response.text()` gets a misleading `TypeError: Failed to fetch`, even for an uploaded file. | Detect gzip by magic bytes. Catch that error and say "this looks like bgzip; decompress it first". Never keep a partial file. |
| **Header lines** | `track`, `browser`, `#` comments, and blank lines are legal in BED. ENCODE files have none; hand-made ones often do. | Skipped and counted, not rejected. |
| **0-based or 1-based** | BED is 0-based half-open. A CSV from R, like Vahedi's, could be either, and doesn't say. | Q2. |
| **Chromosome names** | ENCODE writes `chr1`; the Vahedi CSV writes `1`. Mouse has `chrM`, Ensembl says `MT`. Unplaced contigs like `chrUn_JH584304` turn up in ENCODE files. | Natural order, aligned across files, others grouped. |
| **Impossible intervals** | `end ≤ start`, negative starts, non-numbers. | Rejected with a reason (Q1 on `end = start`). |
| **Scientific notation** | R's `write.csv` can write large round numbers as `1e+05`. Not in the Vahedi file, but in plenty of others. | Accept whole numbers written that way; reject `1.5e2`. |
| **`-1` in narrowPeak** | Means "not given" for `pValue`, `qValue`, `signalValue` or the summit. | Don't include it in ranges. |
| **Overlaps and duplicates** | CTCF and DNase above. | Q3, Q4. |
| **Big files** | The largest reference file is 91,474 lines and reads in well under a second. A file of millions of peaks would take a few seconds, and more memory than you'd expect. | Q10. |

## 6. Open questions

Each gets one short record in `adr/`: context, decision, consequences. Suggested
defaults are **suggestions**.

| # | Question | Suggested default |
|---|---|---|
| Q1 | Is a zero-width peak (`end = start`) rejected, or kept? BED allows it for insertions. | Reject, with the reason "zero width" |
| Q2 | Are CSV/TSV coordinates 0-based or 1-based? | 0-based, with a toggle, and the choice shown on the card |
| Q3 | Are exact duplicate lines counted, dropped, or counted and flagged? | Counted and flagged |
| Q4 | "Coverage": the sum of widths, merged bp, or both? | Both, clearly labelled |
| Q5 | Which columns can name the chromosome, start and end in a CSV? | `chr`, `chrom`, `chromosome`, `seqnames`; `start`, `chromStart`; `end`, `chromEnd`; any case |
| Q6 | Histogram bins: how many, and log or linear? | 30 log-spaced bins from the smallest to the largest width across all files |
| Q7 | Show chromosome names as written, or normalised? | As written on each card; aligned by normalised name in the side-by-side view |
| Q8 | What's a file's label? | File name without extensions, editable; a URL's last path segment |
| Q9 | Hand-written SVG, or a charting library? | Hand-written. A library means a CDN (which needs the network) or a copy in the folder (whose licence you then carry). |
| Q10 | Is there a size limit? | Warn above 1,000,000 lines, but keep going |
| Q11 | What goes in "Problems"? | Rejected lines, duplicates, overlaps, mixed chromosome styles, peaks off the main chromosomes, widths over 100 kb |

## 7. Acceptance tests

1. **The fixture.** `examples/fixture.bed` below, written by hand, with its answers in
   `examples/fixture.js`. **The answers are written by a person before any code
   exists, and never edited to make a test pass.**
2. **Double-click.** Open `index.html` by double-clicking it. It loads with no console
   errors. So does `test.html`, and every test passes.
3. **Upload.** Drop all five ENCODE files at once (downloaded first). Every number
   matches §2's table.
4. **URL.** Paste the Vahedi CSV URL. It loads, and with the 0-based and 1-based settings
   matches the two rows in §2.
5. **A failing URL.** Paste a Zenodo file link. The message says the server doesn't allow
   it, not "something went wrong".
6. **Cross-check.** For one file, reproduce the peak count, median width and merged bp
   with a tool that isn't the page: `awk`, R, Python or `bedtools`. Ask an agent to write
   it, then check it doesn't reuse the page's code.
7. **Biology.** Before loading them, predict which of the five ENCODE files has the widest
   peaks, and which the narrowest. Write the prediction in the ledger first.

### The fixture

Tabs between columns. Line numbers matter: rejections report them.

```
track name=fixture description="hand-made test file"
browser position chr1:1-1000
# a comment
chr1	100	200	a
chr1	150	250	b
chr2	0	1	c
chr10	5000	6000	d
chrX	10	20	e
chrM	0	50	f
chrUn_JH584304	100	400	g
chr1	300	300	h
chr1	500	400	i
chr1	abc	600	j
chr1	1e+03	1100	k

chr1	100	200	a
chr3	2000
```

With the suggested defaults (Q1, Q3, Q4):

| Answer | Value |
|---|---|
| Format | `bed4`: BED3 plus a name column |
| Accepted | 9: `a b c d e f g k a` |
| Skipped | 4: lines 1, 2, 3 and 15 |
| Rejected | 4: line 11 (zero width), 12 (end before start), 13 (start isn't a number), 17 (too few columns) |
| Widths | min 1, median 100, mean 196 (1,761 ÷ 9 = 195.67), max 1,000 |
| Sum of widths | 1,761 |
| Merged bp | 1,611 (on chr1, `a`, `b` and the duplicate `a` merge to 150 bp) |
| Duplicates | 1 |
| Per chromosome | chr1 4, chr2 1, chr10 1, chrX 1, chrM 1, other 1 |
| Chromosome style | `chr` |

`chr10` comes after `chr2`. Sorting as text puts it first, and that is the bug this line
is there to catch.

## 8. Issues

The issues live **here, as checklists**, not on GitHub. Each one owns its files and
touches nothing else, so issues 1–5 can be built **at the same time, by different agents,
in the same folder**.

**How to use them.** An agent building an issue *reports* which boxes it believes are
met, and the evidence. **You** tick them after checking, change *Status* to
`Done — <your name>`, and add a ledger entry. Agents don't edit this file: several of
them work in the folder at once, and two editing the same file at the same moment can
silently undo each other's changes. An issue isn't done until a person says so.

| # | Issue | Owns | Needs |
|---|---|---|---|
| 1 | Page shell and test page | `index.html`, `style.css`, `test.html`, `tests/assert.js` | — |
| 2 | Reading files and URLs | `src/read.js`, `tests/read.test.js` | — |
| 3 | Parsing | `src/parse.js`, `tests/parse.test.js` | — |
| 4 | Statistics | `src/stats.js`, `tests/stats.test.js` | — |
| 5 | Charts | `src/charts.js`, `tests/charts.test.js` | — |
| 6 | Wiring it together | `src/app.js` | 1–5 |
| 7 | Acceptance | `LEDGER.md` | 6 |

### Issue 1: Page shell and test page

Spec: §3.1, §4. **Status:** Done — orchestrator, for Sean Davis (not yet reviewed by him)

- [x] `index.html` has the drop zone, file picker (several files), URL box and an empty
      results area, and loads every `src/*.js` with classic `<script>` tags
- [x] `test.html` loads the same scripts, then every `tests/*.test.js`, and shows each
      test's pass/fail on the page, with a total
- [x] `tests/assert.js` gives §4's `PeakPeek.test`, `PeakPeek.assert` and
      `PeakPeek.runTests`, with failure messages that show expected and actual
- [x] Both pages open by double-clicking, with no console errors
- [x] Works with only placeholder `src/` files, so issues 2–5 don't wait for it

### Issue 2: Reading files and URLs

Spec: §4 (`read.js`), §5 (the first five rows). **Status:** Done — orchestrator, for Sean Davis (not yet reviewed by him)

- [x] `PeakPeek.readFile` and `PeakPeek.readURL` return the file's text
- [x] Gzip detected by the bytes `1f 8b`, not the file name
- [x] Multi-member gzip (`bgzip`) gives an error saying so, never a partial file
- [x] A server that doesn't allow the fetch (CORS) gives §5's plain message
- [x] An HTML page instead of a peak file gives "this is a web page, not a peak file"
- [x] Tests for gzip, plain text, bgzip and HTML, built from bytes in the test (no network)
- [x] Checked by hand, in a real browser: one ENCODE URL and one raw GitHub URL load; a
      Zenodo URL gives the CORS message. Record which browser

### Issue 3: Parsing

Spec: §2, §5 (header lines onwards), §6 Q1–Q3, Q5. **Status:** open

- [ ] `PeakPeek.parsePeaks` returns the §4 shape, coordinates 0-based half-open
- [ ] Format detected: BED3, BED6, narrowPeak, broadPeak, CSV, TSV
- [ ] `track`, `browser`, `#` and blank lines are skipped and counted
- [ ] Rejections carry the 1-based line number and a reason
- [ ] `1e+03` is accepted and `1.5e2` rejected
- [ ] The CSV `oneBased` setting shifts start by one; the default follows Q2
- [ ] **The fixture's accepted, skipped and rejected lines match `PeakPeek.EXPECTED`**

### Issue 4: Statistics

Spec: §3.2, §4 (`stats.js`), §6 Q3, Q4, Q6, Q11. **Status:** open

- [ ] `PeakPeek.summarise` returns the §4 shape
- [ ] Median of an even count is the mean of the middle two
- [ ] Merged bp merges overlapping *and* touching peaks, per chromosome
- [ ] `PeakPeek.naturalChromOrder` puts `chr2` before `chr10`, and `chrX, chrY, chrM` after
      the numbers, with or without `chr`
- [ ] narrowPeak `-1` values are left out of score ranges
- [ ] **Every fixture number in `PeakPeek.EXPECTED` matches**
- [ ] `PeakPeek.logBins` gives n + 1 increasing edges; shared bins give comparable histograms
- [ ] Timed on 100,000 random peaks: well under a second

### Issue 5: Charts

Spec: §3.2, §3.3, §4 (`charts.js`), §6 Q6, Q9. **Status:** open

- [ ] `PeakPeek.histogramSVG` and `PeakPeek.chromBarsSVG` return standalone SVG text
- [ ] Several files share axes and have a legend
- [ ] Axis labels say what's counted, and the width axis says it's log-scaled
- [ ] Readable with colour blindness (for example, the Okabe–Ito palette)
- [ ] Tests check the SVG parses, and that a file with one peak or one chromosome doesn't
      break it
- [ ] Looked at by eye, in `test.html` or a scratch page, with the fixture and one real file

### Issue 6: Wiring it together

Spec: §3, §6 Q7, Q8, Q10. Needs 1–5. **Status:** open

- [ ] Dropping files and pasting URLs both produce a card per file, with progress
- [ ] Labels are editable; the side-by-side view appears with two or more files
- [ ] Errors from issue 2 appear on that file's card; other files still load
- [ ] The summary CSV and each chart's SVG download
- [ ] Still opens by double-clicking, with no console errors

### Issue 7: Acceptance

Spec: §7. Needs 6. **Status:** open

- [ ] Test 2: double-click, both pages, all tests pass
- [ ] Test 3: all five ENCODE files uploaded; every number matches §2
- [ ] Test 4: the Vahedi CSV by URL, both coordinate settings, matches §2
- [ ] Test 5: a Zenodo URL gives the CORS message
- [ ] Test 6: one file cross-checked with a tool that isn't the page
- [ ] Test 7: the prediction was written in the ledger *before* loading
- [ ] `examples/fixture.bed` dropped into the page gives the numbers in `PeakPeek.EXPECTED`

### Later, if you like

- Peaks per megabase, using chromosome lengths from a `chrom.sizes` URL (UCSC's allows
  web pages to read it).
- Overlap between two files: how many peaks in A touch a peak in B.
- A shareable link that reloads the same URLs.

## 9. Working together without GitHub

The project should still look like one where someone else could pick it up: what was
decided, who did what, and how it was checked.

- [ ] `README.md`: what this is, how to open it, and what state it's in
- [ ] `SPEC.md`: this file, or your version of it
- [ ] `adr/`: one record per §6 question, plus a `template.md`
- [ ] §8's issues ticked and signed off by a person, as each one is checked
- [ ] `AGENTS.md` (or `CLAUDE.md`): only what an agent can't work out by reading the folder
- [ ] `LEDGER.md`: one entry per issue: asked, did, checked how, confidently wrong, keep
- [ ] `examples/fixture.bed`, and its answers in `examples/fixture.js`, written by a person
- [ ] `test.html` passes, and the ledger says who last saw it pass
- [ ] Version history: `git`, if you have it (one commit per issue); if not, copy the
      folder to `snapshots/<date>-issue-N/` before each issue starts
