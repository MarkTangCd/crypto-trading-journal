---
id: doc-7
title: Trade journal map
type: other
created_date: '2026-11-13 12:46'
updated_date: '2026-11-13 14:22'
---
## Destination

A locked **Trade journal spec** (Backlog doc) plus the data model (`journal_entries`, `journal_entry_trades`, `setups`, `journal_entry_setups`, polymorphic `images` owner), the Journal pages validated through an /impeccable prototype, and an ordered set of implementation tasks ready to hand to build sessions. No implementation happens on this map; build sessions follow it.

## Notes

- Domain: crypto trading journal, single trader. Vocabulary in `GLOSSARY.md` → section **Trade journal** (Journal entry, Unreviewed/Reviewed entry, Review, Setup, Entry trigger, Emotion, Planned R:R, Actual R). Use those words; never 'log', 'note', 'diary', 'post-mortem', 'scenario' (for a setup) or 'open/closed' (for an entry).
- Skills every session should consult: `grilling` + `domain-modeling` for grilling tickets; `prototype` for prototype tickets (UI through `/impeccable`, read `DESIGN.md` and `PRODUCT.md` first); `research` for research tickets.
- Time policy stays decision-1 (epoch ms storage, UTC+8 display via `shared/time.ts`). Images stay decision-3 (BLOBs in SQLite, Express routes, app-code cascade, no FK).
- Reuse from the Plans effort (doc-6, task-70…84): Tiptap editor `PlanEditor`, `RichTextDoc` + `isEmptyDoc` in `shared/richText.ts`, image routes in `server/_core/imageRoutes.ts`, the create-then-jump flow, autosave with the quiet 'saved hh:mm' indicator, `PlanFooter` for the close/reopen/delete pattern. `client/src/lib/plannedRiskReward.ts` already computes planned R:R with direction-aware validation for the position size calculator.
- Trades: synced only, `trades` rows are updated in place and never deleted (tradeKey), so a join table can reference `trades.id`. A trade is open or closed; it never reopens.
- Nav labels are English; the review prompt block is the one piece of Chinese UI text and is kept verbatim:

  交易结束后，问:
  - 哪些方面做得好?
  - 哪些方面出了问题?
  - 我是否遵循了计划?
  - 我应该重复什么?
  - 我应该避免什么?
  - 主要教训是什么?
  - 下次我会做出哪些不同的做法?

  目标不是为每一笔交易写长篇笔记。目标是养成持续反思的习惯。

## Decisions so far (charting, 2026-11-13)

Settled directly with the trader while charting; later tickets build on these and must not reopen them.

- **Terminology**: nav item **Journal** at `/journal`; one record is a **Journal entry**; the post-close part is the **Review**; a reusable pattern is a **Setup** (distinct from a Plan's Scenario, GLOSSARY updated). Entry states are **unreviewed / reviewed**, derived from a nullable `reviewedAt`.
- **Cardinality**: an entry links one or more trades; a trade belongs to at most one entry; all linked trades share one symbol and one linked account, direction may differ. Entries belong to the user; `/journal` lists all entries regardless of AccountSwitcher; the trade picker lists only the selected account's trades (open and closed) not already linked elsewhere, newest first, with symbol search, same-symbol constraint after the first tick, at least one trade to create. Linked trades can be added or removed while unreviewed (never below one).
- **Two phases**: recording fields (setups multi-select, entry reason, market context, before screenshots, planned entry / stop loss / take profit, emotion, invalidation) are editable while unreviewed. The review section (after screenshots, mistakes, rules followed or broken, management decisions, notes for next time) is shown but locked with a 'waiting for N open trade(s) to close' line until every linked trade is closed. 'Mark reviewed' needs only that condition, no field is required; it sets `reviewedAt`, makes the entry read-only; reopen clears it and keeps every field. Delete works in both states behind a confirmation and cascades images and setup links; the trades become pickable again.
- **Creation and saving**: on `/journal` the trader only picks trades; the row is created at once and the page jumps to `/journal/:id` for in-place editing; rich text autosaves ~1 s after the last keystroke, structured fields save on change, quiet 'saved hh:mm', no success toast.
- **Planned prices and ratios**: three optional numeric inputs (planned entry, stop loss, take profit). Planned R:R = |TP − entry| / |entry − SL| (reuse `previewPlannedRiskReward`). Actual R = net realized PnL of all linked trades ÷ (|entry − SL| × total quantity), shown only once every linked trade is closed. Missing inputs show '—'. The trades' exchange `stopLossPrice/takeProfitPrice` are not used here.
- **Emotion**: single optional select, recorded in the recording phase; values fear, greed, frustration, impatience, hesitation, overconfidence, revenge, boredom, stress, FOMO.
- **Screenshots**: dedicated before / after slots (not rich text), each accepting several pasted or dropped images, each removable; the after slot belongs to the locked review section. The `images` table becomes polymorphic (`ownerKind` plan | journal_entry | setup + `ownerId`), cascaded with its owner.
- **Setups**: name (unique, case-insensitive, 1..60 chars), rich text description (images allowed), 0..n entry triggers as chips (each 1..80 chars) stored as a string array. Managed at `/journal/setups` (list, inline create, edit), reached from a small 'setups' link in the `/journal` header and from '+ new setup' inside the entry's setup multi-select; not in the sidebar. A setup referenced by any entry cannot be deleted (usage count shown); no archive state.
- **Entry date and list**: an entry's displayed date is the earliest linked trade's `openTime` in UTC+8; the list sorts by it, newest first; `createdAt` is internal. Row shows date, symbol, side(s), setup names, trade count, net realized PnL, state (details from the prototype).
- **Review prompts**: the seven questions and the closing line are a static block at the top of the review section, not stored, shown in the original Chinese.
- **Navigation and trades**: sidebar order Goals → Plans → Trades → **Journal** → Pre-Trade; the trade detail page shows a link to its entry, or a 'new journal entry' shortcut preselecting that trade; the trade list gets no new column.

<!-- one line per closed ticket, appended as tickets resolve -->
- [Migrating images to a polymorphic owner on SQLite](task-86): drizzle-kit emits a full __new_images rebuild whose INSERT … SELECT reads the new columns from the old table and fails at runtime; use `drizzle-kit generate --name images_polymorphic_owner` then hand-edit the SELECT to `'plan', "planId"` (verified on a 0014 DB, rows and ids survive, drizzle-kit check passes; same precedent as 0012). POST ownership check per kind: plan 404/closedAt 409, journal_entry 404/reviewedAt 409, setup 404. Touch points listed with file:line. Findings: branch research/journal-image-owner.
- [Standalone paste-and-drop image slot reusing the upload pipeline](task-87): extract uploadImage(file, owner) + imageUploadError into client/src/lib/images.ts shared by PlanEditor and the slot; slot = native button with onPaste + hidden file input, onDrop on the wrapper, no window listener (ProseMirror/FileHandler stop propagation, no double-fire); store beforeImageIds / afterImageIds as ordered JSON number[] on journal_entries, removal orphans the row, add/remove via server read-modify-write in a transaction. Findings: branch research/journal-image-slot.
- [Prototype the Journal pages](task-88): variant B, facing pages, as is: /journal a column table (date · symbol · side · setups · trades · net pnl · state, '● to review' / '● n open' / muted 'reviewed'), the picker replaces the table in place; the entry is a two-page spread, left 'before' with planned R:R as hero, right 'after' with actual R as hero, linked trades and the locked review; setups master-detail; trade detail ends with a 'journal' section. Mixed directions show as 'short / long'. Build needs a popover for the setups multi-select. Prototype: branch prototype/journal-ui.
- [Write the Trade journal spec, schema and ADR](task-89): locked as doc-8 Trade journal spec; four new tables plus the images owner pair in two migrations, CONFLICT for every state conflict (incl. open trades on mark reviewed), BAD_REQUEST for input; planned R:R client-only off the earliest trade's side, actual R and net pnl on read; RichTextEditor with an owner prop, shadcn popover for setups; no new ADR, decision-3 amended.

## Not yet specified

- Statistics by setup and by emotion (win rate, average actual R per setup) once entries accumulate; where they live (Dashboard strip or a Journal summary).
- A Dashboard nudge for entries still unreviewed whose trades have all closed.
- Orphan image garbage collection now that three owner kinds share the table (carried over from the Plans map).
- e2e coverage of the entry lifecycle in the Playwright smoke.

## Out of scope

- Linking an entry to a Plan or Scenario (a later effort once both exist).
- Agents reading journal entries or setups (`get_journal_entries` and the like).
- Account-scoped entries; a trade in several entries; entries without a trade (manual entries are ruled out by decision-2).
- A setup archive state; setup versioning; deleting a setup that is in use.
- Multi-select emotion or a second emotion recorded at review time.
- Required review fields before marking reviewed.
