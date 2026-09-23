# 0005 — CSV/TSV column names

**Status:** accepted
**Deciders:** orchestrating agent, acting for Sean Davis (not yet reviewed by him). SPEC.md §6 Q5, suggested default taken.

## Context

Tables name their columns differently.

## Decision

Chromosome: `chr`, `chrom`, `chromosome`, `seqnames`. Start: `start`, `chromStart`. End: `end`, `chromEnd`. Any case. The first matching column wins.

## Consequences

A table without those names is rejected with a message listing what was looked for.
