# PeakPeek

**A peak file at a glance.** Drop in BED, narrowPeak, broadPeak or CSV peak files, or paste
URLs, and PeakPeek tells you how many peaks there are, how wide, on which chromosomes, and
what's wrong with each file, side by side.

**Try it: <https://seandavi.github.io/peakpeek/>**, or download this folder and
double-click `index.html`. No server, no install, no packages. Files you drop in never
leave your computer; URLs are fetched by your browser directly.

Paste an ENCODE file to see it work:

```
https://www.encodeproject.org/files/ENCFF714WDP/@@download/ENCFF714WDP.bed.gz
```

Double-click `test.html` to run the tests.

## How it was made

PeakPeek was built by AI agents from a specification, for the
[Penn Epigenetics Institute agentic AI workshop](https://github.com/seandavi/2026-penn-epigen-agentic-workshop),
where attendees build their own in one prompt and then change it.

- [`SPEC.md`](SPEC.md) is the source of truth. Its §8 lists the issues as checklists, each
  signed off after review.
- [`adr/`](adr/) records the decisions, [`LEDGER.md`](LEDGER.md) what was done and how it
  was checked, including what went wrong.
- Every number in SPEC §2's table was checked through the page against real ENCODE files,
  and cross-checked with `bedtools` for two of them.

The decisions were made by the orchestrating agent on Sean Davis's behalf, taking the
spec's suggested defaults, and are recorded as not yet reviewed by him.

## Licence

MIT
