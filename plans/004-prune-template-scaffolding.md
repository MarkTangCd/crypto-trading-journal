# Plan 004: Prune Manus-template scaffolding and unused dependencies

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 153587a..HEAD -- server/ client/src/ shared/ package.json`
> If any of these changed since this plan was written, re-do the audit grep
> in Step 1 before deleting anything. On a mismatch in the cited file
> locations, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (does NOT depend on 003, but works cleaner after it)
- **Category**: tech-debt
- **Planned at**: commit `153587a`, 2026-06-18

## Why this matters

This codebase was scaffolded from a "Manus WebDev" template that ships a
bag of integrations (LLM proxy, voice transcription, image generation,
Google Maps proxy, generic data API caller, owner-notification service,
S3-backed storage, an AI chat box widget, a Google Map React component, an
"open in Manus" dialog, a 1440-line component showcase, a `Home.tsx` page
that redirects to itself). **None of it is reachable from the application**:

- No tRPC procedure besides the unused `system.notifyOwner` calls any of
  the server helpers.
- No client page besides the unrouted `ComponentShowcase` references any of
  the orphan widgets.
- `system.notifyOwner` itself is exposed in the router but has no
  client-side caller.

Each unused file is a maintenance burden, a hiring-test red herring, and
(in the case of the server-side helpers) a path with hard-coded calls to
the `BUILT_IN_FORGE_API_*` proxy. Their listed dependencies — `axios`,
`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `jose`, `cookie`,
`streamdown`, `@types/google.maps` — pull tens of MB into `node_modules`
and expand the supply-chain surface for no benefit.

Delete the dead code, then delete the deps that drop out from under it.

## Current state

Verified during recon (`grep -rEn` across `server/`, `client/`, `shared/`):

### Server-side dead files (no production caller)

| File | Verified by |
|---|---|
| `server/_core/llm.ts` | only self-references |
| `server/_core/voiceTranscription.ts` | only self-references |
| `server/_core/imageGeneration.ts` | only self-references (the `storagePut` call inside is also dead) |
| `server/_core/map.ts` | only self-references |
| `server/_core/dataApi.ts` | only self-references |
| `server/_core/notification.ts` | called by `server/_core/systemRouter.ts` `system.notifyOwner`; that procedure has no client-side caller |
| `server/storage.ts` | only called by `server/_core/imageGeneration.ts` |
| `server/_core/types/cookie.d.ts` | only referenced by code in the dead files (cookie parsing pattern from the removed auth layer) |

### Client-side dead files

| File | Verified by |
|---|---|
| `client/src/pages/Home.tsx` | not routed in `client/src/App.tsx`; also self-redirects to `/` infinitely |
| `client/src/pages/ComponentShowcase.tsx` | 1440 lines; not routed in `App.tsx` |
| `client/src/components/Map.tsx` | only referenced by `ComponentShowcase.tsx` |
| `client/src/components/AIChatBox.tsx` | only referenced by `ComponentShowcase.tsx` |
| `client/src/components/ManusDialog.tsx` | only used by its own export |

### Router cleanup

`server/_core/systemRouter.ts` has two procedures: `health` and
`notifyOwner`. `notifyOwner` is the only thing that imports
`./notification`; with that import gone the file shrinks to just `health`.

Keep `health` — it's a legitimate liveness ping, even if no client uses it
today. Cost is one z.object input + one `() => ({ ok: true })`.

### Dependencies that drop out

After the file deletions above, the following `dependencies` in
`package.json` should have **zero** production importers. Verify each in
Step 4 before removing:

| Dep | Used by (today, before this plan) |
|---|---|
| `@aws-sdk/client-s3` | nothing (imageGeneration's storagePut is unused) |
| `@aws-sdk/s3-request-presigner` | nothing |
| `axios` | nothing (the LLM/forge calls use native `fetch`) |
| `streamdown` | `AIChatBox.tsx` only |
| `jose` | nothing (auth layer was removed in commit `c365e36`) |
| `cookie` | nothing (auth layer removal) |
| `@types/google.maps` | `Map.tsx` only |

Repo conventions:

- `tsc --noEmit` is the contract. After file deletions, the compiler will
  flag every loose end you missed; let it.
- Prettier formats automatically; do not hand-format.
- The repo uses npm (not pnpm despite the `pnpm` devDep — see `package-lock.json`).

## Commands you will need

| Purpose                | Command                                            | Expected on success |
|------------------------|----------------------------------------------------|---------------------|
| Install                | `npm install`                                      | exit 0              |
| Typecheck              | `npm run check`                                    | exit 0              |
| Tests                  | `npm run test`                                     | all pass            |
| Format                 | `npm run format`                                   | exit 0              |
| Production build       | `npm run build`                                    | dist/ produced without errors |
| Targeted import search | `grep -rn "<symbol>" --include='*.ts' --include='*.tsx' server client shared` | used in steps |

## Scope

**In scope** — delete the files listed in "Current state" → "Server-side dead
files" and "Client-side dead files", trim `systemRouter.ts`, and remove the
verified-dead `dependencies` from `package.json`.

**Out of scope** (do NOT delete, even though they look related):

- `vite-plugin-manus-runtime` (a devDep) and `client/public/__manus__/debug-collector.js` — Vite dev-only browser-log instrumentation. Removing
  these is a separate "do we still run under the Manus sandbox?" decision.
- `.manus-logs/`, `.serena/`, `.sisyphus/`, `.impeccable/`, `.agents/` —
  agent / tooling state, not source.
- `vite.config.ts` `vitePluginManusDebugCollector` — same call as above.
- `server/_core/systemRouter.ts:health` procedure — keep it.
- `client/src/components/CandlestickChart.tsx` and
  `client/src/lib/mockCandleData.ts` — covered by direction finding **D1**;
  do not touch in this plan even though `mockCandleData.ts` is technically
  "mock template data".

## Git workflow

- Branch: `advisor/004-prune-template-scaffolding`.
- Two or three commits, in this order, so review is reversible:
  1. `chore: delete unused server-side template helpers`
  2. `chore: delete unused client-side template widgets and pages`
  3. `chore: drop dependencies whose only callers were removed`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Re-verify nothing depends on the targets

For each file in the "Server-side dead files" and "Client-side dead files"
tables, run:

```
grep -rn "<basename without extension>" --include='*.ts' --include='*.tsx' server client shared
```

Examples:

```
grep -rn "voiceTranscription\|transcribeAudio" --include='*.ts' --include='*.tsx' server client shared
grep -rn "imageGeneration\|generateImage" --include='*.ts' --include='*.tsx' server client shared
grep -rn "/Map\"\|Map.tsx\|@types/google.maps\|google\\.maps\\." --include='*.ts' --include='*.tsx' server client shared
grep -rn "AIChatBox" --include='*.ts' --include='*.tsx' server client shared
grep -rn "ManusDialog" --include='*.ts' --include='*.tsx' server client shared
grep -rn "ComponentShowcase" --include='*.ts' --include='*.tsx' server client shared
grep -rn "pages/Home\\b\|from .*\"@/pages/Home\"" --include='*.ts' --include='*.tsx' server client shared
```

For each target, **expect** matches only inside:
- the target file itself,
- the other files marked for deletion in this plan,
- documentation / comments.

If a target has a real importer outside this set, STOP and report — the
recon may be stale.

### Step 2: Trim `systemRouter.ts` first

Edit `server/_core/systemRouter.ts`. After this step it should contain only
the `health` procedure:

```ts
import { z } from "zod";
import { publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),
});
```

Remove the `import { notifyOwner } from "./notification";` and the entire
`notifyOwner` mutation.

**Verify**: `npm run check` → exits 0.

### Step 3: Delete the server-side dead files

```
git rm server/_core/llm.ts
git rm server/_core/voiceTranscription.ts
git rm server/_core/imageGeneration.ts
git rm server/_core/map.ts
git rm server/_core/dataApi.ts
git rm server/_core/notification.ts
git rm server/storage.ts
git rm server/_core/types/cookie.d.ts
```

If `server/_core/types/` is now empty, `git rm -r server/_core/types/`.

**Verify**:

```
npm run check
```

Expected: exits 0. Any error here means an importer slipped past Step 1 —
STOP and follow the compiler's error trail.

Commit:
```
git commit -m "chore: delete unused server-side template helpers"
```

### Step 4: Delete the client-side dead files

```
git rm client/src/pages/Home.tsx
git rm client/src/pages/ComponentShowcase.tsx
git rm client/src/components/Map.tsx
git rm client/src/components/AIChatBox.tsx
git rm client/src/components/ManusDialog.tsx
```

**Verify**:

```
npm run check
```

Expected: exits 0. If any error, STOP — most likely
`ComponentShowcase.tsx` imported a UI primitive that is *only* used by it.
Track the import down and either keep the primitive (if it's a generic
`components/ui/*` shadcn file already used elsewhere — leave it alone) or
add it to the deletion list.

Commit:
```
git commit -m "chore: delete unused client-side template widgets and pages"
```

### Step 5: Remove the orphaned dependencies

For each dep in the "Dependencies that drop out" table, run the verification
grep (substring search of the package name in source — *not* lockfile, *not*
`node_modules`):

```
grep -rn "from \"<dep>\"\|require(\"<dep>\")\|import \"<dep>\"" --include='*.ts' --include='*.tsx' server client shared
```

Examples (run each and confirm zero matches before removing the dep):

```
grep -rn "@aws-sdk/client-s3" --include='*.ts' --include='*.tsx' server client shared
grep -rn "@aws-sdk/s3-request-presigner" --include='*.ts' --include='*.tsx' server client shared
grep -rn "from \"axios\"\|from 'axios'" --include='*.ts' --include='*.tsx' server client shared
grep -rn "streamdown" --include='*.ts' --include='*.tsx' server client shared
grep -rn "from \"jose\"\|from 'jose'" --include='*.ts' --include='*.tsx' server client shared
grep -rn "from \"cookie\"\|from 'cookie'" --include='*.ts' --include='*.tsx' server client shared
grep -rn "google\\.maps\\." --include='*.ts' --include='*.tsx' server client shared
```

For each that returns **zero matches**, remove the dep from `package.json`:

- From `dependencies` block: `@aws-sdk/client-s3`,
  `@aws-sdk/s3-request-presigner`, `axios`, `streamdown`, `jose`, `cookie`.
- From `devDependencies` block: `@types/google.maps`.

If any grep returns matches inside live source, **leave that dep in
`package.json`** and add a note to the commit message.

Refresh the lockfile:

```
npm install
```

This will rewrite `package-lock.json`. Expected: install succeeds, deps
that were removed disappear from the lockfile, no warnings about missing
peers.

**Verify**:

```
npm run check
npm run test
npm run build
```

All three must exit 0. `npm run build` is critical — it runs both `vite build`
and the `esbuild` server bundle, which will fail if a removed dep is
imported somewhere the typechecker didn't catch (e.g. inside a `// @ts-expect-error`
… though the repo bans that).

Commit:
```
git commit -m "chore: drop dependencies whose only callers were removed"
```

### Step 6: Format

```
npm run format
```

If any files were touched by formatting, amend the last commit:
```
git add -A
git commit --amend --no-edit
```

(Amending here is fine — it's only the latest commit, only formatting
deltas.)

## Test plan

No new tests. This plan is pure subtraction; the existing server test suite
verifies that the survivors still behave correctly, and the `npm run build`
check verifies the production bundle is still buildable.

If your `npm run test` count drops, investigate which test was deleted —
none of the in-scope deletions should remove tests (the server tests in
`server/*.test.ts` do not touch any of the listed dead files). A drop is a
STOP condition.

## Done criteria

ALL must hold:

- [ ] All files in the "Server-side dead files" table are deleted.
- [ ] All files in the "Client-side dead files" table are deleted.
- [ ] `server/_core/systemRouter.ts` contains only the `health` procedure
      and the two needed imports (`z`, `publicProcedure`, `router`).
- [ ] `grep -rEn "transcribeAudio|generateImage|notifyOwner|callDataApi|storagePut|storageGet|invokeLLM|makeRequest" --include='*.ts' --include='*.tsx' server client shared`
      returns zero matches.
- [ ] Every dep in the "Dependencies that drop out" table is either removed
      from `package.json` or accompanied by a note explaining why it survived.
- [ ] `npm run check` exits 0.
- [ ] `npm run test` exits 0 with the same test count as before this plan.
- [ ] `npm run build` exits 0 and writes `dist/index.js` plus `dist/public/`.
- [ ] `plans/README.md` status row updated to DONE.

## STOP conditions

Stop and report back (do not improvise) if:

- Any Step 1 grep reveals a live importer for a file marked for deletion.
- Any Step 5 grep reveals an import you didn't expect (especially `axios` —
  if someone replaced a `fetch` call, your removal will break runtime).
- `npm run build` fails after any step. Esbuild bundling the server can
  trip on a dynamic import the typechecker doesn't see.
- The test count changes.
- You feel tempted to delete `vite-plugin-manus-runtime` or
  `client/public/__manus__/debug-collector.js` — STOP, that's the
  out-of-scope item, report and wait.

## Maintenance notes

- After this plan lands, `server/_core/systemRouter.ts` becomes a candidate
  for inlining into `server/routers.ts` (it's one procedure). That's a
  separate cleanup — don't bundle it here.
- `notification.ts` is gone but its tRPC procedure `system.notifyOwner`
  was also deleted; if a future plan reintroduces it, prefer a real
  in-process queue / cron task over the forge-API proxy.
- The dependencies removed here include `jose` (JWT) and `cookie`, which
  were used by the auth layer torn out in commit `c365e36`. If auth is
  ever reintroduced, prefer a cookie-session library over re-adding `jose`
  unless the project specifically needs JWT-shaped tokens.
- If you ever want to re-prototype the LLM / Map / Voice integrations,
  scaffold them in a new dedicated folder (e.g. `server/integrations/`)
  rather than `_core/` — that keeps the "is this load-bearing?" question
  cheap to answer next time.
