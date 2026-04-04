# Confidence Level → Confidence Score (1-5)

## TL;DR

> **Quick Summary**: Convert the confidence system from a percentage scale (0-100) to a discrete score (1-5) across schema, backend, and all 4 frontend pages. Element scores are integers 1-5; transaction scores are calculated averages stored as decimals (e.g. 3.5).
>
> **Deliverables**:
>
> - Updated Drizzle schema (element: integer 1-5, transaction: real for decimal)
> - Updated backend validation (Zod 1-5) and calculation logic (1-decimal avg)
> - New shared confidence helper utilities (extracted from 4 duplicated copies)
> - 4 updated frontend pages with score display instead of percentage
> - TradingElements page: 5-button score selector replacing Slider
> - Updated test files
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (schema + backend) → Task 2-5 (frontend pages, parallel)

---

## Context

### Original Request

User wants to change confidence from a percentage (0-100) to a score (1-5) because percentages feel awkward for this use case. The label should change from "Confidence Level" to "Confidence Score".

### Interview Summary

**Key Discussions**:

- **Transaction confidence decimal handling**: Store with 1 decimal (e.g. 3.5) using `real` column type
- **UI selector**: Use 5 discrete buttons labeled 1-5 with labels (Very Low → Very High) instead of the current Slider
- **Data migration**: Not needed (dev stage), just change schema defaults and push

**Research Findings**:

- `getConfidenceColor`, `getConfidenceLabel`, `getConfidenceBgColor` are duplicated identically across 4 page files — should be extracted to a shared utility
- Transaction `confidenceLevel` column is currently `integer` in Drizzle schema — needs to change to `real` for decimal averages
- Need to import `real` from `drizzle-orm/sqlite-core` (currently only imports `integer`, `text`, `check`, `sqliteTable`)
- `calculateConfidenceLevel` in `server/db.ts:1121-1126` uses `Math.round()` — needs `toFixed(1)` + parseFloat
- Quick-add suggestions in TradingElements have hardcoded 50-75 values that need remapping to 1-5

---

## Work Objectives

### Core Objective

Replace the 0-100 percentage confidence system with a 1-5 score system that uses integers for elements and decimals (1 decimal place) for calculated transaction confidence.

### Concrete Deliverables

- `drizzle/schema.ts` — updated column types and comments
- `server/routers.ts` — updated Zod validation (min 1, max 5)
- `server/db.ts` — updated `calculateConfidenceLevel` for 1-decimal avg
- `client/src/lib/confidence.ts` — NEW shared confidence helpers
- `client/src/pages/TradingElements.tsx` — 5-button selector, score display
- `client/src/pages/NewTransaction.tsx` — score display
- `client/src/pages/TransactionDetail.tsx` — score display
- `client/src/pages/Transactions.tsx` — score display
- Test files updated to match new 1-5 scale

### Definition of Done

- [ ] `npm run check` passes with zero errors
- [ ] `npm run test` passes with zero failures
- [ ] All confidence values display as scores (1-5 or decimals like 3.5), no percentages anywhere

### Must Have

- Element confidence: integer 1-5, default 3
- Transaction confidence: real number with 1 decimal, calculated as average
- 5-button score selector on TradingElements create/edit dialogs
- Labels: 1=Very Low, 2=Low, 3=Medium, 4=High, 5=Very High
- All display text changed from "Confidence Level" to "Confidence Score"
- No `%` symbols displayed anywhere for confidence

### Must NOT Have (Guardrails)

- Do NOT change the DB column name `confidenceLevel` — only change the display text
- Do NOT add data migration — dev stage, just `db:push`
- Do NOT change any other feature behavior (trading systems, transactions lifecycle, etc.)
- Do NOT introduce new dependencies or UI libraries
- Do NOT refactor unrelated code in the pages

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Tests-after (update existing tests to match new 1-5 scale)
- **Framework**: Vitest (`npm run test`)

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend**: Use Bash — `npm run check`, `npm run test`
- **Frontend**: Use Playwright — Navigate pages, verify score display

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Sequential foundation — schema + backend + shared utils):
├── Task 1: Schema + backend + shared confidence utils [quick]

Wave 2 (After Wave 1 — all 4 frontend pages in PARALLEL):
├── Task 2: TradingElements page (create/edit with 5-button selector) [quick]
├── Task 3: NewTransaction page (score display) [quick]
├── Task 4: TransactionDetail page (score display) [quick]
├── Task 5: Transactions list page (score display) [quick]

Wave 3 (After Wave 2 — tests + final check):
├── Task 6: Update all test files + run check + run test [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks    |
| ---- | ---------- | --------- |
| 1    | —          | 2,3,4,5,6 |
| 2    | 1          | 6         |
| 3    | 1          | 6         |
| 4    | 1          | 6         |
| 5    | 1          | 6         |
| 6    | 1,2,3,4,5  | F1-F4     |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `quick`
- **Wave 2**: 4 tasks — T2-T5 → `quick` (all parallel)
- **Wave 3**: 1 task — T6 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Schema + Backend + Shared Confidence Utils

  **What to do**:

  **A. Drizzle Schema (`drizzle/schema.ts`)**:
  - Line 2: Add `real` to imports from `drizzle-orm/sqlite-core`
  - Line 47-48: Change element confidence comment + default:
    - FROM: `/** Confidence level for this element (0-100) */` + `integer("confidenceLevel").notNull().default(50)`
    - TO: `/** Confidence score for this element (1-5) */` + `integer("confidenceLevel").notNull().default(3)`
  - Line 139-140: Change transaction confidence comment + type:
    - FROM: `/** Overall confidence level calculated from selected elements (0-100) */` + `integer("confidenceLevel")`
    - TO: `/** Overall confidence score calculated from selected elements (1.0-5.0) */` + `real("confidenceLevel")`

  **B. Backend Validation (`server/routers.ts`)**:
  - Line 67: Element create Zod — FROM: `z.number().min(0).max(100).default(50)` → TO: `z.number().int().min(1).max(5).default(3)`
  - Line 95: Element update Zod — FROM: `z.number().min(0).max(100).optional()` → TO: `z.number().int().min(1).max(5).optional()`

  **C. Confidence Calculation (`server/db.ts`)**:
  - Line 1121-1126: Update `calculateConfidenceLevel` function:
    - Change fallback from `50` to `3`
    - Change return from `Math.round(totalConfidence / elements.length)` to `parseFloat((totalConfidence / elements.length).toFixed(1))`

  **D. Create Shared Confidence Helpers (`client/src/lib/confidence.ts`)** — NEW FILE:
  - Extract and consolidate the duplicated helper functions from 4 pages into one shared module
  - `getConfidenceColor(score: number): string` — Remap thresholds: `>=5` green, `>=4` emerald, `>=3` yellow, `>=2` orange, else red
  - `getConfidenceLabel(score: number): string` — Map: 5=Very High, 4=High, 3=Medium, 2=Low, 1=Very Low (use `Math.round()` for decimal transaction scores)
  - `getConfidenceBgColor(score: number): string` — Same threshold remapping as color but with bg- classes
  - Export all three functions

  **E. Run `npm run db:push`** to apply schema changes.

  **Must NOT do**:
  - Do NOT rename the DB column `confidenceLevel` — only change type/default/comment
  - Do NOT touch any other columns or tables
  - Do NOT change transaction lifecycle logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundation task)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3, 4, 5, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `drizzle/schema.ts:1-2` — Current imports (need to add `real`)
  - `drizzle/schema.ts:47-48` — Element confidenceLevel column definition
  - `drizzle/schema.ts:139-140` — Transaction confidenceLevel column definition
  - `server/routers.ts:67` — Element create Zod validation
  - `server/routers.ts:95` — Element update Zod validation
  - `server/db.ts:1121-1126` — `calculateConfidenceLevel` logic with `Math.round` and fallback 50
  - `client/src/pages/TradingElements.tsx:44-58` — Canonical copy of the 3 helper functions to extract

  **Why Each Reference Matters**:
  - Schema lines: exact location of column definitions to modify
  - Routers lines: exact Zod validators constraining the allowed range
  - db.ts: the calculation logic producing the transaction-level confidence
  - TradingElements helpers: the source to extract into `client/src/lib/confidence.ts`

  **Acceptance Criteria**:
  - [ ] `drizzle/schema.ts` imports `real` from `drizzle-orm/sqlite-core`
  - [ ] Element `confidenceLevel` default is `3`, comment says `(1-5)`
  - [ ] Transaction `confidenceLevel` uses `real()` type, comment says `(1.0-5.0)`
  - [ ] Zod create validation: `z.number().int().min(1).max(5).default(3)`
  - [ ] Zod update validation: `z.number().int().min(1).max(5).optional()`
  - [ ] `calculateConfidenceLevel` fallback is `3`, returns 1-decimal float
  - [ ] `client/src/lib/confidence.ts` exists with 3 exported functions
  - [ ] `npm run db:push` succeeds

  **QA Scenarios**:

  ```
  Scenario: Schema types are correct after push
    Tool: Bash
    Preconditions: Dev server stopped
    Steps:
      1. Run `npm run db:push` — should complete without errors
      2. Run `npm run check` — should pass with 0 errors
    Expected Result: Both commands exit 0
    Evidence: .sisyphus/evidence/task-1-schema-push.txt

  Scenario: Shared confidence helpers work correctly
    Tool: Bash
    Steps:
      1. Run: `npx tsx -e "const {getConfidenceColor,getConfidenceLabel,getConfidenceBgColor} = require('./client/src/lib/confidence'); console.log(getConfidenceLabel(5), getConfidenceLabel(3), getConfidenceLabel(1)); console.log(getConfidenceColor(4.5), getConfidenceBgColor(2))"`
      2. Verify output contains: "Very High", "Medium", "Very Low" and valid Tailwind classes
    Expected Result: All 3 functions return correct values for the 1-5 scale
    Evidence: .sisyphus/evidence/task-1-confidence-helpers.txt
  ```

  **Commit**: YES
  - Message: `refactor(schema): change confidence from percentage (0-100) to score (1-5)`
  - Files: `drizzle/schema.ts`, `server/routers.ts`, `server/db.ts`, `client/src/lib/confidence.ts`
  - Pre-commit: `npm run check`

- [x] 2. TradingElements Page — 5-Button Score Selector + Score Display

  **What to do**:

  **A. Replace helper functions with shared import**:
  - Remove the local `getConfidenceColor` (lines 44-50) and `getConfidenceLabel` (lines 52-58) function definitions
  - Add import: `import { getConfidenceColor, getConfidenceLabel } from "@/lib/confidence";`

  **B. Update form default value**:
  - Line 77: Change `confidenceLevel: 50` → `confidenceLevel: 3`
  - Line 85, 97, 157: All `confidenceLevel: 50` resets → `confidenceLevel: 3`

  **C. Replace Slider with 5-button score selector** (in both Create and Edit dialogs):
  - Remove Slider import (line 12)
  - In Create Dialog (lines 346-368): Replace the Slider block with 5 inline buttons:
    - Each button shows score number (1-5) and label text (Very Low, Low, Medium, High, Very High)
    - Active button is visually highlighted (e.g., `variant="default"` vs `variant="outline"`)
    - On click: `setFormData({ ...formData, confidenceLevel: score })`
    - Show selected score + label above buttons
  - In Edit Dialog (lines 420-439): Same 5-button pattern
  - Change label text "Confidence Level" → "Confidence Score" in both dialogs
  - Change helper text from `"How confident are you when this element appears? (0-100)"` → `"Rate your confidence when this element appears (1-5)"`

  **D. Update element card display** (lines 266-274):
  - Change `{element.confidenceLevel}%` → `{element.confidenceLevel}/5`
  - "Confidence Level" → "Confidence Score" in any remaining label text

  **E. Update quick-add suggestions** (lines 161-171):
  - Remap all confidence values to 1-5 scale:
    - Gap: 70 → 4, Double Top/Bottom: 75 → 4, CVD Divergence: 65 → 3
    - Support/Resistance: 60 → 3, Trend Line Break: 55 → 3, Volume Spike: 50 → 3
    - Fibonacci Retracement: 60 → 3, Moving Average Cross: 55 → 3
    - RSI Divergence: 65 → 3, Order Block: 70 → 4
  - Line 229: Change `{suggestion.confidence}%` → `{suggestion.confidence}/5`

  **F. Update dialog descriptions**:
  - Line 331: "Add a new trading opportunity element with a confidence level" → "Add a new trading opportunity element with a confidence score"
  - Line 406: "Update the element details and confidence level" → "Update the element details and confidence score"
  - Line 189: "Manage your trading opportunity tags with confidence levels" → "Manage your trading opportunity tags with confidence scores"
  - Line 207-208: "confidence levels" → "confidence scores"
  - Line 243-244: "Confidence levels help calculate trade confidence" → "Confidence scores help calculate trade confidence"

  **Must NOT do**:
  - Do NOT change element list/card layout structure
  - Do NOT change delete confirmation dialog
  - Do NOT add new npm dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `client/src/pages/TradingElements.tsx:44-58` — Local helpers to remove (replaced by shared import)
  - `client/src/pages/TradingElements.tsx:74-78` — Form state default to change
  - `client/src/pages/TradingElements.tsx:161-171` — Quick-add suggestion values to remap
  - `client/src/pages/TradingElements.tsx:346-368` — Create dialog Slider block to replace with buttons
  - `client/src/pages/TradingElements.tsx:420-439` — Edit dialog Slider block to replace with buttons

  **API/Type References**:
  - `client/src/lib/confidence.ts` — New shared helpers (created in Task 1)

  **Why Each Reference Matters**:
  - Lines 44-58: These are the exact functions to delete (replaced by shared import)
  - Lines 346-368 and 420-439: These are the Slider UI blocks to replace with 5-button selectors
  - Lines 161-171: Hardcoded percentage values that must be remapped to 1-5

  **Acceptance Criteria**:
  - [ ] No local `getConfidenceColor`/`getConfidenceLabel` definitions remain in file
  - [ ] Import from `@/lib/confidence` present
  - [ ] No Slider import or usage in file
  - [ ] Create dialog shows 5 clickable score buttons (1-5 with labels)
  - [ ] Edit dialog shows 5 clickable score buttons (1-5 with labels)
  - [ ] All suggestion confidence values are 1-5
  - [ ] No `%` symbol anywhere in the file
  - [ ] All text says "Confidence Score" not "Confidence Level"
  - [ ] Form default is `3` not `50`

  **QA Scenarios**:

  ```
  Scenario: Create element with score 4 via button selector
    Tool: Playwright
    Preconditions: Dev server running, user logged in, on /elements page
    Steps:
      1. Click "New Element" button
      2. Type "Test Element" in name input
      3. Verify 5 score buttons visible (labeled 1-5)
      4. Click button for score "4" (High)
      5. Verify selected button is highlighted, display shows "4/5 - High"
      6. Click "Create"
      7. Verify element appears in list with "4/5" and "(High)" label
    Expected Result: Element created with score 4, displayed as "4/5 (High)"
    Evidence: .sisyphus/evidence/task-2-create-element.png

  Scenario: Quick-add shows scores not percentages
    Tool: Playwright
    Preconditions: On /elements page, some suggestions available
    Steps:
      1. Look at Quick Add section
      2. Verify suggestion buttons show "/5" not "%"
      3. Click a suggestion (e.g. "Gap")
      4. Verify created element shows score 4/5 not 70%
    Expected Result: All suggestions display as X/5, not X%
    Evidence: .sisyphus/evidence/task-2-quick-add.png
  ```

  **Commit**: YES (groups with Tasks 3, 4, 5)
  - Message: `feat(ui): update confidence display to score system across all pages`
  - Files: `client/src/pages/TradingElements.tsx`
  - Pre-commit: `npm run check`

- [x] 3. NewTransaction Page — Score Display

  **What to do**:

  **A. Replace helper functions with shared import**:
  - Remove local `getConfidenceColor` (lines 30-36) and `getConfidenceLabel` (lines 38-44) definitions
  - Add import: `import { getConfidenceColor, getConfidenceLabel } from "@/lib/confidence";`

  **B. Update calculated confidence display** (lines 84-102):
  - Line 102: Change `Math.round(totalConfidence / selectedElements.length)` → `parseFloat((totalConfidence / selectedElements.length).toFixed(1))`
  - This produces decimal averages like 3.5 for display

  **C. Update confidence value display**:
  - Line 264: Change `{element.confidenceLevel}%` → `{element.confidenceLevel}/5`
  - Line 291: Change `{calculatedConfidence}%` → `{calculatedConfidence}`
  - Line 435: Change `{calculatedConfidence}%` → `{calculatedConfidence}/5`

  **D. Update label text**:
  - Line 284: "Overall Confidence Level" → "Overall Confidence Score"
  - Line 430: "Confidence Level" → "Confidence Score"

  **Must NOT do**:
  - Do NOT change form submission logic
  - Do NOT change element selection checkbox behavior
  - Do NOT change any layout structure

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 4, 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `client/src/pages/NewTransaction.tsx:30-44` — Local helper functions to remove
  - `client/src/pages/NewTransaction.tsx:84-102` — Client-side confidence calculation with `Math.round`
  - `client/src/pages/NewTransaction.tsx:260-265` — Element confidence display with `%`
  - `client/src/pages/NewTransaction.tsx:288-297` — Overall confidence display with `%` and label
  - `client/src/pages/NewTransaction.tsx:428-436` — Summary section confidence display

  **Why Each Reference Matters**:
  - Lines 30-44: Exact functions to delete (replaced by shared import)
  - Lines 84-102: Client-side calculation must match backend (1-decimal precision)
  - Lines 260-297 and 428-436: Every place `%` appears that must change to score format

  **Acceptance Criteria**:
  - [ ] No local helper function definitions in file
  - [ ] Import from `@/lib/confidence` present
  - [ ] Client-side calculation produces 1-decimal results (e.g., 3.5)
  - [ ] No `%` symbol in confidence display
  - [ ] Labels say "Confidence Score" not "Confidence Level"

  **QA Scenarios**:

  ```
  Scenario: Transaction creation shows calculated confidence score
    Tool: Playwright
    Preconditions: Dev server running, user logged in, trading system exists with elements
    Steps:
      1. Navigate to /new-transaction
      2. Select 2+ elements with different scores (e.g., score 3 and score 5)
      3. Verify "Overall Confidence Score" label shown (not "Level")
      4. Verify calculated value shows as decimal (e.g., "4.0" or "3.5"), no `%`
      5. Verify individual element scores show as "X/5" not "X%"
    Expected Result: Scores display as numbers (1-5 scale), no percentages
    Evidence: .sisyphus/evidence/task-3-new-transaction.png

  Scenario: No elements selected shows no confidence
    Tool: Playwright
    Steps:
      1. Navigate to /new-transaction with no elements selected
      2. Verify confidence section is not displayed
    Expected Result: Confidence section hidden when no elements selected
    Evidence: .sisyphus/evidence/task-3-no-elements.png
  ```

  **Commit**: YES (groups with Tasks 2, 4, 5)
  - Files: `client/src/pages/NewTransaction.tsx`

- [x] 4. TransactionDetail Page — Score Display

  **What to do**:

  **A. Replace helper functions with shared import**:
  - Remove local `getConfidenceColor` (lines 22-28), `getConfidenceLabel` (lines 30-36), `getConfidenceBgColor` (lines 38-44)
  - Add import: `import { getConfidenceColor, getConfidenceLabel, getConfidenceBgColor } from "@/lib/confidence";`

  **B. Update element confidence display** (lines 310-312):
  - Line 312: Change `{element.confidenceLevel}%` → `{element.confidenceLevel}/5`

  **C. Update transaction confidence display** (lines 430-446):
  - Line 440: Change `{transaction.confidenceLevel}%` → `{transaction.confidenceLevel}/5`

  **Must NOT do**:
  - Do NOT change transaction detail layout or other sections
  - Do NOT touch review section, close trade modal, or status badges

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3, 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `client/src/pages/TransactionDetail.tsx:22-44` — Three local helper functions to remove
  - `client/src/pages/TransactionDetail.tsx:310-312` — Element badge with `%`
  - `client/src/pages/TransactionDetail.tsx:430-446` — Transaction confidence section with `%` and label

  **Why Each Reference Matters**:
  - Lines 22-44: Three functions to delete and replace with shared import
  - Lines 310-312: Element badges showing percentage to change to score
  - Lines 430-446: Main confidence display with `%` and label text

  **Acceptance Criteria**:
  - [ ] No local helper function definitions in file
  - [ ] Import from `@/lib/confidence` present
  - [ ] Element badges show "X/5" not "X%"
  - [ ] Transaction confidence shows "X.X/5" not "X%"
  - [ ] No `%` symbol in confidence display

  **QA Scenarios**:

  ```
  Scenario: Transaction detail shows confidence as score
    Tool: Playwright
    Preconditions: Dev server running, a transaction exists with elements attached
    Steps:
      1. Navigate to /transactions/{id} for a transaction with confidence
      2. Verify confidence section shows score (e.g., "3.5/5") not percentage
      3. Verify label says "Confidence" (not "Confidence Level")
      4. Verify element badges show "X/5" format
      5. Verify color coding still works (green for high, red for low)
    Expected Result: All confidence displays use score format, colors correct
    Evidence: .sisyphus/evidence/task-4-transaction-detail.png

  Scenario: Transaction without confidence shows dash
    Tool: Playwright
    Steps:
      1. View a transaction that has no elements (null confidence)
      2. Verify confidence section is not displayed or shows "—"
    Expected Result: Graceful handling of null confidence
    Evidence: .sisyphus/evidence/task-4-null-confidence.png
  ```

  **Commit**: YES (groups with Tasks 2, 3, 5)
  - Files: `client/src/pages/TransactionDetail.tsx`

- [x] 5. Transactions List Page — Score Display

  **What to do**:

  **A. Replace helper functions with shared import**:
  - Remove local `getConfidenceColor` (lines 57-63) and `getConfidenceBgColor` (lines 65-71)
  - Add import: `import { getConfidenceColor, getConfidenceBgColor } from "@/lib/confidence";`

  **B. Update confidence badge display** (lines 362-373):
  - Line 368: Change `{tx.confidenceLevel}%` → `{tx.confidenceLevel}/5`
  - Line 372: Change `Confidence Level: {tx.confidenceLevel}%` → `Confidence Score: {tx.confidenceLevel}/5`

  **Must NOT do**:
  - Do NOT change table structure or column order
  - Do NOT touch filtering, sorting, or pagination logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3, 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `client/src/pages/Transactions.tsx:57-71` — Two local helper functions to remove
  - `client/src/pages/Transactions.tsx:362-373` — Confidence badge and tooltip with `%`

  **Why Each Reference Matters**:
  - Lines 57-71: Functions to delete and replace with shared import
  - Lines 362-373: The badge and tooltip where `%` must be removed and format changed

  **Acceptance Criteria**:
  - [ ] No local helper function definitions in file
  - [ ] Import from `@/lib/confidence` present
  - [ ] Badge shows "X.X/5" not "X%"
  - [ ] Tooltip shows "Confidence Score: X.X/5" not "Confidence Level: X%"

  **QA Scenarios**:

  ```
  Scenario: Transaction list shows confidence scores
    Tool: Playwright
    Preconditions: Dev server running, transactions exist with confidence values
    Steps:
      1. Navigate to /transactions
      2. Find a transaction row with confidence
      3. Verify badge shows "X.X/5" format (e.g., "3.5/5"), no `%`
      4. Hover over badge to see tooltip
      5. Verify tooltip says "Confidence Score: X.X/5"
    Expected Result: All confidence badges use score format
    Evidence: .sisyphus/evidence/task-5-transactions-list.png

  Scenario: Transaction without confidence shows dash
    Tool: Playwright
    Steps:
      1. Find a transaction row without confidence (null)
      2. Verify it shows "—" in the confidence column
    Expected Result: Dash displayed for null confidence
    Evidence: .sisyphus/evidence/task-5-null-confidence.png
  ```

  **Commit**: YES (groups with Tasks 2, 3, 4)
  - Files: `client/src/pages/Transactions.tsx`

- [x] 6. Update Test Files

  **What to do**:

  **A. `server/transaction.lifecycle.test.ts`**:
  - Line 328: Change `confidenceLevel INTEGER NOT NULL DEFAULT 50` → `DEFAULT 3` in CREATE TABLE
  - Line 331, 429-432, 927-930: Same default change in all CREATE TABLE statements
  - Line 414-415: Change test confidence values from 0-100 range to 1-5 range
  - Line 432: Change `confidenceLevel` value from `10` → `3` (or appropriate 1-5 value)
  - Line 498: Type `confidenceLevel: number | null` — keep as is (still valid)
  - Line 732: Change `confidenceLevel: 95` → `confidenceLevel: 5`

  **B. `server/sqlite.integration.test.ts`**:
  - Line 28: Change `DEFAULT 50` → `DEFAULT 3` in CREATE TABLE
  - Line 240: Change `confidenceLevel: 65` → `confidenceLevel: 3` (or appropriate)
  - Line 258, 366, 445, 534: Update any hardcoded confidence values to 1-5 range
  - Line 512: Change `confidenceLevel: 50` → `confidenceLevel: 3`

  **C. `server/transaction.test.ts`**:
  - Line 266: Change `confidenceLevel: null` — keep as is (null is valid)

  **D. Run verification**:
  - `npm run check` — must pass
  - `npm run test` — must pass with 0 failures

  **Must NOT do**:
  - Do NOT change test logic or assertions beyond confidence values
  - Do NOT add new tests (existing coverage is sufficient for this refactor)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after all implementation)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 2, 3, 4, 5

  **References**:

  **Pattern References**:
  - `server/transaction.lifecycle.test.ts:328-332` — Test DB schema setup (multiple locations)
  - `server/transaction.lifecycle.test.ts:414-415` — Test element confidence data
  - `server/transaction.lifecycle.test.ts:732` — Hardcoded confidence 95
  - `server/sqlite.integration.test.ts:28-31` — Integration test schema setup
  - `server/sqlite.integration.test.ts:218-240` — Seed element data with confidence values
  - `server/transaction.test.ts:266` — Transaction mock with null confidence

  **Why Each Reference Matters**:
  - Schema setup lines: DEFAULT values must match new schema (3 not 50)
  - Test data lines: All hardcoded confidence values must be in 1-5 range
  - Null confidence: verify it's still handled correctly (should be fine)

  **Acceptance Criteria**:
  - [ ] All `DEFAULT 50` in test CREATE TABLE statements → `DEFAULT 3`
  - [ ] All hardcoded confidence values in 1-5 range (no 0-100 values remain)
  - [ ] `npm run check` passes
  - [ ] `npm run test` passes with 0 failures

  **QA Scenarios**:

  ```
  Scenario: All tests pass with new confidence scale
    Tool: Bash
    Steps:
      1. Run `npm run check`
      2. Run `npm run test`
    Expected Result: Both exit 0, all tests pass
    Failure Indicators: Any test failure mentioning confidence, any type error
    Evidence: .sisyphus/evidence/task-6-test-results.txt

  Scenario: No old 0-100 confidence values remain in test files
    Tool: Bash
    Steps:
      1. Run: grep -n "confidenceLevel.*[5-9][0-9]" server/*.test.ts server/*.spec.ts
      2. Verify no matches (values >= 50 in confidence fields would indicate old scale)
    Expected Result: No matches found (all values should be 1-5)
    Evidence: .sisyphus/evidence/task-6-grep-check.txt
  ```

  **Commit**: YES
  - Message: `test: update confidence-related test values to 1-5 scale`
  - Files: `server/transaction.lifecycle.test.ts`, `server/sqlite.integration.test.ts`, `server/transaction.test.ts`
  - Pre-commit: `npm run test`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `npm run check` + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check for remaining `%` symbols in confidence display.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start dev server. Navigate to TradingElements → create element with score 1-5 via buttons → verify display shows score not percentage. Create transaction → verify calculated confidence shows decimal (e.g. "3.5"). Check Transactions list and TransactionDetail pages for score display.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read actual diff. Verify 1:1 spec compliance. Check no unrelated files changed. Check `confidenceLevel` column name unchanged. Check no `%` symbols remain in confidence display code.
      Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

- **After Task 1**: `refactor(schema): change confidence from percentage (0-100) to score (1-5)` — drizzle/schema.ts, server/routers.ts, server/db.ts, client/src/lib/confidence.ts
- **After Tasks 2-5**: `feat(ui): update confidence display to score system across all pages` — 4 page files
- **After Task 6**: `test: update confidence-related test values to 1-5 scale` — test files

---

## Success Criteria

### Verification Commands

```bash
npm run check   # Expected: 0 errors
npm run test    # Expected: all tests pass
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] No `%` in confidence display
- [ ] All tests pass
- [ ] Element scores: integers 1-5
- [ ] Transaction scores: decimals like 3.5
- [ ] "Confidence Score" label everywhere (not "Confidence Level")
