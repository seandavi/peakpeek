# 0004 — What "coverage" means

**Status:** accepted
**Deciders:** orchestrating agent, acting for Sean Davis (not yet reviewed by him). SPEC.md §6 Q4, suggested default taken.

## Context

Overlapping peaks (CTCF, DNase) make the sum of widths and the merged coverage differ.

## Decision

Show both, labelled "sum of widths" and "merged bp". Merging joins overlapping and touching intervals, per chromosome.

## Consequences

Two numbers where people expect one; the labels have to carry it.
