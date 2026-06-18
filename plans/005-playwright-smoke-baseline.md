# Plan 005: Add Playwright smoke-test baseline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 153587a..HEAD -- playwright.config.ts package.json client/src/`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `153587a`, 2026-06-18

## Why this matters

The frontend has **zero** automated tests. The pages that handle real
money flow — `NewTransaction.tsx` (open a trade), `Transactions.tsx` +
`CloseTradeModal.tsx` (close a trade), `Dashboard.tsx` (read the
account snapshot) — total ~1,800 lines and are exercised only by manual
click-through.

Symptoms this enables:

- Any future UI refactor (most obviously splitting the 607-line
  `Transactions.tsx`) is a blind rewrite.
- A typo in a tRPC procedure name reaches localhost before anyone notices.
- The tRPC client/server contract is verified at the type level but not at
  the _behavioral_ level.

`playwright.config.ts` already exists and is wired for a `./e2e` test
directory, with `baseURL: "http://localhost:3000"`, Chromium-only, headless.
There is no `npm run test:e2e` script, no `e2e/` directory, and no actual
test file. This plan creates that baseline: a single
**create-account → log-trade → close-trade → see-it-in-list** smoke test
that takes <30s and pins the golden path.

It does NOT attempt to cover everything. A larger fixture sweep is a
follow-on plan.

## Current state

Relevant files:

- `playwright.config.ts` — exists, configured. Excerpt:

  ```ts
  // playwright.config.ts (entire file at planned-at commit)
  import { defineConfig, devices } from "@playwright/test";

  export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: "list",

    use: {
      baseURL: "http://localhost:3000",
      trace: "on-first-retry",
      screenshot: "on",
      headless: true,
    },

    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  });
  ```

- `package.json` — `@playwright/test ^1.59.1` is already in `devDependencies`;
  no `test:e2e` script exists.

- `e2e/` — directory **does not exist** yet.

- The dev server runs on port 3000 by default (`server/_core/index.ts`).
  Database lives in `./data/crypto-trading-journal.sqlite` (per
  `server/_core/databasePath.ts`). The tRPC anonymous user auto-creates on
  first request.

UI labels to anchor selectors against (from the live pages at the
planned-at commit; confirm with Read before writing the selectors):

- Dashboard layout sidebar (`client/src/components/DashboardLayout.tsx:27-33`):
  menu items literally labeled "Dashboard", "Transactions", "New Trade",
  "Accounts", "Settings".
- `Transactions.tsx:202-204`: header has a `<Button asChild><Link href="/transactions/new">new trade</Link></Button>` — the link text is lowercase
  "new trade".
- `Transactions.tsx:560-567`: empty state has the text "no trades recorded."
  and a button "log a trade".
- `Accounts.tsx`: form for creating a new account; read this file before
  writing the selectors so you anchor on what's actually rendered.
- `NewTransaction.tsx`: a long form. **Anchor selectors on `<label for>` /
  field accessible-name combinations, not deep DOM paths**, so the test
  survives the page-component refactor that's coming.

Repo conventions:

- TypeScript strict; no `any`. Playwright's `Page`, `Locator`, `expect`
  types are well-typed — use them.
- Prettier formats. Settle the test file with `npm run format` before
  committing.
- Test files in `server/` end in `.test.ts` and run under Vitest; the
  `e2e/` directory is exclusively Playwright. Don't cross-contaminate.
- `vitest.config.ts` includes `server/**/*.test.ts` only — `e2e/` is
  invisible to Vitest, so file extension doesn't matter, but use `.spec.ts`
  for clarity:

## Commands you will need

| Purpose                  | Command                           | Expected on success                          |
| ------------------------ | --------------------------------- | -------------------------------------------- |
| Install                  | `npm install`                     | exit 0                                       |
| Install browser binaries | `npx playwright install chromium` | exit 0; chromium downloaded (only first run) |
| Typecheck                | `npm run check`                   | exit 0                                       |
| Vitest                   | `npm run test`                    | unaffected; all pass                         |
| Playwright (new script)  | `npm run test:e2e`                | new: all tests pass                          |
| Dev server (background)  | `npm run dev`                     | listens on :3000                             |
| Format                   | `npm run format`                  | exit 0                                       |

## Scope

**In scope** (create / modify):

- Create: `e2e/smoke.spec.ts` (the smoke test).
- Create: `e2e/helpers.ts` (small file with reusable navigation helpers, only
  if you actually share two or more steps; otherwise inline everything in
  the spec and skip this file — the audit specifically warns against
  premature abstraction).
- Modify: `package.json` — add `"test:e2e": "playwright test"` script.
- Modify: `CLAUDE.md` — add the new command to the "Commands" section,
  matching the existing format. One line.
- Modify: `.gitignore` — add `playwright-report/` and `test-results/` if
  not already ignored (Playwright writes there). Check first:

  ```
  grep -n "playwright-report\|test-results" .gitignore
  ```

**Out of scope**:

- Setting up a CI workflow that runs Playwright in GitHub Actions / similar.
  Local-only is fine for this plan.
- Resetting / seeding the database between test runs (single-tenant, single
  database). The test must be **idempotent**: pick account/trade names that
  encode a timestamp or random suffix so re-runs against the same DB don't
  collide.
- Visual regression / screenshot comparison testing. `screenshot: "on"` in
  the config writes screenshots on failure; that's enough for now.
- Mobile viewport testing.

## Git workflow

- Branch: `advisor/005-playwright-smoke-baseline`.
- One commit. Suggested message:
  `test: add playwright smoke baseline for trade lifecycle`.

## Steps

### Step 1: Install the browser binary

```
npx playwright install chromium
```

This downloads Chromium under `~/.cache/ms-playwright/`. First run takes
a minute. Subsequent runs are no-ops.

If the command fails with a network error, STOP and report — there is no
useful fallback.

### Step 2: Read the live pages

Before writing the spec, open these files and note the actual labels and
field names you'll be selecting against:

- `client/src/pages/Accounts.tsx` — what does "create account" look like
  today? What's the submit button text? What input is the account name?
- `client/src/pages/NewTransaction.tsx` — find every required field. The
  `tradingPair`, `timeFrame`, `startTime`, `direction`, `context`,
  `marketCycle`, `transactionType`, `entryPrice`, `positionSizeUsdt`,
  `plannedStopLossPrice`, `plannedTakeProfitPrice` are mandatory per
  `server/routers.ts:99-118`.
- `client/src/components/CloseTradeModal.tsx` — what's the close form? At
  minimum `endTime` and `exitPrice` per `server/routers.ts:212-218`.

**Do not skim**. The test will be brittle if your selectors don't match
reality. Take notes on a scratchpad.

### Step 3: Add the npm script

Edit `package.json`. In the `"scripts"` block, add:

```json
"test:e2e": "playwright test",
```

Keep alphabetical order if that's the convention (it isn't strictly in this
repo — match neighbors). Suggested placement: right after `"test"`.

**Verify**:

```
cat package.json | grep -A1 '"test"'
```

Should show both `"test"` (vitest) and `"test:e2e"` (playwright).

### Step 4: Write `e2e/smoke.spec.ts`

Create the directory and file:

```
mkdir -p e2e
```

The spec MUST:

1. Use Playwright's `test` and `expect` from `@playwright/test`.
2. Generate a unique identifier per run (e.g.
   `const runId = String(Date.now())`) so account / trading-pair / context
   text never collide with prior runs.
3. Use accessible-name selectors (`page.getByRole`, `page.getByLabel`)
   rather than CSS / XPath, so the test survives the upcoming page-split
   refactor.
4. Cover this single golden path:
   - Navigate to `/`. Expect the dashboard to render (assert some stable
     bit of chrome, e.g. the sidebar link "Transactions").
   - Navigate to `/accounts`. Create a new account named
     `smoke-${runId}` with initial balance `1000`. Expect it to appear in
     the list.
   - Switch the AccountSwitcher to the new account.
   - Navigate to `/transactions/new`. Fill the required fields:
     - tradingPair: `BTCUSDT` (or whatever the input accepts; uppercase
       is normalized server-side per `server/routers.ts:148`).
     - timeFrame: pick the first option from `TIME_FRAMES` in
       `NewTransaction.tsx:28`.
     - startTime: current time minus 1 hour (Playwright `Date.now()` is
       fine here — the test runs **inside the browser timeline**, so this
       is allowed despite the workflow harness's `Date.now` rule).
     - direction: `long`.
     - context: `smoke ${runId} context`.
     - marketCycle: `Upward Trend`.
     - transactionType: `Trend`.
     - entryPrice: `40000`.
     - positionSizeUsdt: `100`.
     - plannedStopLossPrice: `39000`.
     - plannedTakeProfitPrice: `42000`.
   - Submit. Expect navigation to `/transactions` (or wherever the success
     handler lands — confirm during Step 2).
   - Navigate to `/transactions`. Expect a row containing `BTCUSDT` with
     `[open]` marker (per `Transactions.tsx:397-403`).
   - Click "close →" on that row. In the modal, set `endTime` to current
     time and `exitPrice` to `41000`. Submit.
   - Expect the row to update — outcome `win`, balance increased.

The test should run in under 30 seconds locally. If it takes longer, the
selectors are wrong or the dev server is slow; investigate before adding
`test.slow()` workarounds.

Target shape (illustrative — write the real assertions against the live
UI you read in Step 2):

```ts
// e2e/smoke.spec.ts
import { test, expect } from "@playwright/test";

test("create account, log open trade, close it, see win", async ({ page }) => {
  const runId = String(Date.now());

  await page.goto("/");
  await expect(page.getByRole("link", { name: /transactions/i })).toBeVisible();

  await page.getByRole("link", { name: /accounts/i }).click();
  // ... fill the create-account form, anchored on getByLabel(...) ...

  await page.getByRole("link", { name: /new trade/i }).click();
  // ... fill every required field, anchored on getByLabel(...) ...

  await page.getByRole("link", { name: /^transactions$/i }).click();
  const row = page.getByRole("row", { name: new RegExp(`BTCUSDT.*${runId}`) });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: /close/ }).click();
  // ... fill close-modal fields ...

  await expect(row).toContainText("win");
});
```

### Step 5: Update `.gitignore` if needed

```
grep -n "playwright-report\|test-results" .gitignore
```

If either is missing, append (preserving the file's existing comment style):

```
# Playwright outputs
playwright-report/
test-results/
```

Note: `test-results/` already exists in the repo today (it's the directory
listing in the recon). Confirm it's already ignored or that committing
into it isn't a regression before changing.

### Step 6: Update CLAUDE.md "Commands" section

In the `## Commands` section of `CLAUDE.md` (around the existing test
commands), add a line in the same style:

```
npm run test:e2e    # Playwright smoke (requires `npx playwright install chromium` once)
```

Match the existing comment column / spacing.

### Step 7: Run the test against a live dev server

In one terminal:

```
npm run dev
```

Wait for `Server running on http://localhost:3000/`.

In another terminal:

```
npm run test:e2e
```

**Verify**: exits 0; the single spec passes.

If it fails:

- The first failure mode you'll see is a selector mismatch. Use
  `npx playwright test --debug` to step through; fix selectors. Don't add
  `await page.waitForTimeout(…)` — that's a smell. Use Playwright's
  auto-waiting + `expect().toBeVisible({ timeout })` instead.
- If the test creates the account but the row never appears in the list,
  the tRPC invalidation might be slow; allow up to a 5s expect timeout but
  never higher than that — if you need higher, the bug is real.
- If the server is bound to `127.0.0.1` (Plan 001 has landed) and
  Playwright can't connect, double-check the dev server is actually running.
  `curl http://localhost:3000/` should return 200.

### Step 8: Run typecheck, vitest, format

```
npm run check
npm run test
npm run format
```

All three must exit 0.

## Test plan

The plan **is** the test plan. To be specific:

- One new file: `e2e/smoke.spec.ts`.
- One test: `"create account, log open trade, close it, see win"`.
- Coverage:
  - Account creation (`account.create` mutation).
  - Account selection (AccountContext localStorage round-trip).
  - Open trade (`transaction.create` mutation, planned R/R server compute).
  - Close trade (`transaction.close` mutation, outcome / return / streak
    server compute, balance roll-up).
  - List view (`transaction.list` query, status badge, outcome rendering).

What is **not** covered (and should be in a follow-on plan):

- Loss & breakeven outcomes.
- Account deletion guard ("cannot delete the last account").
- Filter / sort UI state.
- Review step (closed → reviewed transition).
- Trade item tagging / context editing.

## Done criteria

ALL must hold:

- [ ] `e2e/smoke.spec.ts` exists and runs.
- [ ] `package.json` has `"test:e2e": "playwright test"` in `scripts`.
- [ ] `CLAUDE.md` "Commands" section lists `npm run test:e2e` with a
      one-line note about the one-time `playwright install chromium` step.
- [ ] `.gitignore` ignores Playwright's `playwright-report/` and
      `test-results/` directories (already present is fine).
- [ ] `npm run test:e2e` exits 0 against a fresh `npm run dev`.
- [ ] `npm run check` exits 0.
- [ ] `npm run test` exits 0 (unaffected).
- [ ] The spec is idempotent: running it twice in a row against the same
      database both times produces a pass.
- [ ] No selectors use raw `nth-child` / `xpath=…` / brittle CSS chains.
- [ ] `plans/README.md` status row updated to DONE.

## STOP conditions

Stop and report back (do not improvise) if:

- `npx playwright install chromium` fails (no network / disk).
- The smoke test passes only when run against an empty database — i.e.
  it's not idempotent. Fix the test (use the `runId` everywhere) rather
  than wiring database resets.
- Any test fails with a tRPC `FORBIDDEN` error — the account-ownership
  guard didn't see your created account. The AccountContext switch may not
  have completed before the new-trade form rendered; investigate the
  invalidation, do not loosen the guard.
- The test wants to wait longer than 5 seconds for any single `expect()`
  to succeed. That's a real bug in the page, not a flake.
- You feel the urge to write more than one spec file in this plan. That's
  scope creep — write the second spec in a follow-on plan after the smoke
  baseline is reviewed.

## Maintenance notes

- The next plan that should ride on this baseline is "split
  `Transactions.tsx` / `NewTransaction.tsx` into ≤200-line components".
  Don't start that refactor without this smoke green.
- If the test starts being flaky in CI / under load, prefer fixing the page
  to fixing the test (await-for-condition over `waitForTimeout`).
- When adding the loss / breakeven cases, factor the duplicated
  "create-account + log-open-trade" steps into a fixture in
  `e2e/helpers.ts` — but only when you have at least two specs sharing it.
  Three would be better. One spec = inline.
