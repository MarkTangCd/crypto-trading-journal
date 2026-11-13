# Migrating `images` to a polymorphic owner on SQLite

Researched 2026-11-13 for TASK-86 (Trade journal map, doc-7). Everything below was run against the repo's pinned toolchain inside devbox: Node 22.22.3 (`node:sqlite` reports SQLite 3.51.2), drizzle-orm 0.45.2, drizzle-kit 0.31.10. The schema edit, the generated migrations and the migration-runner harness lived in a scratch copy of `drizzle/` (not committed); the exact schema diff and harness are reproduced in §5. Nothing in `drizzle/` or `server/` was changed by this ticket.

Settled before this ticket (doc-7, not reopened): images stay BLOBs in SQLite behind the Express routes with application-code cascade and no foreign key (decision-3); ownership becomes `ownerKind in ('plan', 'journal_entry', 'setup')` plus `ownerId`, unique on `(ownerKind, ownerId, sha256)`, replacing `planId`.

Source key:

- DRIZZLE-KIT-SRC: installed `node_modules/drizzle-kit/bin.cjs` 0.31.10: `SQLiteRecreateTableConvertor.convert` (≈ line 25190), `_moveDataStatements` (≈ 25480, push path), `promptColumnsConflicts` / `columnsResolver` (≈ 32146–32711).
- DRIZZLE-ORM-SRC: installed `drizzle-orm/sqlite-proxy/migrator.js` (`migrate`) and `drizzle-orm/migrator.js` (`readMigrationFiles`).
- SQLITE-ALTER: https://www.sqlite.org/lang_altertable.html ("ADD COLUMN", "DROP COLUMN", "RENAME COLUMN", "Making Other Kinds Of Table Schema Changes").
- SQLITE-PRAGMA-FK: https://www.sqlite.org/pragma.html#pragma_foreign_keys.
- REPO: `server/db.ts` (`runInSqliteTransaction`, `ensureDatabaseSchema`, plan image helpers), `server/_core/imageRoutes.ts`, `server/_core/imageRoutes.test.ts`, `server/plan.db.test.ts`, `client/src/components/plans/PlanEditor.tsx`, `drizzle/schema.ts`, `drizzle/meta/_journal.json`, `drizzle/0007_drop_users_initial_balance.sql`, `drizzle/0012_left_starfox.sql`, `backlog/decisions/decision-3`, `backlog/docs/doc-7`.

## 0. Verdicts

1. **drizzle-kit emits a full `__new_images` rebuild, and the file it emits does not run.** For this change (two NOT NULL columns without defaults, one dropped column, one CHECK, one swapped unique index) `drizzle-kit generate` produces `PRAGMA foreign_keys=OFF; CREATE TABLE __new_images …; INSERT INTO __new_images(…) SELECT … FROM images; DROP TABLE images; ALTER TABLE __new_images RENAME TO images; PRAGMA foreign_keys=ON; CREATE … INDEX …`. It is the same SQL whether you answer the interactive prompt with "create column" or "rename planId › ownerId": the rename answer only changes the snapshot diff, never the SQL (§1.2). The `INSERT … SELECT` lists the **new** column set on both sides, so it selects `"ownerKind"` and `"ownerId"` from the old table. Through the real runner this fails with `no such column: "ownerKind"`; `ensureDatabaseSchema` rolls the whole batch back, the database keeps the old schema and every row, `getDb()` returns `null` and the app starts with no database (§1.4). No silent data loss, but no migration either.
2. **Cheapest safe shape: keep the generated file and fix one line.** Run `drizzle-kit generate` (so the journal entry and `0015_snapshot.json` are exactly what the tool wrote and `drizzle-kit check` stays green), then change the `SELECT` list to `SELECT "id", "userId", 'plan', "planId", "sha256", …`. Verified end to end through `ensureDatabaseSchema` on a database seeded at 0014: all rows survive with `ownerKind='plan'`, `ownerId = old planId`, byte-identical BLOBs, ids and the AUTOINCREMENT counter preserved, CHECK and both indexes present, `PRAGMA integrity_check` ok (§2.1). The repo already does exactly this: `0012_left_starfox.sql` carries hand-substituted `NULL` / `'binance'` in its rebuild `SELECT`, which no code path of drizzle-kit 0.31.10 generates. The ticket's three-step variant (add nullable columns, `UPDATE`, rebuild) is a superset: the rebuild is where the backfill happens anyway (§2.2). An ALTER-only variant that avoids copying the BLOBs also works on SQLite 3.51.2 but leaves the live DDL diverging from the snapshot; not recommended (§2.3).
3. **Touch points: 6 code files, about 25 sites** (§3), plus `getPlanRow` gaining two sibling lookups for the new owner kinds. The POST route's per-kind ownership rule is in §4.

## 1. What `drizzle-kit generate` emits

### 1.1 The command and its prompts

Schema diff in §5.1. Command: `devbox run -- npx drizzle-kit generate --name images_polymorphic_owner` (`--name` sets the tag; verified it yields `0015_images_polymorphic_owner.sql`).

drizzle-kit asks two questions, one per added column, because a column was removed from the same table:

```
Is ownerKind column in images table created or renamed from another column?
❯ + ownerKind          create column
  ~ planId › ownerKind rename column
Is ownerId column in images table created or renamed from another column?
❯ + ownerId          create column
  ~ planId › ownerId rename column
```

These prompts need a TTY. With piped stdin (CI, an agent) 0.31.10 aborts with `Error: Interactive prompts require a TTY terminal (process.stdin.isTTY or process.stdout.isTTY is false)` (DRIZZLE-KIT-SRC `render10` / `promptColumnsConflicts`). Run it from a real terminal, or drive it with `expect` as this ticket did (§5.3).

### 1.2 The SQL, for both answers

Answering "create" twice, drizzle-kit writes `0015_images_polymorphic_owner.sql`:

```sql
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`ownerKind` text NOT NULL,
	`ownerId` integer NOT NULL,
	`sha256` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`bytes` blob NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "images_mime_check" CHECK("__new_images"."mime" in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
	CONSTRAINT "images_owner_kind_check" CHECK("__new_images"."ownerKind" in ('plan', 'journal_entry', 'setup'))
);
--> statement-breakpoint
INSERT INTO `__new_images`("id", "userId", "ownerKind", "ownerId", "sha256", "mime", "size", "bytes", "createdAt") SELECT "id", "userId", "ownerKind", "ownerId", "sha256", "mime", "size", "bytes", "createdAt" FROM `images`;--> statement-breakpoint
DROP TABLE `images`;--> statement-breakpoint
ALTER TABLE `__new_images` RENAME TO `images`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `images_owner_sha_unique` ON `images` (`ownerKind`,`ownerId`,`sha256`);--> statement-breakpoint
CREATE INDEX `images_user_idx` ON `images` (`userId`);
```

Answering "create ownerKind" and "rename planId › ownerId" produces a byte-identical file (`diff` of the two outputs is empty). drizzle-kit prints `~ planId › ownerId column will be renamed`, but once the table needs recreating the convertor ignores renames: `SQLiteRecreateTableConvertor.convert` builds `columnNames = columns.map(it => `"${it.name}"`)` from the **new** column list and uses that string for both the `INSERT` column list and the `SELECT` list (DRIZZLE-KIT-SRC ≈ 25190–25215; the push-path `_moveDataStatements` at ≈ 25480 and the libsql twin at ≈ 79805 do the same with `Object.keys(json.tables[tableName].columns)`). There is no code path that substitutes `NULL`, a default, or an old column name. So:

- It is a rebuild, not `ALTER TABLE … RENAME COLUMN` / `ADD COLUMN`. SQLite forces that: `ADD COLUMN` with `NOT NULL` requires "a default value other than NULL" (SQLITE-ALTER, "ADD COLUMN"), a CHECK cannot be added by ALTER, and `DROP COLUMN` refuses a column that "is indexed" (SQLITE-ALTER, "DROP COLUMN"), which `planId` is via `images_plan_sha_unique`.
- The old `planId` values are never read: the generator would drop them even if the statement ran.
- `0012_left_starfox.sql` in this repo (commit 32bc98d) shows rebuild `SELECT`s containing `NULL` for the new nullable `tradeId` and `'binance'` for `accounts.exchange`; those are hand edits to the generated file, the same technique §2.1 recommends.

### 1.3 Journal and snapshot

The generated journal entry and snapshot are consistent and need no hand editing:

- `drizzle/meta/_journal.json` gains `{"idx": 15, "version": "6", "when": 1794574917122, "tag": "0015_images_polymorphic_owner", "breakpoints": true}` (`when` = `Date.now()` at generation).
- `drizzle/meta/0015_snapshot.json`: `prevId` equals 0014's `id` (`af2ecd23-…`), `tables.images.columns` has `ownerKind` (`text`, notNull) and `ownerId` (`integer`, notNull) and no `planId`; `indexes` has `images_owner_sha_unique` on `["ownerKind","ownerId","sha256"]` (unique) and `images_user_idx`; `checkConstraints` has `images_mime_check` and `images_owner_kind_check`. The `$type<…>()` annotation leaves no trace in the snapshot.
- `drizzle-kit check` on the resulting folder prints `Everything's fine`; a second `generate` prints `No schema changes, nothing to migrate`.
- The existing chain is intact: every snapshot 0001–0014 has `prevId` equal to the previous snapshot's `id` (verified with a script over `drizzle/meta`), including the hand-named 0004, 0006 and 0007.

### 1.4 How it interacts with `ensureDatabaseSchema`

`server/db.ts:110-161`. drizzle's `migrate` for sqlite-proxy reads `meta/_journal.json`, loads each tag's `.sql`, splits on `--> statement-breakpoint`, and selects the migrations whose journal `when` is greater than the newest `created_at` row in `__drizzle_migrations`; the file hash is stored but never compared (DRIZZLE-ORM-SRC `migrate`, `readMigrationFiles`). It then calls the project callback **once** with every pending statement plus one `INSERT INTO __drizzle_migrations` per migration. The callback strips standalone `BEGIN|COMMIT|ROLLBACK|END` statements, opens `BEGIN IMMEDIATE`, `exec`s each statement, and `COMMIT`s or `ROLLBACK`s all of them.

Consequences measured with the harness (§5.2), seeded with two plans and three images at 0014:

| Migration file applied through `ensureDatabaseSchema` | Result                                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Generated 0015 as-is (§1.2)                           | `[Database] Failed to connect: Error: no such column: "ownerKind" - should this be a string literal in single-quotes?`; `getDb()` → `null`; `__drizzle_migrations` still 15 rows; `images` still has `planId` and its 3 rows; `integrity_check` ok                 |
| Generated 0015 with the `SELECT` list fixed (§2.1)    | `getDb()` → db; 16 migration rows; columns `id,userId,ownerKind,ownerId,sha256,mime,size,bytes,createdAt`; rows `(1,'plan',1,'aa')`, `(2,'plan',2,'aa')`, `(3,'plan',1,'bb')` with `length(bytes)=3`; both CHECKs in `sqlite_master`; `sqlite_sequence.images = 3` |
| ALTER-only 0015 (§2.3)                                | `getDb()` → db; same rows; DDL carries `` `ownerKind` text NOT NULL DEFAULT 'plan' `` appended last and no `images_owner_kind_check`                                                                                                                               |

Points that matter for this migration:

- **`PRAGMA foreign_keys=OFF/ON` is a no-op here** ("This pragma is a no-op within a transaction; foreign key constraint enforcement may only be enabled or disabled when there is no pending BEGIN or SAVEPOINT", SQLITE-PRAGMA-FK), which is the decision-3 hazard. It is harmless for `images`: no table in the schema declares a foreign key (drizzle-kit prints `0 fks` for all 13 tables) and nothing references `images`, so `DROP TABLE images` cascades nothing. The hazard only bites when a table **with** `ON DELETE CASCADE` children is rebuilt; `images` has none and is none.
- **A failing statement rolls back everything pending**, including any other migration bundled in the same start-up and the journal rows, so a broken 0015 cannot leave a half-migrated file. The price is that the app comes up with `_db = null` (`getDb` catches and warns) rather than refusing to start.
- `CREATE TABLE`, `INSERT … SELECT`, `DROP TABLE`, `ALTER TABLE … RENAME TO` and `CREATE INDEX` are all transactional in SQLite, so the rebuild runs correctly inside the runner's single `BEGIN IMMEDIATE`; this is the SQLite-documented 12-step procedure with steps 1 and 12 (the pragma) made inert (SQLITE-ALTER, "Making Other Kinds Of Table Schema Changes").
- Ids and the `AUTOINCREMENT` counter survive: `INSERT … SELECT` copies `id`, and after `DROP TABLE` + `RENAME TO` `sqlite_sequence.images` reads 3, so deleted-id reuse is no worse than today and the GET route's "an id maps to one byte sequence forever" assumption (`imageRoutes.ts:159-160`) still holds.
- Cost: the rebuild copies every BLOB once (`INSERT … SELECT` on the whole table). One-off, proportional to the total screenshot bytes; milliseconds for the seeded DB, seconds at most for a journal of a few hundred screenshots. The runner holds the write lock for the duration, which is fine at start-up.

## 2. The migration to ship

### 2.1 Recommended: generated file, one line edited

Procedure (mirrors how 0007 was made: commit 7b13589 touched the `.sql`, `0007_snapshot.json`, `_journal.json` and `schema.ts` together, with the snapshot generated by the tool and the tag/`when` hand-set):

1. Edit `drizzle/schema.ts` as in §5.1 (and the doc comment above the table, §3).
2. From a real terminal: `devbox run -- npx drizzle-kit generate --name images_polymorphic_owner`; answer **create column** for both prompts (the answer does not change the SQL, and "create" keeps the snapshot diff honest: these are new columns).
3. In `drizzle/0015_images_polymorphic_owner.sql`, replace the `INSERT` statement with:

```sql
INSERT INTO `__new_images`("id", "userId", "ownerKind", "ownerId", "sha256", "mime", "size", "bytes", "createdAt") SELECT "id", "userId", 'plan', "planId", "sha256", "mime", "size", "bytes", "createdAt" FROM `images`;--> statement-breakpoint
```

Leave every other line, including the two `PRAGMA` lines, as generated: they are no-ops inside the runner's transaction and keeping the file byte-close to the generator's output makes the hand edit obvious in review. Do not touch `0015_snapshot.json`.

4. Optionally round `when` in `_journal.json` (precedent: 0004 `1780930000000`, 0006 `1781709780000`, 0007 `1781800000000`). It must stay greater than 0014's `1794296535377`, because `migrate` selects by `when`, not by hash or idx.
5. `devbox run -- npx drizzle-kit check`, then `devbox run -- npm run test` (`plan.db.test.ts` migrates a fresh database through the full journal, so a broken 0015 fails there), then run the app once against a copy of the real database file and confirm `[Database]` prints no `Failed to connect`.

The full file after step 3 is §1.2 with that one `INSERT` line swapped. Every existing row becomes a plan-owned image; no row is dropped or reordered; the `(ownerKind, ownerId, sha256)` index cannot collide because the old index already guaranteed `(planId, sha256)` uniqueness.

### 2.2 Not recommended: three-step add / backfill / rebuild

```sql
ALTER TABLE `images` ADD `ownerKind` text;
ALTER TABLE `images` ADD `ownerId` integer;
UPDATE `images` SET `ownerKind` = 'plan', `ownerId` = `planId`;
-- then the same CREATE __new_images / INSERT … SELECT / DROP / RENAME / CREATE INDEX as §1.2
```

Same end state, same rebuild (SQLite still needs it for NOT NULL-without-default, the CHECK and dropping an indexed column), three more statements, and the rebuild's `SELECT` must still be hand-written. The backfill inside the rebuild `SELECT` (§2.1) is the three-step collapsed into one statement.

### 2.3 Not recommended: ALTER-only, no BLOB copy

```sql
ALTER TABLE `images` ADD `ownerKind` text NOT NULL DEFAULT 'plan';--> statement-breakpoint
ALTER TABLE `images` RENAME COLUMN `planId` TO `ownerId`;--> statement-breakpoint
DROP INDEX `images_plan_sha_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `images_owner_sha_unique` ON `images` (`ownerKind`,`ownerId`,`sha256`);
```

Runs on SQLite 3.51.2 through the runner and keeps the rows (§1.4 table), with no copy of the BLOBs. Rejected because the live DDL then disagrees with what `schema.ts` and `0015_snapshot.json` say: the column carries `DEFAULT 'plan'` the schema does not declare, there is no `images_owner_kind_check`, and `ownerKind` sits last in column order. drizzle-kit never introspects the live file on `generate`, so the drift is invisible until the next rebuild of `images` silently "fixes" it. The one-off BLOB copy is cheaper than that ambiguity for a single-user database.

## 3. Every code path that reads or writes `images.planId`

Line numbers are from `main` at f9192ea.

| File:line                                             | Today                                                                                                              | Change                                                                                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drizzle/schema.ts:386-391`                           | Doc comment: "Image pasted into a plan's rich text … deleted with its plan"                                        | Reword for three owner kinds                                                                                                                                                                                                |
| `drizzle/schema.ts:398-399`                           | `planId: integer("planId").notNull()`                                                                              | `ownerKind` + `ownerId` (§5.1)                                                                                                                                                                                              |
| `drizzle/schema.ts:417-418`                           | `uniqueIndex("images_plan_sha_unique").on(table.planId, table.sha256)`                                             | `images_owner_sha_unique` on `(ownerKind, ownerId, sha256)` plus `images_owner_kind_check`                                                                                                                                  |
| `drizzle/schema.ts:423-424`                           | `Image` / `InsertImage` inferred types                                                                             | Change by inference; every `insertImage({ planId })` caller stops compiling, which is the safety net                                                                                                                        |
| `shared/const.ts:51-58`                               | `IMAGE_MIME_TYPES`, `MAX_IMAGE_BYTES`                                                                              | Add `IMAGE_OWNER_KINDS = ["plan", "journal_entry", "setup"] as const` next to them (route zod enum + schema `$type`)                                                                                                        |
| `server/db.ts:1231-1250` (`deletePlan`)               | `.delete(images).where(and(eq(images.planId, planId), eq(images.userId, userId)))` at 1245-1246                    | `eq(images.ownerKind, "plan"), eq(images.ownerId, planId)`; the new `deleteJournalEntry` / `deleteSetup` need the same cascade (doc-7: delete cascades images; a setup in use cannot be deleted)                            |
| `server/db.ts:1272-1293` (`findImageBySha`)           | Signature `(userId, planId, sha256)`, filter at 1286 `eq(images.planId, planId)`                                   | `(userId, ownerKind, ownerId, sha256)`; filter on both owner columns                                                                                                                                                        |
| `server/db.ts:1294-1304` (`insertImage`)              | Comment "Throws on a (planId, sha256) unique violation"; body is `values(row)` with `InsertImage`                  | Comment only; the row type carries the new columns                                                                                                                                                                          |
| `server/db.ts:1306-1318` (`getImage`)                 | Filters by `id` + `userId`                                                                                         | None: reads stay owner-kind agnostic, `userId` is the access check                                                                                                                                                          |
| `server/_core/imageRoutes.ts:12`                      | `import { findImageBySha, getImage, getPlanRow, insertImage }`                                                     | Add the two sibling lookups (§4)                                                                                                                                                                                            |
| `server/_core/imageRoutes.ts:66`                      | Doc: `POST /api/images?planId=N`                                                                                   | `POST /api/images?ownerKind=plan&ownerId=N`                                                                                                                                                                                 |
| `server/_core/imageRoutes.ts:83-86`                   | `idSchema.safeParse(req.query.planId)` → 400 `invalid planId`                                                      | Parse `ownerKind` (zod enum over `IMAGE_OWNER_KINDS`) and `ownerId`; 400 on either                                                                                                                                          |
| `server/_core/imageRoutes.ts:89-98`                   | `getPlanRow(userId, planId)` → 404 `plan not found`; `closedAt !== null` → 409 `plan is closed`                    | Dispatch per kind (§4)                                                                                                                                                                                                      |
| `server/_core/imageRoutes.ts:113`, `:131`             | `findImageBySha(userId, plan.id, sha256)` (pre-check and the unique-violation re-select)                           | Pass `(userId, ownerKind, ownerId, sha256)`                                                                                                                                                                                 |
| `server/_core/imageRoutes.ts:120-127`                 | `insertImage({ userId, planId: plan.id, … })`                                                                      | `ownerKind, ownerId`                                                                                                                                                                                                        |
| `server/_core/imageRoutes.ts:142-172` (GET)           | `getImage(userId, id)`                                                                                             | None                                                                                                                                                                                                                        |
| `client/src/components/plans/PlanEditor.tsx:26-27`    | `uploadImage(planId, file)` → `fetch(`/api/images?planId=${planId}`)`                                              | `uploadImage({ ownerKind, ownerId }, file)` → `?ownerKind=…&ownerId=…`                                                                                                                                                      |
| `client/src/components/plans/PlanEditor.tsx:43-55`    | Doc comment and `planId: number` prop                                                                              | Prop becomes an owner `{ kind, id }` (or two props); the editor is reused by journal entries and setups per doc-7                                                                                                           |
| `client/src/components/plans/PlanEditor.tsx:103`      | `uploadImage(planId, file)` inside `insertImages`                                                                  | Pass the owner                                                                                                                                                                                                              |
| `client/src/pages/PlanDetail.tsx:149`                 | `<PlanEditor planId={plan.id} …>`                                                                                  | `owner={{ kind: "plan", id: plan.id }}` (164 and 172 pass `planId` to `PlanScenarios` / `PlanObservations`, which forward it at `PlanScenarios.tsx:193` and `PlanObservations.tsx:54,133`; those forward the owner instead) |
| `server/_core/imageRoutes.test.ts:17-25`              | `StoredImage.planId`                                                                                               | `ownerKind`, `ownerId`                                                                                                                                                                                                      |
| `server/_core/imageRoutes.test.ts:27-45`              | In-memory `store.plans`, `getPlanRow` mock, `findImageBySha` mock keyed on `planId`                                | Add `store.entries` / `store.setups` and the two lookup mocks; key the sha mock on `(ownerKind, ownerId)`                                                                                                                   |
| `server/_core/imageRoutes.test.ts:113-117`            | `upload(planId, body, type)` → `?planId=`                                                                          | `upload(owner, …)` → `?ownerKind=&ownerId=`                                                                                                                                                                                 |
| `server/_core/imageRoutes.test.ts:150-162`, `164-170` | Expects `planId: 1`; "dedupes … within a plan"                                                                     | Expect the owner pair; add "same bytes under another owner kind gets a new row"                                                                                                                                             |
| `server/_core/imageRoutes.test.ts:192-215`            | 400 for bad `planId`; 404 unknown/foreign plan; 409 closed plan                                                    | Add 400 for a bad `ownerKind`; 404/409 cases per kind (§4)                                                                                                                                                                  |
| `server/_core/imageRoutes.test.ts:262-270`            | Fixture `planId: 2`                                                                                                | Owner pair                                                                                                                                                                                                                  |
| `server/plan.db.test.ts:193-218`                      | `insertImage({ … planId: p.id … })` at 202 and 204; raw `count(*) … where planId = ?` at 211 covers `images` too   | Owner pair in the inserts; split the raw count for `images` to `where ownerKind='plan' and ownerId=?`                                                                                                                       |
| `server/plan.db.test.ts:221-253`                      | `findImageBySha(1, p.id, "abc")` at 230-235; `"unique (planId, sha256)"` at 243; `{ ...img, planId: q.id }` at 244 | New signature; new index name; add a cross-kind dedupe case                                                                                                                                                                 |

Not code, but they state `planId` and should be updated when the spec lands: `backlog/docs/doc-5` lines 30 and 36, `backlog/docs/doc-6` lines 177, 214-215, 253 and 297, and decision-3 item 1 and 3 (a new decision or an amendment recording the polymorphic owner).

No tRPC procedure touches `images` (`server/routers.ts` has no match), `server/_core/index.ts:64` only mounts the router, and `shared/richText.ts` only knows `/api/images/:id` URLs, so none of them change.

## 4. Ownership check per owner kind in `POST /api/images`

Today (`imageRoutes.ts:89-98`): `getPlanRow(userId, planId)` (`db.ts:930-944`, `plans WHERE id = ? AND userId = ?`) gives 404 when missing or foreign, then `closedAt !== null` gives 409. The same two-step shape fits every kind; the route should dispatch on the parsed `ownerKind` before touching the body:

| `ownerKind`     | Lookup (new sibling of `getPlanRow`, `… WHERE id = ? AND userId = ?`) | 404 when              | 409 when                                                                                                                                                                                                                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan`          | `getPlanRow` (exists)                                                 | missing or other user | `closedAt !== null` (unchanged)                                                                                                                                                                                                                                                                                                                                        |
| `journal_entry` | `getJournalEntryRow`                                                  | missing or other user | `reviewedAt !== null`: doc-7 makes a reviewed entry read-only, so no new screenshot may be attached. The before/after slot rule ("after" is locked until every linked trade is closed) is about where the URL may be attached, not about storing bytes; enforce it in the tRPC mutation that writes the slot, not here, unless the route also takes a `slot` parameter |
| `setup`         | `getSetupRow`                                                         | missing or other user | none: setups have no lifecycle state in doc-7                                                                                                                                                                                                                                                                                                                          |

Keep `userId` on the row and keep `GET` filtering by `userId` only, so an image stays readable regardless of owner kind and the ownership check happens once, at upload. `findImageBySha` must take the full `(userId, ownerKind, ownerId)` so the dedupe never hands an entry an image id that belongs to a plan with the same bytes; the unique index backs the same rule. Cascades: `deletePlan` already deletes by owner; `deleteJournalEntry` and `deleteSetup` delete `where ownerKind = ? and ownerId = ? and userId = ?` inside the same `runInSqliteTransaction` as their parent row.

## 5. Appendix

### 5.1 Schema edit used for the experiment

Applied only inside `export const images = sqliteTable("images", …)` in `drizzle/schema.ts` (the same comment-plus-column text also exists in `plan_scenarios` and `plan_observations`; a global replace of it breaks those tables and makes drizzle-kit crash with `Cannot read properties of undefined (reading 'name')` in `generateSqliteSnapshot`):

```diff
-    /** Owning plan; no FK, cascaded in application code */
-    planId: integer("planId").notNull(),
+    /** Owner row kind; no FK, cascaded in application code */
+    ownerKind: text("ownerKind")
+      .$type<"plan" | "journal_entry" | "setup">()
+      .notNull(),
+    /** Owner row id within ownerKind */
+    ownerId: integer("ownerId").notNull(),
@@
-    uniqueIndex("images_plan_sha_unique").on(table.planId, table.sha256),
+    check(
+      "images_owner_kind_check",
+      sql`${table.ownerKind} in ('plan', 'journal_entry', 'setup')`
+    ),
+    uniqueIndex("images_owner_sha_unique").on(
+      table.ownerKind,
+      table.ownerId,
+      table.sha256
+    ),
```

### 5.2 Migration-runner harness

Two tsx scripts, run with `devbox run -- env DATABASE_URL=<file> PHASE_DIR=<dir> npx tsx <script>`; each `PHASE_DIR` holds a `drizzle/` copy and the script calls `process.chdir(PHASE_DIR)` before `await import("server/db.ts")`, because `MIGRATIONS_FOLDER = resolve(process.cwd(), "drizzle")` is fixed at import (`db.ts:51`).

- Phase 1 (`drizzle/` = the committed 0000–0014): `getOrCreateAnonymousUser()`, `createPlan` ×2, `insertImage` ×3 (`(plan 1, "aa")`, `(plan 2, "aa")`, `(plan 1, "bb")`, 3-byte BLOBs), `closeDb()`.
- Phase 2/3/4 (`drizzle/` = 0000–0015 with the generated, hand-fixed, or ALTER-only 0015; a copy of the phase-1 file): `getDb()` (which runs `ensureDatabaseSchema`), `closeDb()`, then raw `node:sqlite` reads of `sqlite_version()`, `count(*) from __drizzle_migrations`, `pragma table_info('images')`, `pragma index_list('images')`, `sqlite_master.sql`, the rows, `sqlite_sequence` and `pragma integrity_check`. Results are the table in §1.4.

### 5.3 Driving the prompt without a terminal

```expect
spawn devbox run -- npx drizzle-kit generate --config <cfg> --name <tag>
expect -re "created or renamed"; sleep 1; send -- "\r"
expect -re "created or renamed"; sleep 1; send -- "\033\[B"; sleep 1; send -- "\r"
expect eof
```

Omit the `"\033\[B"` (cursor down) to answer "create" for the second column as well. A scratch `drizzle.config.ts` with `schema` pointing at a copy of `schema.ts` and `out` at a copy of `drizzle/` keeps the real migration folder untouched; `out` must be a relative path, drizzle-kit prefixes it with `./`.
