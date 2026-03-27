# AGENTS.md

This file is for coding agents working in this repository.
When this file was written, there was no existing top-level `AGENTS.md`, no `.cursorrules`, no `.cursor/rules/`, and no `.github/copilot-instructions.md`.
Treat this file as the main agent guide for repo-specific behavior.

## 1. Stack and layout

- App: crypto trading journal
- Frontend: React 19, Vite, wouter, TanStack Query, tRPC client, Tailwind CSS, shadcn/ui
- Backend: Express, tRPC server, Drizzle ORM, MySQL
- Language: TypeScript throughout
- Package layout: single repo with one `package.json`
- `client/src/` — frontend app code
- `server/` — Express + tRPC backend
- `shared/` — shared constants, errors, and type exports
- `drizzle/schema.ts` — database schema source of truth
- `client/src/main.tsx` — QueryClient + tRPC provider setup
- `client/src/App.tsx` — route table and top-level providers
- `server/_core/index.ts` — server entry point
- `server/routers.ts` — main tRPC router
- `server/db.ts` — plain exported DB functions

## 2. Commands

- `npm run dev` — run the dev server with Express + Vite HMR
- `npm run build` — build the client and bundle the server into `dist/`
- `npm run start` — run the production build
- `npm run check` — TypeScript typecheck via `tsc --noEmit`
- `npm run format` — format the repo with Prettier
- `npm run test` — run all tests with Vitest
- `npx vitest run server/tradingSystem.test.ts` — run a single test file
- `npm run db:push` — generate and apply Drizzle migrations
- There is currently **no lint script** and no ESLint config in this repo

## 3. Test setup

- Vitest is configured in `vitest.config.ts`
- Test include paths: `server/**/*.test.ts` and `server/**/*.spec.ts`
- Test environment: Node
- Server tests commonly use `appRouter.createCaller(ctx)` to exercise tRPC procedures directly
- See `server/transaction.test.ts` for the main mocking pattern with `vi.mock`
- See `server/auth.logout.test.ts` and `server/tradingSystem.test.ts` for context factory patterns
- `tsconfig.json` excludes `**/*.test.ts`, so `npm run check` does **not** typecheck tests
- When you change tested server behavior, run both `npm run check` and `npm run test`

## 4. Path aliases and imports

- `@/*` maps to `client/src/*`
- `@shared/*` maps to `shared/*`
- Prefer aliases over long relative paths when they improve clarity
- Preserve the surrounding file's import grouping instead of gratuitously reordering imports
- This repo does **not** have a rigid auto-sorted import convention
- App code commonly uses named React imports, for example `import { useState } from "react";`
- shadcn/ui primitives commonly use `import * as React from "react";`
- Prefer `import type` for type-only imports where the file already follows that pattern

## 5. Formatting rules

- Prettier is the formatting source of truth
- Semicolons: required
- Quotes: double quotes
- Print width: 80
- Tab width: 2 spaces
- `arrowParens`: `avoid`
- Do not hand-format against Prettier; run `npm run format` after meaningful edits

## 6. TypeScript rules

- `strict: true` is enabled; keep code fully type-safe
- Do not use `any`, `@ts-ignore`, or `@ts-expect-error`
- Prefer inferred types from Drizzle schema where available
- Shared type exports live in `shared/types.ts`, which re-exports from `drizzle/schema.ts`
- Simple props are often typed inline
- Reusable or clearer contracts may use interfaces or type aliases
- In React files, `React.ReactNode` and `React.FormEvent` are used directly in some places; match the surrounding file

## 7. Naming conventions

- React components: PascalCase
- Page files in `client/src/pages/`: PascalCase default exports are common
- Hooks: `useXxx`
- Functions and variables: camelCase
- Constants: UPPER_SNAKE_CASE for fixed sets and configuration values
- Zod schema fields and API inputs: camelCase
- Existing examples: `Dashboard`, `Transactions`, `NewTransaction`, `useAuth`, `useTheme`, `getCurrentBalance`, `UNAUTHED_ERR_MSG`, `COOKIE_NAME`, `TIME_FRAMES`

## 8. Frontend patterns

- Use `wouter`, not React Router
- Routes are defined in `client/src/App.tsx`
- `App.tsx` composes `ErrorBoundary`, `ThemeProvider`, `TooltipProvider`, and `Toaster`
- `DashboardLayout` is the main authenticated shell
- Use `trpc.<namespace>.<procedure>.useQuery()` for reads
- Use `trpc.<namespace>.<procedure>.useMutation()` for writes
- Use `trpc.useUtils()` to invalidate related queries after successful mutations
- Client-side unauthorized behavior is handled in `client/src/main.tsx` through `UNAUTHED_ERR_MSG`
- Helper functions and local `type` aliases often live near the top of the file
- Loading states usually render a centered spinner or loading block
- Mutation failures usually show `toast.error(...)`
- Successful mutations usually show `toast.success(...)`
- Empty states are explicit and user-facing, not silent blanks

## 9. UI and styling patterns

- Tailwind utility classes are the default styling approach
- Shared visual utility classes live in `client/src/index.css`
- Prefer composing existing `components/ui/*` primitives before creating new low-level UI building blocks
- If you edit a shadcn-style primitive, preserve the existing `cva`, `data-slot`, and `cn(...)` patterns
- Do not broadly refactor `components/ui/*` unless the task specifically requires it

## 10. Backend patterns

- Use `publicProcedure`, `protectedProcedure`, and `adminProcedure` from `server/_core/trpc.ts`
- Define input validation inline with Zod in `server/routers.ts`
- Keep tRPC as the API boundary; do not introduce ad hoc REST endpoints for app behavior
- `server/db.ts` uses plain exported functions, not repository classes
- Keep reads and writes in the DB layer instead of embedding SQL/Drizzle logic in routers
- The DB handle is a lazy singleton via `getDb()`
- User-scoped queries should continue to filter by `userId`
- Existing patterns often return `undefined` or `[]` on unavailable DB reads and throw for unavailable DB writes; match the local pattern when editing
- Preserve current calculated-field behavior such as current balance, consecutive losses, and confidence level derivation
- Normalize transaction trading pairs to uppercase as existing code does
- Keep shared constants in `@shared/const` when logic is cross-cutting

## 11. Error handling

- In tRPC middleware and procedures, use `TRPCError`
- For shared HTTP-style errors, use `HttpError` and helper constructors from `shared/_core/errors.ts`
- Client mutations should surface failures with toasts
- Do not introduce empty catch blocks
- If a catch intentionally swallows an error, document why and keep the scope narrow
- Existing logging uses clear prefixes such as `[Database]` and `[API Query Error]`; keep logs similarly scoped and readable

## 12. Practical guidance for agents

- Follow the structure and style of the file you are editing
- Keep changes local and surgical unless the task explicitly asks for broader refactoring
- Reuse the existing tRPC and Drizzle patterns instead of inventing a parallel abstraction
- Use shared exports and aliases rather than duplicating types or constants
- Do not invent a lint workflow that does not exist
- Do not switch routing libraries
- Do not introduce REST endpoints for flows already handled by tRPC
- Do not bypass strict typing

## 13. Quick checklist before finishing

- Did you keep the file's existing alias and import style?
- Did you avoid unrelated refactors?
- Did you keep TypeScript strict and avoid type suppression?
- Did you run `npm run format` if needed?
- Did you run `npm run check` for code changes?
- Did you run `npm run test` or the relevant single server test file when backend behavior changed?
