# Plan 001: Bind HTTP server to loopback only

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

`CLAUDE.md` declares this project as single-tenant, anonymous, local-use
software where the tRPC context always returns the same `getOrCreateAnonymousUser`
and every procedure is `publicProcedure`. It explicitly warns: _"Do not expose
the port to a network without adding real auth first."_

The HTTP server today calls `server.listen(port, () => …)` with no host
argument. Node's `net.Server.listen` defaults to binding `0.0.0.0` (all
interfaces) in that signature, so any device on the same LAN can issue
`POST /api/trpc/transaction.delete`, `account.delete`,
`account.update { initialBalance: "0" }`, etc., and the anonymous-user model
will happily accept the call. The defense-in-depth fix is to bind the
loopback interface only — the same address the startup banner already prints.

## Current state

Relevant files:

- `server/_core/index.ts` — the Express + HTTP entry point. The two relevant
  spots are the port probe and the actual listen call.

Excerpts at the planned-at commit:

```ts
// server/_core/index.ts:11
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
```

```ts
// server/_core/index.ts:64
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}/`);
});
```

Repo conventions:

- TypeScript `strict: true`; no `any`, no `@ts-ignore` (see `CLAUDE.md`).
- Comments: English, terse, only when the WHY is non-obvious. See the
  existing comments in the same file for style (e.g. the `assertClosedTradesHaveEndTime`
  call site).
- Prettier is the formatting source of truth; run `npm run format` after
  meaningful edits.

## Commands you will need

| Purpose   | Command          | Expected on success                                                                 |
| --------- | ---------------- | ----------------------------------------------------------------------------------- |
| Install   | `npm install`    | exit 0                                                                              |
| Typecheck | `npm run check`  | exit 0, no errors                                                                   |
| Tests     | `npm run test`   | all pass                                                                            |
| Format    | `npm run format` | exit 0                                                                              |
| Smoke run | `npm run dev`    | logs `Server running on http://localhost:3000/`; port-bind to loopback (see step 3) |

(Exact commands from `package.json` — verified during recon.)

## Scope

**In scope** (only file you should modify):

- `server/_core/index.ts`

**Out of scope** (do NOT touch, even though they look related):

- `vite.config.ts` `server: { host: true }` — that controls the Vite dev
  middleware host, which Vite handles internally via its own allowlist
  (`allowedHosts: [...]`). Leave it alone.
- `playwright.config.ts` `baseURL: "http://localhost:3000"` — already loopback.
- `server/_core/context.ts` and the anonymous-user model — re-introducing
  auth is a separate, larger decision; this plan is defense-in-depth only.

## Git workflow

- Branch: `advisor/001-bind-loopback` (or whatever branch convention your
  reviewer prefers; the repo has no enforced convention).
- One commit, message style matching recent history (mixed conventional /
  imperative — see `git log --oneline -10` for examples like
  `refactor: harden per-account scoping, concurrency, and migration safety`).
  Suggested: `security: bind http server to loopback only`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Bind the HTTP listener to 127.0.0.1

Edit `server/_core/index.ts:64`. Change:

```ts
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}/`);
});
```

to:

```ts
// Single-tenant, anonymous tRPC: bind loopback only. See CLAUDE.md.
server.listen(port, "127.0.0.1", () => {
  console.log(`Server running on http://localhost:${port}/`);
});
```

(The 3-arg overload of `server.listen(port, host, callback)` is exactly the
shape `@types/node` expects; no extra type casting needed.)

**Verify**: `npm run check` → exits 0 with no errors.

### Step 2: Bind the port probe to 127.0.0.1 as well

In the same file, edit `isPortAvailable` (line ~11). Change:

```ts
server.listen(port, () => {
  server.close(() => resolve(true));
});
```

to:

```ts
server.listen(port, "127.0.0.1", () => {
  server.close(() => resolve(true));
});
```

Rationale: the probe and the actual listener must agree on the bind host, or
the probe can report "available" while another process is holding the same
port on the loopback interface (or vice versa).

**Verify**: `npm run check` → exits 0.

### Step 3: Manual smoke test

Run `npm run dev`. In another terminal:

1. `curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/` → `200`.
2. `curl -sS -o /dev/null -w "%{http_code}\n" -m 2 http://$(ipconfig getifaddr en0):3000/` (Mac) or your LAN IP equivalent → connection should be refused (curl error 7 / `000`). If your machine has no LAN interface, this step is trivially satisfied — note it and move on.

If step 3.1 doesn't return 200, treat as STOP condition.
If step 3.2 succeeds (returns 200 from the LAN IP), the bind did not take —
re-check that the second argument is exactly `"127.0.0.1"` (not `"localhost"`
on a host where DNS resolves `localhost` differently).

### Step 4: Format and re-run tests

```
npm run format
npm run test
```

**Verify**: both exit 0; existing tests should not be affected by this
change (no server test starts an HTTP listener with this code path —
`appRouter.createCaller` is used directly).

## Test plan

No new automated tests in this plan. Reasoning:

- The change is a single-argument addition to `server.listen`.
- Asserting "the bind interface is 127.0.0.1" requires actually starting the
  HTTP server in a test, which the existing test suite deliberately avoids
  (it uses `appRouter.createCaller`).
- Adding a one-off test that opens a socket on an arbitrary port is
  disproportionate to the risk.

Manual smoke (step 3) is the verification.

## Done criteria

ALL must hold:

- [ ] `server/_core/index.ts` contains exactly one `server.listen(port, "127.0.0.1"` in the main listener.
- [ ] `server/_core/index.ts` contains `server.listen(port, "127.0.0.1"` in `isPortAvailable`.
- [ ] `npm run check` exits 0.
- [ ] `npm run test` exits 0.
- [ ] Manual smoke (step 3.1) returns 200 on loopback.
- [ ] Manual smoke (step 3.2) refuses connection from the LAN IP (or N/A).
- [ ] No files outside `server/_core/index.ts` are modified (`git status`
      shows only that one file changed).
- [ ] `plans/README.md` status row updated to DONE.

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live code (drift).
- `npm run check` errors after step 1 — `@types/node` may have been replaced
  with an incompatible version. Report and wait.
- `npm run test` regressions appear — investigate which test is affected;
  this change should be a no-op for the existing test surface.
- Step 3.2 still succeeds after the change — the bind didn't take effect.
  Likely cause: another process is forwarding the port (Docker, an SSH
  remote-forward, etc.). Report findings.

## Maintenance notes

For whoever owns this code later:

- If you ever reintroduce auth (cookie session, JWT, OAuth, etc.) and want
  to make the journal reachable from a phone on the same LAN, the line you
  need to change is the bind host here — but only do that **after** the
  `publicProcedure → protectedProcedure` migration lands. The two are a
  pair; don't unbind loopback without auth in place.
- An env-controlled bind (e.g. `BIND_HOST=0.0.0.0 npm start`) is an obvious
  future refinement, but adding it now invites the very mistake this plan
  fixes — leave the bind hardcoded.
