# Plan images as SQLite BLOBs via node:sqlite, served by Express

Researched 2026-11-10 for TASK-71 (Trading plan map, doc-5). Primary sources plus a local spike run with the project's pinned Node (`devbox.lock`: nodejs 22.22.3) and the installed library versions (drizzle-orm 0.45.2, drizzle-kit 0.31.10, express 4.22.1, body-parser 1.20.x, fresh 0.5.2). The spike lived in a scratch directory, not the repo; its scripts are reproduced in §7.

Settled before this ticket (doc-5, not reopened here): an `images` table holding BLOBs (not disk, not base64), owned by `planId`, cascade-deleted with the plan; png/jpeg/webp/gif only; 10 MB per image; sha256 dedupe within a plan; Express `POST /api/images` and `GET /api/images/:id`; `express.json` stays at 1 mb.

Source key:

- NODE-SQLITE: https://nodejs.org/docs/latest-v22.x/api/sqlite.html (sections "SQLite", `new DatabaseSync(path[, options])`, "Type conversion between JavaScript and SQLite").
- DRIZZLE-COLS: https://orm.drizzle.team/docs/column-types/sqlite (section "Blob").
- DRIZZLE-PROXY: https://orm.drizzle.team/docs/sqlite/connect-drizzle-proxy.
- DRIZZLE-SRC: installed `drizzle-orm/sqlite-core/columns/blob.js` and `drizzle-orm/sqlite-proxy/session.js` (0.45.2).
- BODY-PARSER: installed `body-parser/README.md`, sections `bodyParser.raw([options])` and "Errors" (this is what `express.raw` re-exports).
- EXPRESS-SRC: installed `express/lib/response.js` (`res.send`), `express/lib/request.js` (`req.fresh`), `express/lib/application.js` (`etag` default), `etag/index.js`, `fresh/index.js`.
- SQLITE-LIMITS: https://www.sqlite.org/limits.html, item 2 "Maximum length of a string or BLOB".
- SQLITE-BLOB: https://www.sqlite.org/c3ref/blob_open.html.
- SQLITE-INTEXT: https://www.sqlite.org/intern-v-extern-blob.html.
- SQLITE-FK: https://www.sqlite.org/foreignkeys.html, sections 2 and 5.
- MIMESNIFF: https://mimesniff.spec.whatwg.org/ §6.1 "Matching an image type pattern".
- RFC8246: https://www.rfc-editor.org/rfc/rfc8246.html §2 (`immutable`).
- REPO: `server/db.ts` (proxy callback, `runInSqliteTransaction`, `ensureDatabaseSchema`), `server/_core/index.ts`, `server/_core/vite.ts`, `server/_core/reviewAgentSseRoute.ts`, `drizzle/schema.ts`, `drizzle/0013_foamy_madripoor.sql`.

## 0. Verdicts

1. **Blob round-trip: yes.** `blob("bytes", { mode: "buffer" })` through the project's sqlite-proxy callback over `DatabaseSync` round-trips byte-exactly: `Buffer` or `Uint8Array` in, `Buffer` out (`select().all()` path). drizzle-kit emits `` `bytes` blob NOT NULL ``. One gotcha: the project's proxy callback returns the wrong shape for drizzle's `.get()`; nothing in `server/` uses `.get()` today, so keep using `.all()`/destructuring, or fix the callback (§1.4).
2. **Route shape:** an Express `Router` mounted at `/api/images` _before_ `setupVite`/`serveStatic`, with `express.raw({ type: [the four image types], limit: 10 * 1024 * 1024 })` attached to the POST handler only; `planId` in the query string; MIME decided by magic bytes (WHATWG table), Content-Type only used as the `type` gate; sha256 lookup `(planId, sha256)` before insert plus a unique index as the backstop; response `Content-Type: <stored mime>`, `ETag: "<sha256>"` (strong), `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`; `res.send(buffer)` yields `Content-Length` and automatic `304` on `If-None-Match`; `404` via `res.sendStatus(404)` for unknown/foreign ids. Verified end to end in the spike (§7.2).
3. **Memory: whole buffer, no streaming.** node:sqlite has no incremental blob API; a 10 MB blob is one `Uint8Array` on read, and drizzle's buffer mode copies it once (`Buffer.from`), so a GET peaks at ~2x the image (20 MB transient) for ~3 ms. Insert passes the request `Buffer` straight through, no extra copy. For a single-user localhost app this is fine; `substr()` paging exists if that ever changes.
4. **Ownership gotchas:** resolve the user with `createContext` like the SSE routes; check the plan with a separate `plans WHERE id = ? AND userId = ?` query (not a join, see §4.3); refuse uploads to closed plans; store `userId` on the row and filter by it on GET. **Do not model the cascade as a DB-level `ON DELETE CASCADE` foreign key** under the current migration runner: `PRAGMA foreign_keys=OFF` is a no-op inside the `BEGIN IMMEDIATE` that `ensureDatabaseSchema` wraps around every migration, so a future drizzle-kit table rebuild of `plans` would silently delete every image (reproduced, §4.4). Cascade in application code inside `runInSqliteTransaction`, matching the schema's existing no-FK convention.

## 1. Drizzle sqlite-proxy over node:sqlite and BLOB columns

### 1.1 What the drivers promise

- node:sqlite maps `BLOB` ↔ "`TypedArray` or `DataView`"; parameters may be `null | number | bigint | string | Buffer | TypedArray | DataView`; "Attempting to write an unsupported data type to SQLite will result in an exception." Source: NODE-SQLITE, "Type conversion between JavaScript and SQLite" and the `statement.run()`/`get()`/`all()` parameter lists. Typed-array parameters were added in v22.14.0 (NODE-SQLITE history), below the pinned 22.22.3.
- `--experimental-sqlite` is no longer required since v22.13.0; the module remains Stability 1.1 and prints an `ExperimentalWarning` at first use. Source: NODE-SQLITE, "SQLite" history table. The spike was run with the flag as the ticket asked; it is accepted and harmless.
- Drizzle `blob()` has modes `buffer` (default), `bigint`, `json`; the column's SQL type is `blob`. Source: DRIZZLE-COLS. In 0.45.2 `SQLiteBlobBuffer.mapFromDriverValue` is `Buffer.isBuffer(value) ? value : Buffer.from(value)` and there is no `mapToDriverValue`, i.e. the JS value you insert is handed to the driver untouched. Source: DRIZZLE-SRC `blob.js`.
- The proxy contract: callback `(sql, params, method)` with `method ∈ run | all | values | get`; "Drizzle always waits for `{rows: string[][]}` or `{rows: string[]}`" — `string[][]` (array of value arrays) for `all`/`values`, a single `string[]` row for `get`. Source: DRIZZLE-PROXY. The project callback (`server/db.ts`, `getDb`) maps node:sqlite's row objects with `Object.values(row)` for `all`/`values`, which satisfies the array-of-values contract.

### 1.2 Spike results (schema in §7.1, script §7.2)

| Step                                                         | Result                                                                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `insert(images).values({ bytes: Buffer })` through the proxy | param reaches node:sqlite as `Buffer`; `typeof(bytes)` in SQLite = `blob`                                                                |
| `insert` with a plain `Uint8Array`                           | param reaches node:sqlite as `Uint8Array`; stored as `blob`; reads back equal                                                            |
| raw `stmt.get().bytes` from node:sqlite                      | `Uint8Array` (not `Buffer`)                                                                                                              |
| `db.select().from(images).where(...)` (`all` path)           | `bytes` is `Buffer`, `Buffer.compare(...) === 0`; `createdAt` (`timestamp_ms`) comes back as `Date`                                      |
| `Buffer.from(uint8array)` in `mapFromDriverValue`            | copies (`buffer.buffer !== raw.buffer`), see §3                                                                                          |
| `uniqueIndex(planId, sha256)` violated                       | insert throws; drizzle wraps it as `Failed query: insert into "images" ...` with the SQLite cause attached, not as a top-level `errcode` |

### 1.3 What drizzle-kit emits

`drizzle-kit generate` (0.31.10, `dialect: "sqlite"`) for the schema in §7.1:

```sql
CREATE TABLE `images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`planId` integer NOT NULL,
	`sha256` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`bytes` blob NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`planId`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `images_plan_sha256_unique` ON `images` (`planId`,`sha256`);--> statement-breakpoint
CREATE INDEX `images_user_idx` ON `images` (`userId`);
```

The `FOREIGN KEY ... ON DELETE cascade` line only appears if the column carries `.references(() => plans.id, { onDelete: "cascade" })`; §4.4 recommends dropping it. Everything else matches the conventions in `drizzle/schema.ts` (`integer` autoincrement id, `userId` integer, `createdAt` `timestamp_ms` with `(unixepoch() * 1000)` default).

### 1.4 Gotcha: the proxy callback's `get` shape

`server/db.ts` returns `{ rows: result ? [Object.values(result)] : [] }` for `method === "get"`. Drizzle's `RemotePreparedQuery.get` passes `clientResult.rows` straight into `mapResultRow` as _the row_ (DRIZZLE-SRC `session.js`, `mapGetResult`), so the nested array lands in column 0 and every other column is `undefined`. For an image row this throws (`Buffer.from(undefined)`); for a plain row it silently yields a ghost object. Spike (§7.2, "get() [project]"): hit → throws; miss → `{}`.

The shapes that work: `{ rows: Object.values(result) }` on a hit and `{ rows: undefined }` on a miss (`[]` on a miss is truthy and still produces a ghost row; spike "get() [spec]" vs "get() [undef]"). `grep -rn "\.get()" server` finds no drizzle `.get()` call today, so the simplest rule for the image work is: keep using `.all()`/`limit(1)` with destructuring, as the rest of `server/db.ts` does. Fixing the callback is a one-line change if a later task wants `.get()`.

## 2. Route shape

### 2.1 Registration and dev/prod ordering

`server/_core/index.ts` registers, in order: `express.json({ limit: "1mb" })`, `express.urlencoded`, `/api/trpc`, the two SSE routers, then `setupVite` (dev) or `serveStatic` (prod). Both tails end in `app.use("*", ...)` catch-alls that answer `index.html` for anything unmatched (`server/_core/vite.ts`). Therefore:

- Mount `app.use("/api/images", mountImagesRoute())` next to the SSE routers, before the Vite/static block. The spike (§7.3) confirms `/api/images/:id` wins over a trailing `"*"` catch-all placed after it, in the same way for dev and prod since the ordering is identical.
- `express.json` and `express.urlencoded` only act on `application/json` / `application/x-www-form-urlencoded` bodies, so they neither consume nor size-limit an `image/*` upload; the 1 mb limit stays untouched and still 413s a 2 MB JSON body (spike).
- Unmatched `/api/images/...` paths (for example a trailing slash with no id) fall through to the SPA catch-all and get `index.html` with 200. Add `router.use((_req, res) => res.sendStatus(404))` at the end of the images router if a JSON/404 contract for the whole prefix is wanted.
- Follow `reviewAgentSseRoute.ts`: a `Router` factory in `server/_core/`, user resolved via `createContext({ req, res, info: undefined as never })`, reads/writes through functions in `server/db.ts`.

### 2.2 Upload: `express.raw` scoped to the route

`bodyParser.raw` "parses all bodies as a `Buffer` and only looks at requests where the `Content-Type` header matches the `type` option"; `type` may be "a string, array of strings, or a function" passed to `type-is`; `limit` is bytes or a `bytes` string, default `100kb`; `inflate` defaults to `true`. Source: BODY-PARSER `bodyParser.raw([options])`. Errors: body over `limit` → `status 413`, `type 'entity.too.large'`; aborted → 400 `request.aborted`; length mismatch → 400 `request.size.invalid`. Source: BODY-PARSER "Errors".

Shape that the spike verified (§7.3):

```ts
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

router.post(
  "/",
  express.raw({ type: IMAGE_TYPES, limit: MAX_IMAGE_BYTES }),
  async (req, res) => { ... }
);
```

- Attaching the parser to the one `post` handler keeps the 10 MB limit off every other route.
- When `Content-Type` is not in `type`, body-parser skips and `req.body` stays `{}` → check `Buffer.isBuffer(req.body)` and answer `415`.
- `limit` is enforced by `raw-body`: a `Content-Length` over the limit is rejected before reading; 10 MiB exactly passes, 10 MiB + 1 → 413 (spike). Because the ticket says "10 MB", decide 10 _ 1024 _ 1024 vs 10_000_000 once and share the constant with the client (`shared/const.ts`).
- The 413 surfaces through Express's error path, so the images router needs an error handler (or a tiny `app.use((err, req, res, next) => ...)`) that turns `err.status`/`err.type` into a JSON body; otherwise Express's default HTML error page answers.
- `planId` cannot ride in a raw body, and multipart would need a dependency the repo does not have (`multer`/`busboy` are absent). Use the query string: `POST /api/images?planId=123`. Validate with zod (`z.coerce.number().int().positive()`), mirroring `bodySchema` in the SSE routes.
- `inflate: false` is a reasonable tightening: browsers never gzip uploads, and with inflate on, the limit applies to the inflated stream rather than the wire bytes.

### 2.3 MIME: magic bytes decide, Content-Type only gates

Clipboard/drag uploads report whatever the browser believes; a renamed or malformed file would otherwise be stored and later served with an attacker-chosen type. Sniff the first bytes against the WHATWG image patterns (MIMESNIFF §6.1), which cover exactly the four allowed types:

| MIME       | bytes (hex)                                 | mask             | note             |
| ---------- | ------------------------------------------- | ---------------- | ---------------- |
| image/png  | `89 50 4E 47 0D 0A 1A 0A`                   | all `FF`         |                  |
| image/jpeg | `FF D8 FF`                                  | all `FF`         |                  |
| image/gif  | `47 49 46 38 37 61` / `47 49 46 38 39 61`   | all `FF`         | GIF87a / GIF89a  |
| image/webp | `52 49 46 46 ?? ?? ?? ?? 57 45 42 50 56 50` | `FF×4 00×4 FF×6` | `RIFF....WEBPVP` |

Store the sniffed type in `mime`; reject with 415 when nothing matches (even if `Content-Type` said `image/png`). Spike: a PNG sent as `image/jpeg` is stored as `image/png`; `"hello"` sent as `image/png` → 415. No library needed; a 15-line function covers it (§7.3 `sniffImageMime`).

### 2.4 sha256 dedupe within a plan

- Compute `createHash("sha256").update(req.body).digest("hex")` on the full buffer (≈ 20–30 ms for 10 MB on the spike machine, synchronous; acceptable for one user).
- Lookup `select id from images where planId = ? and sha256 = ?` (drizzle `and(eq(images.planId, planId), eq(images.sha256, sha))`); on a hit answer `200 { id }` (spike returns `deduped: true` too) instead of inserting. The unique index `(planId, sha256)` is the race backstop; a violation surfaces as drizzle's `Failed query ...` error with the SQLite error as `cause`, so catch it and re-select rather than pattern-match the message.
- Keep the lookup + insert inside `runInSqliteTransaction` if you want the backstop to be unnecessary; a single-user app can also just rely on the index.

### 2.5 Serving: headers, ETag, 304, 404

Express defaults `etag` to `'weak'` and, in `res.send`, generates an ETag only when none is set (`generateETag = !this.get('ETag') && ...`); it then sets `Content-Length` from the Buffer, and `if (req.fresh) this.statusCode = 304`, stripping `Content-Type`/`Content-Length` and the body for 304. Source: EXPRESS-SRC `response.js` (`res.send`), `application.js` (`this.set('etag', 'weak')`). `req.fresh` only applies to GET/HEAD with a 2xx status and delegates to `fresh`, which compares `If-None-Match` tokens against the response `ETag` (strong or `W/` forms) and returns stale when the request carries `Cache-Control: no-cache`. Source: EXPRESS-SRC `request.js`, `fresh/index.js`.

Recommended response for a hit:

```ts
res.set({
  "Content-Type": row.mime, // sniffed on upload, so trustworthy
  ETag: `"${row.sha256}"`, // strong; bytes never change for an id
  "Cache-Control": "private, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
});
res.send(row.bytes); // Buffer from drizzle
```

- Strong ETag is legitimate because image rows are insert-only and dedupe reuses the existing id, so an id maps to one byte sequence forever. Using the stored sha256 avoids Express hashing 10 MB with sha1 on every request (the default `etag` module does `sha1` + base64 over the whole entity, `etag/index.js`).
- `immutable` (RFC8246 §2): "Clients SHOULD NOT issue a conditional request during the response's freshness lifetime (e.g., upon a reload) unless explicitly overridden by the user (e.g., a force reload)." With a one-year `max-age` the browser will not even revalidate pasted screenshots on normal reloads; the ETag path is the fallback for force reloads and expired caches. `private` keeps any future proxy from caching a single-tenant resource; it is optional on localhost.
- Spike (§7.3): conditional `GET` with matching `If-None-Match` → `304`, empty body, `ETag`/`Cache-Control` retained; weak-form `W/"sha"` also → 304; a non-matching tag → 200 with body; `HEAD` → 200 with headers and no body. Note that Node's `fetch` adds `Cache-Control: no-cache` to every request, which `fresh` treats as a forced reload — test conditional requests with `node:http`, a browser, or curl, not `fetch`.
- 404: `res.sendStatus(404)` for a non-integer id, an id that does not exist, or a row owned by another `userId` (same status for both so ids are not enumerable). Spike: `/api/images/999` and `/api/images/abc` → 404 `Not Found`.
- Optional hardening headers for served bytes: `Content-Security-Policy: default-src 'none'` costs nothing and neutralises any future non-image type.

## 3. Memory behaviour of a 10 MB blob

- SQLite's own ceiling is `SQLITE_MAX_LENGTH` = 1,000,000,000 bytes by default (hard max 2^31-3), and "During part of SQLite's INSERT and SELECT processing, the complete content of each row in the database is encoded as a single BLOB" (SQLITE-LIMITS item 2). 10 MB is 1% of the default limit.
- node:sqlite exposes no `sqlite3_blob_open` wrapper (NODE-SQLITE lists only statements, `iterate()` over rows, `backup()`, sessions); so incremental blob I/O (SQLITE-BLOB) is not available from JS. Every read is `SELECT bytes` → one `Uint8Array` holding the whole value.
- Spike numbers (Node 22.22.3, arm64, in-memory DB; §7.2 part 4): insert 10 MB via drizzle 4.6 ms; select via drizzle 2.9 ms; raw node:sqlite select 4.4 ms; metadata-only select (`length(bytes)`, no bytes column) 0.2 ms; `substr(bytes, 1, 1048576)` returns a 1 MiB chunk server-side. `process.memoryUsage().arrayBuffers` grew by 10 MB for the upload buffer, +20 MB after the drizzle select (driver `Uint8Array` plus drizzle's `Buffer.from` copy), +10 MB for the raw select; all are ordinary GC-managed `ArrayBuffer`s.
- Verdict: a GET costs one 10 MB driver allocation plus one 10 MB copy, lives for a few ms, then is written to the socket by `res.send`. No streaming is needed at this size for one user; Node's HTTP layer handles back-pressure on the single write. If it ever mattered, (a) wrap the driver's `Uint8Array` zero-copy in the proxy callback (`Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)` satisfies `Buffer.isBuffer` so drizzle skips its copy), or (b) page with `substr()` into chunked writes.
- Storage-side perf context: SQLite's own measurement says separate files beat in-database storage above roughly 100 KB per blob with default page sizes (SQLITE-INTEXT: "For BLOBs larger than 100KB, reads from a separate file are faster"; 8192/16384-byte pages narrow the gap). That is a throughput statement for high-volume workloads; for a handful of screenshots per plan on one laptop the decision on doc-5 (BLOBs in SQLite for one backup file and cascade semantics) stands. Do not `SELECT *` from `images` in list queries — select metadata columns and leave `bytes` for the GET route.

## 4. userId scoping and planId ownership

### 4.1 Upload flow

1. `ctx = await createContext({ req, res, info: undefined as never })` (as in `reviewAgentSseRoute.ts`) → `ctx.user.id`.
2. Parse `planId` from the query; `400` if missing/invalid.
3. `const [plan] = await db.select({ id, userId, closedAt }).from(plans).where(and(eq(plans.id, planId), eq(plans.userId, userId)))`; `404` when absent (do not distinguish "not yours" from "missing").
4. `closedAt !== null` → `409` (doc-5: closed plans are read-only until reopened; observations cannot be added either).
5. Sniff mime; `415` if not one of the four.
6. sha256; dedupe lookup on `(planId, sha256)`; insert `{ userId, planId, sha256, mime, size: body.length, bytes: body }`; answer `201 { id, mime, size }` (dedupe hit → `200 { id }`).

### 4.2 Serving

`where(and(eq(images.id, id), eq(images.userId, ctx.user.id)))` — the CLAUDE.md rule "user-scoped queries must keep filtering by `userId`" applies even though there is one anonymous user. Storing `userId` on `images` (already in the provisional schema) avoids a join on every image request.

### 4.3 Gotcha: joins through the proxy callback

The callback turns each row object into `Object.values(row)`. node:sqlite row objects are keyed by column name, so a join that returns two columns with the same name (`images.id` and `plans.id`, `userId` on both) collapses them and misaligns every later column. Do the ownership check as a separate query (step 3 above) or alias columns explicitly; never `select().from(images).innerJoin(plans, ...)` through this callback.

### 4.4 Gotcha: `ON DELETE CASCADE` plus the project's migration runner

- node:sqlite enables foreign-key enforcement by default (`enableForeignKeyConstraints`, "Default: `true`", NODE-SQLITE), and the spike confirms `PRAGMA foreign_keys` = 1 on a `new DatabaseSync(path)` connection like `server/db.ts`'s. So a `FOREIGN KEY (planId) REFERENCES plans(id) ON DELETE cascade` _does_ delete images when a plan row is deleted (spike part 3: 3 → 2 images), and rejects inserts with an unknown `planId`.
- But: "It is not possible to enable or disable foreign key constraints in the middle of a multi-statement transaction ... Attempting to do so does not return an error; it simply has no effect." (SQLITE-FK §2). `ensureDatabaseSchema` in `server/db.ts` strips `BEGIN/COMMIT` and runs every statement of a migration inside one `BEGIN IMMEDIATE`, so the `PRAGMA foreign_keys=OFF;` that drizzle-kit emits for table rebuilds (five of the fourteen existing migrations, e.g. `drizzle/0013_foamy_madripoor.sql`) is silently ignored.
- With enforcement still on, "the DROP TABLE command performs an implicit DELETE to remove all rows from the table before dropping it ... [which] may invoke foreign key actions" (SQLITE-FK §5). drizzle-kit's rebuild is `CREATE __new_plans` → copy → `DROP TABLE plans` → `RENAME`. Reproduced (§7.4): PRAGMA inside the transaction → `foreign_keys` stays 1 → **images go from 1 to 0** on a `plans` rebuild; PRAGMA outside the transaction → images survive. Any future column change on `plans` would therefore wipe every screenshot.
- Recommendation: no `.references()` on `images.planId` (the schema currently has zero foreign keys — `userId`, `accountId`, `preTradeId` are all plain integers — so this matches convention), and delete images explicitly in `deletePlan` inside `runInSqliteTransaction(...)` along with scenarios and observations. If a later task wants real FKs, it must first change `ensureDatabaseSchema` to execute `PRAGMA foreign_keys=...` statements outside the transaction (or open the connection with `enableForeignKeyConstraints: false` during migrations), and that is a separate ticket.

## 5. Open points for the build task (not blocking)

- Whether `GET /api/images/:id` should also reject when the owning plan is gone (not needed if the app-level cascade deletes image rows in the same transaction).
- Orphan rows left by removing an image from the editor are tolerated in v1 (doc-5); the `(planId, sha256)` dedupe means re-pasting the same screenshot re-attaches to the orphan row rather than growing the table.
- `10 MB` = 10 MiB (`10 * 1024 * 1024`) vs 10,000,000 bytes: pick one constant in `shared/const.ts` so the client can pre-check `file.size` and show the error without a round trip.
- `--experimental-sqlite` is accepted but unnecessary on Node ≥ 22.13; nothing in `package.json` scripts passes it today and nothing needs to.

## 6. Summary of recommendations

| Topic  | Recommendation                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Column | `bytes: blob("bytes", { mode: "buffer" }).notNull()`, plus `sha256 text`, `mime text`, `size integer`, `userId`, `planId` integers, `createdAt` `timestamp_ms`; `uniqueIndex(planId, sha256)`, `index(userId)` or `index(planId)` as queries need |
| FK     | none; app-level cascade in `runInSqliteTransaction` (§4.4)                                                                                                                                                                                        |
| Reads  | drizzle `.all()`/destructure, never `.get()` until the proxy callback is fixed (§1.4); metadata selects never include `bytes`                                                                                                                     |
| Upload | `POST /api/images?planId=N`, `express.raw({ type: IMAGE_TYPES, limit: MAX_IMAGE_BYTES })` on that handler; 400/404/409/413/415 as in §4.1; 201 `{ id, mime, size }` / 200 on dedupe                                                               |
| MIME   | magic-byte sniff per WHATWG table; stored `mime` is the sniffed one                                                                                                                                                                               |
| Serve  | `Content-Type` from row, strong `ETag "<sha256>"`, `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `res.send(Buffer)`; 304 via `req.fresh`; `sendStatus(404)` for unknown/foreign ids                   |
| Mount  | `app.use("/api/images", mountImagesRoute())` before `setupVite`/`serveStatic`, with a small error handler for body-parser's 413                                                                                                                   |
| Memory | whole-buffer; ~2x image transient on GET; no streaming                                                                                                                                                                                            |

## 7. Spike reproduction

Run from the repo root with `devbox run -- node --experimental-sqlite <file>` after `npm install drizzle-orm@0.45.2 drizzle-kit@0.31.10 express@4.22.1` into a scratch directory with `{"type":"module"}`. Nothing below was committed to the repo besides this note.

### 7.1 `schema.js`

```js
import { sql } from "drizzle-orm";
import {
  blob,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const plans = sqliteTable("plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  symbol: text("symbol").notNull(),
});

export const images = sqliteTable(
  "images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId").notNull(),
    // .references(..., { onDelete: "cascade" }) was included only to observe drizzle-kit output and §4.4
    planId: integer("planId")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    sha256: text("sha256").notNull(),
    mime: text("mime").notNull(),
    size: integer("size", { mode: "number" }).notNull(),
    bytes: blob("bytes", { mode: "buffer" }).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .notNull(),
  },
  table => [
    uniqueIndex("images_plan_sha256_unique").on(table.planId, table.sha256),
    index("images_user_idx").on(table.userId),
  ]
);
```

`drizzle-kit generate` was run with `{ schema: "./schema.js", out: "./out", dialect: "sqlite" }`; output in §1.3.

### 7.2 Round-trip, `.get()` shapes, dedupe, cascade, memory (`spike1.mjs`, abridged)

```js
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { and, eq, sql } from "drizzle-orm";
import { images, plans } from "./schema.js";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(/* DDL from §1.3 */);
let GET_SHAPE = "project";
const db = drizzle(async (sqlStr, params, method) => {
  // copy of server/db.ts
  const stmt = sqlite.prepare(sqlStr);
  if (method === "run") {
    stmt.run(...params);
    return { rows: [] };
  }
  if (method === "all" || method === "values")
    return { rows: stmt.all(...params).map(r => Object.values(r)) };
  const result = stmt.get(...params);
  if (GET_SHAPE === "project")
    return { rows: result ? [Object.values(result)] : [] };
  if (GET_SHAPE === "spec")
    return { rows: result ? Object.values(result) : [] };
  return { rows: result ? Object.values(result) : undefined };
});

await db.insert(plans).values({ userId: 1, symbol: "BTCUSDT" });
const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);
await db
  .insert(images)
  .values({
    userId: 1,
    planId: 1,
    sha256: sha(png),
    mime: "image/png",
    size: png.length,
    bytes: png,
  });
const [row] = await db.select().from(images).where(eq(images.id, 1)); // Buffer, equal
for (const shape of ["project", "spec", "undef"]) {
  GET_SHAPE = shape; /* .get() hit + miss, see §1.4 */
}
// dedupe lookup, duplicate insert -> throws; delete plan 2 -> its image gone (PRAGMA foreign_keys = 1)
const big = randomBytes(10 * 1024 * 1024); // part 4: memoryUsage() before/after
```

Output (trimmed):

```
PRAGMA foreign_keys = { foreign_keys: 1 }
insert param types (Buffer in): [ 'Number', 'Number', 'String', 'String', 'Number', 'Buffer' ]
raw node:sqlite BLOB -> Uint8Array len=11 | sqlite typeof: blob
drizzle all() bytes -> Buffer len=11 equal: true
drizzle all() createdAt -> true 2026-11-10T03:18:23.000Z
get() [project] hit -> THROWS The first argument must be of type string or an instance of Buffer...
get() [project] miss (no blob col) -> {}
get() [spec] hit -> Buffer len=11 equal: true
get() [spec] miss (no blob col) -> {}      // ghost row
get() [undef] hit -> Buffer len=11 equal: true
get() [undef] miss (with blob col) -> undefined
insert param types (Uint8Array in): [ ..., 'Uint8Array' ]
Uint8Array in -> out Buffer len=6 equal: true
drizzle mapFromDriverValue copies the driver Uint8Array: true
dedupe lookup finds existing id: 1
duplicate insert error: Failed query: insert into "images" (...)
images before plan delete: 3
images after deleting plan 2 (expect 2): 2
[mem] baseline: rss=80.8MB heap=6.0MB external=1.8MB arrayBuffers=0.0MB
[mem] after allocating 10MB upload buffer: ... arrayBuffers=10.0MB
insert 10MB took 4.6 ms
select 10MB via drizzle took 2.9 ms -> Buffer len=10485760 equal: true
[mem] after drizzle select (driver Uint8Array + drizzle Buffer copy alive): ... arrayBuffers=30.0MB
select 10MB raw node:sqlite took 4.4 ms -> Uint8Array len=10485760
[mem] after raw select: ... arrayBuffers=40.0MB
metadata-only select took 0.2 ms -> { id: 4, mime: 'image/png', size: 10485760, len: 10485760 }
substr(bytes,1,1MiB) chunk -> Uint8Array len=1048576
PRAGMA foreign_keys inside open txn after OFF (expect still 1): { foreign_keys: 1 }
PRAGMA foreign_keys outside txn after OFF (expect 0): { foreign_keys: 0 }
```

### 7.3 Express routes (`spike2.mjs`, abridged)

```js
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024;

function sniffImageMime(buf) {
  // WHATWG MIME Sniffing §6.1
  const starts = (bytes, offset = 0) =>
    bytes.every((b, i) => buf[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    starts([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    starts([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  )
    return "image/gif";
  if (
    starts([0x52, 0x49, 0x46, 0x46]) &&
    starts([0x57, 0x45, 0x42, 0x50, 0x56, 0x50], 8)
  )
    return "image/webp";
  return undefined;
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));
app.use("/api/trpc", (_req, res) => res.json({ trpc: true }));

const imagesRouter = express.Router();
imagesRouter.post(
  "/",
  express.raw({ type: IMAGE_TYPES, limit: MAX_BYTES }),
  (req, res) => {
    if (!Buffer.isBuffer(req.body))
      return res.status(415).json({ error: "unsupported media type" });
    const planId = Number(req.query.planId);
    if (!Number.isInteger(planId) || planId <= 0)
      return res.status(400).json({ error: "planId required" });
    const mime = sniffImageMime(req.body);
    if (!mime)
      return res.status(415).json({ error: "not a png/jpeg/webp/gif" });
    const sha256 = createHash("sha256").update(req.body).digest("hex");
    const existing = sqlite
      .prepare("SELECT id FROM images WHERE planId = ? AND sha256 = ?")
      .get(planId, sha256);
    if (existing)
      return res.status(200).json({ id: existing.id, deduped: true });
    const r = sqlite
      .prepare(
        "INSERT INTO images (userId, planId, sha256, mime, size, bytes) VALUES (?,?,?,?,?,?)"
      )
      .run(1, planId, sha256, mime, req.body.length, req.body);
    res
      .status(201)
      .json({ id: Number(r.lastInsertRowid), mime, size: req.body.length });
  }
);
imagesRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.sendStatus(404);
  const row = sqlite
    .prepare(
      "SELECT mime, sha256, bytes FROM images WHERE id = ? AND userId = ?"
    )
    .get(id, 1);
  if (!row) return res.sendStatus(404);
  res.set({
    "Content-Type": row.mime,
    "Cache-Control": "private, max-age=31536000, immutable",
    ETag: `"${row.sha256}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
  });
  res.send(
    Buffer.from(row.bytes.buffer, row.bytes.byteOffset, row.bytes.byteLength)
  );
});
app.use("/api/images", imagesRouter);
app.use("*", (_req, res) =>
  res.status(200).type("html").send("<html>index</html>")
); // Vite/static stand-in
app.use((err, _req, res, _next) =>
  res.status(err.status ?? 500).json({ error: err.type ?? err.message })
);
```

Output (trimmed):

```
POST png (ct image/png): 201 {"id":1,"mime":"image/png","size":5008}
POST same png again (dedupe): 200 {"id":1,"deduped":true}
POST png with lying ct image/jpeg (sniff wins): 200 {"id":1,"deduped":true}
POST png, ct application/octet-stream (not in type list): 415 {"error":"unsupported media type","bodyWas":"object"}
POST text ct image/png (fails sniff): 415 {"error":"not a png/jpeg/webp/gif"}
POST missing planId: 400 {"error":"planId required"}
POST exactly 10MiB: 201 {"id":2,"mime":"image/png","size":10485760}
POST 10MiB+1: 413 {"error":"entity.too.large","status":413}
POST 2MB json to /api/trpc (json limit 1mb): 413 {"error":"entity.too.large","status":413}
GET /api/images/1: 200 | ct=image/png | etag="6ed5d2eb..." | cc=private, max-age=31536000, immutable | len=5008
GET /api/images/1 If-None-Match via fetch (undici adds cache-control: no-cache): 200   <- test-client artifact
http.get If-None-Match (strong): 304 | len 0 | etag "6ed5d2eb..." | cc private, max-age=31536000, immutable | ct undefined
http.get If-None-Match (weak form): 304 | len 0
http.get If-None-Match (stale): 200 | len 5008
http.get If-None-Match + Cache-Control: no-cache (hard reload): 200 | len 5008
GET /api/images/2 (10MiB): 200 | ct=image/png | len=10485760
GET /api/images/999 (missing): 404 Not Found
GET /api/images/abc: 404 Not Found
GET /api/images/ (no id): 200 text/html <html>index</html>        <- falls to the SPA catch-all
HEAD /api/images/1: 200 | ct=image/png | len=5008 | <0 bytes>
```

### 7.4 FK cascade on a parent table rebuild (`spike3.mjs`)

```js
for (const pragmaInsideTxn of [true, false]) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE plans (...); CREATE TABLE images (..., FOREIGN KEY (planId) REFERENCES plans(id) ON DELETE cascade);
           INSERT INTO plans ...; INSERT INTO images ...;`);
  if (!pragmaInsideTxn) db.exec("PRAGMA foreign_keys=OFF");
  db.exec("BEGIN IMMEDIATE");
  if (pragmaInsideTxn) db.exec("PRAGMA foreign_keys=OFF");            // what ensureDatabaseSchema does today
  db.exec(`CREATE TABLE __new_plans (...); INSERT INTO __new_plans SELECT ...; DROP TABLE plans; ALTER TABLE __new_plans RENAME TO plans;`);
  if (pragmaInsideTxn) db.exec("PRAGMA foreign_keys=ON");
  db.exec("COMMIT");
  if (!pragmaInsideTxn) db.exec("PRAGMA foreign_keys=ON");
  console.log(count images);
}
```

```
--- PRAGMA foreign_keys=OFF issued INSIDE the transaction (images before: 1)
foreign_keys now: 1
images after rebuild: 0 | images FK now points at: REFERENCES plans(id)
--- PRAGMA foreign_keys=OFF issued OUTSIDE the transaction (images before: 1)
foreign_keys now: 0
images after rebuild: 1 | images FK now points at: REFERENCES plans(id)
```
