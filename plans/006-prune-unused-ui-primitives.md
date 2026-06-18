# Plan 006: Prune unused shadcn UI primitives and their dependencies

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8f09a1d..HEAD -- client/src/components/ui package.json package-lock.json vite.config.ts`
> If `client/src/components/ui/*.tsx`, `package.json`, or `package-lock.json`
> changed since this plan was written, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt / security
- **Planned at**: commit `8f09a1d`, 2026-06-18

## Why this matters

`client/src/components/ui/` holds 53 shadcn primitives. The app actually
imports exactly 13 of them (closure of imports starting from non-`ui/` files);
the other 40 are template scaffolding that survived the prior cleanup
(plan 004). Each surviving primitive drags in a dedicated `@radix-ui/react-*`
package plus, in several cases, a heavier third-party dep (`recharts`,
`react-day-picker`, `react-hook-form`, `embla-carousel-react`, `cmdk`,
`vaul`, `input-otp`, `react-resizable-panels`, `framer-motion`,
`@hookform/resolvers`).

Two concrete payoffs:

1. **Eliminates the only `lodash` vulnerability chain.**
   `npm audit` reports two HIGH-severity advisories against
   `lodash@4.17.23` (code injection via `_.template`, prototype pollution in
   `_.unset`/`_.omit`). `npm ls lodash` shows `recharts → lodash` is the
   sole path, and `recharts` is imported only by the unused
   `client/src/components/ui/chart.tsx`. Deleting that file lets `recharts`
   (and therefore `lodash`) drop out of the tree.
2. **Removes ~40 files and 29 deps from the search/grep/AI-context surface.**
   The journal is a single-trader local app with a Bench Notebook design
   system; the shadcn primitives' rounded-corner / pastel-card semantics
   actively conflict with `DESIGN.md`'s `--radius: 0` / no-card rules.

## Current state

### Files that ARE imported by app code (keep)

13 primitives are reachable from non-`ui/` files (directly or transitively
via another kept primitive):

```
client/src/components/ui/
  alert-dialog.tsx   button.tsx       dialog.tsx
  dropdown-menu.tsx  input.tsx        label.tsx
  separator.tsx      sheet.tsx        sidebar.tsx
  skeleton.tsx       sonner.tsx       textarea.tsx
  tooltip.tsx
```

Verify (from repo root):

```bash
# Every primitive imported by a non-ui file:
grep -rln '@/components/ui/' --include='*.ts' --include='*.tsx' client/src \
  | grep -v '/components/ui/' \
  | xargs grep -h '@/components/ui/' \
  | sed -n 's/.*@\/components\/ui\/\([a-z-]*\).*/\1/p' | sort -u
# Expected (10 lines):
#   alert-dialog
#   button
#   dialog
#   dropdown-menu
#   input
#   label
#   sidebar
#   sonner
#   textarea
#   tooltip

# Plus what sidebar.tsx imports transitively:
grep '@/components/ui/' client/src/components/ui/sidebar.tsx
# Expected lines reference: button, input, separator, sheet, skeleton, tooltip
```

### Files to DELETE (40 primitives — zero non-ui importers)

```
client/src/components/ui/
  accordion.tsx       alert.tsx           aspect-ratio.tsx
  avatar.tsx          badge.tsx           breadcrumb.tsx
  button-group.tsx    calendar.tsx        card.tsx
  carousel.tsx        chart.tsx           checkbox.tsx
  collapsible.tsx     command.tsx         context-menu.tsx
  drawer.tsx          empty.tsx           field.tsx
  form.tsx            hover-card.tsx      input-group.tsx
  input-otp.tsx       item.tsx            kbd.tsx
  menubar.tsx         navigation-menu.tsx pagination.tsx
  popover.tsx         progress.tsx        radio-group.tsx
  resizable.tsx       scroll-area.tsx     select.tsx
  slider.tsx          spinner.tsx         switch.tsx
  table.tsx           tabs.tsx            toggle-group.tsx
  toggle.tsx
```

Verify each file has zero non-self importers:

```bash
for f in accordion alert aspect-ratio avatar badge breadcrumb button-group \
         calendar card carousel chart checkbox collapsible command \
         context-menu drawer empty field form hover-card input-group \
         input-otp item kbd menubar navigation-menu pagination popover \
         progress radio-group resizable scroll-area select slider spinner \
         switch table tabs toggle-group toggle; do
  hits=$(grep -rln "@/components/ui/$f\"" --include='*.ts' --include='*.tsx' \
    client server shared 2>/dev/null \
    | grep -v "client/src/components/ui/$f.tsx" | wc -l | tr -d ' ')
  if [ "$hits" != "0" ]; then echo "STILL USED: $f ($hits)"; fi
done
# Expected output: empty (no "STILL USED" lines)
```

### Dependencies to DROP from `package.json`

Drop because their sole importer is one of the deleted UI files:

| Dep | Sole importer (about to be deleted) |
| --- | --- |
| `@hookform/resolvers` | (none — zero importers already) |
| `@radix-ui/react-accordion` | `ui/accordion.tsx` |
| `@radix-ui/react-aspect-ratio` | `ui/aspect-ratio.tsx` |
| `@radix-ui/react-avatar` | `ui/avatar.tsx` |
| `@radix-ui/react-checkbox` | `ui/checkbox.tsx` |
| `@radix-ui/react-collapsible` | `ui/collapsible.tsx` |
| `@radix-ui/react-context-menu` | `ui/context-menu.tsx` |
| `@radix-ui/react-hover-card` | `ui/hover-card.tsx` |
| `@radix-ui/react-menubar` | `ui/menubar.tsx` |
| `@radix-ui/react-navigation-menu` | `ui/navigation-menu.tsx` |
| `@radix-ui/react-popover` | `ui/popover.tsx` |
| `@radix-ui/react-progress` | `ui/progress.tsx` |
| `@radix-ui/react-radio-group` | `ui/radio-group.tsx` |
| `@radix-ui/react-scroll-area` | `ui/scroll-area.tsx` |
| `@radix-ui/react-select` | `ui/select.tsx` |
| `@radix-ui/react-slider` | `ui/slider.tsx` |
| `@radix-ui/react-switch` | `ui/switch.tsx` |
| `@radix-ui/react-tabs` | `ui/tabs.tsx` |
| `@radix-ui/react-toggle` | `ui/toggle.tsx` |
| `@radix-ui/react-toggle-group` | `ui/toggle-group.tsx` |
| `cmdk` | `ui/command.tsx` |
| `embla-carousel-react` | `ui/carousel.tsx` |
| `framer-motion` | (none — zero importers already) |
| `input-otp` | `ui/input-otp.tsx` |
| `react-day-picker` | `ui/calendar.tsx` |
| `react-hook-form` | `ui/form.tsx` |
| `react-resizable-panels` | `ui/resizable.tsx` |
| `recharts` | `ui/chart.tsx` (this also drops `lodash`) |
| `vaul` | `ui/drawer.tsx` |

KEEP (still imported, do NOT touch the line in `package.json`):

```
@hookform                            (not present after drop)
@radix-ui/react-alert-dialog         (alert-dialog.tsx)
@radix-ui/react-dialog               (dialog.tsx, sheet.tsx)
@radix-ui/react-dropdown-menu        (dropdown-menu.tsx)
@radix-ui/react-label                (label.tsx)
@radix-ui/react-separator            (separator.tsx)
@radix-ui/react-slot                 (button.tsx, sidebar.tsx)
@radix-ui/react-tooltip              (tooltip.tsx)
next-themes                          (sonner.tsx)
sonner                               (sonner.tsx + main App toaster)
class-variance-authority             (button.tsx, sidebar.tsx + many app callsites)
clsx, tailwind-merge                 (lib/utils.cn)
lucide-react                         (icons everywhere)
date-fns                             (lib/ledger fmtDate*)
lightweight-charts                   (components/CandlestickChart.tsx)
nanoid                               (server/_core/vite.ts)
superjson                            (trpc client + server)
dotenv                               (server/_core/index.ts: import "dotenv/config")
```

### Repo conventions

- `client/src/components/ui/*` files use shadcn patterns (`cva`,
  `data-slot`, `cn(...)`). Do not modify the survivors.
- Match the surrounding `package.json` formatting: two-space indent, no
  trailing whitespace, `@radix-ui/react-*` entries are alphabetised in the
  current file already — keep alphabetic order when removing lines.
- `client/public/__manus__/debug-collector.js` and
  `vite-plugin-manus-runtime` are **out of scope**; do not touch them.

## Commands you will need

| Purpose      | Command                       | Expected on success                |
| ------------ | ----------------------------- | ---------------------------------- |
| Install      | `npm install`                 | exit 0                             |
| Typecheck    | `npm run check`               | exit 0, zero errors                |
| Tests        | `npm test -- --run`           | all 104 tests pass                 |
| Format       | `npm run format`              | exit 0                             |
| Build        | `npm run build`               | exit 0, writes `dist/`             |
| E2E (smoke)  | `npm run test:e2e`            | smoke spec passes (run last)       |
| Audit        | `npm audit --omit=dev`        | no `lodash` or `recharts` advisories |

## Scope

**In scope**:

- Delete the 40 files listed above under "Files to DELETE".
- Edit `package.json`: drop the 29 listed dep lines.
- Edit `package-lock.json`: regenerate via `npm install`.

**Out of scope** (do NOT touch even though they look related):

- The 13 surviving UI primitives. They MUST remain byte-identical.
- `vite.config.ts`, `vite-plugin-manus-runtime`, `client/public/__manus__/*`
  — separate maintenance question.
- `client/src/components/CandlestickChart.tsx` — uses
  `lightweight-charts`, not `recharts`.
- `recharts`-style code anywhere else (none exists; do not invent uses).
- `pnpm.patchedDependencies.wouter@3.7.1` in `package.json` — repo uses npm.

## Git workflow

- Branch: `advisor/006-prune-unused-ui-primitives`.
- Commit style matches recent log: lowercase `chore: ...` /
  `chore: drop dependencies whose only callers were removed`-style imperative.
  Suggested split:
  1. `chore: delete unused shadcn UI primitive components`
  2. `chore: drop unused @radix-ui / template dependencies`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: confirm baseline

```bash
git status            # clean tree
git rev-parse HEAD    # record SHA for the drift check
npm install           # exit 0
npm run check         # exit 0
npm test -- --run     # 104 passed
```

**Verify**: all four commands exit 0; test count is 104.

### Step 2: delete the 40 unused UI files

```bash
cd client/src/components/ui
rm accordion.tsx alert.tsx aspect-ratio.tsx avatar.tsx badge.tsx \
   breadcrumb.tsx button-group.tsx calendar.tsx card.tsx carousel.tsx \
   chart.tsx checkbox.tsx collapsible.tsx command.tsx context-menu.tsx \
   drawer.tsx empty.tsx field.tsx form.tsx hover-card.tsx \
   input-group.tsx input-otp.tsx item.tsx kbd.tsx menubar.tsx \
   navigation-menu.tsx pagination.tsx popover.tsx progress.tsx \
   radio-group.tsx resizable.tsx scroll-area.tsx select.tsx slider.tsx \
   spinner.tsx switch.tsx table.tsx tabs.tsx toggle-group.tsx toggle.tsx
cd -
```

**Verify**:

```bash
ls client/src/components/ui/ | wc -l    # expected: 13
npm run check                            # expected: exit 0, no errors
```

If `tsc` errors here, a survivor still imports a deleted file — STOP and
report which `@/components/ui/<name>` the error mentions.

### Step 3: drop unused deps from `package.json`

Remove these exact lines from the `dependencies` block of `package.json`,
preserving the trailing-comma JSON syntax (the last entry must not have a
trailing comma):

```
"@hookform/resolvers": "^5.2.2",
"@radix-ui/react-accordion": "^1.2.12",
"@radix-ui/react-aspect-ratio": "^1.1.7",
"@radix-ui/react-avatar": "^1.1.10",
"@radix-ui/react-checkbox": "^1.3.3",
"@radix-ui/react-collapsible": "^1.1.12",
"@radix-ui/react-context-menu": "^2.2.16",
"@radix-ui/react-hover-card": "^1.1.15",
"@radix-ui/react-menubar": "^1.1.16",
"@radix-ui/react-navigation-menu": "^1.2.14",
"@radix-ui/react-popover": "^1.1.15",
"@radix-ui/react-progress": "^1.1.7",
"@radix-ui/react-radio-group": "^1.3.8",
"@radix-ui/react-scroll-area": "^1.2.10",
"@radix-ui/react-select": "^2.2.6",
"@radix-ui/react-slider": "^1.3.6",
"@radix-ui/react-switch": "^1.2.6",
"@radix-ui/react-tabs": "^1.1.13",
"@radix-ui/react-toggle": "^1.1.10",
"@radix-ui/react-toggle-group": "^1.1.11",
"cmdk": "^1.1.1",
"embla-carousel-react": "^8.6.0",
"framer-motion": "^12.23.22",
"input-otp": "^1.4.2",
"react-day-picker": "^9.11.1",
"react-hook-form": "^7.64.0",
"react-resizable-panels": "^3.0.6",
"recharts": "^2.15.2",
"vaul": "^1.1.2",
```

Make sure NOT to remove `@radix-ui/react-alert-dialog`,
`@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`,
`@radix-ui/react-label`, `@radix-ui/react-separator`,
`@radix-ui/react-slot`, `@radix-ui/react-tooltip`, `class-variance-authority`,
`next-themes`, or `sonner`.

Regenerate the lockfile:

```bash
npm install
```

**Verify**:

```bash
git diff --stat package.json package-lock.json   # both modified
grep -c '"recharts"' package.json                 # expected: 0
grep -c '"lodash"' package-lock.json              # expected: 0
npm run check                                     # exit 0
```

### Step 4: full verification gauntlet

```bash
npm run format               # exit 0
npm run check                # exit 0
npm test -- --run            # 104 passed (no test change expected)
npm run build                # exit 0
npm audit --omit=dev         # zero advisories naming lodash or recharts
npm run test:e2e             # smoke spec passes
```

If `npm run test:e2e` is skipped because Chromium isn't installed locally,
record that explicitly in the plan status update and run it before merge.

## Test plan

- No new tests; the existing 104 Vitest tests + Playwright smoke spec are the
  safety net.
- The smoke spec (`e2e/smoke.spec.ts`) exercises every user-visible primitive
  that we kept (dialog, button, label, input, sonner toast, sidebar, etc.).
- Verification: `npm test -- --run` and `npm run test:e2e` both green.

## Done criteria

Machine-checkable; ALL must hold:

- [ ] `ls client/src/components/ui/ | wc -l` returns `13`.
- [ ] `grep -c 'recharts\|lodash\|framer-motion\|@hookform/resolvers' package.json`
      returns `0`.
- [ ] `npm ls lodash 2>&1 | grep -c lodash` returns `0`
      (no `lodash` anywhere in the production tree).
- [ ] `npm run check` exits 0.
- [ ] `npm test -- --run` reports `Tests  104 passed (104)`.
- [ ] `npm run build` exits 0.
- [ ] `npm audit --omit=dev` reports no HIGH-severity advisories.
- [ ] `npm run test:e2e` passes (Playwright smoke).
- [ ] `git status` shows changes only to `client/src/components/ui/`,
      `package.json`, `package-lock.json`, and `plans/README.md`.
- [ ] `plans/README.md` row for plan 006 set to DONE.

## STOP conditions

Stop and report (do not improvise) if:

- `tsc` errors on Step 2 after deleting the listed files — a survivor or
  page-level file references one of the supposedly-unused primitives. Do not
  reintroduce the file; surface which import path failed.
- Any of the 104 unit tests fail after the changes. Test count is fixed; a
  failing test means a survivor primitive references something this plan
  intended to drop.
- `npm audit --omit=dev` still reports `lodash` after step 4 — the plan
  assumption "recharts is the only path to lodash" has drifted; report
  `npm ls lodash` output back.
- The drift check in the preamble shows
  `client/src/components/ui/*.tsx` or `package.json` has been edited since
  commit `8f09a1d`.

## Maintenance notes

- Next time a shadcn primitive is needed, copy the source from
  `npx shadcn@latest add <component>` rather than restoring the
  template scaffold — that way only what is actually used lands in
  `client/src/components/ui/`.
- `vite-plugin-manus-runtime` and `client/public/__manus__/debug-collector.js`
  are still in the tree (Manus debug instrumentation). Treat them as a
  separate decision: they only run in dev (`NODE_ENV === "development"`),
  and removing them is a larger discussion about whether this project
  still ships through the Manus sandbox.
- The `pnpm.patchedDependencies` block in `package.json` references
  `wouter@3.7.1`, but the project pins `wouter ^3.3.5` and uses `npm`,
  not `pnpm`. That metadata is inert and intentionally untouched here.
