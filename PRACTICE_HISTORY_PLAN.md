# ClearSpeak: saved recordings and evaluations

Prepared: 19 September 2026. Implementation handoff for Muse 1.3; subsequent code review by Codex.

Status: design only. This document does not implement features or authorize deployment.

## 1. Product decision

Make ClearSpeak a personal practice journal. Automatically keep finished voice recordings, the exact practice text, and their complete evaluations. Make it easy to return later, listen again, repeat a passage, and compare attempts.

The owner has explicitly chosen convenience and persistent storage. Do not add recording-storage consent dialogs, an opt-in toggle, automatic expiry, account registration, or a privacy settings screen. Saving is the normal behavior.

Keep the existing personal access code and server-side Azure key handling. These already protect access and paid service usage; keeping them does not add a new user workflow. Replace prominent privacy messaging with useful practice and saving status.

This plan supersedes the storage recommendations in `PRONUNCIATION_IMPROVEMENT_PLAN.md`: in-memory-only audio, optional persistent recordings, local summary history, a 200-attempt history cap, and deferring server storage no longer apply. Its learning/content recommendations remain separate work. `BUILD_PROMPT.md` describes the original product and must not override this new persistence requirement.

### First-release scope

- Automatic recording and evaluation storage on the app's server.
- A simple **Practice / History** navigation.
- Full playback and evaluation detail for previous attempts.
- **Record again** and comparison with the previous comparable attempt.
- Retry evaluation of an existing recording after a failure.
- Search, a few filters, individual downloads, and individual deletion.
- Reliable saving status, recovery of pending saves, and a documented database backup/restore procedure.

Defer reminders, streaks, favorites, notes, graphs, AI coaching, long recordings, bulk deletion, user accounts, and a general offline app. Do not build a large dashboard before the journal works.

## 2. Repository facts and assumptions

The current implementation has:

- Next.js App Router, React, TypeScript, and a toolchain pinned in `mise.toml` to Node 24.20.0.
- A 44-passage library with stable IDs/versions, custom-text identities, and browser reference voices.
- `hooks/use-pcm-recorder.ts`: mono 16-bit PCM WAV at 16 kHz, a 30-second cap, and an in-memory Blob/object URL.
- `components/clearspeak-app.tsx`: recording/assessment state, duplicate-finish guards, cancellation, and active passage identity.
- `lib/azure/pronunciation.ts`: browser-to-Azure assessment; the server supplies short-lived credentials.
- `AssessmentResult` in `lib/types.ts`: scores, recognized/reference text, words, inserted words, syllables, phonemes, alternatives, and available timings.
- Reusable results and audio-player components, but no persisted attempts or database.
- Production/staging systemd service templates running a Node server on one host with distinct app directories.

Architecture assumption: continue with the persistent single-host deployment suggested by those service templates. It has not been verified against a live server. History is shared by devices that access that same server. A development instance has its own history. Do not promise synchronization between separate deployments.

## 3. Experience design

### Practice home

Preserve the current warm neutral cards, blue accents, passage library, and responsive layout. Keep recording as the primary task.

Place **Practice** and **History** in the header, with the active view clearly marked. On mobile use the same two visible navigation choices; no hamburger menu is necessary. Use URLs `/` and `/history`, with `/history/[id]` for saved detail, so browser Back and reload work naturally.

Show a compact **Continue practicing** card above the editor when history exists: latest passage title, date, latest available score, **Record again**, and **View result**. Hide it for an empty history. Do not delay opening the editor while loading history.

Below the record action, use one quiet sentence: “Finished recordings and feedback are saved automatically.” No confirmation is required for each take.

### Finish and results

Keep **Finish & analyze** as one action. Automatic stopping at 30 seconds follows the same save path. Save the finished WAV even if Azure later fails.

At the top of results show passage title, recording date/duration, and a small accessible save-status label. Keep the full existing feedback below it. Make playback easy to find near the top.

| State | Copy and behavior |
|---|---|
| Upload in progress | “Saving recording…” |
| Recording saved, evaluation running | “Recording saved · Analyzing…” |
| Audio and successful evaluation acknowledged by server | “Saved to history” |
| Only browser recovery copy exists | “Saved on this device · Waiting to sync” |
| Server saved audio but not the latest evaluation | “Recording saved · Feedback waiting to sync” |
| Neither durable write succeeded | “Not saved — keep this tab open” with **Retry save** and **Download recording** |
| Evaluation failed, recording saved | “Recording saved · Evaluation failed” with **Retry evaluation** |

Do not claim a server save before its response confirms a committed write. Show scores as soon as Azure returns them; a slow history write must not hide the feedback.

Primary action: **Record again**. Secondary: **New text**. Link: **View in history** when a server record exists. Record again preloads the exact passage but waits for the user to start the microphone.

### History list

Newest first, grouped visually by recording date in the browser's local timezone. Use cards/rows with generous touch targets, not a wide spreadsheet.

Each row contains title or a short custom-text excerpt, level when known, date/time, duration, overall score when available, and a status such as **Evaluated**, **Needs evaluation**, or **Evaluation failed**. Clicking a row opens its detail. Do not load audio for every row.

Provide text search over title and reference text, an **All / Evaluated / Needs evaluation / Failed** filter, and **Load more** after 20 records. Preserve filters and pagination context when returning from detail. Merge pending local saves into the list without duplicate IDs and label them **Waiting to sync**.

Empty state: “Your practice history starts with your first recording.” Action: **Start practicing**. A failed history request should show **Retry**, not an empty-history claim.

### Saved detail

Show exact saved text, title/level snapshot, recording date, duration, playback, complete evaluation, and available comparison. Reuse existing word/syllable/phoneme feedback. Loading a saved evaluation must not request a new Azure token or run assessment.

Actions: **Record again**, **Download recording (.wav)**, **Download evaluation (.json)** when present, and **Delete attempt** in a secondary menu. Failed or unevaluated attempts additionally offer **Retry evaluation**, using their saved WAV and text.

Confirm individual deletion with “Delete this recording and its evaluation?” On success return to History and announce deletion. No bulk-delete UI in this release. Explain in operational documentation that database backups may still contain deleted attempts.

Missing/unreadable audio should show an audio error with retry while retaining readable feedback. A deleted or unknown detail URL gets a clear not-found screen and a History link.

### Compare attempts

On a newly evaluated take and on saved detail, show a compact **Compared with your previous attempt** section when a compatible older take exists. Select the most recent evaluated compatible take before the selected recording, rather than an arbitrary latest row.

Show previous/current overall score and signed difference, plus available accuracy, fluency, completeness, and prosody values. Missing scores display “—”; never convert them to zero. Add two labeled players, **Previous** and **This attempt**, allowing only one to play at a time. Keep the previous audio lazy-loaded until requested.

Compatibility requires equal exact normalized reference text, practice scope, locale, assessment configuration, and evaluation schema version. Library attempts also require the same passage ID and version. Custom-text hashes alone are insufficient: the existing helper uses a short non-cryptographic hash, so verify the actual text. A changed passage/version/configuration starts a separate comparison group.

Label 30-second auto-stopped recordings and exclude them from automatic comparison in this release. Both takes must have successful evaluations. Differences are practice feedback, not CEFR progression claims. Do not add a global average across unrelated passages.

## 4. Storage architecture

Use one SQLite database on the app server, containing metadata, parsed evaluation JSON, and WAV bytes. For this personal app with recordings capped at 30 seconds, a BLOB in a separate audio table keeps creation/deletion/backup transactional and avoids coordinating database rows with loose audio files.

A maximum-length PCM payload is approximately `16,000 × 2 × 30 = 960,000` bytes plus its WAV header. One thousand maximum-length recordings use roughly 0.96 GB before database overhead and backups. Keep everything until explicitly deleted; do not silently evict older attempts. Keep history queries restricted to metadata so they never read audio BLOBs unnecessarily.

Preferred database interface: built-in `node:sqlite`, isolated in a server-only module using Node-runtime route handlers. Node's version-24 documentation describes `DatabaseSync` and its backup interface. Verify availability/API status on the repository's exact pinned runtime before coding; update the current Node-20 TypeScript definitions to the matching runtime major if needed. Treat synchronous operations as short bounded transactions; never keep one open during network requests. [Node 24 SQLite documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)

Set `CLEARSPEAK_DATA_DIR` explicitly in production. Suggested locations based on the service templates:

- Production: `/home/ubuntu/data/clearspeak`
- Staging: `/home/ubuntu/data/clearspeak-staging`
- Development default: `.data/clearspeak` in the project, gitignored.

Store `clearspeak.sqlite` under that directory. Production must not silently fall back to temporary or application-release directories. Confirm directory permissions for the existing service user, and initialize the database lazily at runtime rather than during Next.js build. Give tests an isolated temporary directory.

Use versioned migrations, foreign keys, prepared statements, WAL mode, a bounded busy timeout, and durable commits. Do not introduce an ORM, remote database, object-storage service, or job system for this scope. Keep database types out of client bundles.

The resulting persistence design requires durable disk and a single app host. Update the README's generic hosting instructions accordingly; an ephemeral/serverless filesystem is not a compatible production storage target.

## 5. Data contract

Use one `attemptId` UUID per finished take. Generate it once when a recording starts and retain it through audio preparation, assessment, persistence retries, and rerenders. Cancelled recordings never create durable attempts. A fresh recording always gets a fresh ID.

Persist these logical records; exact SQL names may follow repository conventions:

| Record | Required data |
|---|---|
| Attempt | ID, schema version, client recording timestamp, server creation timestamp, duration, stop reason (`manual` or `limit`), reference text snapshot, title/level snapshot, source identity, scope (`passage` initially), locale, evaluation state, revision |
| Audio | Attempt ID with cascade delete, WAV BLOB, byte length, content hash, format metadata |
| Evaluation | Attempt ID, evaluation ID for idempotent writes, evaluation timestamp, versioned `AssessmentResult` JSON, assessment configuration snapshot, normalized available scores for lists, sanitized failure kind/message when failed |

Source identity is `{kind: "library", id, version}` or `{kind: "custom", hash}`. Store the exact text and title independently so deleted/edited library entries still open correctly. Do not substitute today's library text when repeating a historical version; retain its old identity only when using its unchanged snapshot.

Assessment configuration records provider (`azure`), SDK version, locale, effective prosody flag, phoneme alphabet, granularity, grading system, miscue setting, and an app evaluation/parser version. Use explicit `null`/missing semantics for unavailable scores. Store all fields currently present in `AssessmentResult`, including inserted words and phoneme alternatives; a score summary alone is insufficient.

The server validates evaluation shape and derives list scores from that payload. Scores must be finite and within 0–100 when present. Bound nested array sizes/text lengths; preserve legitimate omissions. This personal client-submitted assessment is suitable for a journal, not independently verified scoring.

No tokens, Azure subscription keys, app access codes, or object URLs belong in these records. Full raw Azure responses are unnecessary for this release. Recompute existing deterministic coaching from saved results and retain its version marker; preserving every historical rendering of coaching prose is out of scope.

## 6. Saving and failure recovery

Separate recorder/assessment state from persistence state. Do not grow the existing `PracticePhase` into a combined state machine for every upload condition. Use an attempt repository/client service and a dedicated persistence hook; components render their status.

1. Start: freeze text, source identity, and attempt ID for this take.
2. Finish: validate the finalized WAV. Discard cancelled/under-minimum takes with the existing clear message; save valid takes, including silence that later fails evaluation.
3. Write a browser recovery entry to IndexedDB containing ID, metadata, and Blob. Never put audio in localStorage. If IndexedDB fails, continue with the in-memory snapshot and surface its limited durability.
4. Start the server recording upload and normal Azure assessment independently. Upload failure must not suppress an available assessment; evaluation failure must not discard audio.
5. When Azure returns, render its result immediately and add it to the recovery entry. Queue evaluation persistence behind successful server creation of the recording.
6. Remove local queued data only when every required server write is acknowledged. Failed assessments can sync their failure state too; they are then fully saved attempts.
7. After unlock, on reconnect, and on **Retry save**, drain pending saves sequentially with bounded backoff. Stop retries for invalid payloads and pause on authorization failure. Never put credentials in queue entries.

The recovery queue is a small pending-upload buffer, not a second permanent history database. Bound it to 20 attempts or 25 MB. Do not evict unsynced work when full: warn, retain the current take in memory, and offer retry/download. Browser storage may be denied, cleared, or evicted, so only a server acknowledgment earns **Saved to history**.

Refresh recovery uploads existing data only. Never automatically rerun Azure evaluation after refresh, reconnect, or an uncertain response. If the tab closed during assessment and no result was saved, the recording becomes **Needs evaluation**, with an explicit **Retry evaluation** action. Azure requests happen in the browser, so no assessment continues on the server after the browser closes.

Within the app, keep persistence alive while switching Practice/History or starting another take; use immutable Blob snapshots rather than a recorder object URL that the recorder may revoke. Stop reference/recorded audio before a new microphone session. Revoke playback URLs when their consumers release them.

Preserve existing duplicate-finish, auto-stop, abort, and stale-callback protections. Navigation during recording/assessment should explicitly finish or cancel that active operation before leaving; completed pending saves can continue independently. Cancel during recording saves nothing. Aborting assessment after Finish retains the completed recording for later evaluation.

Once an attempt is successfully evaluated, do not offer paid reassessment of the identical audio in this release. **Record again** creates a new take. Failed/unevaluated attempts may retry; save retries reuse the existing evaluation ID and never invoke Azure.

## 7. Server endpoints and consistency

All history endpoints use the existing access-code policy, including reads, audio, downloads, and deletion. Extract its shared server check rather than duplicating it in every handler. Preserve production fail-closed behavior and the existing development exception. Return `Cache-Control: no-store` for personal history responses.

| Endpoint | Contract |
|---|---|
| `PUT /api/attempts/[id]` | Multipart immutable metadata + WAV; create audio and attempt atomically; identical retry returns the existing record; changed payload under the same ID returns 409 |
| `PUT /api/attempts/[id]/evaluation` | Validated outcome + evaluation ID + expected revision; idempotent replay succeeds; atomically update outcome/list fields; stale conflicting outcome returns 409 |
| `GET /api/attempts` | Search/filter/cursor pagination; 20 summaries by default, bounded maximum; stable ordering by recorded timestamp and ID; no WAV/full evaluation payloads |
| `GET /api/attempts/[id]` | Metadata, full saved evaluation/failure, revision, and compatible previous-attempt summary/ID if available |
| `GET /api/attempts/[id]/audio` | Authenticated WAV response used for playback/download |
| `DELETE /api/attempts/[id]` | Atomically delete audio/evaluation and retire the ID; repeat deletion succeeds |

Fetch saved audio with the access header, then create a Blob URL for the player. An HTML audio element cannot attach the app's custom access header itself. Do not place access codes in URLs. The same authenticated fetch supports WAV download; evaluation JSON can be downloaded from validated detail data with versioned metadata.

Validate WAV headers, channel count, sample rate, bit depth, actual payload length, and duration against the current recorder contract. Use a small documented duration tolerance for recorder scheduling, not an arbitrary longer-recording allowance. Enforce a bounded total request size (proposed 2 MiB) while reading, not only through `Content-Length`; reject malformed/oversize input clearly. Keep existing text limits. Return distinct unauthorized, invalid, conflict, not-found, busy, and storage-unavailable responses without exposing paths/secrets.

Use transactional revision checks so a delayed failure cannot overwrite a successful evaluation. For identical evaluation IDs, verify identical content before treating the write as a replay. On conflict, refetch and reconcile without automatically spending another Azure request. Deletion retains a minimal ID tombstone so another tab's delayed upload cannot resurrect a deleted take; return 410 to that stale upload and stop its local queue retries.

Do not count save/list traffic against Azure token-mint limits. Database availability must not be required to display the practice editor or return Azure feedback. Storage failures are visible and retryable; never fall back silently to an in-memory server database.

## 8. File-level implementation map

Suggested organization; Muse may adjust names while preserving boundaries:

| Area | Files/work |
|---|---|
| Shared contracts | `lib/history/types.ts`, validation, comparison compatibility helpers |
| Server persistence | `lib/server/history-db.ts`, `lib/server/history-repository.ts`, versioned migrations |
| Shared gate | `lib/server/access.ts`; reuse in existing access/token routes and new routes |
| API | Route handlers matching section 7, explicitly using Node runtime |
| Client persistence | `lib/history/client.ts`, `lib/history/pending-saves.ts`, `hooks/use-practice-history.ts` |
| Practice integration | Refactor `components/clearspeak-app.tsx` carefully; reuse existing recorder and Azure assessment |
| Journal UI | History list/detail components; `/history` and `/history/[id]` pages; shared header/unlock shell |
| Feedback/playback | Extend `results-view.tsx`; generalize `last-recording-player.tsx`; add compact comparison/save-status components |
| Operations | `.env.example`, `.gitignore`, deployment examples, backup/restore script or documented commands, README |
| Verification | Repository/API, queue, compatibility, UI, and recording-regression tests |

Direct history links must pass through the same unlock flow and return to the requested page. Reuse the existing tab credential behavior; do not add a new account/session system to this change.

Update obsolete copy in `components/clearspeak-app.tsx`, `components/analyzing-state.tsx`, `components/last-recording-player.tsx`, `components/access-gate.tsx`, and README. Suggested header subtitle: “Practice, listen, improve.” Suggested access heading: “Open ClearSpeak.” Keep one accurate data-flow explanation in README: recording is sent to the app server for storage and to Azure for evaluation. Update comments that incorrectly imply the WAV never reaches the app server.

## 9. Backups and deployment

Provide a repeatable backup command using a consistent SQLite snapshot/backup mechanism, plus a restore procedure tested against a separate temporary database. Do not copy only the live main database file while ignoring its WAL. SQLite documents its online backup API and `VACUUM INTO` as snapshot approaches. [SQLite backup documentation](https://www.sqlite.org/backup.html)

Before production rollout, confirm the persistent directory, keep staging separate, back up existing data before migrations, and verify one saved attempt survives a service restart and app rebuild. Document disk use and that deletion makes SQLite space reusable but may not immediately shrink the file. Never delete old practice to free space automatically.

Provide operator instructions for scheduled snapshots and copying them off the app host. Actual scheduling/production deployment is a separate rollout action; Muse should report whether either remains undone. A backup held only on the app's disk does not cover losing that disk.

Existing ephemeral recordings cannot be recovered retroactively. Start history empty. Do not claim to migrate sessions the app never stored.

## 10. Implementation order

1. **Persistence foundation:** verify pinned Node support; build schema/migrations, shared authorization, bounded upload validation, repository, and API. Test real temporary SQLite files and reopen behavior.
2. **Automatic saving:** integrate immutable attempt snapshots, separate save state, IndexedDB pending queue, idempotent writes, and failed-evaluation recovery. Update storage copy alongside this behavior.
3. **History experience:** add navigation/list/detail, authenticated replay, downloads, deletion, pending rows, and Continue practicing. Verify direct links and mobile layout.
4. **Repeat and compare:** exact saved-text preload, compatibility rules, previous/current scores and playback. Preserve old attempts.
5. **Handoff verification:** regression checks, browser walkthrough, documentation, backup/restore rehearsal, and implementation summary for review.

These are implementation checkpoints for one first release, not permission gates. Complete them in order. Do not mix the earlier content-expansion/coaching milestones into this work.

## 11. Acceptance and review checklist

- [ ] A normal take automatically saves audio, exact reference text, complete evaluation, and passage/configuration identity without an extra save click.
- [ ] Reload, browser restart, and app-server restart retain saved attempts; another authorized browser on the same server can open them.
- [ ] Reading history and replaying audio do not call Azure. Retry save does not call Azure either.
- [ ] An Azure failure retains the WAV; explicit Retry evaluation uses that WAV without microphone access.
- [ ] Double Finish, auto-stop/manual-stop races, repeated uploads, Strict Mode effects, and lost responses do not create duplicate attempts or outcomes.
- [ ] Cancelled and too-short takes create no history. A valid take with no recognized speech remains available.
- [ ] A failed upload displays truthful status and survives reload when the local queue succeeds; denied/full browser storage has a visible fallback.
- [ ] Refresh during assessment leaves a recoverable unevaluated recording and never auto-bills a fresh evaluation.
- [ ] A new take does not revoke audio needed by a pending save or comparison; switching/retrying cannot attach old results to a new take.
- [ ] Library edits, changed text/settings, absent scores, and cutoff recordings cannot produce misleading comparisons.
- [ ] Historical text/results still open after the library entry is changed or removed.
- [ ] Authorization applies to list/detail/audio/create/evaluation/delete; no credentials appear in URLs or stored payloads.
- [ ] Malformed/oversize uploads, missing IDs, stale revisions, unwritable disk, and database busy errors produce useful errors without breaking the editor.
- [ ] Delete removes the take and its feedback, and delayed writes from another tab cannot recreate it.
- [ ] History pagination/search are stable with identical timestamps; list requests contain no audio BLOBs.
- [ ] Keyboard navigation, focus after unlock/delete, live save-status announcements, small-screen layout, and playback controls work.
- [ ] A consistent backup restores into an isolated database with matching attempt metadata, feedback, and playable WAV bytes.

Run `rtk mise run lint`, `rtk mise run typecheck`, `rtk mise run test`, and `rtk mise run build`. Add meaningful integration tests for transactional persistence/idempotency/deletion, queue recovery, comparison eligibility, and UI failure paths. Keep the existing recording/cancellation regressions passing. Manually exercise a real microphone in desktop Chrome and mobile Safari when available; report any browser/device or live-Azure checks that were unavailable rather than claiming them passed.

For Codex review, supply changed files, architecture decisions/deviations, test outputs, screenshots of Practice/History/detail on desktop and mobile, and any operational steps still pending. Review should concentrate on data loss, incorrect attempt/result pairing, duplicate Azure calls, persistence across deployment, and whether the normal workflow remains simple.

## 12. Ready-to-paste request for Muse 1.3

> Implement `PRACTICE_HISTORY_PLAN.md` in this repository, completing the first-release scope through its acceptance checks. This plan supersedes the old privacy-first/local-only storage requirements. Automatically save finished voice recordings and complete evaluations; add History, replay, repeat/compare, downloads, deletion, and reliable pending-save recovery. Keep the current Azure assessment, passage library, recording limits, and personal access gate. Use the existing persistent Node deployment with SQLite, following the plan's runtime verification and storage requirements. Preserve unrelated work. Do not implement deferred features or deploy to production. Run the repository checks, document any unverified manual checks and remaining rollout steps, and provide a concise handoff for Codex review.
