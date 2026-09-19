# Milestone 5 pilot report

Reviewed: 19 September 2026

## Track and scope

This pilot implements Track B, constrained generated coaching. It adds at most
one deterministic extra coaching note to the existing results view. Browser
playback, Azure Pronunciation Assessment, the standard focus drill, and static
sound feedback remain unchanged.

The note is built locally from `primaryDrill()`, which selects the lowest
evidenced phoneme returned by Azure through `soundsToFix()`. Its exercise combines
that existing drill with one position-matched entry from a reviewed static tip
catalog. There is no text-model call, server route, network request, or new
runtime subscription.

## Pilot safety and operation

- The pilot is disabled by default.
- Set `NEXT_PUBLIC_ENABLE_EXTRA_COACHING=1` at build time and rebuild/restart the
  app to enable it.
- Unset the variable or set it to `0`, then rebuild/restart, to disable it.
- Missing phoneme evidence, scores at or above the focus threshold, malformed
  assessment data, and unexpected note-generation errors render no pilot note;
  the normal results remain available.
- The observation names only the sound, word, and score selected by
  `primaryDrill()`. It does not infer an acoustic cause or claim that a sound was
  omitted.

## Pilot observations

The additional note is useful as a compact bridge from a low Azure score to a
repeatable exercise: isolate the position-specific sound, practise the word and
short phrase, then repeat the sentence. This is an implementation observation;
learner usefulness still needs to be evaluated during the small pilot.

Because selection and wording are synchronous, local, and deterministic, the
feature adds no network round trip and has an incremental runtime cost of $0 per
session. A production build with the flag enabled was inspected and confirmed to
contain an enabled compile-time client gate. Direct desktop Chrome timing was not
available in this environment: the Chrome browser provider was unavailable and
native computer-control permission was denied. Do not treat latency as manually
verified until the enabled pilot is exercised in desktop Chrome with a saved or
live assessment result.

## Verification

| Check | Result |
|---|---|
| Pilot disabled by default | Passed |
| Failure falls back to standard results | Passed |
| Grounded fixture score / no invented sound | Passed |
| Enabled client gate in production bundle | Passed (`NEXT_PUBLIC_ENABLE_EXTRA_COACHING=1`) |
| Desktop Chrome latency | Not available: browser provider/OS permission unavailable |
| `mise run lint` | Passed |
| `mise run typecheck` | Passed |
| `npx vitest run` | Passed: 23 files, 148 tests |
| `mise run build` | Environment blocked: Turbopack could not bind its CSS worker port, including outside the sandbox |
| `mise exec -- npm run build -- --webpack` | Passed |
