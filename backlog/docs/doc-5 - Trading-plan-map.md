---
id: doc-5
title: Trading plan map
type: other
created_date: '2026-11-10 03:08'
updated_date: '2026-11-10 06:51'
---
## Destination

A locked **Trading plan spec** (Backlog doc) plus the data model (`plans`, `plan_scenarios`, `plan_observations`, `images`), the Plans pages validated through an /impeccable prototype, and an ordered set of implementation tasks ready to hand to build sessions. No implementation happens on this map.

## Notes

- Domain: crypto trading journal, single trader. Vocabulary in `GLOSSARY.md` → section **Trading plans** (Plan, Open/Closed plan, Market context, Scenario, Scenario outcome, Observation). Use those words; never 'pre-trade', 'playbook', 'note' or 'completed' for the new model.
- Skills every session should consult: `grilling` + `domain-modeling` for grilling tickets; `prototype` for prototype tickets (UI through `/impeccable`, read `DESIGN.md` and `PRODUCT.md` first); `research` for research tickets.
- Time policy stays decision-1 (epoch ms storage, UTC+8 display via `shared/time.ts`).
- Existing facts that shaped the charting: `pre_trades` already carries tradingPair / direction / primaryTimeFrame / idea and stays separate; `shared/const.ts` `TIME_FRAMES` is `1m 5m 15m 30m 1H 4H 1D 1W 1M` (no 12H, uppercase H/D); express.json limit is 1 mb; drizzle runs over `sqlite-proxy` on `node:sqlite` DatabaseSync; nav labels are English.

## Decisions so far (charting, 2026-11-10)

Settled directly with the trader while charting; later tickets build on these and must not reopen them.

- **Terminology**: Plan / Scenario / Observation / Market context; plan states are **open / closed** (same words as trades), derived from a nullable `closedAt` which is the trader's end time. No planned expiry, no automatic daily close. Reopen allowed.
- **Independence from Pre-trade**: v1 links nothing between a Plan and a Pre-trade session or the agents.
- **Cardinality and scope**: one Plan per symbol per intention; several open Plans may coexist, even on the same symbol. Plans belong to the user, not to an account (AccountSwitcher has no effect).
- **Editing**: everything editable while open (symbol, market context, scenarios add/edit/delete, observations add/edit/delete); closed plans are read-only until reopened; delete cascades scenarios, observations and images behind a confirmation.
- **Scenario outcome**: two values, **triggered / invalidated** (a scenario the market never reached is invalidated), null while open. The close action opens a panel that requires a verdict on every scenario before the plan can close; a plan with zero scenarios closes directly. Reopen keeps outcomes; re-close pre-fills them. Outcomes cannot be set while open.
- **Observation time** is its `createdAt`, shown in UTC+8, not editable; no observations can be added to a closed plan.
- **Timeframes**: Scenario UI shows `15m 30m 1H 4H 12H 1D`. (Refined by the spec: its own `SCENARIO_TIME_FRAMES` constant; shared `TIME_FRAMES` and the K-line chain stay untouched.)
- **Images**: separate `images` table holding BLOBs in SQLite (not disk, not base64 in the document), owned by `planId` and cascade-deleted with the plan; served by Express `GET /api/images/:id`, written by `POST /api/images`; png/jpeg/webp/gif, 10 MB max, sha256 dedupe within a plan; orphan rows left by removing an image from the editor are tolerated in v1.
- **Rich text capability**: paragraphs, bold, bullet/numbered lists, links, images (paste + drop). No headings, tables, colors, alignment. Editor and stored format decided by the research ticket.
- **Creation flow**: on `/plans` the trader enters only the symbol; the row is created at once and the page jumps to `/plans/:id`, where market context, scenarios and observations are edited in place (so every pasted image already has a planId).
- **Saving**: rich text autosaves about 1 s after the last keystroke; structured fields save on change; a quiet 'saved hh:mm' indicator, no toast on success.
- **Required fields**: Plan needs only the symbol (free text, stored uppercase, suggestions from synced trade symbols); Scenario needs name, side and primary timeframe, content optional; Observation needs non-empty content.
- **Navigation**: English menu item **Plans** at `/plans`, between Goals and Trades; `/plans/:id` is the detail page.
- **Provisional schema shape** (locked in the spec ticket, which dropped `plan_scenarios.position`): `plans` (id, userId, symbol, marketContext, closedAt, createdAt, updatedAt); `plan_scenarios` (id, planId, name, side long|short, primaryTimeFrame, content, outcome triggered|invalidated|null, position, timestamps); `plan_observations` (id, planId, content, createdAt, updatedAt); `images` (id, userId, planId, sha256, mime, size, bytes, createdAt).

<!-- one line per closed ticket, appended as tickets resolve -->
- [Rich text editor and paste-to-image pipeline for Plans](task-70): Tiptap 3 (pin 3.32.0) with StarterKit (headings etc. off) + Image + FileHandler, no toolbar; store ProseMirror JSON, read-only via `editable: false`, agents read it through static-renderer + turndown; paste/drop inserts a blob: placeholder, uploads to POST /api/images, swaps src to /api/images/:id; ~130 kB gzip, lazy-load the route. Findings: branch research/plan-rich-text-editor.
- [Image storage in SQLite via node:sqlite and Express serving](task-71): drizzle `blob({ mode: "buffer" })` round-trips over the node:sqlite proxy; `POST /api/images?planId=` with route-scoped `express.raw` (10 MiB, magic-byte MIME), `GET /api/images/:id` with strong sha256 ETag + `Cache-Control: immutable`; whole-buffer reads are fine; cascade in app code, not a DB FK (migration runner hazard). Findings: branch research/plan-image-storage.
- [Prototype the Plans pages](task-72): variant A "ledger" chosen as is. Separate /plans and /plans/:id pages; single column with the symbol as display hero (editable while open); scenarios lettered in creation order (no manual reorder); observations oldest first with the composer at the foot; close is an inline verdict section at the page foot, not a modal; outcomes in ink with glyphs, no win/loss hue. Prototype: branch prototype/plans-ui.
- [Write the Trading plan spec, schema and ADR](task-73): locked as **Trading plan spec** (doc-6) plus ADR decision-3 (image BLOBs in SQLite via Express, app-code cascade, no FK). Scenarios order by id (no `position`); own `SCENARIO_TIME_FRAMES`; rich text as JSON `RichTextDoc` with `isEmptyDoc`; flat tRPC `plan` namespace with NOT_FOUND / CONFLICT (closed) / BAD_REQUEST (verdicts); reopen keeps outcomes only as close pre-fill (GLOSSARY reworded); no agent packages.
- [Break the Trading plan spec into implementation tasks](task-74): ten ready-for-agent tasks TASK-75…TASK-84 referencing doc-6, additive-first (shared consts/richText → schema → db → image routes ∥ tRPC → list page → detail shell + PlanEditor → scenarios ∥ observations → close/reopen/delete); critical path 75→76→77→79→80→81→82→84; UI tasks verified on the :3100 temp-DB dev server against variant A. No new fog — the map is complete.

## Not yet specified

- Reading Plans from the agents: a review-agent or pre-trade skill such as `get_trading_plans` so the model can compare what was planned with what was traded.
- Launching a Pre-trade discussion from a Scenario (it already has symbol, side and timeframe).
- Relating a Plan to the synced trades on its symbol inside its open window (did the trade follow a triggered scenario?). Nothing is stored for this; derivable by symbol + time range.
- Orphan image garbage collection once removed-from-editor images accumulate; and whether dedupe should be per user instead of per plan.
- Dashboard presence: whether open plans deserve a strip like open goals, or stay only on `/plans`.
- e2e coverage for the Plan lifecycle in the Playwright smoke.

## Out of scope

- A third outcome state ('untriggered'); a planned expiry time on a plan; editable observation timestamps; account-scoped plans.
- Headings, tables, colors, alignment, embeds in the editor.
- Storing images on disk or as base64 inside documents.
- Any Pre-trade or agent integration in this effort (fog items above are for a later effort).
- Manual time-of-observation entry and backdating.
