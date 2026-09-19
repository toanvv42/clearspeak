# Implementation prompt — Milestone 4: Content expansion

You are working in the ClearSpeak repo (Next.js + TypeScript + Tailwind + Azure Speech).
Base: this branch already contains Milestones 1–3 (graded library, listen/retry,
progress + review). Implement **only** Milestone 4 from
`PRONUNCIATION_IMPROVEMENT_PLAN.md`.

## Goal

Grow the reviewed passage library from 44 to **120 passages** with cleared rights,
plus curated external learning links. No network import may be required to browse
built-in text.

## Current state (verify before changing)

- `content/passages/*.json` hold 44 reviewed original passages:
  A1 5, A2 6, B1.1 7, B1.2 12, B2 6, C1 4, C2 4.
- `lib/practice-content.ts` enforces per-band counts (`LIBRARY_BAND_COUNTS`),
  word-count targets, unique IDs/text, provenance, rights, and review status.

## Target distribution (plan §5, expanded library)

| Band | Have | Need | Target words |
|---|---:|---:|---|
| A1 | 5 | +7 | 8–18 |
| A2 | 6 | +12 | 15–25 |
| B1.1 | 7 | +13 | 20–30 |
| B1.2 | 12 | +18 | 20–35 |
| B2 | 6 | +14 | 25–40 |
| C1 | 4 | +8 | 25–45 |
| C2 | 4 | +4 | 25–45 |

## Rules (plan §5–§8)

- Fill gaps with **original reviewed writing first**, drafted from a
  topic/focus brief (level, everyday topic, target sound or prosodic feature,
  length, `en-US` locale). Mark levels as provisional estimates.
- At most two focus tags per passage; keep chunks with valid character
  boundaries; display annotations must never leak into the Azure reference text.
- Optional external items **only** with cleared rights and recorded evidence
  (`rights.status: cleared`, licence, `evidenceUrl`, `checkedAt`):
  evaluate ~10 VOA Learning English candidates and ~10 Tatoeba sentences;
  publish only those that pass. VOA: verify each text/audio asset is
  exclusively VOA-produced (third-party material is excluded). Tatoeba: keep
  sentence IDs, attribution, licences; check audio licences independently.
- BBC / British Council stay as **link-only** recommendations (no copied
  transcript or audio) in a separate resource list.
- Every new passage must pass `validatePassage` limits (1–60 words,
  ≤600 chars) and `validatePracticePassages`. Duplicate-check normalized text.
- Update `LIBRARY_BAND_COUNTS` to the expanded totals in the same change.

## Do not

- Import publisher content with unknown rights; when in doubt, leave it out.
- Change assessment, recording, progress, or analytics code.
- Add network fetching for built-in browsing.

## Verify

- `mise run lint`, `mise run typecheck`, `npx vitest run`, `mise run build`.
- Add/extend content-integrity tests: band counts match the table above, IDs
  unique, every passage within input limits, chunks align to text.
- Report: passages added per band, external candidates evaluated vs.
  published (with rights evidence), and the check results.
