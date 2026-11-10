---
id: doc-6
title: Trading plan spec
type: specification
created_date: "2026-11-10 06:37"
updated_date: "2026-11-10 06:37"
---

Spec for **Trading plans**: the trader writes, before and during a session,
what they expect one symbol to do, then gives each expectation a verdict when
the plan is closed. Vocabulary per `GLOSSARY.md` → section _Trading plans_
(Plan, Open/Closed plan, Market context, Scenario, Scenario outcome,
Observation). Every decision below was settled with the trader on 2026-11-10
on the _Trading plan map_ (doc-5) and its tickets; implementation must not
reopen them. Where this spec is silent about layout, variant A of the
prototype on branch `prototype/plans-ui`
(`client/src/components/plans-prototype/VariantA.tsx`, `PlanEditor.tsx`,
`ObservationComposer.tsx`) is the reference. The research findings live on
`research/plan-rich-text-editor` (`docs/research/plan-rich-text-editor.md`)
and `research/plan-image-storage` (`docs/research/plan-image-storage.md`).
None of these branches is ever merged.

## Purpose

Give the trader a place to write intent before the market moves: one plan per
symbol per intention, holding a market context, one or more scenarios
(name, long/short, primary timeframe, free-form content) and timestamped
observations logged while the plan is open. Closing the plan forces a
verdict — triggered or invalidated — on every scenario, so planning becomes
something that can be reviewed, not a scratch pad that is never reread.

## Locked decisions

1. **States**: a plan is _open_ or _closed_, derived from a nullable
   `closedAt` (the trader's end time). No expiry, no automatic close. A
   closed plan can be reopened.
2. **Independence**: no link to Pre-trade sessions, trades, accounts or the
   agents in v1. Plans belong to the user; the AccountSwitcher has no effect.
3. **Cardinality**: several open plans may coexist, even on the same symbol.
4. **Editing**: everything is editable while open (symbol, market context,
   scenarios, observations — add, edit, delete). A closed plan is read-only
   until reopened. Deleting a plan cascades its scenarios, observations and
   images behind a confirmation; deleting a scenario or observation is
   immediate, no confirmation, no undo.
5. **Scenario outcome**: `triggered | invalidated`, settable only by the close
   action, which requires a verdict for every scenario. A plan with zero
   scenarios closes directly. Reopen keeps stored outcomes; they are not
   shown while open and only pre-fill the next close. A scenario added after
   reopening has a null outcome and needs a verdict at the next close.
6. **Observation time** is its `createdAt` (server clock), never editable;
   no observations on a closed plan.
7. **Scenario timeframes**: their own constant `SCENARIO_TIME_FRAMES =
15m 30m 1H 4H 12H 1D`; the shared `TIME_FRAMES` and the K-line chain
   (coinank, `getKlines`, Pre-trade picker) are untouched.
8. **Rich text** (market context, scenario content, observation content):
   Tiptap 3.32.0, paragraphs / bold / bullet + numbered lists / links /
   images; no headings, tables, colours, alignment; no toolbar. Stored as
   ProseMirror JSON.
9. **Images** are BLOBs in SQLite (`images` table), served and written by
   Express, cascaded by application code — see decision _Plan images are
   BLOBs in SQLite served by Express, cascaded in application code_
   (decision-3).
10. **Saving**: rich text autosaves ~1 s after the last keystroke;
    structured fields save on change; last write wins, no version check; a
    quiet `saved hh:mm` indicator, no toast on success.
11. **Time**: epoch ms storage, UTC+8 display through `shared/time.ts`
    (decision-1).

## Shared constants and helpers

`shared/const.ts`:

```ts
export const SCENARIO_TIME_FRAMES = [
  "15m",
  "30m",
  "1H",
  "4H",
  "12H",
  "1D",
] as const;
export type ScenarioTimeFrame = (typeof SCENARIO_TIME_FRAMES)[number];
export const SCENARIO_SIDES = ["long", "short"] as const;
export const SCENARIO_OUTCOMES = ["triggered", "invalidated"] as const;
export const SCENARIO_NAME_MAX = 80;
/** Moved from server/routers.ts; shared by plan symbol input and getCandles */
export const TRADING_PAIR_RE = /^[A-Z0-9]{4,20}$/;
export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
/** 10 MiB; the client pre-checks file.size against it */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
```

`shared/richText.ts` (no Tiptap import, so `drizzle/schema.ts` and the
server stay free of editor packages):

- `RichTextDoc` — `{ type: "doc"; content?: RichTextNode[] }`, with
  `RichTextNode` a minimal recursive `{ type: string; attrs?; text?; marks?; content? }`.
- `richTextDocSchema` — zod: `type` must be the literal `"doc"`, `content`
  an optional array; nodes below the top level are not validated (the
  editor is the only writer).
- `isEmptyDoc(doc)` — true unless the doc contains at least one text node
  with non-whitespace text or one `image` node.

Symbol input everywhere: trim → uppercase → `TRADING_PAIR_RE`, else
`BAD_REQUEST`.

## Data model

All in `drizzle/schema.ts`, same conventions as `goals` / `trades`: integer
autoincrement ids, camelCase column names, `timestamp_ms` timestamps with
`(unixepoch() * 1000)` defaults, `check` constraints for enums, **no
foreign keys** (decision-3). One drizzle-kit generated migration
(`npm run db:push`). Rich-text columns are
`text(..., { mode: "json" }).$type<RichTextDoc>()`.

### `plans` (new)

| column          | type                  | notes                                        |
| --------------- | --------------------- | -------------------------------------------- |
| `id`            | integer pk            |                                              |
| `userId`        | integer not null      |                                              |
| `symbol`        | text not null         | uppercase, `TRADING_PAIR_RE`                 |
| `marketContext` | text json, nullable   | null = empty                                 |
| `closedAt`      | timestamp_ms nullable | null = open; set by close, cleared by reopen |
| `createdAt`     | timestamp_ms not null |                                              |
| `updatedAt`     | timestamp_ms not null | bumped only when this row changes            |

Index: `plans_user_closed_idx (userId, closedAt)`.

### `plan_scenarios` (new)

| column                   | type                  | notes                                                                 |
| ------------------------ | --------------------- | --------------------------------------------------------------------- |
| `id`                     | integer pk            | ordering key: scenarios list by `id` asc, lettered a, b, c… at render |
| `planId`                 | integer not null      |                                                                       |
| `name`                   | text not null         | trimmed, 1..`SCENARIO_NAME_MAX`                                       |
| `side`                   | text not null         | check `in ('long','short')`                                           |
| `primaryTimeFrame`       | text not null         | check `in` `SCENARIO_TIME_FRAMES`                                     |
| `content`                | text json, nullable   | null = empty                                                          |
| `outcome`                | text nullable         | check `outcome is null or outcome in ('triggered','invalidated')`     |
| `createdAt`, `updatedAt` | timestamp_ms not null |                                                                       |

No `position` column (no manual reorder). Deleting a middle scenario shifts
later letters; only open plans can delete, so a closed plan's letters are
stable. Index: `plan_scenarios_plan_idx (planId)`.

### `plan_observations` (new)

| column      | type                  | notes                               |
| ----------- | --------------------- | ----------------------------------- |
| `id`        | integer pk            |                                     |
| `planId`    | integer not null      |                                     |
| `content`   | text json not null    | never `isEmptyDoc`                  |
| `createdAt` | timestamp_ms not null | the observation time; never updated |
| `updatedAt` | timestamp_ms not null |                                     |

Index: `plan_observations_plan_created_idx (planId, createdAt)`.

### `images` (new)

| column      | type                             | notes                                               |
| ----------- | -------------------------------- | --------------------------------------------------- |
| `id`        | integer pk                       |                                                     |
| `userId`    | integer not null                 | GET filters by it                                   |
| `planId`    | integer not null                 | owner; no FK                                        |
| `sha256`    | text not null                    | hex of the bytes                                    |
| `mime`      | text not null                    | the **sniffed** type, check `in` `IMAGE_MIME_TYPES` |
| `size`      | integer not null                 | bytes                                               |
| `bytes`     | blob (`mode: "buffer"`) not null |                                                     |
| `createdAt` | timestamp_ms not null            | insert-only table, no `updatedAt`                   |

Indexes: `images_plan_sha_unique (planId, sha256)` unique (dedupe backstop),
`images_user_idx (userId)`. Metadata queries never select `bytes`.

## Derived values (computed on read, `server/db.ts`)

- Plan state: `closedAt === null` → open.
- List row: `scenarioCount`, `observationCount`, and for closed plans the
  outcomes in scenario order (`triggered`/`invalidated` counts and glyphs).
- Open-for duration: `now − createdAt` (open) or `closedAt − createdAt`
  (closed), formatted on the client.

## DB functions (`server/db.ts`)

Plain exported functions, every one scoped by `userId`. Plan ownership is
checked with a separate `plans WHERE id AND userId` query; **no joins**
through the sqlite-proxy callback (`Object.values` collapses duplicate column
names, see the image-storage research §4.3). Use `.all()` / `limit(1)` and
destructure, never drizzle `.get()` (research §1.4).

- `listPlans(userId)` → open plans by `createdAt` desc, closed plans by
  `closedAt` desc, each with the derived counts and outcomes (three queries:
  plans, scenarios `(id, planId, outcome)` for those plans, observation
  counts grouped by `planId`).
- `getPlan(userId, planId)` → plan with scenarios (`id` asc) and
  observations (`createdAt` asc), or `undefined`.
- `createPlan(userId, symbol)`, `updatePlan(userId, planId, { symbol?, marketContext? })`.
- `addScenario`, `updateScenario(userId, planId, scenarioId, patch)`,
  `deleteScenario` — child writes filter by `id AND planId`, after the
  ownership check.
- `addObservation`, `updateObservation`, `deleteObservation` — same shape.
- `closePlan(userId, planId, verdicts)` — inside
  `runInSqliteTransaction`: write each scenario's `outcome`, set
  `closedAt = now`.
- `reopenPlan(userId, planId)` — `closedAt = null`, outcomes untouched.
- `deletePlan(userId, planId)` — inside `runInSqliteTransaction`: delete
  images, observations, scenarios, then the plan.
- `listTradeSymbols(userId)` → distinct `trades.symbol`, sorted.
- Images: `findImageBySha(userId, planId, sha256)`, `insertImage(row)`,
  `getImage(userId, imageId)`.

Open/closed guards live in the router (and the image route), not in the db
functions, so `NOT_FOUND` vs `CONFLICT` is decided in one place.

## tRPC surface (`server/routers.ts`, namespace `plan`)

All `publicProcedure`. Common errors: unknown or foreign plan / child id →
`NOT_FOUND`; any write to a closed plan except `reopen` and `delete` →
`CONFLICT`; zod failures → `BAD_REQUEST`.

| procedure           | input                                                               | notes                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list`              | —                                                                   | `listPlans`                                                                                                                                                              |
| `get`               | `{ id }`                                                            | outcomes returned as stored; the client shows them only when closed                                                                                                      |
| `symbolSuggestions` | —                                                                   | `listTradeSymbols`                                                                                                                                                       |
| `create`            | `{ symbol }`                                                        | returns `{ id }`                                                                                                                                                         |
| `update`            | `{ id, symbol?, marketContext? }`                                   | `marketContext: RichTextDoc \| null`; returns `updatedAt` for the saved indicator                                                                                        |
| `addScenario`       | `{ planId, name, side, primaryTimeFrame }`                          | `content` starts null                                                                                                                                                    |
| `updateScenario`    | `{ planId, scenarioId, name?, side?, primaryTimeFrame?, content? }` | `outcome` is not an input                                                                                                                                                |
| `deleteScenario`    | `{ planId, scenarioId }`                                            |                                                                                                                                                                          |
| `addObservation`    | `{ planId, content }`                                               | `isEmptyDoc` → `BAD_REQUEST`                                                                                                                                             |
| `updateObservation` | `{ planId, observationId, content }`                                | same check; `createdAt` unchanged                                                                                                                                        |
| `deleteObservation` | `{ planId, observationId }`                                         |                                                                                                                                                                          |
| `close`             | `{ id, verdicts: { scenarioId, outcome }[] }`                       | verdict ids must equal the plan's scenario ids exactly (no missing, extra or duplicate) else `BAD_REQUEST`; zero scenarios → `verdicts: []`; already closed → `CONFLICT` |
| `reopen`            | `{ id }`                                                            | already open → `CONFLICT`                                                                                                                                                |
| `delete`            | `{ id }`                                                            | allowed open or closed                                                                                                                                                   |

`getCandles` switches to the shared `TRADING_PAIR_RE`; no other existing
procedure changes.

## Image routes (`server/_core/imageRoutes.ts`)

A `Router` factory `mountImageRoutes()`, mounted
`app.use("/api/images", mountImageRoutes())` next to the SSE routers in
`server/_core/index.ts`, before `setupVite` / `serveStatic`. User from
`createContext` exactly as `reviewAgentSseRoute.ts` does.

**`POST /api/images?planId=N`**, body = raw image bytes,
`express.raw({ type: IMAGE_MIME_TYPES, limit: MAX_IMAGE_BYTES, inflate: false })`
on this handler only (`express.json` stays 1 mb):

1. `planId` via `z.coerce.number().int().positive()` → 400.
2. Plan owned by user → else 404; plan closed → 409.
3. Body not a Buffer (Content-Type not allowed) → 415.
4. Sniff magic bytes (WHATWG table, research §2.3) → stored `mime`; no
   match → 415, whatever the Content-Type claimed.
5. sha256; existing `(planId, sha256)` → `200 { id }`; else insert →
   `201 { id }`. A unique-index race is caught and re-selected.

Over-limit bodies → 413 via a small error handler on the router that answers
JSON `{ error }` instead of Express's HTML page. A trailing
`router.use((_req, res) => res.sendStatus(404))` keeps the prefix off the SPA
catch-all.

**`GET /api/images/:id`**: non-integer, unknown or foreign id →
`sendStatus(404)`. Hit → headers `Content-Type: <mime>`,
`ETag: "<sha256>"`, `Cache-Control: private, max-age=31536000, immutable`,
`X-Content-Type-Options: nosniff`, then `res.send(bytes)` (Express answers
304 on a matching `If-None-Match`).

Orphans: an image removed from the editor, or belonging to a deleted
scenario or observation, stays until its plan is deleted (tolerated in v1;
re-pasting the same bytes reuses the row via dedupe).

## Editor (`client/src/components/plans/PlanEditor.tsx`)

Packages, all pinned to exactly **3.32.0**: `@tiptap/core`, `@tiptap/pm`,
`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`,
`@tiptap/extension-file-handler`. Not installed: `@tiptap/static-renderer`,
`turndown` (agents are out of scope).

- Extensions: `StarterKit.configure({ heading, blockquote, codeBlock, code,
italic, strike, underline, horizontalRule: false, link: { openOnClick:
false, autolink: true, linkOnPaste: true } })`, `Image.configure({
allowBase64: false })`, `FileHandler.configure({ allowedMimeTypes:
IMAGE_MIME_TYPES, consumePasteEvent: true, onPaste, onDrop })`. Bold via
  Cmd+B, lists via `- ` / `1. ` input rules, no toolbar.
- `editable: !closed`, toggled with `editor.setEditable` on close/reopen;
  `shouldRerenderOnTransaction: false`.
- Paste/drop pipeline (research §7): reject files over `MAX_IMAGE_BYTES`
  with `toast.error`; insert an image node with a `blob:` URL and
  `title="uploading"` (dimmed in CSS); `fetch("/api/images?planId=…", {
method: "POST", headers: { "content-type": file.type }, body: file })`;
  on success find the node by its `blob:` src and `setNodeMarkup` to
  `/api/images/<id>`, clear the title, revoke the URL; on failure delete the
  node, `toast.error`, revoke.
- Autosave: `onUpdate` → 1000 ms debounce held in a ref, flushed on
  unmount; skipped while any upload is pending (the swap is itself an update
  and re-arms the debounce). Autosave success sets the saved-at time from
  the mutation result and does **not** invalidate `plan.get` (that would
  reset the editor).
- Styles: a `.plan-editor` block in `client/src/index.css` for `p`,
  `ul/ol`, `img` and `img[title="uploading"]`, following `DESIGN.md` body
  rules (max ~65ch).

## UI (variant A "ledger"; read `DESIGN.md`, `PRODUCT.md` first)

- **Nav**: English item **Plans** at `/plans`, between Goals and Trades in
  `DashboardLayout`; routes `/plans` and `/plans/:id` in `App.tsx`. The
  detail page (which pulls in Tiptap) is `React.lazy` loaded.
- **`/plans`** (`client/src/pages/Plans.tsx`): title; one symbol input
  (uppercased as typed, `datalist` from `plan.symbolSuggestions`) with
  `open plan →`, which creates the plan and navigates to `/plans/:id`.
  Section `open · n`: one line per open plan, newest first — open-for
  duration, symbol, scenario and observation counts. Closed plans grouped by
  UTC+8 close day, one line each — close `hh:mm`, symbol, outcome glyphs,
  `n triggered · m invalidated` (`—` for zero scenarios). Explicit empty
  state when there are no plans.
- **`/plans/:id`** (`client/src/pages/PlanDetail.tsx`): single column
  `max-w-3xl`; top row `← plans` and the quiet `saved hh:mm`. Symbol as the
  display-size hero, editable in place while open. Meta line `open · since
<day hh:mm> · <duration>` or `closed <day hh:mm> · was open <duration>`.
  Sections under mist-rule headers: **market context**, **scenarios**,
  **observations**.
- **Scenarios**: lettered a, b, c… in `id` order. Each shows the name
  (inline edit), long/short and `15m 30m 1H 4H 12H 1D` as one-click
  segmented controls, delete, and its rich text. Add-scenario form at the
  end of the list: name + side + timeframe.
- **Observations**: oldest first, UTC+8 day + time column, content editable
  while open, delete on hover. Composer at the foot; Cmd+Enter or
  `log observation →`; the server stamps the time.
- **Footer**: `close plan →` (filled ink) and `delete plan`. Delete opens a
  confirmation dialog naming the scenario and observation counts.
- **Close**: an inline section replacing the footer, not a modal — one
  triggered / invalidated toggle per scenario (pre-filled from stored
  outcomes after a reopen), a `k of n verdicts` counter, `close plan`
  disabled until complete, `cancel`. Zero-scenario plans close directly.
- **Closed plan**: everything read-only, outcome next to each scenario name,
  `reopen plan`.
- Outcomes in ink with glyphs (● triggered, ○ invalidated), never win/loss
  hues; long/short in ink; timeframes keep uppercase H/D inside lowercase
  labels.
- Mutations: structured writes invalidate `plan.get` and `plan.list` via
  `trpc.useUtils()`; failures `toast.error`; no success toasts.

## Testing

- `server/plan.test.ts` — router via `appRouter.createCaller` with
  `vi.mock("./db")` (the `goal.test.ts` pattern): symbol normalisation and
  `BAD_REQUEST`; `NOT_FOUND`; `CONFLICT` on every write to a closed plan;
  `close` verdict-set validation (missing, extra, duplicate, zero
  scenarios); `reopen` / `close` state conflicts; `isEmptyDoc` rejection on
  observations.
- `server/plan.db.test.ts` — real temp SQLite (the `trade.db.test.ts`
  pattern): list ordering and derived counts; close writes outcomes and
  `closedAt` atomically; reopen keeps outcomes; delete cascades scenarios,
  observations and images; user scoping.
- `server/_core/imageRoutes.test.ts` — Express on an ephemeral port: upload
  201, dedupe 200 with the same id, 400 bad `planId`, 404 foreign plan, 409
  closed plan, 413 over limit, 415 wrong Content-Type and wrong magic bytes,
  stored `mime` is the sniffed one; GET headers, 404, and 304 on
  `If-None-Match` — sent with `node:http`, not `fetch` (Node's `fetch` adds
  `Cache-Control: no-cache`, which defeats freshness).
- `shared/richText.ts` `isEmptyDoc` unit cases (whitespace-only text, image
  only, nested list).
- Playwright e2e for the plan lifecycle is not part of v1 (map fog).

## Out of scope (v1)

- Any link to Pre-trade, trades or the agents (`get_trading_plans`,
  launching Pre-trade from a scenario, matching trades to scenarios).
- A third outcome (`untriggered`), planned expiry, editable or backdated
  observation times, account-scoped plans, manual scenario reorder.
- Headings, tables, colours, alignment, embeds; a toolbar.
- Images on disk or as base64 in documents; orphan-image GC; per-user
  dedupe.
- A Dashboard strip for open plans.
- Real foreign keys (needs the migration runner fixed first, decision-3).
