# Ledger — PeakPeek

A running record of what I asked an agent to do, what it did, and how I checked.

One entry per task. Keep it terse — this is a lab notebook, not a report. The only
field that must never be left blank is **Checked how**.

---

Roles: *SD* is Sean Davis. *Orchestrator* is the AI agent acting as maintainer on his
behalf; its decisions are not yet reviewed by him. *Worker* is an AI agent building one
issue.

---

## Entry 1 — Scaffold: spec, decisions, fixture

**Asked** — *SD*: build PeakPeek locally, as an attendee would, following the workshop
exercise. No GitHub until it's finished.

**Orchestrator did** — Copied SPEC.md from the workshop. Recorded all eleven §6 decisions
in `adr/`, taking the suggested defaults. Wrote `examples/fixture.bed` and its answers in
`examples/fixture.js`, plus placeholder `src/` and `tests/` files so issues 1–5 can
start at once.

**Checked how** — *Orchestrator*: in Chrome, a double-clicked page that `fetch`es
`examples/fixture.bed` is blocked ("Cross origin requests are only supported for protocol
schemes: … http, https …"). The fixture answers were recomputed by a separate script from
the fixture text.

**Confidently wrong** — The spec, already reviewed, planned an `expected.json` that
`test.html` could never read, because a double-clicked page can't fetch its neighbours.
Setting up the project exposed three more gaps in its contracts: no shared test API for
four parallel test files, no `bed4` format value for a fixture that is BED4, and per-file
histogram bins where §3.3 needs shared ones. All four were fixed in the spec before any
worker started.

**Keep** — Setting up the folder is the first test of the spec. Do it before handing out
issues.

---

## Entry 2 — Issues 1–5, built in parallel in one folder

**Asked** — *Orchestrator*: five workers at once, one per issue, each told to edit only
its own files, not SPEC.md, and not to commit.

**Worker did** — Built the page shell and test page, reading, parsing, statistics and
charts: 77 tests in all. Each reported which §8 boxes it believed were met, with evidence.

**Checked how** — *Orchestrator*, per issue, before ticking its boxes:
- `test.html` in Chrome 152 via `file://`: 77 passed, 0 failed, no console errors.
- In a scratch copy: changing `EXPECTED.mergedBp` to 1612 failed 1 test; disabling the
  zero-width rule failed 6. The tests really do check the hand-written answers.
- Repeated issue 2's live check: ENCODE 25,099 lines, Vahedi CSV 49,782, Zenodo gives
  the CORS message.
- Drew both charts from three real ENCODE files through read, parse and stats: n, median
  and merged bp match SPEC §2. Looked at the screenshot.
- Not re-run: issue 4's worker's check of all five ENCODE files against §2 (Test 3 in
  issue 7 covers it through the page).

**Confidently wrong** — *Orchestrator*: while the workers ran, committed a spec change
with `git commit -a`. The placeholder `src/` files were tracked, so it also committed
three workers' half-written code. Caught by the issue 3 worker; the commit was redone
with SPEC.md only (not yet shared, so rewriting it was safe). While agents share a
folder, commit named paths only.

**Keep** — "Report the boxes; a person ticks them" worked: five agents, no clashes in
SPEC.md. Open questions for SD: R writes `1.5e+07`, which the spec rejects (proposed
ADR: accept scientific notation that is a whole number); the shared 0–100 % histogram
axis makes broad distributions look flat.

---

## Entry 3 — Issue 6 and acceptance (issue 7)

**Asked** — *Orchestrator*: one worker wires the page (issue 6); then the orchestrator
runs §7's acceptance tests itself.

**Worker did** — `src/app.js` and `style.css`: cards with progress, editable labels,
problems, rejected lines, shared bins, the 1-based toggle, side-by-side table and charts,
CSV and SVG downloads.

**Checked how** — *Orchestrator*, in Chrome 152 via `file://`:
- `fixture.bed` through the file picker: 9 peaks, 4 skipped, rejected lines 11, 12, 13,
  17 with the expected reasons, merged 1,611, 1 duplicate. Matches `PeakPeek.EXPECTED`.
- All five §2 ENCODE files by URL together, plus the Vahedi CSV at both settings: every
  number in the side-by-side table matches §2. Zenodo errors on its own card.
- `bedtools merge` on CTCF and DNase: sum, merged bp and duplicates agree.
- Not checked: that Chrome saves the downloads to disk (the worker checked their
  contents); the five ENCODE files as uploads rather than URLs.

**Confidently wrong** — Test 7 (predict before loading) can't be done by an agent that
wrote §2's table. Left unticked rather than faked.

**Keep** — Building 1–5 took the workers 3–8½ minutes each; issue 6 about as long. Setting
up the spec and reviewing took far longer, which is the point, and the thing to budget
for. Follow-ups: the card shows chromosome style as `chr1` rather than "with chr"; the
side-by-side view sits below every card.

---

## Entry 4 — A second build, in one prompt, for comparison

**Asked** — *SD*: make the workshop exercise a one-shot build.

**Orchestrator did** — Gave one fresh agent the workshop's SPEC.md in an empty folder and
the one-prompt build from the exercise. Folded what it found back into this spec.

**Checked how** — *Orchestrator*: it took 14.5 minutes; its `test.html` passes 62 of 62;
the fixture and CTCF through its page match §2, in Chrome 152. `sort | uniq -d` on CTCF:
0 identical lines, 1 pair with the same chromosome, start and end.

**Confidently wrong** — *Orchestrator*: SPEC §2 said CTCF has "an exact duplicate line".
It has a duplicate *peak*: same coordinates, different scores. Also, "overlapping
peaks" and the side-by-side axis were never defined, and the two builds chose
differently (CTCF overlaps: 1,763 against an earlier peak vs 3,457 against any other).
The spec now defines both as this build does. ADR-0003 has a correction note.

**Keep** — A second independent build is a cheap test of a spec: every place the two
disagree is a sentence the spec didn't write.
