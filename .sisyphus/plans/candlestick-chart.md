# Candlestick Chart on New Trade Page

## TL;DR

> **Quick Summary**: Add a TradingView lightweight-charts candlestick chart to the New Trade page with mock OHLC data. Clicking a candle marks it with an arrow marker (single marker at a time). This is a visual prototype for future entry-time selection.
>
> **Deliverables**:
>
> - `lightweight-charts` npm dependency installed
> - Mock OHLC data generator utility (`client/src/lib/mockCandleData.ts`)
> - Reusable `CandlestickChart` component (`client/src/components/CandlestickChart.tsx`)
> - Chart integrated into NewTransaction page above the Trade Details form
>
> **Estimated Effort**: Short (3 implementation tasks)
> **Parallel Execution**: YES - 2 waves + final verification
> **Critical Path**: Task 1 → Task 2 → Task 3 → Final Verification

---

## Context

### Original Request

Add a candlestick chart using lightweight-charts to the New Trade page. Use mock data (no API integration). Clicking a candle should visually mark it. This is a prototype for future entry-time selection — no real functionality binding yet.

### Interview Summary

**Key Discussions**:

- **Chart placement**: Above the Trade Details form card, as an independent Card in the left column
- **Theme**: Fixed dark background (common trading chart style), NOT following app dark/light toggle
- **Scope**: Mock data only, click-to-mark interaction only, no form binding

**Research Findings**:

- NewTransaction page is 560 lines, 2-column grid layout (`lg:grid-cols-3`), left column has Trading System banner → Trading Elements → Trade Details cards
- lightweight-charts v5.x confirmed: `createChart()`, `CandlestickSeries`, `subscribeClick()`, `createSeriesMarkers()` all available
- React pattern: `useRef` + `useEffect` with `chart.remove()` cleanup, no wrapper library needed
- Project has dark/light theme via CSS variables, but chart will use fixed dark colors independent of app theme

### Metis Review

**Identified Gaps** (addressed):

- **Mock data determinism**: Use seeded/static data for stable QA — no `Math.random()` per render
- **Marker behavior on repeat click**: Same candle → marker stays; different candle → marker moves
- **Theme leakage**: Chart must be isolated from app theme toggle via explicit fixed options
- **QA automation hooks**: Add `data-testid` attributes and `data-selected-time` for Playwright assertions
- **React Strict Mode**: Ensure `chart.remove()` + unsubscribe in cleanup to prevent double-init leaks
- **Resize handling**: Add `ResizeObserver` or `window.resize` listener with cleanup

---

## Work Objectives

### Core Objective

Add a visual candlestick chart prototype with click-to-mark interaction to the New Trade page, using mock data and the lightweight-charts library.

### Concrete Deliverables

- `lightweight-charts` installed as npm dependency
- `client/src/lib/mockCandleData.ts` — deterministic mock OHLC data generator
- `client/src/components/CandlestickChart.tsx` — reusable chart component with click-to-mark
- `client/src/pages/NewTransaction.tsx` — updated to include chart Card above form

### Definition of Done

- [ ] `npm run check` exits 0 (TypeScript clean)
- [ ] `npm run build` exits 0 (production build succeeds)
- [ ] `npm run test` exits 0 (existing server tests still pass)
- [ ] Chart renders on `/transactions/new` with visible candles
- [ ] Clicking a candle shows an arrow marker on it
- [ ] Clicking a different candle moves the marker (only 1 marker at a time)
- [ ] Chart has fixed dark theme regardless of app theme state

### Must Have

- Deterministic mock data (same candles every render)
- Single marker at a time — clicking a new candle replaces the old marker
- Fixed dark chart appearance independent of app theme
- `data-testid` attributes for QA automation
- `data-selected-time` attribute exposing selected candle time for assertions
- Proper chart cleanup on unmount (no memory leaks)
- Responsive width (fills container, handles resize)

### Must NOT Have (Guardrails)

- NO API integration or real exchange data
- NO form field binding (selected candle does NOT set `startTime` or any form field)
- NO multiple markers or marker accumulation
- NO timeframe/trading-pair controls or toolbar
- NO volume bars, OHLC tooltip overlay, or crosshair legend panel
- NO modification to `client/src/components/ui/chart.tsx` (Recharts wrapper — unrelated)
- NO generic chart abstraction, context provider, or shared chart hook
- NO persistence (localStorage, URL params, form state, API calls)
- NO refactoring of existing NewTransaction layout sections
- NO over-commented code or JSDoc on every line

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, server-side only)
- **Automated tests**: None for this feature — Vitest is configured for `server/**/*.test.ts` only. No client-side test infrastructure.
- **Framework**: Vitest (server only) — NOT expanding client test setup for this task
- **Rationale**: This is a visual/interactive component. Pure logic (mock data gen) is trivial. Playwright QA is the right verification method.

### QA Policy

Every task includes agent-executed QA scenarios using Playwright for UI verification.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate to `/transactions/new`, interact with chart, assert DOM state, capture screenshots
- **Build/Type checks**: Use Bash — `npm run check`, `npm run build`, `npm run test`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Install lightweight-charts + create mock data utility [quick]

Wave 2 (After Wave 1 — component + integration):
├── Task 2: Create CandlestickChart component with click-to-mark [visual-engineering]
├── Task 3: Integrate chart into NewTransaction page [quick]

Wave FINAL (After ALL tasks — verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 3 → F1-F4 → user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| 1     | —          | 2, 3   | 1     |
| 2     | 1          | 3      | 2     |
| 3     | 2          | F1-F4  | 2     |
| F1-F4 | 3          | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `quick`
- **Wave 2**: **2 tasks** — T2 → `visual-engineering`, T3 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Install lightweight-charts and create mock OHLC data utility

  **What to do**:
  - Run `npm install lightweight-charts` to add the dependency
  - Create `client/src/lib/mockCandleData.ts` with a deterministic mock OHLC data generator
  - The generator function `generateMockCandles(count: number): CandlestickData<string>[]` should:
    - Produce `count` candles of realistic BTC/USDT 1H-like price data
    - Use a seeded random walk starting from a fixed base price (e.g., 42000)
    - Use a simple linear congruential generator (LCG) seeded with a fixed seed (e.g., `seed = 12345`) — NOT `Math.random()`
    - Each candle: generate open from previous close, apply random walk for high/low/close with realistic wicks
    - Time values as `'YYYY-MM-DD'` strings starting from `'2024-01-01'`, incrementing by 1 day per candle
    - Default export of pre-generated data: `export const MOCK_CANDLE_DATA = generateMockCandles(80);`
  - Verify: `npm run check` passes with the new file

  **Must NOT do**:
  - Do NOT use `Math.random()` — must be deterministic
  - Do NOT fetch any external data
  - Do NOT add any React components in this file — pure data utility only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple npm install + single utility file with pure functions
  - **Skills**: []
    - No special skills needed for a data utility

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundation task)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `client/src/lib/confidence.ts` — Example of a pure utility module in the `lib/` directory with named exports. Follow the same file organization pattern.

  **API/Type References**:
  - lightweight-charts `CandlestickData<string>` type — Each candle needs `{ time: string, open: number, high: number, low: number, close: number }`. Import from `'lightweight-charts'`.
  - lightweight-charts docs on time formats: time as `'YYYY-MM-DD'` string is the simplest format.

  **External References**:
  - Official docs: https://tradingview.github.io/lightweight-charts/docs — CandlestickData type and time format

  **WHY Each Reference Matters**:
  - `confidence.ts` shows how this repo organizes pure utility functions in `lib/` — follow the same export pattern
  - The CandlestickData type ensures the mock data is directly compatible with `series.setData()`

  **Acceptance Criteria**:
  - [ ] `package.json` includes `lightweight-charts` as a dependency
  - [ ] `client/src/lib/mockCandleData.ts` exists and exports `generateMockCandles` and `MOCK_CANDLE_DATA`
  - [ ] `MOCK_CANDLE_DATA` has exactly 80 entries
  - [ ] Each entry has `time`, `open`, `high`, `low`, `close` — all numbers positive, `high >= max(open, close)`, `low <= min(open, close)`
  - [ ] Calling `generateMockCandles(80)` twice produces identical output (deterministic)
  - [ ] `npm run check` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Mock data is valid and deterministic
    Tool: Bash (node/bun)
    Preconditions: Task 1 complete, dependencies installed
    Steps:
      1. Run: node -e "const m = require('./client/src/lib/mockCandleData.ts'); ..." — NOTE: Since this is TS, use tsx or verify via npm run check + build instead
      2. Run: npm run check — verify no type errors
      3. Grep mockCandleData.ts for Math.random — must find 0 matches
    Expected Result: npm run check exits 0, no Math.random found
    Evidence: .sisyphus/evidence/task-1-mock-data-valid.txt

  Scenario: Dependency installed correctly
    Tool: Bash
    Preconditions: npm install lightweight-charts completed
    Steps:
      1. Run: node -e "require('lightweight-charts')" — verify no module-not-found error
      2. Check package.json contains "lightweight-charts"
    Expected Result: No errors, dependency listed in package.json
    Evidence: .sisyphus/evidence/task-1-dependency-installed.txt
  ```

  **Commit**: YES
  - Message: `feat(chart): add lightweight-charts dependency and mock OHLC data generator`
  - Files: `package.json`, `package-lock.json`, `client/src/lib/mockCandleData.ts`
  - Pre-commit: `npm run check`

- [ ] 2. Create CandlestickChart component with click-to-mark interaction

  **What to do**:
  - Create `client/src/components/CandlestickChart.tsx` — a reusable candlestick chart component
  - Component interface:
    ```typescript
    interface CandlestickChartProps {
      data: CandlestickData<string>[];
      onCandleSelect?: (time: string) => void; // callback for future form binding
      className?: string;
    }
    ```
  - Implementation using `useRef` + `useEffect` pattern:
    1. Create container `div` with `ref`, add `data-testid="candlestick-chart-container"`
    2. In `useEffect`:
       - `createChart(containerRef.current, options)` with fixed dark theme options:
         - Background: `{ type: ColorType.Solid, color: '#131722' }` (TradingView dark)
         - Text color: `'#d1d4dc'`
         - Grid lines: `'#1e222d'`
       - `chart.addSeries(CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' })`
       - `series.setData(data)`
       - `chart.timeScale().fitContent()`
    3. Click handling with `chart.subscribeClick(param => ...)`:
       - If `param.time` exists (clicked on a candle), update selected time state
       - Use `createSeriesMarkers(series, [marker])` to place a single `arrowUp` marker `belowBar` in color `#2962FF` (bright blue) with text `'Entry'`
       - If clicking a different candle, replace the marker (always exactly 1 marker)
       - If `param.time` is undefined (clicked empty space), do nothing (keep existing marker)
       - Call `onCandleSelect?.(timeString)` when selection changes
    4. Store selected time in component state, expose via `data-selected-time` attribute on the container div
    5. Resize handling: Use `ResizeObserver` on the container element to call `chart.applyOptions({ width: container.clientWidth })`. Clean up observer in useEffect return.
    6. Cleanup in useEffect return: `chart.remove()` + disconnect ResizeObserver
  - The component renders ONLY the chart div (no Card wrapper — that's the integration task's job)
  - Height: accept via `style` or default `400px`

  **Must NOT do**:
  - Do NOT wrap in Card/CardHeader — integration task handles that
  - Do NOT add any form state, localStorage, or API calls
  - Do NOT support multiple markers or marker accumulation
  - Do NOT add timeframe controls, toolbar, volume, or tooltip panels
  - Do NOT create a React context or shared hook for the chart
  - Do NOT use the existing `client/src/components/ui/chart.tsx` (Recharts wrapper — unrelated)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Frontend component with DOM lifecycle, canvas rendering, event handling, and visual interaction
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 for lightweight-charts types)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:
  - `client/src/components/CloseTradeModal.tsx` — Example of a custom component in the `components/` directory. Follow naming pattern (PascalCase, default export or named export).
  - `client/src/components/ui/card.tsx` — Card composition pattern used in the integration task. Read this to understand Card API but do NOT use Card in this component.

  **API/Type References**:
  - lightweight-charts `createChart(container, options)` — Returns `IChartApi`
  - lightweight-charts `chart.addSeries(CandlestickSeries, styleOptions)` — Returns `ISeriesApi`
  - lightweight-charts `chart.subscribeClick(handler)` — Handler receives `MouseEventParams` with `.time` and `.seriesData`
  - lightweight-charts `createSeriesMarkers(series, markers[])` — Sets markers array on a series. Import from `'lightweight-charts'`.
  - lightweight-charts `SeriesMarker<Time>` type — `{ time, position, shape, color, text, size }`
  - lightweight-charts `ColorType.Solid` — For background type enum
  - lightweight-charts `CandlestickData<string>` — For props typing

  **External References**:
  - React integration tutorial: https://tradingview.github.io/lightweight-charts/tutorials/react/simple — useRef + useEffect pattern with cleanup
  - Series markers tutorial: https://tradingview.github.io/lightweight-charts/tutorials/how_to/series-markers — createSeriesMarkers API usage
  - Official API: https://tradingview.github.io/lightweight-charts/docs/api — IChartApi.subscribeClick, MouseEventParams

  **WHY Each Reference Matters**:
  - The React tutorial shows the exact `useEffect` lifecycle pattern with `chart.remove()` cleanup — prevents memory leaks
  - The markers tutorial shows `createSeriesMarkers()` usage — the v5 API for setting markers on a series
  - `CloseTradeModal.tsx` shows how custom components are organized in this repo

  **Acceptance Criteria**:
  - [ ] `client/src/components/CandlestickChart.tsx` exists
  - [ ] Component accepts `data`, `onCandleSelect?`, `className?` props
  - [ ] `npm run check` exits 0
  - [ ] `npm run build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Chart renders with candles on the page
    Tool: Playwright (playwright-e2e-testing skill)
    Preconditions: Dev server running, Task 1 mock data available. Temporarily render chart standalone or via Task 3 integration.
    Steps:
      1. Navigate to /transactions/new (if Task 3 done) or a test harness page
      2. Wait for [data-testid="candlestick-chart-container"] to be visible
      3. Assert the container contains a <canvas> element (lightweight-charts renders to canvas)
      4. Screenshot the chart container
    Expected Result: Chart container visible with canvas child element
    Failure Indicators: Container missing, no canvas element, JS errors in console
    Evidence: .sisyphus/evidence/task-2-chart-renders.png

  Scenario: Click candle adds marker and sets selected time
    Tool: Playwright
    Preconditions: Chart rendered with mock data
    Steps:
      1. Get the chart container bounding box via [data-testid="candlestick-chart-container"]
      2. Click at the center of the chart (approximately where candles are)
      3. Wait 500ms for marker render
      4. Read [data-selected-time] attribute from the container div
      5. Assert [data-selected-time] is not empty (a time value was selected)
      6. Screenshot the chart
    Expected Result: data-selected-time contains a date string like "2024-01-XX"
    Failure Indicators: data-selected-time is empty or missing, no visual change
    Evidence: .sisyphus/evidence/task-2-click-marks-candle.png

  Scenario: Click different candle moves marker (single marker only)
    Tool: Playwright
    Preconditions: Chart rendered, one candle already selected
    Steps:
      1. Read current [data-selected-time] value (call it T1)
      2. Click at a different X position in the chart (e.g., 100px left or right of center)
      3. Wait 500ms
      4. Read new [data-selected-time] value (call it T2)
      5. Assert T2 !== T1 (marker moved to a different candle)
      6. Screenshot
    Expected Result: Selected time changed, only one marker visible
    Failure Indicators: T2 === T1 (didn't move), multiple markers visible
    Evidence: .sisyphus/evidence/task-2-click-moves-marker.png

  Scenario: Click empty space does not clear marker
    Tool: Playwright
    Preconditions: Chart rendered, one candle selected
    Steps:
      1. Read current [data-selected-time] value
      2. Click at the very top edge of the chart (above candles, in the price scale area)
      3. Wait 500ms
      4. Read [data-selected-time] again
      5. Assert value unchanged
    Expected Result: data-selected-time unchanged after clicking empty space
    Failure Indicators: data-selected-time becomes empty or changes
    Evidence: .sisyphus/evidence/task-2-click-empty-no-change.png
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `feat(chart): add candlestick chart with click-to-mark to new trade page`
  - Files: `client/src/components/CandlestickChart.tsx`, `client/src/pages/NewTransaction.tsx`
  - Pre-commit: `npm run check && npm run build && npm run test`

- [ ] 3. Integrate CandlestickChart into NewTransaction page

  **What to do**:
  - Edit `client/src/pages/NewTransaction.tsx` to add the chart above the Trade Details form card
  - Exact insertion point: In the left column (`<div className="lg:col-span-2 space-y-6">`), AFTER the Trading Elements Selection card (lines 219-286) and BEFORE the Trade Details card (the next `<Card>` after elements section)
  - Integration structure:
    ```tsx
    {
      /* Candlestick Chart */
    }
    <Card data-testid="candlestick-chart-card">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <CandlestickChartIcon className="h-5 w-5" />{" "}
          {/* Use BarChart3 from lucide-react */}
          Price Chart
        </CardTitle>
        <CardDescription className="text-subtitle">
          Click a candle to mark the entry point
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CandlestickChart data={MOCK_CANDLE_DATA} />
      </CardContent>
    </Card>;
    ```
  - Add imports at top of file:
    - `import CandlestickChart from "@/components/CandlestickChart";` (or named import based on component export)
    - `import { MOCK_CANDLE_DATA } from "@/lib/mockCandleData";`
    - `import { BarChart3 } from "lucide-react";` (icon for the card header — matches existing icon pattern with `Layers`, `AlertCircle`, `Gauge`, `Tag`)
  - The chart uses fixed mock data — no connection to form state whatsoever
  - Pass NO `onCandleSelect` callback for now — the interaction is self-contained in the chart component

  **Must NOT do**:
  - Do NOT connect chart selection to any form field (startTime, tradingPair, etc.)
  - Do NOT add state to NewTransaction for the selected candle
  - Do NOT modify the existing form cards, sidebar, or layout grid
  - Do NOT add conditional rendering based on form state
  - Do NOT modify the existing imports' grouping style — follow the file's current import organization

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple integration — add imports and insert one JSX block into existing page. No logic changes.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 2 for the component)
  - **Parallel Group**: Wave 2 (after Task 2, can be done in same agent session)
  - **Blocks**: Final Verification
  - **Blocked By**: Task 2

  **References** (CRITICAL):

  **Pattern References**:
  - `client/src/pages/NewTransaction.tsx:219-286` — Trading Elements Selection card section. The new chart Card goes IMMEDIATELY AFTER this section and BEFORE the Trade Details card.
  - `client/src/pages/NewTransaction.tsx:166-217` — Trading System Banner card. Shows the Card composition pattern used in this page (Card > CardContent with flex layout, or Card > CardHeader > CardTitle > CardContent).
  - `client/src/pages/NewTransaction.tsx:1-27` — Import section. Shows how this file organizes imports: shadcn/ui components first, then utilities, then hooks/contexts, then React, then router, then toast, then icons.

  **API/Type References**:
  - `client/src/components/CandlestickChart.tsx` — The component created in Task 2 (props: `data`, `onCandleSelect?`, `className?`)
  - `client/src/lib/mockCandleData.ts` — Exports `MOCK_CANDLE_DATA` (array of 80 CandlestickData objects)

  **WHY Each Reference Matters**:
  - Lines 219-286 are the exact insertion boundary — the executor must find this location to place the chart card correctly
  - Lines 166-217 show how other Card sections look in this page — match the same structure (icon + title + description + content)
  - Lines 1-27 show the import convention — don't break the existing grouping

  **Acceptance Criteria**:
  - [ ] `/transactions/new` shows the chart card above the Trade Details form
  - [ ] Chart card has title "Price Chart" and description "Click a candle to mark the entry point"
  - [ ] Chart card has `data-testid="candlestick-chart-card"`
  - [ ] Chart renders inside the Card with visible candles
  - [ ] Existing form fields still work (can fill trading pair, select timeframe, etc.)
  - [ ] `npm run check` exits 0
  - [ ] `npm run build` exits 0
  - [ ] `npm run test` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Chart card visible in correct position on New Trade page
    Tool: Playwright (playwright-e2e-testing skill)
    Preconditions: Dev server running at localhost:5173 (or configured port), user logged in
    Steps:
      1. Navigate to /transactions/new
      2. Wait for page to fully load (wait for [data-testid="candlestick-chart-card"])
      3. Assert [data-testid="candlestick-chart-card"] is visible
      4. Assert card contains text "Price Chart"
      5. Assert card contains text "Click a candle to mark the entry point"
      6. Verify card position: it should appear BEFORE the Trade Details form fields (trading pair input, timeframe select)
      7. Full-page screenshot
    Expected Result: Chart card visible above form, with correct title and description
    Failure Indicators: Card missing, wrong position, title/description mismatch
    Evidence: .sisyphus/evidence/task-3-chart-on-page.png

  Scenario: Full interaction flow — select candle then fill form
    Tool: Playwright
    Preconditions: Dev server running, user logged in, on /transactions/new
    Steps:
      1. Wait for chart card to load
      2. Click center of chart canvas to select a candle
      3. Wait 500ms
      4. Assert [data-selected-time] has a value
      5. Scroll down to form fields
      6. Fill trading pair field with "BTCUSDT"
      7. Select timeframe "1H"
      8. Assert no JS console errors
      9. Screenshot
    Expected Result: Chart interaction works, form still functional, no errors
    Failure Indicators: Form fields broken, JS errors after chart interaction
    Evidence: .sisyphus/evidence/task-3-full-flow.png

  Scenario: Chart has fixed dark theme regardless of app theme
    Tool: Playwright
    Preconditions: Dev server running, on /transactions/new
    Steps:
      1. Take screenshot of chart in default (light) app theme
      2. Toggle app theme to dark mode (click theme toggle if accessible)
      3. Take screenshot of chart in dark app theme
      4. Compare: chart canvas should look identical in both screenshots (dark background stays dark)
    Expected Result: Chart appearance unchanged between app theme toggles
    Failure Indicators: Chart background changes color with app theme
    Evidence: .sisyphus/evidence/task-3-theme-independence-light.png, .sisyphus/evidence/task-3-theme-independence-dark.png
  ```

  **Commit**: YES (combined with Task 2)
  - Message: `feat(chart): add candlestick chart with click-to-mark to new trade page`
  - Files: `client/src/components/CandlestickChart.tsx`, `client/src/pages/NewTransaction.tsx`
  - Pre-commit: `npm run check && npm run build && npm run test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check DOM). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `npm run check` + `npm run build` + `npm run test`. Review all changed/new files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod code, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify lightweight-charts is imported correctly (tree-shakeable). Verify chart cleanup in useEffect return.
      Output: `Build [PASS/FAIL] | Check [PASS/FAIL] | Tests [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright-e2e-testing` skill)
      Start dev server. Navigate to `/transactions/new`. Verify chart card visible above form. Click a candle — verify marker appears. Click different candle — verify marker moves (only 1). Verify chart is dark themed. Toggle app theme — verify chart stays dark. Fill form fields after chart interaction — verify form still works. Resize window — verify chart redraws. Navigate away and back — verify no console errors. Save screenshots as evidence.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 match — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Check no form state changes, no API calls, no localStorage writes. Verify no changes to unrelated files.
      Output: `Tasks [N/N compliant] | Scope [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task | Message                                                                       | Files                                                                               | Pre-commit check                                 |
| ---------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1          | `feat(chart): add lightweight-charts dependency and mock OHLC data generator` | `package.json`, `package-lock.json`, `client/src/lib/mockCandleData.ts`             | `npm run check`                                  |
| 2+3        | `feat(chart): add candlestick chart with click-to-mark to new trade page`     | `client/src/components/CandlestickChart.tsx`, `client/src/pages/NewTransaction.tsx` | `npm run check && npm run build && npm run test` |

---

## Success Criteria

### Verification Commands

```bash
npm run check    # Expected: exits 0, no type errors
npm run build    # Expected: exits 0, production bundle created
npm run test     # Expected: exits 0, all existing server tests pass
```

### Final Checklist

- [ ] lightweight-charts installed in package.json
- [ ] Mock data utility creates deterministic OHLC candles
- [ ] CandlestickChart component renders candlestick chart
- [ ] Chart appears on `/transactions/new` above Trade Details form
- [ ] Click candle → marker appears (single marker only)
- [ ] Fixed dark theme, unaffected by app theme toggle
- [ ] `data-testid` and `data-selected-time` attributes present for QA
- [ ] Chart cleans up on unmount (no memory leaks)
- [ ] All "Must NOT Have" items absent from implementation
