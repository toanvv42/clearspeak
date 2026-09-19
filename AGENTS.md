# Repository Guidelines

## Project Structure & Module Organization

ClearSpeak is a Next.js App Router pronunciation coach using React, TypeScript, Tailwind CSS, and Azure Speech.

- `app/`: pages, layout, global styles, and access-check/speech-token API routes.
- `components/`: practice, recording, and feedback UI; `hooks/`: browser recording lifecycle.
- `lib/`: text validation, assessment guidance, audio encoding, Azure integration, and server rate limits.
- `content/passages/`: graded JSON practice passages; preserve stable IDs and provenance/review metadata.
- `public/`: static assets and the PCM recorder worklet.
- `tests/`: unit and component tests plus audio mocks; `deploy/`: systemd service definitions.

## Build, Test, and Development Commands

Use the Node version pinned in `mise.toml`.

- `mise install`: install the pinned toolchain.
- `mise run setup`: install npm dependencies.
- `mise run dev`: start development at `http://localhost:3000`.
- `mise run lint`: run ESLint with Next.js Core Web Vitals and TypeScript rules.
- `mise run typecheck`: run TypeScript without emitting files.
- `mise run test`: run Vitest once; `npm test` enables watch mode.
- `mise run build`: create a production build; `npm start` serves it.

## Coding Style & Naming Conventions

Follow existing two-space indentation, double quotes, and semicolons. Use strict TypeScript, PascalCase component names, camelCase functions/variables, and kebab-case filenames such as `score-card.tsx`. Name hooks `use-*` and prefer `@/` imports for repository modules. Mark browser-dependent component entry points with `"use client"`. No standalone formatter is configured; follow nearby code and ESLint.

## Testing Guidelines

Tests use Vitest, jsdom, React Testing Library, and jest-dom. Name files `*.test.ts` or `*.test.tsx` under `tests/` or `lib/`. Add meaningful regression tests for changed behavior; mock browser audio and Azure requests. No coverage threshold is configured. Before a PR, run lint, typecheck, tests, and build.

## Commit & Pull Request Guidelines

History uses short imperative subjects, sometimes prefixed with `feat:` or `fix:`. Keep commits focused. PRs should explain the problem and resulting behavior, list validation performed, link relevant issues, and include screenshots for UI changes.

## Security & Configuration

Keep secrets in gitignored `mise.local.toml` or `.env.local`; use `.env.example` for variable names. Never expose Azure keys through `NEXT_PUBLIC_*`, logs, or client code. Preserve direct browser-to-Azure audio submission for assessment; finished recordings and evaluations are persisted to the app server's SQLite history (see `PRACTICE_HISTORY_PLAN.md`). Production requires HTTPS and `APP_ACCESS_CODE`.
