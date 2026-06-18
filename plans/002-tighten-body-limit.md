# Plan 002: Tighten Express JSON body limit

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 153587a..HEAD -- server/_core/index.ts`
> If `server/_core/index.ts` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `153587a`, 2026-06-18

## Why this matters

The Express body parser is configured with `limit: "50mb"` for both JSON and
urlencoded bodies. The journal has no file-upload route — every tRPC
procedure under `transaction.*`, `stats.*`, `account.*`, and `system.*`
accepts at most a few kilobytes of data (the largest realistic payload is
the `transaction.update.reviewFeedback` text, well under 64 KB in practice).

A 50 MB cap turns each request into a DoS amplifier. Combined with Plan 001
(loopback-only bind), the blast radius is contained, but the limit is still
wrong on its own merits: a malformed in-page request that loops on
`fetch('/api/trpc/…', { body: hugeString })` can lock the Node process for
seconds while it buffers garbage.

A 1 MB limit leaves ~16× headroom over the largest realistic payload and
shrinks the wasted-buffer ceiling by 50×.

## Current state

Relevant file:

- `server/_core/index.ts` — Express middleware setup; the two `app.use`
  calls below are the only body-parser sites.

Excerpt at the planned-at commit:

```ts
// server/_core/index.ts:33-35
// Configure body parser with larger size limit for file uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
```

Note that the inline comment is misleading — there are no file uploads in
the codebase. Confirm by running:

```
grep -rEn "multer|multipart|busboy|formidable|/upload" server/ shared/ client/src --include='*.ts' --include='*.tsx'
```

This should return zero matches (or only documentation references). If it
returns a real upload route, treat as a STOP condition.

Repo conventions:

- Prettier formats; semicolons, double quotes, 80 col, 2 spaces.
- Comments in English, terse. Drop the "for file uploads" comment when you
  change the limit — it's actively wrong now.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Install   | `npm install`    | exit 0              |
| Typecheck | `npm run check`  | exit 0              |
| Tests     | `npm run test`   | all pass            |
| Format    | `npm run format` | exit 0              |

## Scope

**In scope** (only file you should modify):
- `server/_core/index.ts`

**Out of scope**:
- Any test files. The tRPC tests use `appRouter.createCaller`, not HTTP, so
  the body limit doesn't apply to them.
- Changing the URL-encoded `extended` flag (leave as `true`).
- Wiring an env var to make the limit configurable. We want a hard fixed
  ceiling; configurability invites the next operator to bump it back up.

## Git workflow

- Branch: `advisor/002-tighten-body-limit` (or your reviewer's convention).
- One commit. Suggested message:
  `security: tighten express body limit to 1mb`.

## Steps

### Step 1: Drop the limit and fix the stale comment

Edit `server/_core/index.ts:33-35`. Replace:

```ts
// Configure body parser with larger size limit for file uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
```

with:

```ts
// tRPC payloads top out at a few KB; cap well under that to bound DoS surface.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));
```

**Verify**: `npm run check` → exits 0.

### Step 2: Run the full test suite

```
npm run test
```

**Verify**: all existing tests pass. None of them depend on the JSON body
limit (they bypass HTTP via `createCaller`).

### Step 3: Manual sanity check

Start the dev server (`npm run dev`) and exercise the heaviest realistic
mutation in a browser session:

1. Open `http://localhost:3000/transactions/new`.
2. Fill the form, submit, see the trade created (toast: "trade created" or
   similar — match whatever the UI says today).
3. Open an existing trade and add a long `reviewFeedback` (a few hundred
   words).
4. Save. Confirm no 413 / `PayloadTooLargeError` appears in the server log.

If step 3 hits 413, the realistic payload is larger than expected — STOP and
report the actual byte count from the network panel.

### Step 4: Format

```
npm run format
```

## Test plan

No new automated tests. Same reasoning as Plan 001: asserting Express's body
limit requires starting an HTTP listener, which the suite intentionally
avoids; manual smoke (step 3) is appropriate for the change size.

## Done criteria

ALL must hold:

- [ ] `server/_core/index.ts` contains `limit: "1mb"` (or smaller) on both
      `express.json` and `express.urlencoded`.
- [ ] The "for file uploads" comment is gone or replaced.
- [ ] `grep -n '"50mb"' server/_core/index.ts` returns no matches.
- [ ] `npm run check` exits 0.
- [ ] `npm run test` exits 0.
- [ ] Manual smoke (step 3) succeeds without 413.
- [ ] No files outside `server/_core/index.ts` are modified.
- [ ] `plans/README.md` status row updated to DONE.

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check (top of file) shows `server/_core/index.ts` has changed —
  in particular if Plan 001 has already landed, the line numbers in the
  excerpts may have shifted; that's expected, but the content should still
  match.
- The grep in "Current state" reveals a real file-upload route in the
  codebase (e.g. `voiceTranscription` ever gets wired up through HTTP). The
  1 MB limit might be wrong in that case — report and wait.
- Manual smoke produces a 413 — investigate before reducing further.

## Maintenance notes

- If a real upload route is ever added (S3-backed image attachments, voice
  notes via `transcribeAudio`, etc.), put it behind a separate `app.use`
  with its own per-route limit (`express.raw({ limit: "10mb", type: "audio/*" })`
  or similar) rather than raising the global JSON limit. Per-route limits
  keep the smaller global ceiling on the dominant traffic path.
