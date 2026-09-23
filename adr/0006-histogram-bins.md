# 0006 — Histogram bins

**Status:** accepted
**Deciders:** orchestrating agent, acting for Sean Davis (not yet reviewed by him). SPEC.md §6 Q6, suggested default taken.

## Context

Peak widths span 21 bp to 93 kb in the reference data: linear bins would put nearly everything in the first one.

## Decision

30 log-spaced bins from the smallest to the largest width across all loaded files, shared by every file.

## Consequences

Adding a file can change every histogram's bins. That's the price of comparability.
