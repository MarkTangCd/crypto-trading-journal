# Plan 012: Split `CloseTradeModal.tsx` into <200 LOC components

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving
> to the next step. If anything in the "STOP conditions" section
> occurs, stop and report — do not improvise. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8f09a1d..HEAD -- client/src/components/CloseTradeModal.tsx client/src/lib/ledger.tsx server/_core/tradeMath.ts e2e/`
> On a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plan 005 (Playwright smoke) — DONE.
- **Category**: tech-debt
- **Planned at**: commit `8f09a1d`, 2026-06-18

## Why this matters

`client/src/components/CloseTradeModal.tsx` is **419 LOC**. It hosts a
preview calculator (`previewClose`, ~25 LOC), the trade-context strip,
a legacy-warning banner, the plan readout, the form fields, the
computed-readout grid, and the new-balance hero — all inside a single
component. The preview math mirrors `server/_core/tradeMath.ts` and
is reused only here, but it is interleaved with JSX so it's hard to
locate during reviews.

The modal is invoked from two places (`Transactions.tsx` row action
and `TransactionDetail.tsx` hero button), so a stable external API
matters. The split keeps the public prop shape identical and
reduces the internal cognitive load by half.

## Current state

### Files (verify before editing)

- `client/src/components/CloseTradeModal.tsx` — 419 LOC.
- `client/src/pages/Transactions.tsx` — uses
  `<CloseTradeModal open onOpenChange trade />` (lines 592-596 of
  the pre-plan-010 file). Do not change its call shape.
- `client/src/pages/TransactionDetail.tsx` — same.
- `client/src/lib/ledger.tsx` — supplies
  `Field`, `INPUT_CLASS`, `Tone`, `fmtDateTime`, `fmtDecimal`,
  `fmtMoney`, `fmtRatio`, `toneClass`. Reuse, don't edit.

### Existing internal seams

- Lines 27-35: `FormData`, `EMPTY_FORM`.
- Lines 37-53: `CloseTradeModalProps`.
- Lines 55-64: `DECIMAL_PATTERN`, `parsePositiveDecimal`.
- Lines 66-74: `ClosePreview` discriminated union.
- Lines 78-101: `previewClose` pure function.
- Lines 103-189: `CloseTradeModal` component setup (tRPC query,
  `useEffect` reset on open, `closeMutation`, `useMemo`s for the
  parsed trade plan + the preview).
- Lines 190-229: `handleSubmit`, `updateField`, `submitDisabled`
  derivation.
- Lines 236-247: `<Dialog>` shell + `<form>` skeleton.
- Lines 248-275: trade-context strip.
- Lines 265-274: legacy warning.
- Lines 277-298: plan readout.
- Lines 300-330: form fields (end time + exit price).
- Lines 332-363: computed readout.
- Lines 365-395: new-balance hero.
- Lines 398-414: `<DialogFooter>` (cancel / close).

### Repo conventions

- `client/src/components/CloseTradeModal.tsx` lives at the top level
  of `components/`. Move it into
  `client/src/components/close-trade/` together with its new
  siblings so the directory has a clear feature boundary. Re-export
  from a new `client/src/components/CloseTradeModal.tsx` if you want
  to keep import paths from the two callers identical; **simpler**:
  update the two callers to the new path (only two edit sites).
- Pure helpers go in `client/src/lib/`, not in `components/`.

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

- `client/src/lib/closePreview.ts` — **NEW**. Houses
  `DECIMAL_PATTERN`, `parsePositiveDecimal` (renamed locally if
  desired but the simplest move is to keep the name and import it),
  `ClosePreview`, and `previewClose`. Pure module; ≤100 LOC.
- `client/src/components/close-trade/CloseTradeModal.tsx` — **NEW
  location**. Houses the `Dialog` shell, the form, the state hooks,
  the tRPC mutation, and the wiring JSX that composes the four
  presentational children below. ≤200 LOC.
- `client/src/components/close-trade/TradePlanReadout.tsx` —
  **NEW**. Renders the static "trade plan" grid (entry, size,
  planned stop / target / r/r). ≤80 LOC.
- `client/src/components/close-trade/CloseInputs.tsx` — **NEW**.
  Renders the two form fields (`end time`, `exit price`) plus the
  "enter a valid positive exit price" inline error. ≤80 LOC.
- `client/src/components/close-trade/ComputedReadout.tsx` — **NEW**.
  Renders the `actual r/r`, `outcome`, `return` grid. ≤80 LOC.
- `client/src/components/close-trade/NewBalanceHero.tsx` — **NEW**.
  Renders the "new balance" hero + the "from $X · +$Y" caption. ≤80 LOC.
- `client/src/pages/Transactions.tsx` — update the import path of
  `CloseTradeModal` (one line).
- `client/src/pages/TransactionDetail.tsx` — update the import path
  of `CloseTradeModal` (one line).
- Delete `client/src/components/CloseTradeModal.tsx` (old location).

**Out of scope**:

- The `<CloseTradeModalProps['trade']>` shape. It is shared by both
  callers and forms the modal's public contract; preserve it byte
  for byte.
- `server/routers.ts` `transaction.close` procedure.
- `server/_core/tradeMath.ts` — the canonical math. Do not
  reimplement; keep `previewClose` as the UI-only mirror it
  already is.
- Any change to the smoke spec.

## Git workflow

- Branch: `advisor/012-split-close-trade-modal`.
- Suggested commit split:
  1. `refactor: extract closePreview util module`
  2. `refactor: split CloseTradeModal into presentational children`

## Steps

### Step 1: baseline

```bash
git status
git rev-parse HEAD
wc -l client/src/components/CloseTradeModal.tsx     # 419
npm run check && npm test -- --run && npm run test:e2e
```

### Step 2: extract `lib/closePreview.ts`

Create `client/src/lib/closePreview.ts` with the contents of lines
55-101 of the old modal (the `DECIMAL_PATTERN`, `parsePositiveDecimal`,
`ClosePreview`, `previewClose` block). It mirrors the same shape as
`lib/plannedRiskReward.ts` from plan 011 — keep the style consistent.

The header comment that currently says "Mirrors server-side close
calculations for preview only" stays — it tells the next reader why
the math exists in two places.

### Step 3: create the components directory and move the modal

```bash
mkdir -p client/src/components/close-trade
git mv client/src/components/CloseTradeModal.tsx \
       client/src/components/close-trade/CloseTradeModal.tsx
```

Update import paths in:

- `client/src/pages/Transactions.tsx` — change
  `import { CloseTradeModal } from "@/components/CloseTradeModal";`
  to `import { CloseTradeModal } from "@/components/close-trade/CloseTradeModal";`.
- `client/src/pages/TransactionDetail.tsx` — same edit.

After plan 010 has shipped, the import in `Transactions.tsx` may have
moved into a sub-file. Run a wider grep to catch it:

```bash
grep -rn 'from "@/components/CloseTradeModal"' --include='*.tsx' client/src
# Update every match.
```

### Step 4: extract `TradePlanReadout.tsx`

API:

```tsx
type Props = {
  entryPrice: string | null;
  positionSizeUsdt: string | null;
  plannedStopLossPrice: string | null;
  plannedTakeProfitPrice: string | null;
  plannedRiskRewardRatio: string | null;
};
export function TradePlanReadout(props: Props) { … }
```

Move the JSX at lines 277-298 of the old modal verbatim. Format strings
(`fmtDecimal`, `fmtMoney`, `fmtRatio`) come from `@/lib/ledger`.

### Step 5: extract `CloseInputs.tsx`

API:

```tsx
type Props = {
  endTime: string;
  exitPrice: string;
  disabled: boolean;
  showInvalidExitError: boolean;
  onChangeEndTime: (v: string) => void;
  onChangeExitPrice: (v: string) => void;
};
export function CloseInputs(props: Props) { … }
```

Move lines 300-330. The `disabled` prop carries the `isLegacyOpen`
gate that the old modal had inline.

### Step 6: extract `ComputedReadout.tsx`

API:

```tsx
import type { ClosePreview } from "@/lib/closePreview";

type Props = { preview: ClosePreview };
export function ComputedReadout(props: Props) { … }
```

Move lines 332-363. Determine `previewTone` and the "—" fallback
internally from `props.preview.kind`.

### Step 7: extract `NewBalanceHero.tsx`

API:

```tsx
import type { ClosePreview } from "@/lib/closePreview";

type Props = {
  preview: ClosePreview;
  currentBalance: number;
};
export function NewBalanceHero(props: Props) { … }
```

Move lines 365-395.

### Step 8: slim `CloseTradeModal.tsx`

The new (relocated) `CloseTradeModal.tsx` should:

- Keep the `CloseTradeModalProps` shape exactly (`open`,
  `onOpenChange`, `trade`).
- Keep all state, the tRPC query, the `useEffect` reset-on-open, the
  mutation, the `useMemo`s, `handleSubmit`, `updateField`, and the
  derivation of `currentBalanceNum`, `isLegacyOpen`, `submitDisabled`,
  `previewTone`.
- The JSX body becomes:

  ```tsx
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[520px]">
      <form onSubmit={handleSubmit}>
        <DialogHeader>…</DialogHeader>

        <div className="space-y-8 pt-2">
          <TradeContextStrip trade={trade} />        {/* tiny — inline OR fifth file if it grows */}
          {isLegacyOpen && <LegacyWarning />}        {/* tiny — inline OR sixth file */}
          <TradePlanReadout … />
          <CloseInputs … />
          <ComputedReadout preview={preview} />
          <NewBalanceHero preview={preview} currentBalance={currentBalanceNum} />
        </div>

        <DialogFooter>…</DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
  ```

  Inline the trade-context strip and the legacy warning if they each
  fit in <20 LOC; otherwise extract them as siblings (the 200 LOC
  budget is the hard rule, not how many files are produced).

Target: ≤200 LOC after `npm run format`. The `CloseTradeModal`
function must stay ≤100 LOC; if it doesn't, the inlined helpers are
too big — extract them.

### Step 9: format + verify

```bash
npm run format
npm run check                                    # exit 0
npm test -- --run                                # 104 passed
npm run test:e2e                                 # smoke passes
npm run build                                    # exit 0
wc -l client/src/components/close-trade/*.tsx
wc -l client/src/lib/closePreview.ts             # ≤100
```

### Step 10: manual sanity (UI)

```bash
NODE_OPTIONS='--experimental-sqlite' NODE_ENV=development \
  npx tsx server/_core/index.ts &
SERVER_PID=$!
sleep 3
# Open /transactions, click "close →" on an open trade, verify:
#   - the modal renders trade-context strip + plan readout + form
#   - typing a valid exit price updates "actual r/r" / "outcome" /
#     "return" / "new balance" live, with the correct win/loss tone
#   - typing an invalid exit price (e.g. "abc") shows the inline error
#     and keeps the submit button disabled
#   - submitting closes the trade and the row in the list updates
# Then click "close trade →" from /transactions/<id> and verify the
# same modal opens with the same behaviour.
kill $SERVER_PID
```

## Test plan

- The Playwright smoke spec already covers the close-modal happy path
  (`page.getByLabel("end time").fill(...)`,
  `page.getByLabel("exit price").fill("41000").press("Enter")`,
  `expect(...).toContainText("win")`). Re-run after each step.
- Manual sanity (Step 10) covers the invalid-input branch and the
  cross-page invocation.

## Done criteria

ALL must hold:

- [ ] `client/src/components/CloseTradeModal.tsx` (old path) no
      longer exists.
- [ ] `client/src/components/close-trade/CloseTradeModal.tsx` exists
      and is ≤ 200 LOC.
- [ ] Every other file under `client/src/components/close-trade/` is
      ≤ 200 LOC.
- [ ] `client/src/lib/closePreview.ts` is ≤ 100 LOC.
- [ ] `grep -rn '"@/components/CloseTradeModal"' --include='*.tsx' client/src`
      returns zero matches.
- [ ] `npm run check` exits 0.
- [ ] `npm test -- --run` reports `Tests 104 passed (104)`.
- [ ] `npm run test:e2e` passes.
- [ ] `npm run build` exits 0.
- [ ] `git status` shows changes only in:
        - `client/src/components/CloseTradeModal.tsx` (deleted)
        - `client/src/components/close-trade/*.tsx` (new + the moved
          modal)
        - `client/src/lib/closePreview.ts` (new)
        - `client/src/pages/Transactions.tsx` (one import line, or
          one import line in whatever sub-file plan 010 produced)
        - `client/src/pages/TransactionDetail.tsx` (one import line)
        - `plans/README.md` (status update)
- [ ] `plans/README.md` row for plan 012 set to DONE.

## STOP conditions

Stop and report if:

- The smoke spec's
  `page.getByLabel("end time").fill(...)` step can no longer find the
  input. Cause: a `<Field htmlFor="endTime">` / `<input id="endTime">`
  pair got split between two files and one side dropped the id. Re-pair
  them.
- The "computed" grid stops updating live. Cause: the `preview`
  prop is not being recomputed because the page-level `useMemo`
  dependency list lost `formData.exitPrice` or a parsed numeric.
- A type error claims `CloseTradeModalProps['trade']` differs at the
  call site vs. the modal. The shape is the load-bearing contract;
  resurface the diff rather than narrowing the type at one call site.
- The "from $X · +$Y" caption mis-renders when `preview.kind ===
  "invalidExit"`. The original collapsed the `· +$Y` branch when
  `hasOkPreview` is false (line 383-393). Preserve that in
  `NewBalanceHero`.

## Maintenance notes

- The close-trade math now lives in two files in this repo:
  `server/_core/tradeMath.ts` (authoritative) and
  `client/src/lib/closePreview.ts` (UI mirror). Any change to the
  server formula MUST be mirrored here, or the preview drifts from
  the actual close. The top-of-file comment is the trigger.
- Plan 010 will likely have moved the modal-host JSX in
  `Transactions.tsx` to `client/src/components/transactions/`. The
  import path edits in Step 3 should follow whichever file ends up
  hosting the modal.
- The trade-context strip and legacy warning are good candidates to
  inline today. They become extraction candidates the first time
  someone wants to render a slightly different variant (e.g. for
  the trade-detail page hero). Resist pre-extracting.
