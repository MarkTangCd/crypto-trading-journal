# CLAUDE.md

Guidance for Claude Code and other coding agents working in this repository.

## Agent Behavior

### Think Before Coding

- State assumptions when the task has meaningful ambiguity.
- Surface multiple plausible interpretations before making a risky choice.
- Push back when a simpler or safer approach better matches the request.
- Stop and ask when local context cannot resolve an important uncertainty.

### Simplicity First

- Use the minimum code that solves the requested problem.
- No unrequested features, configurability, abstractions, or defensive branches.
- Do not create abstractions for single-use code.
- Simplify before finishing when the implementation can be substantially shorter
  without losing clarity.

### Surgical Changes

- Touch only files and lines that directly support the task.
- Do not refactor adjacent code, comments, or formatting opportunistically.
- Match the surrounding style.
- Remove imports/variables/functions/files only when your own changes made them
  obsolete. Mention unrelated dead code instead of deleting it.

### Goal-Driven Execution

- Convert non-trivial tasks into verifiable success criteria.
- For bug fixes, prefer a reproducing test before the fix when practical.
- For refactors, keep behavior stable and verify before/after.
- For multi-step work, keep a brief plan and loop until checks pass.

## Communication

- Reply to the user in Chinese.
- Use English for code comments.
- Keep explanations concise and direct; avoid preamble.

## Commands

```bash
# Development
npm run dev          # Start dev server (Express + Vite HMR) on port 3000

# Build & production
npm run build        # Vite build + esbuild server bundle -> dist/
npm run start        # Run production build

# Type checking & formatting
npm run check        # TypeScript type check (tsc --noEmit)
npm run format       # Prettier format all files

# Tests
npm run test         # Run all tests with Vitest
npx vitest run server/transaction.test.ts  # Run one test file
npm run test:e2e     # Playwright smoke (requires `npx playwright install chromium` once)

# Database
npm run db:push      # Generate and apply Drizzle migrations
```

No lint script and no ESLint config in this repo.

## Stack And Layout

- App: crypto trading journal.
- Frontend: React 19, Vite, wouter, TanStack Query, tRPC client, Tailwind CSS,
  shadcn/ui.
- Backend: Express, tRPC server, Drizzle ORM, SQLite via Node's experimental
  `node:sqlite`.
- Language: TypeScript throughout. Single repo with one `package.json`.
- `client/src/` — frontend app code; `@/*` maps here.
- `server/` — Express + tRPC backend.
- `shared/` — shared constants, errors, type exports; `@shared/*` maps here.
- `drizzle/schema.ts` — database schema source of truth.
- `client/src/main.tsx` — QueryClient + tRPC provider setup.
- `client/src/App.tsx` — route table and top-level providers.
- `server/_core/index.ts` — server entry point.
- `server/routers.ts` — main tRPC router.
- `server/db.ts` — plain exported DB functions.

Request flow: `Browser -> Express -> tRPC router -> DB functions -> SQLite`.

All API calls go through `trpc.<namespace>.<procedure>` or `trpc.<procedure>`.
Do not introduce REST endpoints for behavior already handled by tRPC.

## Authentication

Single-tenant, anonymous, local-use software. tRPC context in
`server/_core/context.ts` always returns the same anonymous user from
`getOrCreateAnonymousUser()`. No cookie parsing, JWT, OAuth, or
`protectedProcedure`; all procedures use `publicProcedure`. This is deliberate
for a solo-use journal on `localhost` — do not expose the port to a network
without adding real auth first. If auth is reintroduced, prefer
`protectedProcedure` plus a cookie session over OAuth indirection.

## Database Rules

- SQLite is the active database. Use SQLite-compatible SQL only.
- Drizzle schema source of truth: `drizzle/schema.ts`.
- Main tables: `users`, `accounts`, `transactions`.
- Time fields (`startTime`, `endTime`) are millisecond timestamps.
- User-scoped queries must keep filtering by `userId`, even with one anonymous user.
- Reads and writes belong in `server/db.ts`, not directly in routers.
- `server/db.ts` uses plain exported functions, not repository classes.
- DB handle is a lazy singleton via `getDb()`.
- Reads may return `undefined` or `[]`; writes should throw on unavailable writes.

Preserve current calculated-field behavior:

- `getCurrentBalance(accountId, initialBalance)`.
- `getConsecutiveLosses(accountId)`.
- `calculateConfidenceLevel()`.
- Trading pairs are normalized to uppercase.

SQLite transactions go through `runInSqliteTransaction(fn)`, which wraps the
shared handle with raw `BEGIN`/`COMMIT`/`ROLLBACK`. Not reentrant; never nest.

## TypeScript And Imports

- `strict: true`; keep code fully type-safe.
- No `any`, `@ts-ignore`, or `@ts-expect-error`.
- Prefer inferred Drizzle types where available.
- Shared type exports live in `shared/types.ts` (re-exports `drizzle/schema.ts`).
- Prefer `import type` for type-only imports where the file already does.
- Preserve the surrounding file's import grouping; no gratuitous reordering.

Naming:

- React components / page files in `client/src/pages/`: PascalCase.
- Hooks: `useXxx`. Functions & variables: camelCase. Constants: UPPER_SNAKE_CASE.
- Zod schema fields and API inputs: camelCase.

## Formatting

Prettier is the source of truth: semicolons required, double quotes, print width
80, tab width 2, `arrowParens: avoid`. Run `npm run format` after meaningful edits.

## Test Setup

- Vitest config: `vitest.config.ts`. Include: `server/**/*.test.ts` and `*.spec.ts`.
- Test environment: Node.
- Server tests use `appRouter.createCaller(ctx)` to exercise tRPC procedures
  directly. See `server/transaction.test.ts` for the main `vi.mock` pattern.
- `tsconfig.json` excludes `**/*.test.ts`, so `npm run check` skips tests.
- When changing tested server behavior, run both `npm run check` and `npm run test`.

## Frontend Patterns

- Use `wouter`, not React Router. Routes defined in `client/src/App.tsx`.
- `App.tsx` composes `ErrorBoundary`, `ThemeProvider`, `TooltipProvider`, `Toaster`.
- Reads: `trpc.<namespace>.<procedure>.useQuery()`.
- Writes: `trpc.<namespace>.<procedure>.useMutation()`.
- Invalidate related queries via `trpc.useUtils()` after successful mutations.
- Loading states: centered spinner or loading block.
- Mutation failures: `toast.error(...)`. Success: `toast.success(...)`.
- Empty states are explicit and user-facing, not silent blanks.

## UI And Styling

- Tailwind utility classes are the default. Shared utilities in `client/src/index.css`.
- Compose existing `components/ui/*` primitives before creating new low-level UI.
- When editing shadcn-style primitives, preserve `cva`, `data-slot`, and `cn(...)` patterns.
- Do not broadly refactor `components/ui/*` unless the task requires it.

For UI work, read `PRODUCT.md` and `DESIGN.md` first — they are the strategic
and visual source of truth.

Brand: a watchmaker's notebook for one trader — paper-pale, mono-forward,
oversized numerals as the design.

Anti-references: pastel SaaS dashboards, crypto gamification/hype gradients,
exchange/TradingView grammar, Apple HIG / Material safety.

Operating principles: the number is the design; discipline over excitement;
two modes (recording and reviewing); earn every panel; motion is feedback, not
atmosphere.

Visual essentials: IBM Plex Mono; paper `oklch(0.985 0 0)`; ink `oklch(0.18 0 0)`;
win `oklch(0.5 0.13 150)`; loss `oklch(0.48 0.18 25)`; `--radius: 0`; no cards,
no shadows; lowercase labels; `font-variant-numeric: tabular-nums` on column
numerals.

Live mode config at `.impeccable/live/config.json`; run `/impeccable live` to
iterate visually.

## Error Handling

- Use `TRPCError` in tRPC middleware/procedures where appropriate.
- For shared HTTP-style errors, use `HttpError` and helpers from `shared/_core/errors.ts`.
- Client mutations surface failures with toasts.
- No empty catch blocks. If a catch intentionally swallows, document why, keep narrow.
- Logging uses scoped prefixes (`[Database]`, `[API Query Error]`); keep similar.

## Completion Checklist

- Every changed line traces back to the request.
- No unrelated refactors.
- TypeScript strict; no type suppression.
- Alias, import, and formatting style preserved.
- Ran `npm run format` after meaningful edits.
- Ran `npm run check` for code changes.
- Ran `npm run test` (or the relevant single server test) when backend behavior changed.

## Backlog.md (Task Management)

This project uses the Backlog.md CLI for tasks. Detailed docs are available via
the `backlog` MCP server resources — list them when you need more than the
cheat sheet below.

> Note: do not run `backlog agents` — it will re-inject ~770 lines of bloat
> into this file. The condensed reference here plus MCP resources are enough.

### Golden Rules

- Tasks live in `backlog/tasks/`. **Never edit task `.md` files directly** —
  use CLI; direct edits break metadata, Git tracking, and relationships.
- Always pass `--plain` when reading for AI-friendly output.
- When starting a task: `backlog task edit <id> -s "In Progress" -a @myself`,
  then add a plan via `--plan` and **share it with the user for approval before coding**.
- Only implement what's in the Acceptance Criteria. Need more? Update AC or
  create a follow-up task.
- Mark each AC complete as soon as it's done; add a Final Summary (PR-style)
  before flipping status to Done.

### Common Commands

```bash
# Read
backlog task list --plain
backlog task list -s "In Progress" --plain
backlog task <id> --plain
backlog search "topic" --plain

# Create
backlog task create "Title" -d "Why" --ac "Criterion 1" --ac "Criterion 2"

# Work
backlog task edit <id> -s "In Progress" -a @myself
backlog task edit <id> --plan "1. Step\n2. Step"     # add plan
backlog task edit <id> --append-notes "Progress note" # log progress
backlog task edit <id> --check-ac 1 --check-ac 2     # check ACs (multi-flag)
backlog task edit <id> --final-summary "PR summary"  # wrap up
backlog task edit <id> -s Done
```

For multi-line content, repeat `--append-*` per line, or pass real newlines
inside double quotes — the CLI does not interpret `\n`.
