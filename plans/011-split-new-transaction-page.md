# Plan 011: Split `NewTransaction.tsx` into <200 LOC components

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving
> to the next step. If anything in the "STOP conditions" section
> occurs, stop and report — do not improvise. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8f09a1d..HEAD -- client/src/pages/NewTransaction.tsx client/src/components/CandlestickChart.tsx client/src/lib/ledger.tsx client/src/lib/mockCandleData.ts e2e/`
> On a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plan 005 (Playwright smoke) — DONE.
- **Category**: tech-debt
- **Planned at**: commit `8f09a1d`, 2026-06-18

## Why this matters

`client/src/pages/NewTransaction.tsx` is **550 LOC**, well past the 200
LOC ceiling. It bundles seven loosely-related UI sections (account
meta strip, instrument, chart, entry time, plan + planned r/r preview,
classification, context) into a single component, plus a planned-r/r
preview function and a `previewPlannedRiskReward` calculator.

The page is a "recording" surface — the cognitive-load argument in
`PRODUCT.md` is *"the interface must subtract from it"*. A
600-line single-file form is the opposite. Splitting also makes it
easier to add per-section helpers (e.g. tradeItems autocomplete, click-to-mark
wiring from the chart) without pushing the page past 800 LOC.

## Current state

### Files (verify before editing)

- `client/src/pages/NewTransaction.tsx` — 550 LOC.
- `client/src/components/CandlestickChart.tsx` — used as-is via
  `<CandlestickChart data={MOCK_CANDLE_DATA} />`. Do NOT touch its
  props or internals.
- `client/src/lib/mockCandleData.ts` — supplies `MOCK_CANDLE_DATA`.
  Out of scope.
- `client/src/lib/ledger.tsx` — supplies `Field`, `SectionHeader`,
  `INPUT_CLASS`, `SELECT_CLASS`, `TEXTAREA_CLASS`, `fmtMoney`,
  `fmtRatio`. Reuse, don't edit.

### Existing internal seams

- Lines 28-46: constants + types (`TIME_FRAMES`, `Direction`,
  `FormData` interface).
- Lines 48-58: `DECIMAL_PATTERN`, `parsePositiveDecimal`.
- Lines 59-98: `previewPlannedRiskReward` (pure function — UI mirror
  of the server's `calculatePlannedRiskRewardRatio`).
- Lines 100-156: `NewTransaction` component setup — state hooks,
  tRPC query + mutation, `previewPlannedRrPreview` `useMemo`.
- Lines 157-207: `handleSubmit` and `updateField`.
- Lines 216-235: `tradeItemInput` state + `addTradeItem` +
  `handleTradeItemKeyDown`.
- Lines 237-249: loading branch + balance/streak derivation.
- Lines 251-285: outer JSX — header, account meta strip.
- Lines 287-548: the seven `<section>` blocks of the form body.

### Repo conventions

- Sub-components are placed under `client/src/components/<feature>/`.
  For this plan, create `client/src/components/new-transaction/`.
- The `<section>`s in the form use the brand's lowercase
  `<SectionHeader>` and the brand's underline-blank `INPUT_CLASS` /
  `SELECT_CLASS` / `TEXTAREA_CLASS`. Do NOT swap these primitives.
- Form-state remains lifted up to the page (so the planned r/r
  preview can use cross-section fields).
- Match the existing helper-pure-function placement: pure utilities go
  at the top of a file, not inside a component body.

## Commands you will need

| Purpose      | Command                                            | Expected           |
| ------------ | -------------------------------------------------- | ------------------ |
| Typecheck    | `npm run check`                                    | exit 0             |
| Tests        | `npm test -- --run`                                | 104 passed         |
| E2E (smoke)  | `npm run test:e2e`                                 | smoke spec passes  |
| Build        | `npm run build`                                    | exit 0             |
| Format       | `npm run format`                                   | exit 0             |

## Scope

**In scope** (create or modify only these):

- `client/src/pages/NewTransaction.tsx` — slim to **≤200 LOC** by
  extracting the sections below. Keep state, queries, mutation,
  `previewPlannedRrPreview`, `handleSubmit`, and the wiring JSX.
- `client/src/lib/plannedRiskReward.ts` — **NEW**. Houses
  `DECIMAL_PATTERN`, `parsePositiveDecimal`, the
  `PlannedRrPreview` union, and `previewPlannedRiskReward`. Pure
  module, no React. ≤80 LOC.
- `client/src/components/new-transaction/AccountMetaStrip.tsx` —
  **NEW**. Renders the balance + losing-streak row (page lines
  269-285). ≤60 LOC.
- `client/src/components/new-transaction/InstrumentSection.tsx` —
  **NEW**. Wraps the trading pair + timeframe + direction inputs
  (lines 287-334). ≤120 LOC.
- `client/src/components/new-transaction/PlanSection.tsx` — **NEW**.
  Wraps entry/size/SL/TP fields + the planned r/r preview readout
  (lines 357-428). ≤200 LOC.
- `client/src/components/new-transaction/ClassificationSection.tsx`
  — **NEW**. Wraps market-cycle and type selects
  (lines 430-472). ≤80 LOC.
- `client/src/components/new-transaction/ContextSection.tsx` —
  **NEW**. Wraps context textarea + trade-item tag input + tvUrl
  (lines 474-525). ≤200 LOC. Internalises the
  `tradeItemInput` state and the `addTradeItem` /
  `handleTradeItemKeyDown` helpers — the parent only needs to know
  the resulting `tradeItems: string[]`.

(There is no need to extract the chart section — it is already a
two-line `<CandlestickChart>` invocation. Leave it inline in the
page.)

**Out of scope**:

- `CandlestickChart.tsx`, `mockCandleData.ts`, `ledger.tsx`. Reuse.
- `e2e/smoke.spec.ts` selectors. The spec drives the form by
  `page.getByLabel("trading pair")`, `page.getByLabel("entry price")`,
  etc. Preserve every `<label>` text and `htmlFor` mapping.
- Server-side anything. The split is client-only.

## Git workflow

- Branch: `advisor/011-split-new-transaction-page`.
- Suggested commit split:
  1. `refactor: extract plannedRiskReward util module`
  2. `refactor: split NewTransaction page into section components`

## Steps

### Step 1: baseline

```bash
git status
git rev-parse HEAD
wc -l client/src/pages/NewTransaction.tsx       # 550
npm run check && npm test -- --run && npm run test:e2e
```

### Step 2: move pure helpers into `lib/plannedRiskReward.ts`

Create `client/src/lib/plannedRiskReward.ts` containing:

- `DECIMAL_PATTERN` (line 49)
- `parsePositiveDecimal` (lines 51-57)
- `Direction` type alias (`"long" | "short" | ""`) — even though the
  page uses it inline, move it here so the preview function's
  signature stays self-contained.
- `PlannedRrPreview` type union (lines 59-62)
- `previewPlannedRiskReward(direction, entryStr, stopStr, targetStr)`
  (lines 66-98)

This file is React-free. Import nothing.

Update `NewTransaction.tsx` to `import { Direction,
PlannedRrPreview, previewPlannedRiskReward } from "@/lib/plannedRiskReward";`
and delete the duplicated declarations. Keep the `useMemo` in the page
that wraps the preview call.

**Verify**:

```bash
wc -l client/src/lib/plannedRiskReward.ts      # ≤80
npm run check
```

### Step 3: create the components directory

```bash
mkdir -p client/src/components/new-transaction
```

### Step 4: extract `AccountMetaStrip.tsx`

API:

```tsx
type Props = { currentBalance: string; consecutiveLosses: number };
export function AccountMetaStrip(props: Props) { … }
```

Move lines 269-285 into the new file. Replace the page block with
`<AccountMetaStrip currentBalance={currentBalance} consecutiveLosses={streak} />`.

### Step 5: extract `InstrumentSection.tsx`

API:

```tsx
type Props = {
  tradingPair: string;
  timeFrame: string;
  direction: Direction;
  onChange<K extends "tradingPair" | "timeFrame" | "direction">(
    field: K,
    value: { tradingPair: string; timeFrame: string; direction: Direction }[K]
  ): void;
};
export function InstrumentSection(props: Props) { … }
```

Move lines 287-334. Keep the `TIME_FRAMES` constant inside this file
(it has only one consumer).

### Step 6: extract `PlanSection.tsx`

API:

```tsx
type Props = {
  entryPrice: string;
  positionSizeUsdt: string;
  plannedStopLossPrice: string;
  plannedTakeProfitPrice: string;
  preview: PlannedRrPreview;
  onChange<K extends
    | "entryPrice"
    | "positionSizeUsdt"
    | "plannedStopLossPrice"
    | "plannedTakeProfitPrice"
  >(field: K, value: string): void;
};
export function PlanSection(props: Props) { … }
```

Move lines 357-428 (the four inputs + the planned r/r readout). The
`preview` prop is the value produced by the page-level `useMemo`.

### Step 7: extract `ClassificationSection.tsx`

API:

```tsx
type Props = {
  marketCycle: MarketCycle | "";
  transactionType: TransactionType | "";
  onChangeMarketCycle: (v: MarketCycle | "") => void;
  onChangeTransactionType: (v: TransactionType | "") => void;
};
export function ClassificationSection(props: Props) { … }
```

Move lines 430-472.

### Step 8: extract `ContextSection.tsx`

API:

```tsx
type Props = {
  context: string;
  tradeItems: string[];
  tvUrl: string;
  onChangeContext: (v: string) => void;
  onChangeTradeItems: (v: string[]) => void;
  onChangeTvUrl: (v: string) => void;
};
export function ContextSection(props: Props) { … }
```

Move lines 474-525. Internalise the `tradeItemInput` `useState` and
the `addTradeItem` / `handleTradeItemKeyDown` helpers — the parent only
sees the resulting `tradeItems` array via `onChangeTradeItems`.

### Step 9: slim `NewTransaction.tsx`

After extractions, the page should be:

- imports
- a single default-export `NewTransaction()` function holding:
  - state hooks (formData, tradeItemInput is removed)
  - tRPC `getFormDefaults.useQuery` + `create.useMutation`
  - the `previewPlannedRiskReward` `useMemo`
  - `handleSubmit` (unchanged)
  - JSX skeleton (header, `<AccountMetaStrip />`, form with the five
    extracted sections + chart + start time + submit row)

Target: ≤180 LOC after `npm run format`. The `NewTransaction`
function itself must stay ≤100 LOC. The `handleSubmit` validation
block already pushes that limit (≈40 LOC); if it grows during the
refactor, factor the "required-field" check into a local helper
inside the same file.

The chart `<section>` (lines 337-341) stays inline in the page.

### Step 10: format + typecheck + tests

```bash
npm run format
npm run check                                    # exit 0
npm test -- --run                                # 104 passed
npm run test:e2e                                 # smoke passes
npm run build                                    # exit 0
wc -l client/src/pages/NewTransaction.tsx        # ≤200
wc -l client/src/components/new-transaction/*.tsx
wc -l client/src/lib/plannedRiskReward.ts        # ≤80
```

### Step 11: manual sanity (UI)

```bash
NODE_OPTIONS='--experimental-sqlite' NODE_ENV=development \
  npx tsx server/_core/index.ts &
SERVER_PID=$!
sleep 3
# Open /transactions/new and verify:
#   - balance + losing-streak strip renders the right numbers
#   - all six dropdowns populate (timeframe, direction, market cycle, type)
#   - the planned r/r preview updates as you type entry/SL/TP
#   - "trade items" tags add on Enter
#   - submitting routes to /transactions with a toast "trade recorded"
kill $SERVER_PID
```

## Test plan

- No new automated tests in this plan. The Playwright smoke spec is
  the regression net for the create flow; it exercises every label
  this plan touches.
- Manual UI sanity (Step 11) covers the planned-r/r preview interactions
  the smoke spec does not.

## Done criteria

ALL must hold:

- [ ] `wc -l client/src/pages/NewTransaction.tsx` returns ≤ 200.
- [ ] Each new file under `client/src/components/new-transaction/`
      is ≤ 200 LOC.
- [ ] `client/src/lib/plannedRiskReward.ts` is ≤ 80 LOC.
- [ ] `npm run check` exits 0.
- [ ] `npm test -- --run` reports `Tests 104 passed (104)`.
- [ ] `npm run test:e2e` passes.
- [ ] `npm run build` exits 0.
- [ ] `git status` shows changes only in:
        - `client/src/pages/NewTransaction.tsx` (modified)
        - `client/src/components/new-transaction/*.tsx` (5 new files)
        - `client/src/lib/plannedRiskReward.ts` (new file)
        - `plans/README.md` (status update)
- [ ] `plans/README.md` row for plan 011 set to DONE.

## STOP conditions

Stop and report (do not improvise) if:

- The smoke spec fails after Step 10. The likely cause is a
  `getByLabel("…")` lookup landing on the wrong element because a new
  `<Field htmlFor="…">` does not match the input's `id`. Re-check
  every `id={…}` / `htmlFor={…}` pair you split across files.
- The page-level `NewTransaction` function still exceeds 100 LOC after
  extractions. The `handleSubmit` validation block is the most likely
  inflator — break it out.
- The planned-r/r preview stops updating live. Probable cause: the
  `useMemo` dependency list or the `PlanSection` `onChange` callback
  signature lost a field during the extraction. The fields that drive
  the preview are exactly `direction`, `entryPrice`,
  `plannedStopLossPrice`, `plannedTakeProfitPrice`.
- Typecheck complains about `Direction` being incompatible between
  `plannedRiskReward.ts` and `routers.ts`. The server signature uses
  `"long" | "short"` (no empty string); the client widens to
  `"long" | "short" | ""`. Keep the client widening — the page
  narrows back to the strict union just before
  `createMutation.mutate(...)` (around current lines 196-197).

## Maintenance notes

- After this plan, any new field added to the trade-creation form
  belongs to whichever section it sits in (instrument / plan /
  classification / context). Resist adding a new top-level `<section>`
  in `NewTransaction.tsx` — extract a new section file instead.
- `plannedRiskReward.ts` mirrors server math. If
  `server/_core/tradeMath.ts` is ever extended (e.g. fee handling,
  funding-cost adjustments), the preview formula here will lag the
  server until manually re-synced. Flag the file at the top with a
  one-line comment pointing at the server function so the next
  reader knows to keep them aligned.
- The chart `<section>` is a deliberate one-liner today
  (`<CandlestickChart data={MOCK_CANDLE_DATA} />`). When the direction
  finding "replace mock OHLC with real klines" lands, *that* is the
  moment to extract a `ChartSection.tsx` wrapper — don't pre-extract.
