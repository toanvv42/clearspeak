# Implementation prompt — Milestone 5: Optional enhancements (small pilot)

You are working in the ClearSpeak repo (Next.js + TypeScript + Tailwind + Azure Speech).
Base: this branch already contains Milestones 1–3 (graded library, listen/retry
with slow/normal playback and sentence replay, progress + review). Run a **small,
reversible pilot** for Milestone 5 from `PRONUNCIATION_IMPROVEMENT_PLAN.md`.
Pick **one** track unless both are trivially small.

## Track A — Consistent reference audio

- Pilot consistent reference audio for a small subset of curated passages
  (e.g. one band), comparing consistent TTS or licensed human recordings
  against current browser speech synthesis on usefulness and running cost.
- Keep browser playback as the default/fallback; gate the pilot audio so it
  can be disabled without breaking listening.
- Record audio type, locale, voice, matching text version, and separate audio
  rights in the passage `audio` metadata (plan §8). Never serve audio whose
  transcript does not exactly match.

## Track B — Generated coaching (constrained)

- Generate at most one extra coaching note from **structured assessment data
  plus reviewed tips only**: require one evidenced observation (a real low
  score) and one concrete exercise.
- Never let a text model manufacture an acoustic diagnosis, invent a sound
  error the provider did not report, or contradict `primaryDrill()` /
  `soundsToFix()` in `lib/assessment-guidance.ts`.
- No new required runtime LLM subscription: keep Azure Pronunciation
  Assessment as the scorer and reviewed static tips as the default. Any model
  call must be optional, access-gated like other server routes, and must fail
  open (results still render without it).

## Do not

- Replace browser playback or static tips outright; this is a pilot.
- Add accounts, cloud sync, leaderboards, or long recordings.
- Touch content counts, progress scheduling, or the assessment pipeline
  except through existing, tested seams.

## Verify

- `mise run lint`, `mise run typecheck`, `npx vitest run`, `mise run build`.
- Add tests: pilot gating (disabled by default / failure falls back),
  coaching grounded in fixture scores (no invented errors — extend
  `tests/guidance.test.ts` style), and no unsupported sound diagnoses.
- Manually verify latency on desktop Chrome and note approximate per-session
  cost in your report.
- Report: which track, what changed, pilot observations (usefulness,
  latency/cost), check results, and how to disable the pilot.
