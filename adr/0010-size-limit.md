# 0010 — Size limit

**Status:** accepted
**Deciders:** orchestrating agent, acting for Sean Davis (not yet reviewed by him). SPEC.md §6 Q10, suggested default taken.

## Context

The largest reference file is 91,474 lines. Some peak files have millions.

## Decision

Warn above 1,000,000 lines, and keep going.

## Consequences

Very large files may be slow; the warning says so rather than refusing.
