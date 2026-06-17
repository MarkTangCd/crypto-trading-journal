# CLAUDE.md

This file provides guidance to Claude Code and other coding agents working in
this repository.

## Agent Behavior

These rules merge the project-specific guide with the Karpathy-inspired
guidelines from `multica-ai/andrej-karpathy-skills`.

### Think Before Coding

- State assumptions when the task has meaningful ambiguity.
- If there are multiple plausible interpretations, surface them before making a
  risky choice.
- Push back when a simpler or safer approach better matches the request.
- Stop and ask when local context cannot resolve an important uncertainty.

### Simplicity First

- Use the minimum code that solves the requested problem.
- Do not add features, configurability, abstractions, or defensive branches that
  were not requested and are not required by existing behavior.
- Do not create abstractions for single-use code.
- If an implementation can be substantially shorter without losing clarity,
  simplify it before finishing.

### Surgical Changes

- Touch only files and lines that directly support the task.
- Do not refactor adjacent code, comments, or formatting just because it looks
  improvable.
- Match the surrounding style, even when another style might be preferred.
- Remove imports, variables, functions, and files only when your own changes made
  them obsolete.
- Mention unrelated dead code or risks instead of deleting them.

### Goal-Driven Execution

- Convert non-trivial tasks into verifiable success criteria.
- For bug fixes, prefer a reproducing test before the fix when practical.
- For refactors, keep behavior stable and verify before and after when feasible.
- For multi-step work, keep a brief plan and loop until the stated checks pass.

## Communication

- Reply to the user in Chinese.
- Keep explanations concise and direct.
- Use English for code comments.
- Avoid unnecessary preamble.

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

# Database
npm run db:push      # Generate and apply Drizzle migrations
```

There is currently no lint script and no ESLint config in this repo.

## Stack And Layout

- App: crypto trading journal.
- Frontend: React 19, Vite, wouter, TanStack Query, tRPC client, Tailwind CSS,
  shadcn/ui.
- Backend: Express, tRPC server, Drizzle ORM, SQLite through Node's experimental
  `node:sqlite`.
- Language: TypeScript throughout.
- Package layout: single repo with one `package.json`.
- `client/src/` - frontend app code; `@/*` maps here.
- `server/` - Express + tRPC backend.
- `shared/` - shared constants, errors, and type exports; `@shared/*` maps here.
- `drizzle/schema.ts` - database schema source of truth.
- `client/src/main.tsx` - QueryClient + tRPC provider setup.
- `client/src/App.tsx` - route table and top-level providers.
- `server/_core/index.ts` - server entry point.
- `server/routers.ts` - main tRPC router.
- `server/db.ts` - plain exported DB functions.

Request flow:

```text
Browser -> Express -> tRPC router -> DB functions -> SQLite
```

All API calls go through `trpc.<namespace>.<procedure>` or
`trpc.<procedure>`. Do not introduce REST endpoints for app behavior already
handled by tRPC.

## Authentication

This is single-tenant, anonymous, local-use software. The tRPC context in
`server/_core/context.ts` always returns the same anonymous user from
`getOrCreateAnonymousUser()`.

- There is currently no cookie parsing, JWT verification, OAuth flow,
  `protectedProcedure`, or `requireUser`.
- All procedures use `publicProcedure`.
- This is deliberate for a solo-use journal running on `localhost`.
- Do not expose the port to a network without adding real auth first.
- If auth is reintroduced, prefer `protectedProcedure` plus a cookie session over
  OAuth indirection.

Legacy `JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`,
`VITE_OAUTH_PORTAL_URL`, and `OWNER_OPEN_ID` may appear in old environments, but
they are not wired into the current app.

## Database Rules

- SQLite is the active database. Use SQLite-compatible SQL only.
- Drizzle schema source of truth: `drizzle/schema.ts`.
- Main tables: `users`, `accounts`, `transactions`.
- Time fields such as `startTime` and `endTime` are stored as millisecond
  timestamps.
- User-scoped queries must keep filtering by `userId`, even though the current
  app has one anonymous user.
- Reads and writes belong in `server/db.ts`, not directly in routers.
- `server/db.ts` uses plain exported functions, not repository classes.
- The DB handle is a lazy singleton via `getDb()`.
- Existing read patterns may return `undefined` or `[]` when data is unavailable;
  write paths should throw on unavailable writes.

Preserve current calculated-field behavior:

- `getCurrentBalance(accountId, initialBalance)`.
- `getConsecutiveLosses(accountId)`.
- `calculateConfidenceLevel()`.
- Trading pairs are normalized to uppercase.

SQLite transactions go through `runInSqliteTransaction(fn)`, which wraps the
shared SQLite handle with raw `BEGIN`, `COMMIT`, and `ROLLBACK`. It is not
reentrant; never nest calls.

## TypeScript And Imports

- `strict: true` is enabled; keep code fully type-safe.
- Do not use `any`, `@ts-ignore`, or `@ts-expect-error`.
- Prefer inferred Drizzle types where available.
- Shared type exports live in `shared/types.ts`, which re-exports from
  `drizzle/schema.ts`.
- Prefer `import type` for type-only imports where the file already follows that
  pattern.
- Preserve the surrounding file's import grouping instead of gratuitously
  reordering imports.
- This repo does not have a rigid auto-sorted import convention.

Naming:

- React components: PascalCase.
- Page files in `client/src/pages/`: PascalCase default exports are common.
- Hooks: `useXxx`.
- Functions and variables: camelCase.
- Constants: UPPER_SNAKE_CASE.
- Zod schema fields and API inputs: camelCase.

## Formatting

- Prettier is the formatting source of truth.
- Semicolons: required.
- Quotes: double quotes.
- Print width: 80.
- Tab width: 2 spaces.
- `arrowParens`: `avoid`.
- Run `npm run format` after meaningful edits.

## Test Setup

- Vitest config: `vitest.config.ts`.
- Test include paths: `server/**/*.test.ts` and `server/**/*.spec.ts`.
- Test environment: Node.
- Server tests commonly use `appRouter.createCaller(ctx)` to exercise tRPC
  procedures directly.
- See `server/transaction.test.ts` for the main `vi.mock` pattern.
- `tsconfig.json` excludes `**/*.test.ts`, so `npm run check` does not typecheck
  tests.
- When changing tested server behavior, run both `npm run check` and
  `npm run test`.

## Frontend Patterns

- Use `wouter`, not React Router.
- Routes are defined in `client/src/App.tsx`.
- `App.tsx` composes `ErrorBoundary`, `ThemeProvider`, `TooltipProvider`, and
  `Toaster`.
- Use `trpc.<namespace>.<procedure>.useQuery()` for reads.
- Use `trpc.<namespace>.<procedure>.useMutation()` for writes.
- Use `trpc.useUtils()` to invalidate related queries after successful
  mutations.
- Helper functions and local type aliases often live near the top of the file.
- Loading states usually render a centered spinner or loading block.
- Mutation failures usually show `toast.error(...)`.
- Successful mutations usually show `toast.success(...)`.
- Empty states are explicit and user-facing, not silent blanks.

## UI And Styling

- Tailwind utility classes are the default styling approach.
- Shared visual utility classes live in `client/src/index.css`.
- Prefer composing existing `components/ui/*` primitives before creating new
  low-level UI building blocks.
- If editing a shadcn-style primitive, preserve `cva`, `data-slot`, and
  `cn(...)` patterns.
- Do not broadly refactor `components/ui/*` unless the task specifically
  requires it.

For UI work, read `PRODUCT.md` and `DESIGN.md` first. They are the strategic and
visual source of truth.

Brand in one line: a watchmaker's notebook for one trader - paper-pale,
mono-forward, oversized numerals as the design.

Anti-references:

- Pastel cool-gray SaaS dashboards.
- Crypto-project gamification, hype gradients, and NFT-launch energy.
- Exchange or TradingView UI grammar.
- Apple HIG / Material safety.

Operating principles:

1. The number is the design.
2. Discipline over excitement.
3. Two modes, one tool: recording and reviewing.
4. Earn every panel.
5. Motion is feedback, not atmosphere.

Visual short-form:

- IBM Plex Mono is the committed face.
- Paper: `oklch(0.985 0 0)`.
- Ink: `oklch(0.18 0 0)`.
- Win: `oklch(0.5 0.13 150)`.
- Loss: `oklch(0.48 0.18 25)`.
- `--radius: 0`.
- No cards, no shadows.
- Lowercase labels.
- Use `font-variant-numeric: tabular-nums` on column numerals.

Live mode is configured at `.impeccable/live/config.json`; run
`/impeccable live` to iterate visually in the browser.

## Error Handling

- In tRPC middleware and procedures, use `TRPCError` where appropriate.
- For shared HTTP-style errors, use `HttpError` and helper constructors from
  `shared/_core/errors.ts`.
- Client mutations should surface failures with toasts.
- Do not introduce empty catch blocks.
- If a catch intentionally swallows an error, document why and keep the scope
  narrow.
- Existing logging uses scoped prefixes such as `[Database]` and
  `[API Query Error]`; keep logs similarly scoped and readable.

## Completion Checklist

- Did every changed line trace back to the request?
- Did you avoid unrelated refactors?
- Did you keep TypeScript strict and avoid type suppression?
- Did you preserve existing alias, import, and formatting style?
- Did you run `npm run format` after meaningful edits?
- Did you run `npm run check` for code changes?
- Did you run `npm run test` or the relevant single server test when backend
  behavior changed?
