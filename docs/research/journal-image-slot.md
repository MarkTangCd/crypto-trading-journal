# Standalone paste-and-drop image slot reusing the upload pipeline

Findings for TASK-87 (wayfinder research, Trade journal map doc-7).
Branch `research/journal-image-slot`, 2026-11-13. No application code was
changed; the sketches below are proposals for the build tickets.

Versions read from `node_modules`: `@tiptap/extension-file-handler` 3.32.0,
`prosemirror-view` 1.42.9, React 19.2. Line numbers are from the main
checkout at `f9192ea`.

Assumption (from task-86): the upload URL becomes
`POST /api/images?ownerKind=journal_entry&ownerId=N` and `deleteJournalEntry`
deletes `images where ownerKind='journal_entry' and ownerId=?` in application
code, as `deletePlan` does today (`server/db.ts:1231-1253`).

## Summary

1. **Reusable now**: the upload fetch (`PlanEditor.tsx:26-39`), the size
   guard and its toast text (`:89-92`), the failure toast text (`:121`), the
   `blob:` object-URL preview idea (`:93`, `:135`). **Editor-bound**: the
   FileHandler plugin itself, `insertContentAt`, `findImage` +
   `setNodeMarkup` src swap, and the `pendingUploads` gate on autosave.
   Smallest extraction: `client/src/lib/images.ts` exporting
   `uploadImage(file, owner): Promise<{ id, url }>` and
   `imageUploadError(file): string | undefined`; PlanEditor loses ~14 lines
   and gains two imports. Nothing on the server changes for this ticket.
2. **Receive paste on a focused native `<button>` with React `onPaste`, and
   drop on the slot wrapper with `onDragOver` + `onDrop`.** Not a window
   listener. The paste event targets the focused node (Clipboard API spec),
   ProseMirror only listens on its own `view.dom`, and FileHandler calls
   `stopPropagation()` on file pastes/drops, so slot and editor cannot
   double-fire as long as neither wraps the other. A macOS screenshot
   pasted in Chrome or Safari arrives as one `File` named `image.png` of type
   `image/png` in `clipboardData.files` (Blink and WebKit sources below),
   which is the same list FileHandler reads. A hidden
   `<input type="file" accept=... multiple>` behind the button gives keyboard
   users a path that does not need the clipboard.
3. **Store two ordered JSON arrays of image ids on `journal_entries`
   (`beforeImageIds`, `afterImageIds`, `text({ mode: "json" })`,
   `$type<number[]>()`, default `'[]'`).** Same shape as `enabledSkillIds`
   and `contextTimeframes`. Removing from a slot rewrites the array and
   **orphans** the row (decision-3 already tolerates this for the editor);
   deleting the entry cascades by owner. Mutate the arrays through
   server-side `addSlotImage` / `removeSlotImage` procedures that
   read-modify-write inside `runInSqliteTransaction`, so three uploads
   finishing together cannot overwrite each other. Reject a `slot` column on
   `images` (one row cannot sit in both slots under the `(owner, sha256)`
   unique index) and a join table (a second table and migration for no
   gain in a single-user app).

## 1. What in the current pipeline is reusable

### Inventory

| Piece                                                                                                                 | Where                                                                                                                    | Depends on Tiptap?                                                                                                 | Verdict                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Upload fetch: `POST /api/images?planId=` with `content-type: file.type`, raw `File` body, `{ id }` / `{ error }` JSON | `client/src/components/plans/PlanEditor.tsx:26-39`                                                                       | No. Plain `fetch`; only the query string names the owner.                                                          | Extract as is, parameterise the owner.                                                                                              |
| Size guard `file.size > MAX_IMAGE_BYTES` → `toast.error("<name> is over 10 mb")`, skip file                           | `PlanEditor.tsx:89-92`; constant `shared/const.ts:58`                                                                    | No                                                                                                                 | Extract as `imageUploadError(file)`.                                                                                                |
| Client mime guard                                                                                                     | FileHandler `allowedMimeTypes` filter on `file.type` (`node_modules/@tiptap/extension-file-handler/dist/index.js:18,31`) | **Yes** — happens inside the plugin before `onPaste`/`onDrop`                                                      | The slot must filter `IMAGE_MIME_TYPES.includes(file.type)` itself; fold into `imageUploadError`.                                   |
| Server mime guard: magic-byte sniff, 415 on unknown                                                                   | `server/_core/imageRoutes.ts:33-39,100-110`                                                                              | No                                                                                                                 | Unchanged; the backstop for both callers.                                                                                           |
| Failure toast `image upload failed: <message>`                                                                        | `PlanEditor.tsx:121`                                                                                                     | No                                                                                                                 | Reuse the wording in the slot.                                                                                                      |
| `blob:` preview via `URL.createObjectURL` / `revokeObjectURL`                                                         | `PlanEditor.tsx:93,135`                                                                                                  | No                                                                                                                 | Same technique in the slot, held in React state instead of a node attr.                                                             |
| Placeholder node insert (`insertContentAt`, `title: "uploading"`) and CSS `.plan-editor img[title="uploading"]`       | `PlanEditor.tsx:95-101`; `client/src/index.css:327-329`                                                                  | **Yes**                                                                                                            | Editor-bound. Slot renders a pending `<img>` with the same `opacity: 0.4` treatment.                                                |
| Src swap after upload: `findImage` + `tr.setNodeMarkup(..., src: /api/images/:id)` and delete-on-failure              | `PlanEditor.tsx:14-24,103-133`                                                                                           | **Yes** (ProseMirror transaction)                                                                                  | Editor-bound. Slot equivalent: replace the pending entry with the id, or drop it on failure.                                        |
| `pendingUploads` counter gating autosave so a `blob:` src is never saved                                              | `PlanEditor.tsx:66,77-85,134-138`                                                                                        | **Yes** (guards `editor.getJSON()`)                                                                                | Not needed: the slot saves ids, never previews.                                                                                     |
| `FileHandler.configure({ onPaste, onDrop, consumePasteEvent })`                                                       | `PlanEditor.tsx:156-162`                                                                                                 | **Yes** — it is a ProseMirror plugin (`FileHandlePlugin`, `index.js:4-41`) with `handlePaste` / `handleDrop` props | Editor-bound.                                                                                                                       |
| Dedupe: POST returns the existing id when `(owner, sha256)` already exists                                            | `imageRoutes.ts:112-117,129-134`; `db.ts:1272-1293`                                                                      | No                                                                                                                 | Free for the slot. Pasting the same screenshot twice yields the same id; the slot should no-op when the id is already in its array. |

The server route needs no change for this ticket beyond what task-86 does
to the owner. One consequence to carry into the spec: the route's
`plan.closedAt !== null → 409 "plan is closed"` guard (`imageRoutes.ts:95-98`)
becomes an owner-specific "is this owner still editable" check; for a journal
entry that is `reviewedAt !== null` (doc-7: reviewed = read-only).

### Smallest extraction

New file `client/src/lib/images.ts` (the `@/lib` folder already holds plain
helpers such as `plannedRiskReward.ts` and `syncErrors.ts`):

```ts
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from "@shared/const";

export type ImageOwner = {
  kind: "plan" | "journal_entry" | "setup";
  id: number;
};

/** Why `file` cannot be uploaded, or undefined when it can. */
export function imageUploadError(file: File): string | undefined {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name} is not an image`;
  }
  if (file.size > MAX_IMAGE_BYTES) return `${file.name} is over 10 mb`;
  return undefined;
}

/** POST raw bytes to /api/images; resolves to the stored id and its URL. */
export async function uploadImage(
  file: File,
  owner: ImageOwner
): Promise<{ id: number; url: string }> {
  const query = new URLSearchParams({
    ownerKind: owner.kind,
    ownerId: String(owner.id),
  });
  const response = await fetch(`/api/images?${query}`, {
    method: "POST",
    headers: { "content-type": file.type },
    body: file,
  });
  const body: { id?: number; error?: string } = await response
    .json()
    .catch(() => ({}));
  if (!response.ok || typeof body.id !== "number") {
    throw new Error(body.error ?? `upload failed (${response.status})`);
  }
  return { id: body.id, url: `/api/images/${body.id}` };
}
```

The mime branch of `imageUploadError` never fires inside the editor (the
FileHandler filter runs first) but is what the slot relies on; keeping both
checks in one function means one message vocabulary. `uploadImage` does not
toast: the editor and the slot already own their toasts and the editor also
has to roll back a node on failure.

What `PlanEditor.tsx` changes:

- Lines 26-39 (`uploadImage(planId, file)`) are deleted.
- Line 2 keeps only what is still used; add
  `import { imageUploadError, uploadImage } from "@/lib/images";`.
  `MAX_IMAGE_BYTES` is no longer referenced; `IMAGE_MIME_TYPES` still feeds
  `allowedMimeTypes` at line 157.
- Lines 89-92 become:
  ```ts
  const error = imageUploadError(file);
  if (error) {
    toast.error(error);
    continue;
  }
  ```
- Line 103 becomes `uploadImage(file, { kind: "plan", id: planId })`, the
  `.then(id => ...)` becomes `.then(({ url }) => ...)` and line 113 becomes
  `src: url`.
- Everything else (placeholder insert, `findImage`, failure rollback,
  `pendingUploads`, `scheduleSave`) stays; it is the editor's business.

Call sites that pass `planId` and are untouched by this: `PlanDetail.tsx:148`,
`PlanScenarios.tsx:192`, `PlanObservations.tsx:53,131`. Sequencing: the
helper must land with or after task-86 (owner params); landing it earlier
would mean temporarily emitting `?planId=` for `kind: "plan"`, which is not
worth the branch.

## 2. How a non-editor element receives paste and drop

### What the clipboard yields for a macOS screenshot

- Clipboard API spec, "fire a clipboard event", target step: in a
  non-editable context, "set target to the focused node, or the body element
  if no node has focus". The paste action "has no effect in a non-editable
  context, but the paste event fires regardless"; `clipboardData` is a
  read-only drag data store filled from the OS clipboard for trusted events.
  Source: https://w3c.github.io/clipboard-apis/#clipboard-event-paste
- MDN `paste` event: "This event bubbles up the DOM tree, eventually to
  `Document` and `Window`, is cancelable and is composed."
  https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event
- MDN `DataTransfer.files`: "For clipboard operations, files can also be
  read in the handler for the `paste` event, using
  `ClipboardEvent.clipboardData`."
  https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/files
- **Chrome (Blink)**: `DataObjectItem::CreateFromClipboard` creates a
  `kFileKind` item when the clipboard type is `ui::kMimeTypePng`;
  `DataObjectItem::GetAsFile` returns
  `MakeGarbageCollected<File>("image.png", base::Time::Now(), ...)` with
  content type `ui::kMimeTypePng`.
  https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/clipboard/data_object_item.cc
- **Safari (WebKit)**: `Pasteboard::read(PasteboardFileReader&)` converts a
  TIFF pasteboard image with `convertTIFFToPNG` and hands it to the reader
  as `imageTypeToFakeFilename(imageType)`, which returns `"image.png"_s`
  ("For Web compatibility, we pretend to have PNG instead").
  https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/platform/cocoa/PasteboardCocoa.mm
  WebKit blog, Safari 11.1: WebKit "exposes PNG images as files when there
  are images in the system pasteboard", "accessible through
  `DataTransfer.files` and `DataTransfer.items`".
  https://webkit.org/blog/8170/clipboard-api-improvements/

So in both browsers a Cmd-Ctrl-Shift-4 screenshot (or a copied image) is one
`File { name: "image.png", type: "image/png" }` in `clipboardData.files`,
and `clipboardData.items[i].kind === "file"` with `getAsFile()` returning the
same object. `clipboardData.files` is exactly what FileHandler reads
(`index.js:28-29`), so the slot reads the same list. Rich copies (an image
copied from a web page) also carry `text/html`; the slot ignores strings and
takes files only, so FileHandler's `consumePasteEvent` concern
(`index.js:36`) does not arise outside the editor. Firefox was not checked;
the trader uses Chrome/Safari.

The async `navigator.clipboard.read()` is not an alternative: it needs
transient activation and, in Safari, an ephemeral "Paste" prompt
(https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API, Security
considerations). The `paste` event needs nothing.

### Focusable element with `onPaste`/`onDrop`, not a window listener

Why a window-level `paste` listener is the wrong shape:

- It fires for every paste on the page: the symbol search, the planned
  price inputs, and the editors. It must be gated on an "armed slot" state
  and must inspect `document.activeElement` and `event.defaultPrevented`.
- The editor's text pastes reach it. ProseMirror's handler calls
  `event.preventDefault()` after a successful `doPaste`
  (`prosemirror-view/dist/index.js:3815-3829`) but never
  `stopPropagation()`, so a window listener sees them with
  `defaultPrevented === true`; file pastes do not reach it because
  FileHandler calls `event.stopPropagation()` (`index.js:33-34`). Two
  different signals for "already handled" is the fragile part.

Why an element handler is sufficient and cannot double-fire:

- ProseMirror attaches all its listeners to `view.dom`
  (`initInput`, `index.js:3163-3171`) and additionally rejects events
  whose target is not inside `view.dom` (`eventBelongsToView`, `:3205-3214`).
  A paste while the slot button is focused targets the button (spec step
  above) and never enters the editor's subtree. Tiptap's `editor.isFocused`
  is only a mirror of the DOM focus (`@tiptap/core/dist/index.js:6050-6056`);
  the editor does not need to be asked.
- The reverse direction: React handlers "catch events from any children";
  "all events propagate in React except `onScroll`"
  (https://react.dev/learn/responding-to-events). A slot that is a sibling of
  the editor (not an ancestor) never receives the editor's events. If a page
  did wrap the editor inside the slot, FileHandler's `stopPropagation()` on
  file pastes/drops (`index.js:20-21,33-34`) would still stop them before the
  React root, because React 17+ delegates at the root container
  (https://legacy.reactjs.org/blog/2020/08/10/react-v17-rc.html#changes-to-event-delegation).
  Do not rely on that; keep the slot and the editor as siblings.
- Drop: ProseMirror's `drop` handler is likewise on `view.dom`
  (`editHandlers.drop`, `:3882-3888`), and FileHandler's `handleDrop`
  returns early when `dataTransfer.files` is empty or contains the
  `application/x-prosemirror-slice` type (`index.js:10-12`). A drop on the
  slot never reaches `view.dom`; a drop on the editor never reaches the slot.

The Tiptap FileHandler docs
(https://tiptap.dev/docs/editor/extensions/functionality/filehandler)
describe the options (`onPaste(editor, files, htmlContent)`,
`onDrop(editor, files, pos)`, `allowedMimeTypes`, `consumePasteEvent`) but
say nothing about focus; the focus behaviour above comes from the
ProseMirror source, not the docs.

### Element shape and keyboard accessibility

- The paste target is a native `<button type="button">` labelled in
  lowercase ("paste or drop a screenshot"). MDN tabindex: "Avoid using the
  `tabindex` attribute in conjunction with non-interactive content to make
  something intended to be interactive focusable"; interactive components
  built from `<div>` "are not listed in the accessibility tree".
  https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/tabindex
  A button is in the tab order, has a role and a name, and receives the
  `paste` event when focused (spec target step). `focus-visible` outline is
  the one permitted focus ring (DESIGN.md:141-143).
- Activating the button (Enter/Space/click) opens a visually hidden
  `<input type="file" accept={IMAGE_MIME_TYPES.join(",")} multiple>`: the
  keyboard route that does not depend on the clipboard. MDN recommends
  hiding such an input with `opacity`, not `display: none`, so assistive
  technology still treats it as interactive.
  https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file
- Drop target is the slot wrapper (gallery + button). React docs: `onDragOver`
  "You must call `e.preventDefault()` here to allow dropping"; `onDrop`
  "fires when something is dropped on a valid drop target".
  https://react.dev/reference/react-dom/components/common
  HTML spec drag data store modes: file _data_ is readable only in `drop`
  (read-only mode); `dragover` is protected, where kinds and types can be
  listed but not data. So `onDragOver` may inspect
  `dataTransfer.items[i].kind === "file"` to decide whether to accept and set
  `dropEffect = "copy"`, and `onDrop` reads `dataTransfer.files`.
  https://html.spec.whatwg.org/multipage/dnd.html#the-drag-data-store
- Optional page-level guard: MDN notes that for files "the browser may
  process them by default (such as opening or downloading the file) even
  when the file is not dropped into a valid drop target" and cancels
  `dragover`/`drop` on `window` when a file is being dragged.
  https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop
  A single `useEffect` on the entry page can do this; it must only
  `preventDefault`, never read files, so it cannot double-handle. Low
  priority; a mis-drop navigating the SPA away loses nothing because fields
  save on change.
- Handler sketch:

  ```tsx
  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length === 0) return; // leave text pastes alone
    e.preventDefault();
    addFiles(files);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  };
  ```

  `addFiles`: for each file, `imageUploadError` → toast and skip; else
  `URL.createObjectURL`, push `{ key, previewUrl }` to local `pending`
  state, `uploadImage(file, owner)`, then call the add mutation with the
  id (no-op if the slot already holds it), finally revoke the URL and drop
  the pending entry; on error toast `image upload failed: ...` and drop it.

- Gallery: a `<ul>` of `<img src="/api/images/:id">` (1px mist border like
  `.plan-editor img`, `index.css:320-323`; pending previews at
  `opacity: 0.4` like `:327-329`), each with a small lowercase "remove"
  button (`aria-label="remove screenshot"`). No card, no shadow, radius 0
  (DESIGN.md:76,126,145). Drag-over feedback: the hairline flips from mist
  to ink; "motion is feedback, not atmosphere".
- When the entry is reviewed (read-only) the button and remove controls are
  not rendered and `onPaste`/`onDrop` are not attached; the server also
  refuses the upload (owner editable check, section 1).

## 3. Where the slot's images live

### Options

A. Two JSON arrays on `journal_entries`:
`beforeImageIds` / `afterImageIds: text(..., { mode: "json" }).$type<number[]>().notNull().default(sql\`'[]'\`)`.
   Precedent: `enabledSkillIds` (`drizzle/schema.ts:575-578`, zod
   `z.array(...)`at`server/routers.ts:795`, read/write at
   `server/db.ts:1588-1600`) and `contextTimeframes` (`schema.ts:447-450`).
   Drizzle recommends `text`json over`blob`json "because it supports JSON
   functions" (https://orm.drizzle.team/docs/column-types/sqlite); SQLite has
   no array type, arrays are JSON.
B. Join table`journal_entry_images (entryId, imageId, slot, position)`.
C. `slot`(+`position`) columns on `images` itself.

### Evaluation

- **Cascade delete.** decision-3: no foreign keys, owners cascade in
  application code (`deletePlan`, `db.ts:1231-1253`). After task-86,
  `deleteJournalEntry` deletes `images` by `(ownerKind, ownerId)`; that
  already removes every slot image under A and C. B needs one more
  `delete from journal_entry_images`. No option gets database-level
  cascade, so B's "referential" look buys nothing.
- **Orphan tolerance.** decision-3 consequences: "Images removed from the
  editor are orphaned until their plan is deleted (tolerated in v1)". The
  editor's documents reference rows by URL inside JSON
  (`/api/images/:id`, `PlanEditor.tsx:113`); the row is a byte store, the
  document says what is shown. A is the same model with a flatter JSON.
  doc-7 lists orphan GC as "not yet specified" for all three owner kinds;
  SQLite `json_each` makes an array column queryable for that later
  (`select ... from journal_entries, json_each(journal_entries.beforeImageIds) where json_each.value = ?`,
  https://sqlite.org/json1.html#jeach), and rich-text docs would need a
  JSON walk anyway, so B does not make GC uniform.
- **Ordering.** A: array order is the order, append = push; reorder (not in
  scope) is a rewrite. B: `position` column plus renumbering. C: `position`
  plus, fatally, the `(owner, sha256)` unique index
  (`schema.ts:418`, kept per owner in task-86) means one row cannot be in
  both slots: the same screenshot pasted into before and after dedupes to
  one row (`imageRoutes.ts:112-117`), and a `slot` column cannot hold two
  values. Loosening the index to include `slot` would duplicate bytes.
  Reject C.
- **Remove from slot.** Recommend: remove the id from the array and leave
  the row (orphan), not delete it. Reasons: (1) the same row may be
  referenced from the other slot or, for setups, from rich text, because
  dedupe is per owner, and there is no refcount; (2) `GET /api/images/:id`
  is served `immutable` (`imageRoutes.ts:159-166`) on the promise that an
  id maps to one byte sequence forever; a removed-then-re-pasted screenshot
  dedupes back to the same id and the cache still holds; (3) it is exactly
  what the editor does today. The entry's delete collects everything.
- **Write path and races.** Structured fields "save on change" (doc-7). A
  paste of three screenshots finishes three uploads at unpredictable times;
  if the client sends whole arrays computed from props, two completions can
  overwrite each other. Give the server the append/remove:
  `journal.addSlotImage({ entryId, slot: "before" | "after", imageId })` and
  `journal.removeSlotImage(...)`, each a read-modify-write of the one column
  inside `runInSqliteTransaction` (`db.ts:75`; not reentrant, so the
  procedure owns the transaction). `addSlotImage` also verifies the image
  row belongs to `(userId, 'journal_entry', entryId)` with one select, which
  keeps cross-owner ids out at the cost of a single query. Under B the
  append is an `insert` but `position = max + 1` is the same
  read-modify-write, so B does not remove the transaction.
- **Migration cost.** A: two columns created with the `journal_entries`
  table itself, nothing extra. B: one more table and index. The repo's
  migration runner hazard (decision-3: `PRAGMA foreign_keys` ignored inside
  the single `BEGIN IMMEDIATE`) is irrelevant to both because no FK is
  declared.

### Recommendation

Option A: `beforeImageIds` and `afterImageIds` as ordered JSON arrays of
image ids on `journal_entries`, appended and removed by two tRPC procedures
that run in a transaction, orphaning on remove, cascading on entry delete via
the polymorphic owner from task-86. The slot component takes
`imageIds: number[]`, `owner`, `editable` and the two mutations, holds only
pending previews locally, and invalidates `journal.get` after each
mutation.

## Open points for the spec

- task-86 is a prerequisite: both the helper's query string and the cascade
  assume `ownerKind` / `ownerId`.
- The POST route's "owner still editable" check (today `plan.closedAt`)
  needs a per-kind rule; for entries it is `reviewedAt === null`.
- Firefox clipboard behaviour was not verified; Chrome and Safari were read
  from source, not exercised in a browser in this ticket.
- Maximum images per slot: suggest a small zod cap (e.g. 10) on
  `addSlotImage` so the array cannot grow without bound; not in the map yet.
