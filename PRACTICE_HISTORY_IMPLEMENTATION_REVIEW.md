# ClearSpeak practice-history implementation review

Reviewed: 19 September 2026

Implementation: Muse 1.3

Reviewer: Codex

## Review outcome

The implementation covers the intended architecture and most of the requested product surface, including SQLite persistence, authenticated history APIs, an IndexedDB recovery queue, History pages, saved audio playback, evaluation retry, deletion, comparison, deployment configuration, backups, and automated tests.

It is not ready to be treated as complete. The issues below should be fixed before deployment, particularly the offline recording-loss path and the broken pending-history experience.

## Findings

### P1 — Offline recordings are lost instead of queued

`components/clearspeak-app.tsx:317` returns when `navigator.onLine` is false. Attempt metadata is not created and `saver.beginTake()` is not called until line 349. Consequently, a valid finished WAV is held only in the current page and is lost on reload.

Expected behavior: every valid finished take must first receive its immutable attempt ID/metadata and enter the IndexedDB/server save path. Offline status should prevent Azure evaluation while leaving the recording queued as **Waiting to sync**.

### P1 — Pending history entries lead to broken detail pages

`components/history-app.tsx:76` reads pending IndexedDB entries but does not drain the pending queue. Queue draining currently occurs only through `useAttemptSave`, which is mounted by the Practice page.

At `components/history-app.tsx:189`, every pending item links to `/history/[id]`. If its recording has not reached the server, that route returns not found. Pending entries are also prepended regardless of the active search or filter.

Expected behavior:

- Drain pending saves after History unlock and when connectivity returns.
- Do not link a local-only attempt to a server-only detail page. Provide a useful local pending state with retry/download actions, or upload it before enabling detail navigation.
- Apply search and status filters consistently to local pending records.
- Remove or reconcile pending entries after deletion so they cannot become permanent zombie rows.

### P1 — Attempt idempotency accepts changed metadata

`lib/server/history-repository.ts:159` treats an upload as an identical replay when only reference text, duration, and audio SHA-256 match.

The same attempt ID can therefore be submitted with a different recording timestamp, title, level, source identity, library version, stop reason, scope, or locale and receive a successful idempotent response instead of `409 Conflict`. This can preserve incorrect identity and interfere with grouping and comparison.

Expected behavior: canonicalize and compare the complete immutable attempt payload plus the audio hash. Only an identical replay should succeed.

### P2 — An evaluation can be attached to the wrong passage

`lib/history/validation.ts:148` validates an evaluation result's shape, while `lib/server/history-repository.ts:229` saves it under the supplied attempt ID. Neither layer verifies that the result's normalized `referenceText` equals the attempt's stored reference text.

Expected behavior: before committing an evaluation, verify its reference text and applicable configuration identity against the stored attempt. Reject a mismatch with `409 Conflict` or a clear validation error. Add a regression test demonstrating that an evaluation for passage B cannot be attached to passage A.

### P2 — Token failures are not persisted as evaluation failures

When token acquisition fails, `components/clearspeak-app.tsx:354` waits for the recording save and calls `saver.markEvalFailed()`. At `hooks/use-attempt-save.ts:197`, that function changes only React state; it does not enqueue or store a failure evaluation.

The current tab says **Recording saved · Evaluation failed**, but after reload the database says `pending`, History labels it **Needs evaluation**, and it does not appear under the Failed filter.

Expected behavior: persist a versioned failure outcome after the recording exists, using the same idempotent evaluation-write path used for recognition failures. The visible state must reflect whether that server write actually succeeded.

### P2 — Upload limits are applied after buffering the request

`app/api/attempts/[id]/route.ts:42` calls `req.formData()` before checking the WAV Blob size. The whole multipart request can therefore be buffered before the advertised 2 MiB limit is enforced.

Expected behavior: enforce a documented total request limit before or while reading the body. At minimum reject an excessive `Content-Length` early, and use a platform/body-parser limit or streaming parser so a missing or false header cannot bypass the memory bound.

### P2 — Comparison can miss a valid previous attempt

`lib/server/history-repository.ts:125` loads only the latest 40 successful manual attempts across every passage, then filters for compatible text and identity in application code.

If more than 40 unrelated successful attempts occurred since the last matching passage, no comparison appears even though a compatible prior attempt exists.

Expected behavior: express compatibility filters in SQL where possible and select the most recent matching row. Do not impose an unrelated global 40-row window.

### P2 — Repository guidance contradicts the implemented storage feature

`AGENTS.md:37` instructs future agents to preserve browser-to-Azure submission and in-memory recording storage. The in-memory-only portion contradicts `PRACTICE_HISTORY_PLAN.md` and the new server persistence requirement.

Expected behavior: update the repository guidance to describe the actual dual data flow: finished WAVs go to the ClearSpeak server for durable history and to Azure from the browser for evaluation.

## Additional product issues to address

- The comparison UI does not coordinate its players, so the previous and current recordings can play simultaneously. The plan requires only one comparison recording to play at a time.
- The live results screen renders save status and **View in history** more than once. Consolidate these into the results header.
- Failed deletion requests in `components/history-detail-app.tsx` are not caught or explained to the user.
- Pending History summaries use zero duration, a synthetic custom source, and the queue update time instead of the immutable metadata already present in the entry.
- Several members of `useAttemptSave` are unused (`completeEvaluation`, `markAudioOnlySaved`, `revision`, and `queueFull` outside the hook). Remove them or integrate them so the persistence contract is easier to audit.

## Verification performed

| Check | Result |
|---|---|
| `rtk mise run lint` | Passed |
| `rtk mise run typecheck` | Passed |
| `rtk mise run test` | Passed: 16 files, 101 tests |
| `rtk mise exec -- npm run build -- --webpack` | Passed |
| `rtk mise run build` | Not verified: Turbopack failed while attempting to bind a local port during CSS processing in the review environment |
| `git diff --check` | Passed |

The Turbopack failure reported `Operation not permitted` while creating a process and binding a port. The same failure persisted after an elevated retry, while the webpack production build compiled, type-checked, generated pages, and completed successfully. This looks environmental rather than evidence of an application compilation defect, but the repository's normal build command still needs verification in Muse's or the deployment environment.

## Test coverage gaps

The added tests provide useful coverage for SQLite persistence, API authorization, tombstones, pagination, backup snapshots, validation, and comparison helpers. They do not exercise the client paths where the most consequential defects occur.

Add tests for:

- Finishing a valid recording while offline queues it and does not call Azure.
- Reloading and reconnecting drains a pending IndexedDB attempt exactly once.
- History renders a local-only pending attempt without linking to a missing server detail.
- Search and status filters include or exclude pending local entries correctly.
- Token acquisition failure persists an evaluation failure after audio is saved.
- A queue/server failure never reports **Saved to history** prematurely.
- Deleting a server attempt also resolves any pending local entry with the same ID.
- Replaying an attempt ID with any changed immutable metadata returns `409`.
- Saving an evaluation with mismatched reference text is rejected.
- More than 40 unrelated attempts do not hide the previous compatible comparison.
- Previous/current comparison audio cannot play simultaneously.
- Strict Mode effects and lost responses do not duplicate uploads or evaluations.

## Recommended fix order

1. Move attempt creation and IndexedDB queuing ahead of the offline/Azure checks.
2. Make pending-save recovery available to both Practice and History, and design a non-broken local-only History row.
3. Tighten server idempotency and bind evaluations to their stored attempts.
4. Persist token failures consistently and make every save-status message truthful.
5. Enforce the request size before buffering.
6. Fix the previous-attempt query and coordinate audio playback.
7. Update repository guidance, remove unused persistence APIs, and add client recovery tests.
8. Run all checks again, including the normal Turbopack build and manual browser checks.

## Ready-to-paste request for Muse 1.3

> Fix every finding in `PRACTICE_HISTORY_IMPLEMENTATION_REVIEW.md`, following the recommended order. Prioritize preventing recording loss, making pending IndexedDB attempts recoverable from both Practice and History, enforcing complete idempotency, and rejecting evaluations whose reference text does not match the stored attempt. Persist token failures truthfully, enforce upload size before buffering, find the actual most recent compatible comparison without a global 40-row window, coordinate comparison playback, and update the contradictory `AGENTS.md` guidance. Add meaningful tests for the listed client recovery and integrity cases. Preserve unrelated work and the existing Azure assessment behavior. Run lint, typecheck, the complete Vitest suite, and the normal production build; report any unavailable microphone, Safari, live-Azure, or deployment checks for Codex review.
