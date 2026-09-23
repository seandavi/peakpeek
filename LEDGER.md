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
