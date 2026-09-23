# 0003 — Exact duplicate lines

**Status:** accepted
**Deciders:** orchestrating agent, acting for Sean Davis (not yet reviewed by him). SPEC.md §6 Q3, suggested default taken.

## Context

CTCF's ENCODE file has one exact duplicate. Dropping it silently changes the count; keeping it silently inflates it.

## Decision

Counted, and flagged in Problems with the number of duplicates.

## Consequences

Peak counts match `wc -l` of the data lines, which is what people check first.
