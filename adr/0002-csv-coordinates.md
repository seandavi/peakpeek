# 0002 — CSV/TSV coordinates

**Status:** accepted
**Deciders:** orchestrating agent, acting for Sean Davis (not yet reviewed by him). SPEC.md §6 Q2, suggested default taken.

## Context

BED is 0-based half-open. A CSV from R could be either, and the Vahedi file doesn't say. The difference is 1 bp per peak (SPEC §2).

## Decision

0-based by default, with a 1-based toggle; the choice is shown on the file's card.

## Consequences

Widths from a 1-based file read as 0-based are 1 bp short. The card says which was assumed, so it's never silent.
