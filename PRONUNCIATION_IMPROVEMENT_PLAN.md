# ClearSpeak improvement and graded content plan

Prepared: 19 September 2026. Scope: product and implementation planning; no app features or sample imports are implemented by this document.

## 1. Recommended direction

Turn ClearSpeak into a daily pronunciation practice tool with a simple learning loop:

**Choose a short passage → listen → record → practise one weak point → record again → review later.**

The focused-drill, progress, DuckDB analytics plugin, and database evolution design is specified in
[`LEARNING_ANALYTICS_PLAN.md`](./LEARNING_ANALYTICS_PLAN.md). That plan keeps SQLite as the
transactional source of truth, uses DuckDB only as an optional read-only analytics plugin, and
defers PostgreSQL and Docker Compose until explicit scaling triggers are met.

Start with your self-estimated B1.2 level, American English, and a 10–15 minute session. Keep the existing Next.js app and Azure pronunciation assessment. The first release should add a graded sample library, better listening controls, and useful retry feedback. Add local progress tracking next.

Treat B1.2 as an app sublevel within B1, not a verified placement result. Reading difficulty and pronunciation difficulty are different: a learner may understand B1 vocabulary while needing an A2 sentence to practise one sound. Allow independent choices for text level and pronunciation focus.

The learning goal is clear, understandable speech. The Council of Europe's B1 pronunciation descriptors allow influence from other languages while emphasizing intelligibility, stress, and intonation. A perfect accent or a particular Azure score is not the definition of B1 or B2. [CEFR Companion Volume, phonological control, printed p. 134](https://rm.coe.int/16809ea0d4)

## 2. What the app already provides

Repository inspection found:

| Area | Existing implementation | Improvement opportunity |
|---|---|---|
| Practice text | One `SAMPLE_TEXT` in `lib/text.ts`; paste or load through `components/practice-editor.tsx` | Add a searchable, graded library with stable passage IDs |
| Recording | Browser recording, 30-second cap, 1–60 words and 600 characters | Author shorter passages and support sentence-sized practice |
| Model listening | Browser speech synthesis with an `en-US` voice preference | Add voice selection, slow/normal playback, sentence replay, and playback status |
| Assessment | Azure phoneme assessment, IPA, word/syllable results, optional prosody | Keep this foundation and turn feedback into a next exercise |
| Feedback | Weak sounds, ending alerts, weakest-metric advice | Explain one actionable target in plain English; retain details behind expansion |
| Retry | “Try again” resets the result | Preserve the previous result for comparison |
| Progress | No persisted results or history | Save compact practice summaries locally, with deletion/export |
| Accent | Assessment fixed to `en-US` | Start with matching US reference audio; evaluate other locales separately |

The existing tests cover recording, alignment, parsing, guidance, access checks, and assessment cancellation. Extend these tests as features change. This planning review did not run the app or assess your speech.

## 3. Pronunciation practice for your estimated B1.2 level

### Start with a small baseline

Use three original passages: a familiar daily situation, a short past-tense story, and a work update. Record each once, listen back, and select one or two recurring difficulties. Let the user adjust the starting level at any time.

Suggested practice categories are final consonants and clusters, word stress, vowel contrasts such as “ship/sheep,” thought groups, linking, and sentence emphasis. These are candidate exercises, not a diagnosis of your pronunciation or assumptions about your first language.

### Daily session: 10–15 minutes

1. Review yesterday's target for two minutes.
2. Listen to one 20–35-word B1 passage, check its meaning, then replay individual sentences.
3. Record the passage once. Show one main coaching suggestion and up to two supporting examples.
4. Practise the target word in a short phrase, then repeat the full passage once or twice.
5. Compare the recordings and save a simple note: “clearer,” “about the same,” or “still difficult.”

Use roughly 70% comfortable B1 practice, 20% easier targeted drills, and 10% B2 stretch material as an initial product setting. Adjust from actual experience; this is a proposed routine, not a validated learning formula.

### Weekly review

Repeat one fixed passage under similar conditions and try one unseen passage with the same sound target. Track whether improvement carries into unfamiliar text. Add a short retelling in your own words for self-listening; do not score that retelling against the original script.

Suggest harder text when several different passages feel comfortable, fewer repetitions are needed, and the learner wants a challenge. Never automatically claim “you are B2” from a read-aloud score.

## 4. Feature priorities

### P0 — Graded library and a useful practice loop

- Replace “Use sample text” with “Browse practice texts.” Filter by level, topic, and pronunciation focus; offer a random unpractised passage.
- Start the library at B1.2 while keeping every level accessible. Preserve paste-your-own-text mode.
- Show title, approximate difficulty, word count, focus, source, and an estimated duration before recording.
- Add slow/normal listening, stop/replay, and sentence selection. Handle delayed browser voice loading and missing US voices explicitly. Label synthesized audio as a browser voice.
- Keep the previous result during retry; compare the same text and assessment settings. If the learner edits the text, treat it as a different practice item.
- Display one primary correction with a concrete exercise. Example: “Practise the ending in ‘worked’: listen, say ‘worked late,’ then repeat the sentence.”
- Keep score details and IPA available, but make the default instructions understandable without knowing IPA.

Acceptance: a learner can choose a B1.2 text, listen, record, understand one suggested action, and compare a retry without leaving the practice flow.

### P1 — Targeted practice and local progress

- Add a reviewed sound-tip catalog with plain-language instructions, example words, and short contrast drills. Use assessment results to select a tip; do not invent a sound error when the provider omits phoneme data.
- Add “Practise this sentence” and “Practise this sound.” Preserve the parent passage ID and distinguish drill results from full-passage results.
- Save recent session summaries, favourite passages, practiced targets, and review due dates locally.
- Start with a simple review schedule: tomorrow, three days later, and one week later; adjust after retry success and learner feedback. Treat these intervals as tunable defaults.
- Show first/latest/best results for the same passage and a weekly practice count. Keep whole-passage, sentence, and word scores separate.
- Use available word timing data for playback of the learner's problem phrase when timing is valid. Fall back to full-recording playback when it is missing.

Acceptance: the learner can reopen the app, find due practice, and see progress on comparable attempts. Clearing history removes saved summaries and preferences as described in the UI.

### P2 — Richer audio and coaching, after the core works

- Evaluate consistent reference TTS or licensed human recordings for curated passages. Compare usefulness and running costs before replacing browser playback.
- Add a short shadowing mode: listen and repeat a phrase, then record independently with reference audio stopped.
- Add optional coaching generated from structured assessment data and reviewed tips. Require one evidenced observation and one exercise; never let a text model manufacture an acoustic diagnosis.
- Consider other English locales only after verifying Azure feature support and matching the reference voice. Microsoft currently documents prosody assessment as `en-US` only. [Azure pronunciation assessment](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment)
- Defer accounts, cloud sync, leaderboards, full news-article imports, and continuous long recordings until the daily practice loop proves useful.

## 5. Sample library by level

Build a 30-passage pilot, then expand to 120 reviewed passages. Counts below refer to full practice passages; sound drills are additional. The targets are editorial decisions, not official CEFR word limits.

| Level | Pilot | Expanded library | Target words per recording | Language and pronunciation emphasis |
|---|---:|---:|---|---|
| A1 | 3 | 12 | 8–18 | Familiar objects, introductions, simple requests; clear words and basic stress |
| A2 | 4 | 18 | 15–25 | Daily routines, shopping, travel; endings and simple phrase rhythm |
| B1.1 | 5 | 20 | 20–30 | Past events and plans; consonant clusters and word stress |
| B1.2 | 10 | 30 | 20–35 | Work updates, explanations, opinions; thought groups, linking, sentence stress |
| B2 | 4 | 20 | 25–40 | Comparisons and supported arguments; contrastive stress and flexible phrasing |
| C1 | 2 | 12 | 25–45 | Abstract ideas and qualified claims; nuanced intonation and emphasis |
| C2 | 2 | 8 | 25–45 | Subtle meaning and rhetorical intent; expressive control at natural pace |
| **Total** | **30** | **120** | | |

Store `cefrLevel: B1` plus `sublevel: B1.1` or `B1.2`; label these subdivisions as ClearSpeak's practice bands. Other CEFR levels need not be subdivided initially. Higher-level passages should be more demanding in meaning and delivery, not merely longer or full of rare words. A short C2-targeted exercise is not a C2 proficiency test.

A word limit cannot guarantee a recording will fit. For example, 60 words at 90 words/minute takes 40 seconds before pauses. Keep the existing hard limits, aim for recordings of about 15–25 seconds, and offer smaller chunks whenever a learner reaches the cap. Check actual reading duration during the pilot.

Use these topic families: daily life, travel, work/technology, relationships, health/habits, and science/environment. Give B1.2 particular emphasis on explaining a problem, describing yesterday's work, requesting clarification, and giving a reason for an opinion.

### Original examples for the editorial brief

These drafts illustrate the direction. Their levels are provisional and need editorial review; they are not copied from the websites below and are not yet app data.

| Band | Draft passage | Practice focus |
|---|---|---|
| A1 | “My name is Sam. I live near a park. I walk there with my friend.” | Clear short phrases; final consonants |
| A2 | “Yesterday, I missed the bus, so I walked to the station. I bought a ticket and called my friend.” | Past-tense endings; phrase breaks |
| B1.1 | “We planned to meet after work, but the rain was heavy. Instead, we cooked dinner at home and talked about our weekend plans.” | Consonant clusters; stress on key words |
| B1.2 | “I finished the first part of the project yesterday, but I still need to check a few details. Could we meet after lunch to discuss the next steps?” | Thought groups; endings; request intonation |
| B2 | “Working from home saves travel time, although it can make teamwork harder. A flexible schedule may offer a better balance, provided everyone agrees on how to stay in touch.” | Contrast and clause stress |
| C1 | “Although the proposal appears practical, its success depends on assumptions that have not yet been tested. We should therefore distinguish between promising early results and evidence of lasting improvement.” | Stress in multisyllabic words; phrasing qualifications |
| C2 | “The proposal is elegant, admittedly, but elegance is hardly evidence of feasibility. What appears to be a minor concession may, in practice, undermine the very principle the policy was intended to protect.” | Rhetorical emphasis; parenthetical phrasing |

## 6. Where to get content

My recommendation is **original reviewed texts first, VOA as the first external source, and BBC/British Council as curated extra-practice links**. Popularity alone does not establish permission to redistribute a transcript or recording.

| Source | Best use in ClearSpeak | Suggested audience | Reuse approach |
|---|---|---|---|
| Original texts, written by you or drafted with AI and reviewed | Core graded passages, minimal pairs, work scenarios | All levels; especially B1.2 | Author from a topic/focus brief; record authorship and review status |
| VOA Learning English | Selected short excerpts or permitted adaptations; American English listening | Beginning through advanced, assigned an app level after review | Check each selected text and audio asset is exclusively VOA-produced; credit and link it |
| BBC Learning English | Extra listening, pronunciation lessons, topics for further study | Select appropriate lessons individually | Link to source initially; reuse rights remain unverified for this plan |
| British Council LearnEnglish | Level-labelled listening/reading and everyday situations | Especially A1–C1; strong B1 reference point | Link to lessons; obtain appropriate permission before republishing or adapting |
| Tatoeba | Supplementary short sentence drills | Mainly A1–B1 after review | Verify sentence licence and attribution; check audio licence independently |

### VOA: the first external source to curate

[VOA's program guide](https://learningenglish.voanews.com/p/5373.html) describes beginner lessons, intermediate material, and slower American English programs. Those publisher categories should not be automatically converted into exact CEFR bands.

[VOA's copyright statement](https://learningenglish.voanews.com/p/6021.html) says material produced exclusively by VOA is public domain and requests credit. It also excludes third-party licensed material. Check bylines, credits, embedded quotations, and audio separately; do not assume an entire page is cleared because its URL belongs to VOA. Exclude uncertain items from the bundled library.

Choose evergreen lifestyle, education, or science passages before breaking news. Save approved content locally with its provenance so the library does not depend on a live feed. For an adaptation, label it “Adapted from VOA Learning English” and explain changes. An adapted transcript will no longer match the original recording: use matching synthesized or newly recorded audio.

### BBC and British Council: useful learning references

[BBC Learning English](https://feeds.bbci.co.uk/learningenglish) offers pronunciation, vocabulary, courses, and topic-based resources. Use selected lessons as optional external practice. Its [content-use page](https://www.bbc.co.uk/usingthebbc/terms/can-i-use-bbc-content/) could not be retrieved during this research, so this plan does not assert a current BBC reuse licence. Confirm permissions before importing transcripts, adapting text, or hosting audio.

[British Council's B1 listening library](https://learnenglish.britishcouncil.org/free-resources/listening/b1) is a useful reference for everyday B1 situations. Its [terms, section 10](https://www.britishcouncil.org/terms) allow specified personal, non-commercial uses but restrict republication on another website and modification without approval. A free educational resource is not automatically reusable app content.

Keep external listening clearly labelled when its accent differs from the app's US assessment setting. Do not suggest that reproducing a valid alternative accent is inherently a pronunciation error.

### Tatoeba: optional sentence source

[Tatoeba's reuse guide](https://en.wiki.tatoeba.org/articles/show/using-the-tatoeba-corpus) describes text licensing, audio-specific permissions, and the need to filter unsuitable sentences. Keep sentence IDs, creator attribution, source URLs, and applicable licences. Review naturalness and level manually. Do not assume a text licence also covers its recording.

## 7. Content production and review workflow

1. Create a brief: level, everyday topic, target sound or prosodic feature, approximate length, and US reference locale.
2. Draft an original passage or select a rights-cleared excerpt. For original AI drafts, request fresh writing from the brief rather than a rewrite of a restricted article.
3. Review language level using vocabulary, grammar, context, and inferential demands. Use readability only as a supporting signal. Mark levels as estimates.
4. Review pronunciation value: the target actually occurs, the exercise sounds natural, and the learner can understand its meaning. Add at most two focus tags and brief vocabulary help when needed.
5. Listen and read aloud. Confirm pauses, stress suggestions, and reference audio match the final text. Do not use automatically generated IPA without review.
6. Validate unique IDs, required provenance, locale, length, valid sentence boundaries, and permitted publishing status. Duplicate-check normalized text.
7. Pilot with real practice sessions. Revise passages that repeatedly run over time, produce confusing feedback, or feel much harder than their label.
8. Publish reviewed items; retain content version and review date. Recheck external links and any changed rights before adding new source material.

Start the 30-passage pilot with original reviewed writing. During expansion, evaluate ten VOA candidates and optionally ten Tatoeba sentences; publish only those that pass the checks. Fill remaining slots with original work rather than delaying a level because external content is unavailable. Add five reviewed passages per week after the initial library stabilizes.

## 8. Implementation design

### Content storage

Use versioned JSON files in the repository; a database or CMS is unnecessary for the first release. Suggested new files:

- `content/passages/a1.json`, `a2.json`, `b1.json`, `b2.json`, `c1.json`, `c2.json`
- `lib/practice-content.ts` for types, loading, filtering, and validation
- `lib/pronunciation-tips.ts` for reviewed, deterministic coaching
- `components/passage-library.tsx` for browsing
- `components/reference-player.tsx` for browser audio controls

Each passage should include:

| Fields | Purpose |
|---|---|
| `id`, `version`, `title`, `text` | Stable identity and exact assessment reference |
| `cefrLevel`, optional `sublevel`, `levelRationale` | Honest, reviewable difficulty labels |
| `topic`, `focusTags`, `locale` | Filtering and compatible practice recommendations |
| `chunks` with character boundaries | Sentence/phrase practice without changing the stored text |
| `source.kind`, `source.url`, `source.author`, `source.attribution` | Original/excerpt/adaptation provenance; URL can be absent for original work |
| `rights.status`, `rights.license`, `rights.evidenceUrl`, `rights.checkedAt` | Evidence for reuse; block imported items with unknown rights |
| `review.status`, `review.reviewedAt` | Draft versus reviewed content |
| Optional `audio` metadata | Audio type, locale, voice, matching text version, and separate rights |

Derive word count from the same normalization used by `lib/text.ts`. Store display annotations separately: stress marks or pause slashes must never accidentally become part of the Azure reference text. Link-only recommendations belong in a separate resource list and contain no copied transcript or audio.

When a library passage is edited, create a custom-text identity based on the normalized content; do not save its score as an attempt on the original passage version. For private pasted text, retain only what the learner chooses to save.

### Session state and history

Extend `components/clearspeak-app.tsx` to keep selected passage identity, chunk identity, reference text, previous attempt, and current attempt together. Preserve the existing cancellation and duplicate-submission protections. Keep a previous recording URL alive for comparison only for its intended lifetime, then revoke it.

Use guarded, versioned `localStorage` for preferences and compact summaries, with a bounded history such as the latest 200 attempts. Read it after client hydration and handle blocked storage, malformed data, and quota errors without preventing practice. Store attempt ID, passage version or custom-text hash, chunk ID, timestamp, duration, locale, assessment settings, available scores, and selected focus. Deduplicate saves by attempt ID.

Keep raw recordings in memory by default. If persistent recording comparison becomes a later feature, offer explicit opt-in and use IndexedDB with a size limit. Update the privacy copy when adding history: summaries remain on this device, while assessment audio continues to go directly to Azure. Provide clear history and export controls; do not persist speech tokens.

### Recording and feedback constraints

Keep the 30-second path for this release. Microsoft specifies continuous recognition for longer files, with different omission/insertion handling; increasing the timer alone is insufficient. [Azure continuous-mode guidance](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment)

For multi-sentence samples, verify the existing one-shot recognizer handles natural pauses without returning only an initial utterance. Prefer shorter assessment chunks if it does not. A recording stopped at the time limit should prompt a shorter retry, rather than presenting its low completeness score as a definite pronunciation problem.

Rank recurring, evidenced difficulties above a single unusually low phoneme score. Keep “possibly weak” wording where the result is uncertain, and offer “I think this feedback is wrong.” Do not equate provider scores with CEFR level or listener comprehension. Improve the current “native-like” accuracy explanation to describe similarity to the assessment reference without implying that accent elimination is the goal.

## 9. Delivery sequence and acceptance checks

These are proposed work packages, not fixed calendar estimates. Ship each independently.

| Milestone | Deliverable | Completion check |
|---|---|---|
| 1. Library pilot | Schema, 30 reviewed original passages, all six CEFR levels with B1 subdivisions, filters, source display | Counts match the level table; IDs are unique; every passage passes current input limits; editing/custom text works |
| 2. Listen and retry | Voice/rate controls, chunk selection, one-focus feedback, previous/current comparison | End-to-end browser practice works; model audio stops before recording; no false comparison across changed text/settings |
| 3. Progress and review | Local summaries, favourites, due-practice queue, export/delete | Reload restores summaries; missing/corrupt storage is recoverable; an attempt saves only once |
| 4. Content expansion | 120 reviewed passages, optional cleared VOA/Tatoeba items, external learning links | Coverage and source/audio rights are checked; no network import is required to browse built-in text |
| 5. Optional enhancements | Consistent reference audio and/or generated coaching | Small pilot demonstrates useful feedback, acceptable latency/cost, and no unsupported sound diagnoses |

For implementation, run the repository's lint, typecheck, Vitest suite in non-watch mode, and production build through the configured toolchain. Add meaningful checks for content integrity, filter/selection behaviour, retry identity, storage migration, and cancellation during playback/assessment. Manually verify desktop Chrome and mobile Safari microphone and speech-synthesis behaviour, plus keyboard navigation and non-colour feedback.

Pilot the result for two weeks. Track practice frequency, completed retry loops, cut-off recordings, confusing feedback, and repeated difficulties on unseen passages. Treat rising scores as one signal alongside listening comparison and learner feedback. The key outcome is that you know what to practise next and can hear improvement in new sentences.

## 10. Model recommendation for building this

**Use GPT-5.6 Sol in Codex, starting with medium reasoning, to implement the milestones one at a time.** This is my recommendation for the existing TypeScript/React app: it can handle coordinated UI, state, content, and test changes without requiring a redesign. Current official documentation lists Sol for complex coding, and its model page specifies medium as the default reasoning effort. [Codex model guidance](https://learn.chatgpt.com/docs/models) · [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)

Use high reasoning for changes to recording state, cancellation, and score comparison. GPT-6 Astra is an optional choice for a difficult architecture or final cross-feature review; official guidance describes it as the most capable option for complex code and app work. The extra model is not required to start. This is a workload recommendation, not a benchmark of either model on this repository. Availability depends on your account. [Official model options](https://learn.chatgpt.com/docs/models)

Keep the development model separate from the app's speech engine. Retain Azure Pronunciation Assessment for acoustic scoring, browser speech synthesis for initial reference playback, and reviewed static tips for initial coaching. The first release needs no new runtime LLM subscription or API integration. Sol can also draft original sample batches during development, but generated level labels and pronunciation guidance still need editorial review.

Suggested first implementation request:

> Implement Milestone 1 from PRONUNCIATION_IMPROVEMENT_PLAN.md. Keep the existing Azure assessment and recording flow. Add a typed, validated passage library with the 30-passage pilot distribution in the plan, using original text, provisional level labels, and provenance metadata. Add level/topic/focus browsing with B1.2 as the initial selection, retain custom text input, and prevent edited library text from inheriting the original passage identity. Verify content limits and selection behaviour, run the relevant repository checks, and report the changes. Do not import publisher content or implement later milestones in this change.
