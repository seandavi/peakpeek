# 0007 — Chromosome names

**Status:** accepted
**Deciders:** orchestrating agent, acting for Sean Davis (not yet reviewed by him). SPEC.md §6 Q7, suggested default taken.

## Context

ENCODE writes `chr1`; the Vahedi CSV writes `1`.

## Decision

Shown as written on each card. In the side-by-side view, aligned by the name without a leading `chr`, with `M` and `MT` the same.

## Consequences

A `chr1` file and a `1` file line up without either being rewritten.
