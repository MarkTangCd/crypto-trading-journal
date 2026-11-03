---
id: doc-2
title: Goals spec
type: specification
created_date: "2026-11-03 01:04"
updated_date: "2026-11-03 01:05"
---

Spec for the trading **Goal** feature. Vocabulary per `GLOSSARY.md` (Goal /
Open goal / Done goal). All decisions below were settled with the trader on
2026-11-02; implementation must not reopen them.

## Purpose

Let the trader write down a handful of short, free-text intentions for the
near term, keep them in view every time the Dashboard opens, and tick them
off when achieved. A discipline artifact, not a task manager.

## Decisions (locked)

1. **Scope**: goals belong to the user, not to an account. They do not
   change when the AccountSwitcher changes.
2. **Content**: a single free-text `text` field. No due date, no numeric
   target, no priority.
3. **States**: `open` and `done`. Marking done records `completedAt`; a done
   goal can be reopened (clears `completedAt`).
4. **Visibility**: the `/goals` page shows two sections, open and done. The
   Dashboard shows open goals only.
5. **Where you can mark done**: both `/goals` and the Dashboard.
6. **Edit / delete**: open goals can have their text edited and can be
   deleted. Done goals can be reopened or deleted; editing text of a done
   goal is not needed.
7. **Dashboard presentation**: all open goals are listed (no cap). When
   there are none, show an explicit one-line empty state linking to
   `/goals`. Never hide the section silently.
8. **Navigation**: sidebar item `Goals` at path `/goals`, placed directly
   after `Dashboard` and before `Transactions`.
9. **Ordering**: by `createdAt` ascending everywhere. No manual reordering.
10. **Terminology**: Goal / open / done. Do not use target, todo, task,
    completed, archived in code identifiers or UI copy.

## Data model

New table `goals` in `drizzle/schema.ts`, same conventions as `accounts`:

| column        | type                             | notes                                 |
| ------------- | -------------------------------- | ------------------------------------- |
| `id`          | integer PK autoincrement         |                                       |
| `userId`      | integer not null                 | FK to `users`; every query filters it |
| `text`        | text not null                    | trimmed, 1..200 chars                 |
| `completedAt` | integer `timestamp_ms`, nullable | null = open, non-null = done          |
| `createdAt`   | integer `timestamp_ms` not null  | default `unixepoch() * 1000`          |
| `updatedAt`   | integer `timestamp_ms` not null  | default `unixepoch() * 1000`          |

Export `Goal` / `InsertGoal` inferred types and re-export from
`shared/types.ts`. Generate the migration with `npm run db:push`.

Status is derived from `completedAt`; there is no separate status column.

## Server

Plain exported functions in `server/db.ts` (no repository class):

- `createGoal(data: InsertGoal): Promise<Goal>`
- `listGoalsByUserId(userId): Promise<Goal[]>` ordered by `createdAt` asc
- `getGoalById(id, userId): Promise<Goal | undefined>`
- `updateGoal(id, userId, data: { text?: string; completedAt?: number | null }): Promise<Goal>`
- `deleteGoal(id, userId): Promise<void>`

Writes throw when the DB is unavailable; reads return `undefined` / `[]`.

tRPC namespace `goal` in `server/routers.ts`, all `publicProcedure`,
mirroring the `account` router shape:

- `goal.list` query → `Goal[]` (client splits open vs done by `completedAt`).
- `goal.create` mutation `{ text }` → trims, rejects empty with
  `TRPCError BAD_REQUEST`, length 1..200.
- `goal.update` mutation `{ id, text }` → same validation; ownership check.
- `goal.setDone` mutation `{ id, done: boolean }` → sets `completedAt` to
  `Date.now()` or `null`; ownership check.
- `goal.delete` mutation `{ id }` → ownership check.

Ownership check: load by `(id, userId)`, throw `NOT_FOUND` when missing,
same pattern as `requireOwnedAccount`.

## Client

### `/goals` page (`client/src/pages/Goals.tsx`)

- Route added in `client/src/App.tsx`; sidebar entry added in
  `DashboardLayout.tsx` between Dashboard and Transactions (icon from
  lucide, e.g. `Flag`).
- Top: a single-line input + "add" button. Enter submits. Empty input does
  nothing.
- Section `open`: each row = checkbox (mark done) · text · edit · delete.
  Edit is inline (text becomes an input, Enter saves, Escape cancels).
- Section `done`: each row = text (muted) · completed date via `fmtDate` ·
  reopen · delete. Hidden entirely when there are no done goals; the open
  section always renders, with an explicit empty state ("no open goals").
- Delete uses the existing `AlertDialog` confirmation pattern from
  `Accounts.tsx`.
- Mutations: `toast.success` / `toast.error`, then
  `utils.goal.list.invalidate()`.

### Dashboard strip (`client/src/pages/Dashboard.tsx`)

- A new section **above** the balance hero (first child of the
  `space-y-16` container), labelled with `SectionHeader` text `goals`.
- Lists open goals in `createdAt` order, each with a checkbox that calls
  `goal.setDone`. Ticking removes the row on invalidate.
- Empty state: one muted line, "no open goals", with a link to `/goals`.
- Reads `trpc.goal.list.useQuery()` independently of `accountId`; it must
  render even while account stats are loading or unavailable.

### Visual rules (from `DESIGN.md`)

No cards, no shadows, `--radius: 0`, lowercase labels, hairline borders
only. Rows are separated by `border-b border-border`. The checkbox is the
only control that carries state; no colored side-stripes. Use existing
`components/ui/checkbox` if present, otherwise a native checkbox styled
with Tailwind.

## Tests

`server/goal.test.ts` via `appRouter.createCaller(ctx)` following the
`vi.mock` pattern in `server/account.test.ts`:

- create trims and rejects empty / over-length text
- list returns goals in `createdAt` order
- setDone sets and clears `completedAt`
- update / delete / setDone reject ids not owned by the user

`npm run check` and `npm run test` must pass.

## Out of scope

Due dates, quantified goals (e.g. win-rate thresholds), per-account goals,
manual ordering, goal history analytics, surfacing goals to the review
agent.
