---
id: doc-8
title: Trade journal spec
type: specification
created_date: "2026-11-13 14:22"
updated_date: "2026-11-13 14:22"
---

Spec for the **Trade journal**: the trader links synced trades to a journal
entry, records the setups, reasoning, planned prices and emotion going in,
then writes the review once every linked trade has closed. Vocabulary per
`GLOSSARY.md` → section _Trade journal_ (Journal entry, Unreviewed/Reviewed
entry, Review, Setup, Entry trigger, Emotion, Planned R:R, Actual R) and
_Market context_ under _Trading plans_. Every decision below was settled with
the trader on 2026-11-13 on the _Trade journal map_ (doc-7) and its tickets;
implementation must not reopen them. Where this spec is silent about layout,
variant B ("facing pages") of the prototype on branch `prototype/journal-ui`
(`client/src/components/journal-prototype/VariantB.tsx`, `shared.tsx`,
`store.ts`) is the reference. Research findings:
`research/journal-image-owner` (`docs/research/journal-image-owner.md`) and
`research/journal-image-slot` (`docs/research/journal-image-slot.md`). None
of these branches is ever merged.

## Purpose

Turn every trade into a habit of reflection without long write-ups: before
(or while) a trade idea is taken, say which setup it matched, why, where it
is wrong, and what was felt; after it closes, answer the seven review
prompts in a few lines. Planned R:R against Actual R shows at a glance
whether the idea played out as planned.

## Locked decisions

1. **Terms and nav**: sidebar item **Journal** at `/journal`, order Goals →
   Plans → Trades → Journal → Pre-Trade. Setups live at `/journal/setups`
   (not in the sidebar).
2. **Cardinality**: an entry links one or more trades, all on one symbol and
   one linked account (direction may differ); a trade belongs to at most one
   entry. Entries belong to the user; `/journal` lists every entry
   regardless of the AccountSwitcher. No manual entries, no entry without a
   trade (decision-2).
3. **States**: unreviewed / reviewed, derived from a nullable `reviewedAt`.
   `markReviewed` needs only "every linked trade is closed", no field is
   required; it makes the entry read-only. `reopen` clears `reviewedAt` and
   keeps every field.
4. **Two phases**: recording fields (planned prices, emotion, setups, entry
   reason, market context, invalidation, before screenshots) are editable
   while unreviewed. Review fields (after screenshots, mistakes, rules
   followed or broken, management decisions, notes for next time) are
   editable only while unreviewed **and** every linked trade is closed;
   otherwise they are shown locked with "waiting for n open trade(s) to
   close". Linking another open trade to an unreviewed entry relocks the
   review and keeps what was written; unlinking it unlocks again.
5. **Linked trades**: add or remove while unreviewed, never below one. The
   entry's `accountId` and `symbol` are fixed at creation from its first
   trade; added trades must match both.
6. **Delete** works in both states behind a confirmation; it cascades the
   entry's images, trade links and setup links; the trades become pickable
   again.
7. **Saving**: rich text autosaves ~1 s after the last keystroke; structured
   fields save on change (price inputs on blur); last write wins; quiet
   `saved hh:mm`, no success toast. Create-then-jump: the row is created as
   soon as trades are picked and the page navigates to `/journal/:id`.
8. **Planned R:R** is client-only (reacts while typing), reusing
   `previewPlannedRiskReward` with direction = side of the earliest linked
   trade. **Actual R** = net realized PnL of all linked trades ÷
   (|planned entry − planned stop loss| × Σ quantity), computed on read on
   the server, null unless every linked trade is closed and both prices are
   set and differ. The trades' exchange `stopLossPrice` / `takeProfitPrice`
   are not used.
9. **Emotion**: one optional value from `EMOTIONS`.
10. **Screenshots**: before / after slots outside rich text, each holding up
    to `SLOT_IMAGE_MAX` images, pasted, dropped or picked, each removable;
    stored as ordered id arrays on the entry. Rich text fields also accept
    pasted images (same editor, same owner).
11. **Setups**: name unique per user case-insensitively, 1..60 chars; rich
    text description (images allowed); 0..n entry triggers (each 1..80
    chars). A setup used by any entry cannot be deleted; no archive.
12. **Entry date** = earliest linked trade's `openTime`, shown in UTC+8; the
    list sorts by it, newest first. `createdAt` is internal.
13. **Review prompts**: the static Chinese block (doc-7 Notes, verbatim) at
    the top of the review, never stored.
14. **Images**: polymorphic owner on `images` (decision-3, amended
    2026-11-13). **Time**: decision-1.

## Shared constants and helpers

`shared/const.ts` (next to `IMAGE_MIME_TYPES`):

```ts
export const IMAGE_OWNER_KINDS = ["plan", "journal_entry", "setup"] as const;
export type ImageOwnerKind = (typeof IMAGE_OWNER_KINDS)[number];
export const EMOTIONS = [
  "fear",
  "greed",
  "frustration",
  "impatience",
  "hesitation",
  "overconfidence",
  "revenge",
  "boredom",
  "stress",
  "fomo",
] as const;
export type Emotion = (typeof EMOTIONS)[number];
export const JOURNAL_SLOTS = ["before", "after"] as const;
export const SLOT_IMAGE_MAX = 10;
export const SETUP_NAME_MAX = 60;
export const ENTRY_TRIGGER_MAX = 80;
/** Moved from client/src/lib/plannedRiskReward.ts; server validates prices */
export const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
```

Emotions display lowercase except `fomo` → `FOMO`. `plannedRiskReward.ts`
imports `DECIMAL_PATTERN` from `@shared/const` and keeps its exports.

Planned prices on input: trim; empty → `null`; else must match
`DECIMAL_PATTERN` and be `> 0`, else `BAD_REQUEST`; stored as the trimmed
text decimal. Setup name and each trigger: trim, then length check;
duplicate triggers (case-insensitive) → `BAD_REQUEST`.

## Data model

All in `drizzle/schema.ts`, conventions as doc-6: integer autoincrement ids,
camelCase columns, `timestamp_ms` with `(unixepoch() * 1000)` defaults,
`check` constraints for enums, **no foreign keys**. Rich text columns are
`text(..., { mode: "json" }).$type<RichTextDoc>()`, nullable, null = empty.
JSON arrays follow `enabledSkillIds`:
`text(..., { mode: "json" }).$type<T[]>().notNull().default(sql\`'[]'\`)`.

### `images` (changed)

`planId` is replaced by:

| column      | type             | notes                                       |
| ----------- | ---------------- | ------------------------------------------- |
| `ownerKind` | text not null    | check `in ('plan','journal_entry','setup')` |
| `ownerId`   | integer not null | the owner row id; no FK                     |

Index `images_plan_sha_unique` becomes `images_owner_sha_unique
(ownerKind, ownerId, sha256)` unique; check `images_owner_kind_check`;
`images_user_idx` unchanged.

### `journal_entries` (new)

| column                | type                  | notes                                          |
| --------------------- | --------------------- | ---------------------------------------------- |
| `id`                  | integer pk            |                                                |
| `userId`              | integer not null      |                                                |
| `accountId`           | integer not null      | from the first trade; immutable                |
| `symbol`              | text not null         | from the first trade; immutable                |
| `plannedEntry`        | text nullable         | text decimal, > 0                              |
| `plannedStopLoss`     | text nullable         | same                                           |
| `plannedTakeProfit`   | text nullable         | same                                           |
| `emotion`             | text nullable         | check `emotion is null or emotion in EMOTIONS` |
| `entryReason`         | text json, nullable   | recording                                      |
| `marketContext`       | text json, nullable   | recording                                      |
| `invalidation`        | text json, nullable   | recording                                      |
| `mistakes`            | text json, nullable   | review                                         |
| `rules`               | text json, nullable   | review: rules followed or broken               |
| `managementDecisions` | text json, nullable   | review                                         |
| `nextTime`            | text json, nullable   | review: notes for next time                    |
| `beforeImageIds`      | text json `number[]`  | default `'[]'`; recording                      |
| `afterImageIds`       | text json `number[]`  | default `'[]'`; review                         |
| `reviewedAt`          | timestamp_ms nullable | null = unreviewed                              |
| `createdAt`           | timestamp_ms not null | internal                                       |
| `updatedAt`           | timestamp_ms not null | bumped when this row changes                   |

Index: `journal_entries_user_idx (userId)`.

### `journal_entry_trades` (new)

| column    | type             | notes |
| --------- | ---------------- | ----- |
| `id`      | integer pk       |       |
| `entryId` | integer not null |       |
| `tradeId` | integer not null |       |

Indexes: `journal_entry_trades_trade_unique (tradeId)` unique (a trade
belongs to at most one entry; a race surfaces as `CONFLICT`),
`journal_entry_trades_entry_idx (entryId)`.

### `setups` (new)

| column        | type                  | notes                                       |
| ------------- | --------------------- | ------------------------------------------- |
| `id`          | integer pk            |                                             |
| `userId`      | integer not null      |                                             |
| `name`        | text not null         | trimmed, 1..`SETUP_NAME_MAX`                |
| `description` | text json, nullable   | rich text, images owned by the setup        |
| `triggers`    | text json `string[]`  | default `'[]'`; each 1..`ENTRY_TRIGGER_MAX` |
| `createdAt`   | timestamp_ms not null |                                             |
| `updatedAt`   | timestamp_ms not null |                                             |

Index: `setups_user_name_unique` unique on `(userId, lower(name))`
(expression index; SQLite `lower()` folds ASCII only, which is enough).

### `journal_entry_setups` (new)

| column    | type             | notes |
| --------- | ---------------- | ----- |
| `id`      | integer pk       |       |
| `entryId` | integer not null |       |
| `setupId` | integer not null |       |

Indexes: `journal_entry_setups_entry_setup_unique (entryId, setupId)`
unique, `journal_entry_setups_setup_idx (setupId)` (usage counts).

### Migrations

Two, in order:

1. `0015_images_polymorphic_owner`: `drizzle-kit generate --name
images_polymorphic_owner` (answer "create column"), then hand-edit the
   rebuild's `INSERT … SELECT` to select `'plan', "planId"` for
   `ownerKind, ownerId` — exactly research `journal-image-owner` §2.1. The
   generated file does not run unedited. Leave the snapshot as generated.
2. `0016_…`: the four new tables, generated, no hand edits.

Verify with `drizzle-kit check`, `npm run test` (fresh-DB tests migrate the
full journal), and one app start against a copy of the real database.

## Derived values (computed on read, `server/db.ts`)

- State: `reviewedAt === null` → unreviewed.
- `date`: min `openTime` of the linked trades.
- `sides`: distinct `side` of the linked trades in `openTime` order (the
  client joins them with `/`).
- `tradeCount`, `openTradeCount` (`status = 'open'`).
- `netPnlUsd`: Σ `realizedPnlUsd` of all linked trades, open ones included
  (their realized part so far), as a number.
- `actualR` (`get` only): `netPnlUsd / (|plannedEntry − plannedStopLoss| ×
Σ quantity)`, or null when `openTradeCount > 0`, either price is null, or
  they are equal.
- List state column: `● to review` (unreviewed, `openTradeCount = 0`),
  `● n open` (unreviewed, waiting), muted `reviewed`.
- Setup `usageCount`: number of `journal_entry_setups` rows.

## DB functions (`server/db.ts`)

Plain exported functions scoped by `userId`, same rules as doc-6: separate
ownership queries, **no joins** through the sqlite-proxy callback, `.all()` /
`limit(1)` and destructure. Multi-row writes run in
`runInSqliteTransaction` (not reentrant: the db function owns the
transaction, never nest).

- `listJournalEntries(userId)` → entries with derived values and setup
  names (sorted by name), sorted by `date` desc. Queries: entries; links for
  those entries; those trades; setup links; those setups.
- `getJournalEntry(userId, id)` → entry with trades (`openTime` asc), setups
  (`{ id, name }`, by name), derived values incl. `actualR`; or `undefined`.
- `getJournalEntryRow(userId, id)`, `getSetupRow(userId, id)` — bare row
  lookups for guards and the image route.
- `listPickableTrades(userId, accountId, symbol?)` → the account's trades
  (open and closed) with no `journal_entry_trades` row, `openTime` desc.
- `getJournalEntryForTrade(userId, tradeId)` → `{ id, date, setupNames,
tradeCount, state }` or `undefined`.
- `createJournalEntry(userId, tradeIds)` → transaction: insert the entry
  (`accountId`, `symbol` from the trades) and one link per trade; returns
  `{ id }`.
- `updateJournalEntry(userId, id, patch)` → returns `updatedAt`.
- `setJournalEntrySetups(userId, id, setupIds)` → transaction: replace the
  links.
- `addJournalEntryTrade`, `removeJournalEntryTrade(userId, id, tradeId)`.
- `addSlotImage`, `removeSlotImage(userId, id, slot, imageId)` → transaction:
  read the array, append (no-op if present) or remove, write back.
- `setJournalEntryReviewedAt(userId, id, Date | null)`.
- `deleteJournalEntry(userId, id)` → transaction: delete images
  `(journal_entry, id)`, setup links, trade links, the entry.
- `listSetups(userId)` → setups with `usageCount`, by `lower(name)` asc.
- `getSetup(userId, id)` → setup with `usageCount`, or `undefined`.
- `findSetupByName(userId, name)` → case-insensitive lookup for the
  uniqueness pre-check.
- `createSetup(userId, name)`, `updateSetup(userId, id, patch)`.
- `deleteSetup(userId, id)` → transaction: delete images `(setup, id)`, the
  setup.
- Images: `findImageBySha(userId, ownerKind, ownerId, sha256)`;
  `insertImage` with the owner pair; `deletePlan` deletes images by
  `('plan', planId)`; `getImage` unchanged.

State guards (`CONFLICT` vs `NOT_FOUND` vs `BAD_REQUEST`) live in the router
and the image route, not in the db functions.

## tRPC surface (`server/routers.ts`)

All `publicProcedure`. Common errors: unknown or foreign entry, trade, setup
or image id → `NOT_FOUND`; **state conflicts → `CONFLICT`**; **input
problems → `BAD_REQUEST`** (zod, decimals, lengths, symbol/account mismatch,
empty trade list, removing the last trade, slot full). Any write to a
reviewed entry except `reopen` and `delete` → `CONFLICT`.

### namespace `journal`

| procedure         | input                                                                                                                                                                    | notes                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list`            | —                                                                                                                                                                        | `listJournalEntries`                                                                                                                                                |
| `get`             | `{ id }`                                                                                                                                                                 | `getJournalEntry`                                                                                                                                                   |
| `pickableTrades`  | `{ accountId, symbol? }`                                                                                                                                                 | picker (selected account) and `+ add trade` (entry's account and symbol); no paging, client filters by symbol search                                                |
| `forTrade`        | `{ tradeId }`                                                                                                                                                            | entry summary or `null`                                                                                                                                             |
| `create`          | `{ tradeIds: number[] }` (min 1, unique)                                                                                                                                 | every trade the user's, else `NOT_FOUND`; mixed symbol or account → `BAD_REQUEST`; any already linked → `CONFLICT` (also on a unique-index race); returns `{ id }`  |
| `update`          | `{ id, plannedEntry?, plannedStopLoss?, plannedTakeProfit?, emotion?, entryReason?, marketContext?, invalidation?, mistakes?, rules?, managementDecisions?, nextTime? }` | prices `string \| null`, `emotion: Emotion \| null`, rich text `RichTextDoc \| null`; any review field while `openTradeCount > 0` → `CONFLICT`; returns `updatedAt` |
| `setSetups`       | `{ id, setupIds: number[] }`                                                                                                                                             | replaces the set; unknown setup → `NOT_FOUND`                                                                                                                       |
| `addTrade`        | `{ id, tradeId }`                                                                                                                                                        | symbol or account differs → `BAD_REQUEST`; already linked → `CONFLICT`                                                                                              |
| `removeTrade`     | `{ id, tradeId }`                                                                                                                                                        | not linked to this entry → `NOT_FOUND`; last one → `BAD_REQUEST`                                                                                                    |
| `addSlotImage`    | `{ id, slot: "before" \| "after", imageId }`                                                                                                                             | image must belong to `(userId, journal_entry, id)` else `NOT_FOUND`; `after` while trades open → `CONFLICT`; slot at `SLOT_IMAGE_MAX` → `BAD_REQUEST`               |
| `removeSlotImage` | `{ id, slot, imageId }`                                                                                                                                                  | `after` while trades open → `CONFLICT`; the image row is orphaned, not deleted                                                                                      |
| `markReviewed`    | `{ id }`                                                                                                                                                                 | already reviewed or `openTradeCount > 0` → `CONFLICT`                                                                                                               |
| `reopen`          | `{ id }`                                                                                                                                                                 | not reviewed → `CONFLICT`                                                                                                                                           |
| `delete`          | `{ id }`                                                                                                                                                                 | allowed in both states                                                                                                                                              |

### namespace `setup`

| procedure | input                                    | notes                                                         |
| --------- | ---------------------------------------- | ------------------------------------------------------------- |
| `list`    | —                                        | `listSetups`                                                  |
| `get`     | `{ id }`                                 |                                                               |
| `create`  | `{ name }`                               | name taken (case-insensitive) → `CONFLICT`; returns `{ id }`  |
| `update`  | `{ id, name?, description?, triggers? }` | name taken by another setup → `CONFLICT`; returns `updatedAt` |
| `delete`  | `{ id }`                                 | `usageCount > 0` → `CONFLICT`                                 |

No existing procedure changes.

## Image routes (`server/_core/imageRoutes.ts`)

Per research `journal-image-owner` §3–4:

- `POST /api/images?ownerKind=<kind>&ownerId=<n>`: `ownerKind` zod enum
  over `IMAGE_OWNER_KINDS`, `ownerId` positive int, else 400. Dispatch:
  `plan` → `getPlanRow`, 404 / 409 when `closedAt`; `journal_entry` →
  `getJournalEntryRow`, 404 / 409 when `reviewedAt`; `setup` →
  `getSetupRow`, 404 only. The before/after slot rule is enforced by
  `journal.addSlotImage`, not here. Dedupe by `(userId, ownerKind, ownerId,
sha256)`; insert with the owner pair. Everything else unchanged.
- `GET /api/images/:id` unchanged.

## Client

### Shared pieces

- `client/src/lib/images.ts`: `uploadImage(file, owner)` →
  `{ id, url }` and `imageUploadError(file)` (size guard text), extracted
  from `PlanEditor` (research `journal-image-slot` §1).
- `PlanEditor` moves to `client/src/components/RichTextEditor.tsx`, prop
  `planId` → `owner: { kind: ImageOwnerKind; id: number }`; Plans call
  sites pass `{ kind: "plan", id }`; behaviour unchanged.
- `client/src/components/journal/ImageSlot.tsx`: props `imageIds`, `owner`,
  `editable`, `onAdd(imageId)`, `onRemove(imageId)`. A native `<button>`
  with `onPaste` plus a hidden `<input type="file" accept multiple>`,
  `onDragOver` / `onDrop` on the wrapper, no window listener; pending
  `blob:` previews held locally; the client pre-checks `SLOT_IMAGE_MAX`.
  Uploads go through `uploadImage`, then `journal.addSlotImage`; invalidate
  `journal.get`.
- `client/src/components/ui/popover.tsx`: shadcn popover over
  `@radix-ui/react-popover` (version range in the style of the other radix
  packages), used by the setups multi-select.

### Pages (variant B "facing pages"; read `DESIGN.md`, `PRODUCT.md` first)

- Routes in `App.tsx`: `/journal`, `/journal/setups`, `/journal/:id`
  (`/journal/setups` before `/journal/:id`); the entry and setups pages pull
  in Tiptap and are `React.lazy`. Sidebar item per decision 1.
- **`/journal`**: title `journal`, `n entries · m to review`; header actions
  `setups` and `new entry →`. Column table: date `day hh:mm` UTC+8 · symbol
  (`· <account>` when not the selected account) · side(s) · setups (`—`) ·
  trades · net pnl · state; rows link to the entry; tabular numerals;
  explicit empty state.
- **Picker** (`new entry →`, or `?new=1`, `?pick=<tradeId>` preselects)
  replaces the table in place: symbol search, checkbox column, opened ·
  symbol · status · position (`side qty @ entry → exit`) · pnl (`open` while
  open); after the first tick other symbols dim with a one-line
  explanation; footer `create entry with n trade(s) →` (disabled `tick at
least one trade`) and cancel. Data: `journal.pickableTrades` for the
  AccountSwitcher's account.
- **`/journal/:id`**: `← journal` and `saved hh:mm`; title line symbol with
  `date · side(s) · n trades · state`. Two pages at `lg` split by a 1px mist
  rule, stacked when narrow.
  - Left `before · planned r:r`: planned R:R hero with hint line
    (`|target − entry| / |entry − stop|`, the helper's invalid reason, or
    `enter entry, stop and target`); planned entry / stop loss / take profit
    inputs; setups multi-select (popover, checkboxes, inline `+ new setup`
    → `setup.create` then `journal.setSetups`) beside the emotion select;
    entry reason, market context, invalidation (rich text); before
    screenshots.
  - Right `after · actual r`: actual R hero tinted by sign (`open` while
    trades are open), `net pnl · formula` line; linked trades (unlink on
    hover while unreviewed and more than one; `+ add trade` lists
    `pickableTrades` for the entry's account and symbol); the review —
    locked line while trades are open, else the Chinese prompt block, after
    screenshots, mistakes, rules followed or broken, management decisions,
    notes for next time.
  - Footer across both pages: `mark reviewed →` (filled ink; disabled with
    `after every linked trade closes`); reviewed shows `reviewed <day
hh:mm> · reopen`; `delete entry` at the right behind a confirmation
    dialog, then back to `/journal`.
- **`/journal/setups`**: master-detail. Left: inline create (enter; errors
  inline) and the list with usage counts. Right: name (save on blur,
  uniqueness / length errors inline), `used by n entries`, trigger chips
  (enter to add, × to remove), rich text description, `delete setup`
  disabled with `used by n entries; untag them first` while in use.
- **Trade detail** (`client/src/pages/TradeDetail.tsx`): closing `journal`
  section from `journal.forTrade`: one row linking to the entry (date,
  setups, trade count, state), or `this trade is not in a journal entry.`
  with `new journal entry →` to `/journal?new=1&pick=<id>`. The trade list
  gets no new column.
- Mutations invalidate `journal.get` / `journal.list` (and `setup.list`,
  `journal.forTrade` where relevant) via `trpc.useUtils()`; failures
  `toast.error`; no success toasts. Autosave does not invalidate
  `journal.get` (doc-6 editor rule).

## Testing

- `server/journal.test.ts`, `server/setup.test.ts` — routers via
  `createCaller` with `vi.mock("./db")`: every `CONFLICT` / `BAD_REQUEST` /
  `NOT_FOUND` row above; review-field writes while trades are open; price
  normalisation; trigger validation.
- `server/journal.db.test.ts` — real temp SQLite: create with links; trade
  unique index; list order by earliest `openTime` and derived values
  (`sides`, `netPnlUsd`, `openTradeCount`); `actualR` cases (open trade,
  missing price, equal prices, mixed sides); pickable trades exclude linked
  ones; slot add/remove ordering and no-op; delete cascades images and
  links; setup usage counts, case-insensitive unique index, delete cascades
  images; user scoping.
- `server/_core/imageRoutes.test.ts` and `server/plan.db.test.ts` — updated
  for the owner pair per research §3; add 400 bad `ownerKind`, 404/409 per
  kind, and cross-kind dedupe (same bytes, different owner → new row).
- Playwright e2e for the entry lifecycle is not part of v1 (map fog).

## Out of scope (v1)

- Linking an entry to a Plan or Scenario; agents reading entries or setups.
- Account-scoped entries; a trade in several entries; entries without a
  trade.
- Setup archive, versioning, deleting a setup in use.
- Multi-select emotion or a second emotion at review time; required review
  fields.
- Statistics by setup or emotion; a Dashboard nudge for entries to review;
  orphan-image GC (map fog).
- Using the trades' exchange SL/TP; manual reorder of slot images.
