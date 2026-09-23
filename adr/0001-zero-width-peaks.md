# 0001 — Zero-width peaks

**Status:** accepted
**Deciders:** orchestrating agent, acting for Sean Davis (not yet reviewed by him). SPEC.md §6 Q1, suggested default taken.

## Context

BED allows `end = start` (an insertion point), but a peak caller never produces one, and a zero-width peak in a peak file is almost always a bug upstream.

## Decision

Rejected, with the reason "zero width".

## Consequences

A file of insertion sites would be rejected wholesale; the rejection list makes that obvious.
