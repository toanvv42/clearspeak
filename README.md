# ClearSpeak — Pronunciation Coach

A polished, responsive personal web app. Paste a short English passage, read it aloud while
recording locally, finish, and receive detailed pronunciation feedback from Azure AI Speech
Pronunciation Assessment.

## What it does

1. Browse 44 original practice passages across A1–C2 (with B1.1/B1.2 practice bands), or
   paste your own short English passage (1–60 words, ≤ 600 characters).
2. Read it aloud while recording in the browser (AudioWorklet, 30-second cap).
3. Press **Finish & analyze** (or let the 30-second limit stop automatically).
4. The finished WAV (mono 16-bit PCM at 16 kHz) is saved automatically to your
   **Practice / History** journal on the app server, and sent from the browser to
   Azure Speech through the official JavaScript Speech SDK.
5. Overall, word-level, syllable-level, and phoneme-level feedback is rendered, with the
   weakest IPA sounds ranked first and weak ending sounds highlighted.
6. Return later to listen again, **Record again** with the exact saved text, compare with
   the previous compatible attempt, retry a failed evaluation, download audio/evaluation,
   or delete a take.

The built-in library is stored as versioned JSON in `content/passages`. Every item has a stable
ID, estimated level rationale, topic, pronunciation focus, sentence chunks, provenance, rights,
and review metadata. Level labels are practice estimates rather than proficiency results.

## Data flow / storage

- Finished recordings and feedback are saved automatically to the app server's SQLite
  database (`CLEARSPEAK_DATA_DIR/clearspeak.sqlite`, WAL mode). History is shared by
  devices that reach the same server; a dev instance has its own history.
- When you analyze, the audio is also sent from the browser to Azure Speech for
  evaluation. Reading history and replaying audio never call Azure; retrying a save
  never calls Azure either.
- The Next.js server exposes a short-lived (~9 minute) authorization token via
  `POST /api/speech-token`.
- The Azure subscription key stays server-side. It is never placed in client code, HTML,
  storage, `NEXT_PUBLIC_*` variables, logs, or errors.
- No accounts. Access is guarded by `APP_ACCESS_CODE`, sent as the `x-app-access-code`
  header. Database backups may still contain deleted attempts.

For Microsoft's data handling, see the
[Azure Speech documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment)
and [privacy guidance](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits).

## Prerequisites

- Node.js 20+ and npm.
- An Azure Speech resource (Free **F0** is enough for personal practice).
- A modern desktop or mobile browser with microphone + AudioWorklet support
  (recent Chrome, Edge, Safari, or Firefox). `speechSynthesis` sample playback uses the
  browser voice and costs no Azure quota.

## Create an Azure Speech resource (Free F0)

1. Go to the [Azure portal](https://portal.azure.com) → Create a resource → search
   **Speech**.
2. Create it with pricing tier **Free F0**.
3. After deployment, open the resource → **Keys and Endpoint**.
4. Copy **KEY 1** → `AZURE_SPEECH_KEY`.
5. Copy the **Location/Region** identifier exactly (for example `southeastasia`) →
   `AZURE_SPEECH_REGION`. The full list is at
   https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions.

## Local setup (with mise)

This repo uses [mise](https://mise.jdx.dev) to install Node + npm (see `mise.toml`, pinned to
Node 24.20.0 LTS) and to manage env keys and tasks.

```bash
mise install          # install Node 24.20.0 LTS (npm ships bundled with it)
mise run setup        # npm install with the mise-managed npm
```

## Secrets and environment keys

Never place secret values in the shared `mise.toml` — it is committed to the repo.
Recommended: prompt-based local entry into the gitignored `mise.local.toml`, so values
never appear on the command line or in shell history:

```bash
mise set --file mise.local.toml --prompt AZURE_SPEECH_KEY
mise set --file mise.local.toml --prompt APP_ACCESS_CODE
mise set --file mise.local.toml AZURE_SPEECH_REGION=southeastasia
chmod 600 mise.local.toml
```

Notes:

- `mise.local.toml` (and any `mise.*.local.toml`) is gitignored. If both it and
  `.env.local` define the same key, `mise.local.toml` wins.
- `.env.local` remains an optional alternative (it is also loaded automatically by
  `next dev`). It is unencrypted plaintext — keep it out of git and consider mode
  `0600` (`chmod 600 .env.local`).
- Loading `.env.local` through mise is environment injection for local development,
  not encrypted secret storage.
- Production secrets must be set in the deployment platform's secret/environment
  facility (e.g. Vercel environment variables, Azure App Service app settings),
  never in committed files.

Then start the app:

```bash
mise run dev          # open http://localhost:3000
```

Microphone access works on `localhost` without HTTPS.

Useful commands (all run with the mise-managed toolchain):

```bash
mise run lint
mise run typecheck
mise run test
mise run build
```

## Production

- Requires durable disk on a single Node host (systemd templates in `deploy/`). An
  ephemeral/serverless filesystem is not a compatible production storage target.
- Set `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `APP_ACCESS_CODE`,
  `CLEARSPEAK_DATA_DIR` (`/home/ubuntu/data/clearspeak`; staging uses
  `/home/ubuntu/data/clearspeak-staging`), and optionally `AZURE_ENABLE_PROSODY=true`.
- **HTTPS is required** for microphone access in production browsers.
- In production the app fails closed when `APP_ACCESS_CODE` is missing; in development the
  gate can be omitted.
- Keep `APP_ACCESS_CODE` long and random. It is compared timing-safely on the server and is
  only ever sent as the `x-app-access-code` header when requesting a token.

## F0 quota caveats

- The Free tier permits **one concurrent** real-time speech request. If you open two tabs or
  retry too fast you may see a busy/throttled message — wait ~30 seconds and retry.
- Token minting is rate-limited best-effort in memory (10 requests/minute per IP). This is a
  personal-MVP guard, not a durable distributed limiter.

## Prosody flag

- `AZURE_ENABLE_PROSODY=false` (default): core pronunciation assessment only. The Prosody
  card is omitted when Azure returns no prosody score.
- `AZURE_ENABLE_PROSODY=true`: the server tells the browser to enable prosody assessment.
  Prosody assessment may have pricing implications beyond the free allowance — check
  https://azure.microsoft.com/en-us/pricing/details/speech/.

## Troubleshooting

| Symptom | What to do |
|---|---|
| Browser never asks for the mic | Use HTTPS (or localhost), allow the mic in site settings, close other apps using it. |
| “Microphone blocked” | Allow access in the browser prompt, then Try again. |
| 401 on unlock | Your `APP_ACCESS_CODE` does not match the server value; re-enter it. |
| Speech credentials rejected (502 `bad_credentials`) | Check `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` (exact identifier, e.g. `southeastasia`), restart the server. |
| Busy / 429 | F0 allows one request at a time; wait ~30 s and retry. |
| No speech detected | Move closer, speak the passage aloud, avoid silence-only recordings. |
| “Browser not supported” | Use a recent Chrome, Edge, or Safari with AudioWorklet. |

## Known MVP limitations

- Fixed `en-US` locale; no language selector.
- One-shot assessment of a single ≤ 30 s recording (no continuous long-form mode).
- No accounts, sharing, or AI-generated coaching — the focus suggestion is
  deterministic guidance derived from the weakest returned metric.

## History backups

- Consistent snapshot: `CLEARSPEAK_DATA_DIR=/home/ubuntu/data/clearspeak ./scripts/backup-history.sh`
  (uses `VACUUM INTO`, so WAL content is included — never copy only the live `.sqlite` file).
- Copy snapshots off the host; a backup kept only on the app disk does not cover disk loss.
- Restore: copy a snapshot into a temp dir, point `CLEARSPEAK_DATA_DIR` there, restart, and
  verify one attempt's metadata, feedback, and WAV playback. Deletion reuses SQLite space
  but may not shrink the file immediately.
