# Handover: Primitive Architecture Reset

Date: 2026-05-27

This folder is the working handover for the fresh primitive-based architecture.

## Read Order

1. `CURRENT_STATUS.md` — exact repo/prod status and what is currently changed.
2. `WHAT_WENT_WRONG.md` — incident record from the bad session.
3. `ARCHITECTURE.md` — target fresh architecture.
4. `PRIMITIVE_ROADMAP.md` — primitive-by-primitive build order.
5. `PORTRAIT_GPT2.md` — first primitive status and contract.
6. `OPERATING_RULES.md` — execution rules to prevent another production incident.
7. `RECOVERY_CHECKLIST.md` — what to verify before any next deploy.

## Executive Summary

We are no longer extending the old selfie pipeline as the foundation.

The new direction is a fresh primitive system:

- Fresh primitive contracts.
- Fresh primitive worker service.
- Fresh primitive job tables.
- Fresh storage namespace.
- Fresh queues.
- Skill graphs composed from primitives.
- Marketplace and UI built only after primitives are stable.

Current first primitive:

`portrait_gpt2` — create one realistic portrait using `gpt-image-2`.

Status:

- Contract added.
- Runtime graph accepts it.
- Runtime is disabled unless a fresh primitive worker is explicitly configured.
- No production deploy.
- No provider calls.
