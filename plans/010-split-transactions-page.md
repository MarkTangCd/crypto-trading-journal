# Plan 010: Split `Transactions.tsx` into <200 LOC components

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to
> the next step. If anything in the "STOP conditions" section occurs,
> stop and report — do not improvise. When done, update the status row
> for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8f09a1d..HEAD -- client/src/pages/Transactions.tsx client/src/components/CloseTradeModal.tsx client/src/lib/ledger.tsx e2e/`
> On a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plan 005 (Playwright smoke) — already DONE.
- **Category**: tech-debt
- **Planned at**: commit `8f09a1d`, 2026-06-18

## Why this matters

`client/src/pages/Transactions.tsx` is **599 lines**, three times the
project rule of 200 LOC per component
(`~/.claude/CLAUDE.md` → "A component should not exceed 200 lines of
code"). It mixes:

- filter-state UI (six `<FilterField>`s + a clear-filters button)
- sortable table headers
- per-row rendering of every transaction (date / pair / side / outcome /
  r/r / return / balance / row actions)
- a delete-confirmation `AlertDialog`
- a host for `CloseTradeModal`

The page is also a hot edit surface — the previous batch's plan README
explicitly flagged it: _"before any future page-component refactor (e.g.
splitting the 607-line `Transactions.tsx`), land 005 first so the
close-trade / new-trade golden paths are protected by an end-to-end smoke
test"_. That smoke spec (`e2e/smoke.spec.ts`) is now in place and exercises
the close-trade row action end to end. The refactor is safe.

The split is also a prerequisite for adding any future per-tag /
per-cycle analytics column without pushing the file past 700 LOC.

## Current state

### Files (verify before editing)

- `client/src/pages/Transactions.tsx` — 599 LOC.
- `client/src/components/CloseTradeModal.tsx` — out of scope; only its
  external API (`<CloseTradeModal open onOpenChange trade />`) is
  consumed.
- `client/src/lib/ledger.tsx` — shared brand primitives
  (`SELECT_CLASS, INPUT_CLASS, Field, SectionHeader, fmtMoney, fmtRatio,
fmtDateTime, fmtDecimal, toneClass, Tone`). Already imported by the
  page; reuse them.

### Existing internal seams in `Transactions.tsx`

- Lines 37-41: type aliases `SortBy`, `SortOrder`, `Outcome`, `Direction`,
  `Status` — used in multiple sub-renderings; move to the new
  table component (see Step 3) or keep as page-level types passed via
  props.
- Lines 43: `FILTER_SELECT_CLASS` constant — used only by `FilterField`.
- Lines 45-68: `FilterField` sub-component — pure JSX wrapper around an
  underlined `<select>`. Move into the new filters file.
- Lines 70-101: `SortHeader` sub-component — clickable column header
  with up/down indicator. Move into the new table file.
- Lines 103-148: `Transactions` default export — state hooks + tRPC
  queries.
- Lines 155-167: `deleteMutation` definition.
- Lines 169-176: `toggleSort` action.
- Lines 178-194: `clearFilters` action + `hasFilters` boolean.
- Lines 196-205: page header.
- Lines 207-296: filter section JSX.
- Lines 298-561: list/empty/loading JSX (the table is the biggest chunk).
- Lines 563-590: delete `AlertDialog`.
- Lines 592-596: `<CloseTradeModal />` host.

### Repo conventions (match them)

- Page files in `client/src/pages/` use PascalCase default exports
  (e.g. `export default function Transactions() {…}`). New sub-components
  in `client/src/components/transactions/` use named exports and
  PascalCase.
- Sub-component files live in `client/src/components/` (or a feature
  subfolder). The journal already has `components/CloseTradeModal.tsx`
  and `components/CandlestickChart.tsx` at the top level; cluster the new
  pieces in `client/src/components/transactions/` to avoid polluting the
  flat root list.
- Indent: 2 spaces. Prettier with print-width 80, double quotes, trailing
  commas, `arrowParens: avoid`. Run `npm run format` after edits.
- Imports: keep the surrounding file's grouping (3rd-party, then `@/`,
  then `@shared`, then relative). Use `import type` for type-only
  imports where the file already follows that style.

### Repo design constraints to honour

From `DESIGN.md` and CLAUDE.md:

- The page is a "review" surface — restraint-first. Do NOT swap visual
  elements: same lowercase labels, same `tabular-nums`, same border-only
  hairlines (no shadows), no rounded corners.
- Existing class strings are typographic primitives — do not change
  `text-label`, `border-border`, `status-loss`, `status-win`, etc.
- The semantic outcome tone mapping (`win`/`loss`/`undefined`) is
  load-bearing: every numeric column that can show win/loss must keep
  its `toneClass()` call.

## Commands you will need

| Purpose     | Command                                                                                   | Expected          |
| ----------- | ----------------------------------------------------------------------------------------- | ----------------- |
| Typecheck   | `npm run check`                                                                           | exit 0            |
| Tests       | `npm test -- --run`                                                                       | 104 passed        |
| E2E (smoke) | `npm run test:e2e`                                                                        | smoke spec passes |
| Build       | `npm run build`                                                                           | exit 0            |
| Format      | `npm run format`                                                                          | exit 0            |
| Dev server  | `NODE_OPTIONS='--experimental-sqlite' NODE_ENV=development npx tsx server/_core/index.ts` | http on 3000      |

## Scope

**In scope** (the only files you should create or modify):

- `client/src/pages/Transactions.tsx` — slim it to **≤200 LOC** by
  extracting the three sub-pieces below. Keep state + queries + mutation
  - handlers + the wiring JSX (header, the four extracted children,
    empty states).
- `client/src/components/transactions/TransactionsFilters.tsx` — **NEW**.
  Houses the filter type aliases (`Outcome`, `Direction`, `Status`),
  `FilterField`, and the filter bar JSX. ≤200 LOC.
- `client/src/components/transactions/TransactionsTable.tsx` — **NEW**.
  Houses `SortBy`/`SortOrder`, `SortHeader`, and the
  `<table>` body (header row + the per-row `transactions.map(...)`).
  ≤200 LOC. May internally inline a `TransactionsRow` helper or
  extract a fifth file if needed.
- `client/src/components/transactions/DeleteTradeDialog.tsx` — **NEW**.
  Houses the `<AlertDialog>` that confirms deletion. ≤80 LOC.

**Out of scope** (do NOT touch):

- `client/src/components/CloseTradeModal.tsx` — owned by plan 012.
- The `e2e/smoke.spec.ts` selectors. The spec uses
  `page.getByRole("row", { name: /BTCUSDT/ })`,
  `page.getByRole("button", { name: "close →" })`, etc. Preserve the
  same `role`/`aria-label`/text content as today.
- `client/src/lib/ledger.tsx` — reuse, don't edit.
- `shared/const.ts` — `MARKET_CYCLES`, `TRANSACTION_TYPES` are imported
  by the filter file unchanged.
- Any server file. The split is client-only.

## Git workflow

- Branch: `advisor/010-split-transactions-page`.
- Suggested commit split:
  1. `refactor: extract TransactionsFilters and TransactionsTable`
  2. `refactor: extract DeleteTradeDialog from Transactions page`

## Steps

### Step 1: baseline

```bash
git status
git rev-parse HEAD
wc -l client/src/pages/Transactions.tsx        # expected: 599
npm run check                                    # exit 0
npm test -- --run                                # 104 passed
npm run test:e2e                                 # smoke passes (baseline)
```

If `test:e2e` fails on a clean baseline, fix the test environment first;
do not proceed.

### Step 2: create the new directory

```bash
mkdir -p client/src/components/transactions
```

### Step 3: extract `TransactionsFilters.tsx`

Create `client/src/components/transactions/TransactionsFilters.tsx` and
move into it:

- The type aliases `Outcome`, `Direction`, `Status` (currently
  `Transactions.tsx:39-41`).
- The `FILTER_SELECT_CLASS` constant (line 43).
- The `FilterField` component (lines 45-68).
- The filter-bar JSX block (lines 207-296), turned into a named function
  component:

  ```tsx
  type Props = {
    outcome: Outcome;
    direction: Direction;
    status: Status;
    marketCycle: MarketCycle | undefined;
    transactionType: TransactionType | undefined;
    pair: string;
    tradingPairs: string[] | undefined;
    onChangeOutcome: (v: Outcome) => void;
    onChangeDirection: (v: Direction) => void;
    onChangeStatus: (v: Status) => void;
    onChangeMarketCycle: (v: MarketCycle | undefined) => void;
    onChangeTransactionType: (v: TransactionType | undefined) => void;
    onChangePair: (v: string) => void;
    onClear: () => void;
    hasFilters: boolean;
  };

  export type { Outcome, Direction, Status };
  export function TransactionsFilters(props: Props) { … }
  ```

- The `hasFilters` derivation (line 187-194) moves up to
  `Transactions.tsx` because the page also uses it for the empty-state
  branch — pass the boolean in as a prop.

Constraints:

- File must be ≤200 LOC after `npm run format`.
- No inline new component definitions besides `FilterField`. If the
  prop list grows past ~14 entries, group related state into a single
  `filters` object and a single `onChange(patch)` setter — but the
  page-level state can still be discrete (the grouping is purely
  the component-API shape).

### Step 4: extract `TransactionsTable.tsx`

Create `client/src/components/transactions/TransactionsTable.tsx` and
move into it:

- The type aliases `SortBy`, `SortOrder` (lines 37-38).
- The `SortHeader` component (lines 70-101).
- The `<table>` JSX block (lines 306-540).

API:

```tsx
type Props = {
  transactions: NonNullable<
    ReturnType<typeof trpc.transaction.list.useQuery>["data"]
  >;
  sortBy: SortBy;
  sortOrder: SortOrder;
  onToggleSort: (column: SortBy) => void;
  onCloseClick: (trade: CloseTradePayload) => void;
  onDeleteClick: (id: number) => void;
};

export type { SortBy, SortOrder };
export function TransactionsTable(props: Props) { … }
```

`CloseTradePayload` is the shape currently inlined at lines 121-133 of
the page; lift it to a shared type alias **in this same file** so both
the page and the table reference one definition.

Constraints:

- File must be ≤200 LOC after format. If you can't fit the
  per-row render inside that budget, extract a private
  `TransactionRow(props)` function in the same file (still counted
  toward the 200 LOC). Inlining is OK; another file split is OK; the
  rule is just the 200-LOC ceiling per file.
- Each function (including any inlined `TransactionRow`) must stay
  under **100 LOC** per the user-level rule "A function or method
  should not exceed 100 lines of code". If the per-row body is over
  100 LOC, extract `TransactionRow` into a separate function.
- Preserve every existing `aria-label`, button text ("close →",
  "view →", "del", "delete"), and `role` shape — the smoke spec
  pins these.

### Step 5: extract `DeleteTradeDialog.tsx`

Create `client/src/components/transactions/DeleteTradeDialog.tsx`:

```tsx
type Props = {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};
export function DeleteTradeDialog(props: Props) { … }
```

Move the `<AlertDialog>` block (page lines 563-590) verbatim into this
file, replacing `setDeleteId(null)` with `props.onOpenChange(false)` and
`deleteMutation.mutate({ id: deleteId })` with `props.onConfirm()`.
Replace `deleteMutation.isPending` with `props.pending`.

### Step 6: slim `Transactions.tsx`

Rewrite `Transactions.tsx` to import the three new pieces and reduce
the file to:

- imports
- the `Transactions` default-export function only, holding:
  - the seven `useState` filter-state hooks (page-level state)
  - `trpc.transaction.list.useQuery` and `trpc.transaction.getTradingPairs.useQuery`
  - `deleteMutation` definition
  - the `toggleSort`, `clearFilters` handlers, and the
    `hasFilters` boolean
  - the JSX skeleton: `<h1 sr-only>`, header, `<TransactionsFilters />`,
    loading / empty / `<TransactionsTable />`, `<DeleteTradeDialog />`,
    `<CloseTradeModal />`

Target: ≤180 LOC after `npm run format`. The single `Transactions`
function must stay ≤100 LOC; if it doesn't fit, you missed an
extraction.

### Step 7: format + typecheck

```bash
npm run format
npm run check                                    # exit 0
wc -l client/src/pages/Transactions.tsx           # ≤200
wc -l client/src/components/transactions/*.tsx    # each ≤200
```

### Step 8: re-run tests and the smoke spec

```bash
npm test -- --run                                # 104 passed
npm run test:e2e                                 # smoke passes
npm run build                                    # exit 0
```

If the smoke spec fails:

- Most likely cause: a button label, `aria-label`, or `role=row name`
  changed. Compare your new JSX against the page line ranges cited above
  for the exact text.
- The smoke spec is authoritative — fix the component, not the spec.

### Step 9: manual sanity check (UI)

Start the dev server and click through:

```bash
NODE_OPTIONS='--experimental-sqlite' NODE_ENV=development \
  npx tsx server/_core/index.ts &
SERVER_PID=$!
sleep 3
open http://127.0.0.1:3000/transactions    # macOS; otherwise paste into a browser
# Then in the UI:
#   - apply outcome / direction / status / pair / cycle / type filters; clear them
#   - click a sortable header (date, return); confirm asc/desc arrow toggles
#   - click "close →" on an open trade; confirm the existing CloseTradeModal opens
#   - click "del" on any row; confirm the AlertDialog shows
kill $SERVER_PID
```

## Test plan

- No new automated tests in this plan. The existing Playwright
  smoke spec (`e2e/smoke.spec.ts`) covers the create / close / list
  golden path; that is the regression net for this split.
- Manual sanity (Step 9) covers the filter & sort interactions the
  smoke spec does not.

## Done criteria

ALL must hold:

- [ ] `wc -l client/src/pages/Transactions.tsx` returns ≤ 200.
- [ ] `wc -l client/src/components/transactions/TransactionsFilters.tsx` ≤ 200.
- [ ] `wc -l client/src/components/transactions/TransactionsTable.tsx` ≤ 200.
- [ ] `wc -l client/src/components/transactions/DeleteTradeDialog.tsx` ≤ 80.
- [ ] Every exported function in the new files is ≤100 LOC (eyeball /
      `awk` count).
- [ ] `npm run check` exits 0.
- [ ] `npm test -- --run` reports `Tests 104 passed (104)`.
- [ ] `npm run test:e2e` passes.
- [ ] `npm run build` exits 0.
- [ ] No new ESM import outside the in-scope file list. `git status`
      shows only: - `client/src/pages/Transactions.tsx` (modified) - `client/src/components/transactions/*.tsx` (3 new files) - `plans/README.md` (status update)
- [ ] `plans/README.md` row for plan 010 set to DONE.

## STOP conditions

Stop and report (do not improvise) if:

- The smoke spec fails after Step 8 and your fix attempt still leaves it
  failing. Surface the failing `expect(...)` line and what your JSX
  produced instead.
- A type error appears that requires editing
  `client/src/components/CloseTradeModal.tsx`'s `trade` prop shape. That
  file is out of scope; if its prop shape and the page's payload diverge,
  there is a real type mismatch — surface it instead of forcing a fix.
- The page-level `Transactions` function still exceeds 100 LOC after all
  three extractions. Likely you tried to keep an inline empty-state
  paragraph that should have been hoisted into one of the new files.
- `TransactionsTable.tsx` still exceeds 200 LOC after a row-extraction.
  That signals an over-large per-row JSX block — fall back to splitting
  the row into a separate file rather than abandoning the budget.

## Maintenance notes

- This split is structural, not visual. A reviewer's eye should bounce
  off the diff for `Transactions.tsx` (small) and focus on the new
  files (mostly cut/paste). If the new files contain anything beyond
  what was already on the page, that is scope creep — push it to a
  follow-up.
- If a future change adds a column to the table (e.g. tag counts),
  the touch surface is now just `TransactionsTable.tsx` (and the
  underlying tRPC `list` return shape). The filter bar and the
  delete dialog stay frozen.
- The user-level rule of 200 LOC per component applies to _every_
  React component the agent writes — `TransactionsFilters` and
  `TransactionsTable` are themselves at risk of regrowth. Future
  PRs that push either past 200 should split again before adding
  more.
- Plan 011 splits `NewTransaction.tsx` and Plan 012 splits
  `CloseTradeModal.tsx`. They are independent of this plan, but
  together they bring every component over 400 LOC into compliance.
