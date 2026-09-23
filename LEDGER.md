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
