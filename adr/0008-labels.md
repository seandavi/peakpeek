# 0008 — File labels

**Status:** accepted
**Deciders:** orchestrating agent, acting for Sean Davis (not yet reviewed by him). SPEC.md §6 Q8, suggested default taken.

## Context

Each file needs a short name on charts and tables.

## Decision

The file name without extensions (`.gz`, `.bed`, `.narrowPeak`, `.csv`, …), editable. For a URL, its last path segment, likewise.

## Consequences

ENCODE accessions make poor labels; editing them is expected.
