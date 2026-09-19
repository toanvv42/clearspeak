# Build Prompt: ClearSpeak Pronunciation Coach

You are the implementation agent. Build the complete MVP described below in this directory. Do not only create a plan or mockup: create the working application, tests, configuration examples, and README, then run all relevant checks and fix failures.

## Product goal

Build a polished, responsive personal web app called **ClearSpeak**. A learner pastes a short English passage, records themselves reading it, finishes the recording, and receives detailed pronunciation feedback from Azure AI Speech Pronunciation Assessment.

This is a focused MVP for one person using an Azure Speech Free (F0) resource. Optimize for a reliable learning loop:

1. Paste or load a short English passage.
2. Read it aloud while recording locally.
3. Finish the recording and optionally replay it.
4. Send the completed in-memory WAV recording directly from the browser to Azure Speech through the official JavaScript Speech SDK.
5. Show useful overall, word-level, syllable-level, and phoneme-level feedback.
6. Retry the same passage quickly.

Do not add accounts, a database, social features, payments, or an LLM. Do not persist recordings or assessment results.

## Important product and technical decisions

- Use **Next.js App Router**, **React**, **TypeScript in strict mode**, and **Tailwind CSS**. Resolve to current stable package versions that are mutually compatible. Use npm and commit a lockfile.
- Use the official `microsoft-cognitiveservices-speech-sdk` package for assessment.
- The Azure Speech subscription key must remain server-side. Never place it in client code, HTML, local storage, a `NEXT_PUBLIC_*` variable, logs, errors, or source maps.
- The browser first records raw microphone samples in memory. It calls Azure only after the learner presses **Finish & analyze** (or the 30-second limit is reached).
- Encode the finished recording in the browser as mono 16-bit PCM WAV at 16 kHz, then give that `File`/`Blob` to `SpeechSDK.AudioConfig.fromWavFileInput`. Do not upload the audio to the Next.js server.
- The Next.js server exposes only a short-lived Azure authorization token. The browser uses `SpeechConfig.fromAuthorizationToken(token, region)`. Tokens are valid for about 10 minutes; return an expiry slightly below that.
- Fix the assessment locale to `en-US` for the MVP. This gives the best-supported IPA phoneme, syllable, and optional prosody experience. Do not show a nonfunctional language selector.
- Keep every attempt at or under 30 seconds. Azure recommends continuous mode for audio over 30 seconds, which has different miscue behavior. This MVP intentionally uses one-shot file assessment.
- Optimize for Free (F0): core pronunciation assessment only by default. Prosody can be an add-on, so make it an opt-in server-controlled feature flag and gracefully omit its UI when Azure does not return it.

## User experience

### Initial access gate

This is a personal app. Protect the token-minting endpoint with a simple application access code.

- If `APP_ACCESS_CODE` is configured, show a small, tasteful unlock screen before the practice UI.
- Determine whether the gate is required on the server (for example, in the server-rendered page) and pass only an `accessRequired` boolean to the client. Never pass the configured access code.
- Keep the entered access code in memory or `sessionStorage` only, never `localStorage`.
- Send it as `x-app-access-code` only when requesting a Speech token.
- Compare it on the server without leaking which part was wrong. Use a timing-safe comparison where practical.
- In production, fail closed if `APP_ACCESS_CODE` is missing. In development, allow it to be omitted and bypass the gate.
- A 401 response should return a generic message and take the user back to the unlock state.

### Practice state

The main screen should have:

- A compact header with the ClearSpeak wordmark, a subtle “English · US” badge, and an unobtrusive privacy note.
- A brief heading: “Read it. Hear yourself. Improve.”
- A large textarea labeled **Your practice text**.
- A character count and word count. Normalize surrounding whitespace, but preserve normal punctuation.
- Validation: 1–60 words, at most 600 characters. Explain that this keeps the recording under 30 seconds.
- A **Use sample text** control with a good 25–35 word English sample.
- A reading card that presents the locked passage in a large, comfortable type size once recording begins.
- One clear primary action: **Start recording**.
- A secondary **Listen to sample** action using the browser’s built-in `speechSynthesis` with `en-US`. This must not use Azure quota. Stop speech synthesis before microphone recording begins and on unmount.

### Recording state

- Ask for microphone permission only after the user presses Start.
- Use `navigator.mediaDevices.getUserMedia` with sensible speech constraints: mono where supported, echo cancellation, noise suppression, and automatic gain control.
- Show a strong but calm recording state: pulsing red dot, `Recording`, elapsed `mm:ss`, simple live level meter, and the passage.
- The primary action becomes **Finish & analyze**.
- Include **Cancel** as a lower-emphasis action.
- Stop automatically at 30 seconds and continue to analysis with an explanatory toast/message.
- Reject recordings shorter than about 0.75 seconds with a friendly prompt to retry.
- Disable page controls that could produce conflicting recording sessions.

### Review-before-analysis behavior

When the learner finishes, immediately stop every microphone track and close/disconnect audio resources. Build the WAV in memory and create an object URL for a native audio player. Start assessment automatically, but keep the audio player available when results appear.

### Analyzing state

- Show an honest progress state such as “Analyzing your pronunciation…” with three quiet steps: preparing audio, securely connecting, assessing speech.
- Do not show fake percentage progress.
- Prevent duplicate submissions.
- Provide a useful timeout and a retry path. Cleanup the recognizer, audio config, and pronunciation config in success, error, cancellation, timeout, route change, and component unmount paths.

### Results state

Show the result in this order:

1. **Overall score**: large 0–100 pronunciation score with a short label (Needs practice / Getting there / Good / Excellent).
2. **Metric cards**: Accuracy, Fluency, Completeness, and Prosody only when present. Each card must have a one-sentence plain-English explanation. Never display `NaN`, `undefined`, or a fabricated zero for a missing field.
3. **Sounds to fix**: this is the primary detailed feedback, ahead of word-level feedback. Rank the 3–5 lowest-scoring expected phonemes and show each as a focused practice item containing:
   - the target IPA sound;
   - the word containing it;
   - whether it is at the beginning, middle, or end of the word;
   - its Azure accuracy score;
   - the most likely spoken alternative and confidence when Azure returns N-best phonemes;
   - a concise prompt such as “Practice the ending /t/ in ‘worked’.”
   Do not repeat the same target sound excessively; group repeated weak instances where that makes the result easier to understand.
4. **Ending-sound alert**: if the last expected phoneme of a non-omitted word scores below 60, add a prominent but non-alarming note such as **“Ending /d/ needs attention in ‘played’.”** This should make dropped or weak final consonants easy to find.
5. **One deterministic focus suggestion** based on the weakest available metric. Make it clear this is app guidance derived from the scores, not an AI-generated diagnosis.
6. **Word and sound feedback**: render the reference passage as accessible word buttons/chips, maintaining punctuation. Each word should expose its IPA phonemes as individually scored segments so the learner can see which sound inside the word needs work. Color is supplemental, not the only signal:
   - 80–100: strong
   - 60–79.99: review
   - below 60: focus
   - omitted: omitted
   - inserted words: show separately as “Extra words heard”
7. Clicking/focusing a word or phoneme opens a detail panel with the spoken/expected word, Accuracy score, Azure `ErrorType`, syllables if returned, and IPA phonemes with scores. Clearly mark the first and final expected phonemes. Show N-best spoken phoneme candidates when returned, but keep the default view readable.
8. **Recognized text** in a collapsible section so the learner can compare what Azure heard.
9. The local **Your recording** audio player.
10. Actions: **Try again** (same text) and **Practice new text**.

Be precise about what the API proves. A very low final-phoneme score can mean a dropped, weak, or substituted ending, but Azure does not necessarily return an explicit phoneme-level “omitted” label. In that case say **“final sound needs attention”** or **“likely weak or missing,”** never state **“you definitely omitted this sound.”** Use “omitted” without qualification only when Azure explicitly returns an applicable omission error.

Use a visible legend for score colors. Ensure every chip is keyboard accessible, has an accessible name containing its word and score/status, and has a non-color status indicator.

## Visual direction

Aim for a focused language-learning tool, not an admin dashboard and not a generic AI landing page.

- Warm off-white background, ink/navy text, a confident blue primary color, coral recording accent, and restrained green/amber/red feedback colors with WCAG AA contrast.
- Rounded but not bubbly surfaces, subtle borders, very light shadows, generous whitespace.
- System font stack; do not add a runtime font-network dependency.
- Desktop: centered content, approximately 960–1100 px max width. Results may use a two-column area where it helps.
- Mobile: single column, large tap targets, recording action easy to reach, no horizontal scrolling.
- Respect `prefers-reduced-motion` and dark mode. Both modes must be intentionally designed.
- Use icons sparingly. If an icon library is added, use one consistent library and accessible labels.
- Include polished empty, loading, permission-denied, invalid-credentials, no-speech, quota/throttling, offline, and generic-error states.

## Architecture and data flow

```text
Browser microphone
  -> AudioWorklet captures Float32 PCM in memory
  -> stop at user action / 30 s
  -> resample + encode 16 kHz mono PCM16 WAV
  -> request short-lived token from POST /api/speech-token
  -> browser Speech SDK sends WAV directly to Azure Speech
  -> parse detailed result locally
  -> render feedback; retain only in React memory

Server
  -> validates personal app access code
  -> reads AZURE_SPEECH_KEY and AZURE_SPEECH_REGION
  -> exchanges key for ~10 minute authorization token
  -> returns token, region, expiry, and prosody feature flag
  -> never receives audio
```

Organize code into small modules rather than putting everything in one page. A reasonable shape is:

```text
app/
  api/speech-token/route.ts
  layout.tsx
  page.tsx
components/
  access-gate.tsx
  practice-editor.tsx
  recording-session.tsx
  analyzing-state.tsx
  results-view.tsx
  score-card.tsx
  word-feedback.tsx
hooks/
  use-pcm-recorder.ts
lib/
  azure/pronunciation.ts
  azure/result-parser.ts
  audio/wav.ts
  assessment-guidance.ts
  text.ts
  types.ts
public/
  pcm-recorder-worklet.js
```

This is guidance, not a mandate. Keep browser-only SDK imports out of server execution and avoid SSR errors by dynamically importing the Speech SDK inside the client assessment function.

## Audio capture requirements

Implement a small AudioWorklet processor in `public/pcm-recorder-worklet.js`.

- Copy each mono input frame before transferring/posting it; do not retain browser-owned channel buffers.
- Track peak or RMS level for the meter without excessive React re-renders (roughly 10–15 UI updates/second is enough).
- Flatten chunks efficiently at stop time.
- Resample the actual `AudioContext.sampleRate` to 16,000 Hz. Do not assume the device already uses 16 kHz.
- Encode a correct RIFF/WAVE header and signed little-endian PCM16 samples.
- Clip samples to [-1, 1].
- Return `{ blob, durationMs }` or an equivalent typed result.
- Revoke old object URLs and release streams/nodes/audio contexts reliably.
- If AudioWorklet is unavailable, show a clear unsupported-browser message. Do not silently fall back to a poor or untested format.

## Speech token endpoint

Create `POST /api/speech-token` with Node runtime semantics.

- Read `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `APP_ACCESS_CODE`, and `AZURE_ENABLE_PROSODY` from server-only environment variables.
- Exchange the subscription key via:
  `https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`
- Send `Ocp-Apim-Subscription-Key` and a zero-length POST body.
- Return JSON shaped like:

```ts
type SpeechTokenResponse = {
  token: string;
  region: string;
  expiresAt: string;
  enableProsody: boolean;
};
```

- Use `Cache-Control: no-store` on every response.
- Validate required environment values and the region format. Never echo Azure’s raw error body to the client.
- Use generic, structured error JSON and appropriate 400/401/429/500/502 statuses.
- Add a small best-effort in-memory per-IP rate limit suitable for a personal MVP (document that it is not a durable distributed limiter). Keep it generous enough for normal retries, for example 10 token requests per minute.
- Never log secrets, tokens, the access code, reference text, assessment JSON, or audio-related data.

## Azure pronunciation assessment

Use a one-shot recognizer over the completed WAV file:

1. Dynamically import `microsoft-cognitiveservices-speech-sdk` in browser code.
2. Fetch a token only when a valid recording is ready.
3. Create `SpeechConfig.fromAuthorizationToken(token, region)`; do not add the word `Bearer` to the SDK token.
4. Set `speechRecognitionLanguage = "en-US"` and detailed output.
5. Create `AudioConfig.fromWavFileInput(wavFile)`.
6. Configure scripted pronunciation assessment with:
   - exact pasted `referenceText`
   - `HundredMark`
   - `Phoneme` granularity
   - miscue enabled
   - IPA phoneme alphabet
   - N-best phoneme count of 5
7. If and only if the server response has `enableProsody: true`, call the SDK method that enables prosody assessment.
8. Apply the pronunciation configuration and call `recognizeOnceAsync` through a typed Promise wrapper.
9. Handle `RecognizedSpeech`, `NoMatch`, cancellation, auth failure, throttling, network failure, and timeout separately.
10. Always close SDK objects exactly once.

Read the detailed raw JSON from `SpeechServiceResponse_JsonResult` because the nested word, syllable, phoneme, N-best, and error details may not all be exposed by the convenience result object. Parse it defensively with type guards; Azure fields can be missing. Prefer `NBest[0]` for the detailed assessment.

Create stable internal types independent of Azure’s raw casing, for example:

```ts
type AssessmentResult = {
  referenceText: string;
  recognizedText: string;
  pronunciationScore?: number;
  accuracyScore?: number;
  fluencyScore?: number;
  completenessScore?: number;
  prosodyScore?: number;
  words: AssessedWord[];
  insertedWords: AssessedWord[];
};

type AssessedWord = {
  text: string;
  accuracyScore?: number;
  errorType?: string;
  offset?: number;
  duration?: number;
  syllables: AssessedSyllable[];
  phonemes: AssessedPhoneme[];
};

type AssessedPhoneme = {
  symbol: string;
  accuracyScore?: number;
  position: "initial" | "medial" | "final" | "only";
  alternatives: Array<{ symbol: string; confidence?: number }>;
};
```

Preserve Azure’s returned scores; do not recalculate or embellish them. Clamp only for display safety after validating finite numbers. Use Azure `ErrorType` values rather than inventing errors. Map reference words to result words defensively so omitted words remain visible. Preserve original passage punctuation in the displayed reading text.

Derive phoneme position only from the order of Azure’s expected phoneme array: one phoneme is `only`; otherwise index 0 is `initial`, the last index is `final`, and the rest are `medial`. Build the “sounds to fix” ranking from finite phoneme accuracy scores. Exclude phonemes from a word Azure explicitly marks as wholly omitted, since there is no reliable spoken phoneme comparison for that word. Treat scores below 60 as focus items and final-position scores below 60 as ending-sound alerts. This position/ranking is deterministic UI interpretation, not a new Azure score.

## App state and error handling

Use an explicit state model, reducer, or state machine covering at least:

```text
locked -> editing -> requesting-microphone -> recording -> preparing-audio
       -> requesting-token -> assessing -> success
       -> recoverable-error
```

- Prevent impossible button combinations and double starts/stops.
- Treat cancel differently from failure.
- Check `navigator.onLine` before assessment, but still handle real fetch/SDK network errors.
- Translate known failures into calm user messages with a specific next action.
- Show technical detail only in a collapsible development-only diagnostic area and sanitize it.
- If the token expires before SDK use, request a new one.
- Token endpoint 429 and Azure quota/concurrency failures should explain that the F0 tier permits only one concurrent real-time request and suggest waiting before retrying.

## Privacy and security copy

Accurately communicate:

- “Your recording stays in this browser until you analyze it.”
- “When you analyze, the audio is sent directly to Azure Speech and is not stored by ClearSpeak.”

Do not make broader claims about Microsoft’s retention policy. Link the README to Microsoft’s applicable data/privacy documentation instead.

## Environment and repository files

Create `.env.example` containing placeholders only:

```dotenv
AZURE_SPEECH_KEY=replace_with_your_speech_resource_key
AZURE_SPEECH_REGION=southeastasia
APP_ACCESS_CODE=choose_a_long_random_personal_code
AZURE_ENABLE_PROSODY=false
```

Ensure `.env*` secrets are ignored while `.env.example` remains committed. Add a complete README with:

- what the app does and the exact privacy/data flow;
- prerequisites and supported browser expectations;
- how to create an Azure Speech resource on Free (F0);
- where to find the key and exact region identifier;
- local setup and commands;
- why production requires HTTPS for microphone access (localhost is permitted for development);
- deployment guidance for a Node-capable Next.js host;
- F0 allowance/quota caveats;
- prosody flag and possible pricing implications;
- troubleshooting for mic permission, 401/403, wrong region, 429, no speech, and browser incompatibility;
- test commands and known MVP limitations.

Do not put real credentials anywhere in the repository.

## Testing

Use Vitest and React Testing Library (or equally appropriate current tools) and make tests deterministic. At minimum test:

- WAV encoding: RIFF markers, header fields, sample rate, mono channel count, PCM bit depth, data length, clipping, and duration.
- Text validation and punctuation-preserving tokenization.
- Defensive Azure JSON parsing with fixtures for a full result, missing prosody, omitted word, inserted word, and malformed/missing fields.
- Phoneme positioning for single-, initial-, medial-, and final-phoneme cases; weakest-sound ranking; repeated weak sounds; final-sound alerts; and the rule excluding wholly omitted words.
- Sound-feedback wording tests proving that an inferred low final score is labeled “needs attention” or “likely weak or missing,” not asserted as a definite omission.
- Score thresholds and weakest-metric guidance.
- Token endpoint behavior with mocked `fetch`: success, missing env, wrong access code, Azure failure, no-store headers, and rate limit.
- Main UI behavior with mocked recorder/assessment services: validation, recording, automatic 30-second stop using fake timers, analysis success, error/retry, and cleanup.

Do not call Azure in automated tests. Keep raw result fixtures synthetic and free of personal data.

Run and pass all of the following before finishing:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

Add a `typecheck` script if the framework scaffold does not include one.

## Acceptance criteria

The implementation is complete only when all of these are true:

- A valid short passage can be pasted and locked for reading.
- Microphone permission is requested only from a user gesture.
- Start, Finish & analyze, Cancel, 30-second auto-stop, and Try again all behave correctly.
- The completed audio can be replayed locally.
- The WAV is correctly produced at 16 kHz mono PCM16 regardless of common input sample rates.
- Azure is contacted only after the recording ends.
- Audio never passes through or persists on the app server.
- The Azure key never reaches the browser; only a short-lived token does.
- Missing or wrong credentials lead to useful UI, not a crash.
- Assessment shows the available overall metrics and detailed accessible word feedback.
- Results prioritize the specific IPA sounds that need work, including clear weak-ending alerts and N-best likely spoken alternatives when Azure returns them.
- Every expected phoneme can be inspected independently inside its word; feedback distinguishes Azure facts from app inference and never overclaims a missing final sound.
- Missing prosody/syllable/phoneme data is handled gracefully.
- SDK, media streams, audio context, timers, speech synthesis, and object URLs are all cleaned up.
- The app works at mobile and desktop widths, supports keyboard navigation, and respects reduced motion.
- No secrets, fake results, placeholder buttons, dead controls, TODOs, or unexplained console errors remain.
- Lint, typecheck, unit/component tests, and production build pass.

## Non-goals for this MVP

- User accounts or cloud history
- Database or object storage
- Long passages or continuous multi-minute assessment
- Multiple languages/locales
- AI-generated coaching
- Server-side audio upload or transcoding
- Text-to-speech billed through Azure
- Sharing, leaderboards, or teacher dashboards

## Implementation conduct

- Inspect the repository before changing it and preserve unrelated user work.
- Prefer clear, conventional code over unnecessary abstractions.
- Do not replace real Azure integration with a mock. Mocks belong only in tests.
- If credentials are unavailable, still complete and verify everything that can be tested locally; make the real integration ready for the user’s `.env.local` values.
- Do not weaken TypeScript, lint, or tests to make checks pass.
- At completion, provide a concise report containing the files created, architecture decisions, commands run and their results, any check that could not run, and exact steps for the user to start the app.

## Authoritative references

Use these sources if implementation details are uncertain. They were checked when this prompt was prepared; verify signatures against the installed SDK types.

- Azure pronunciation assessment guide: <https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment>
- JavaScript `PronunciationAssessmentConfig`: <https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/pronunciationassessmentconfig>
- JavaScript `PronunciationAssessmentResult`: <https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/pronunciationassessmentresult>
- JavaScript `AudioConfig`: <https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/audioconfig>
- Azure service-key token exchange: <https://learn.microsoft.com/en-us/azure/ai-services/authentication>
- Azure Speech language support: <https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support>
- Azure Speech region identifiers: <https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions>
- Azure Speech quotas and limits: <https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits>
- Azure Speech pricing: <https://azure.microsoft.com/en-us/pricing/details/speech/>
- Official Speech SDK JavaScript repository: <https://github.com/microsoft/cognitive-services-speech-sdk-js>
