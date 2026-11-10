# Rich text editor and paste-to-image pipeline for Plans

Researched 2026-11-10 for TASK-70 (Trading plan map, doc-5). Primary sources only: the npm registry, the published package code and typings (installed into a scratch project, never into this repo), the official Tiptap / Lexical / ProseMirror docs, and a local bundle probe built with esbuild. Nothing here is taken from blog posts or comparison articles.

Settled constraints this note builds on (doc-5): React 19 + Vite 7 + Tailwind 4; capability is exactly paragraphs, bold, bullet / numbered lists, links, images (paste + drop); no headings, tables, colors, alignment; autosave about 1 s after the last keystroke; closed plans render read-only; images live in the `images` table and are served by `GET /api/images/:id`, written by `POST /api/images` (companion ticket); `turndown` 7.2.4 and `react-markdown` 10 are already dependencies; design is mono-forward paper-and-ink with minimal chrome.

Source key:

- NPM: `npm view <pkg> version|peerDependencies|dependencies|time` against registry.npmjs.org, run 2026-11-10.
- TT-REACT: https://tiptap.dev/docs/editor/getting-started/install/react
- TT-STARTER: https://tiptap.dev/docs/editor/extensions/functionality/starterkit
- TT-IMAGE: https://tiptap.dev/docs/editor/extensions/nodes/image
- TT-LINK: https://tiptap.dev/docs/editor/extensions/marks/link
- TT-FILEHANDLER: https://tiptap.dev/docs/editor/extensions/functionality/filehandler
- TT-OUTPUT: https://tiptap.dev/docs/guides/output-json-html
- TT-STATIC: https://tiptap.dev/docs/editor/api/utilities/static-renderer
- TT-EVENTS: https://tiptap.dev/docs/editor/api/events
- TT-EDITOR: https://tiptap.dev/docs/editor/api/editor
- TT-INVALID: https://tiptap.dev/docs/guides/invalid-schema
- PM-VIEW: https://prosemirror.net/docs/ref/#view.EditorProps
- LX-REACT: https://lexical.dev/docs/getting-started/react
- LX-SERIAL: https://lexical.dev/docs/concepts/serialization (source: packages/lexical-website/docs/serialization/serialization.md)
- LX-UPGRADE: https://github.com/facebook/lexical/blob/main/packages/lexical-website/docs/upgrading.md
- LX-EDITABLE: https://lexical.dev/docs/concepts/read-only
- LX-HTML: https://lexical.dev/docs/packages/lexical-html
- LX-IMAGE: https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/nodes/ImageNode.tsx
- LX-DDP: https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/plugins/DragDropPasteExtension/index.ts
- LX-RICHTEXT: https://github.com/facebook/lexical/blob/main/packages/lexical-rich-text/src/index.ts
- TT-CHANGELOG-REACT: https://github.com/ueberdosis/tiptap/blob/main/packages/react/CHANGELOG.md
- TT-CHANGELOG-FH: https://tiptap.dev/docs/resources/changelog/extension-file-handler
- TT-HTML: https://tiptap.dev/docs/editor/api/utilities/html
- TT-PERF: https://tiptap.dev/docs/guides/performance
- PM-MODEL: https://prosemirror.net/docs/ref/#model.DOMSerializer and https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.ts
- BUNDLEPHOBIA: https://bundlephobia.com/api/size?package=<pkg>@<version>
- TURNDOWN: https://github.com/mixmark-io/turndown (rules: src/commonmark-rules.js)
- PROBE: scratch esbuild build described in section 4 (reproducible from the versions and entry files listed there).

## 1. Candidates and verdict

**Recommendation: Tiptap 3 (ProseMirror) with the extension list in section 6, storing ProseMirror JSON.** Lexical is close on size and React 19 support but ships no image node and no file-paste plugin; both would have to be copied from its playground and maintained here. Tiptap ships `Image` and `FileHandler` as MIT packages, and its static renderer turns the stored JSON into HTML in plain Node without a DOM, which is what the agents and the read-only pages need.

|                                          | Tiptap 3                                                                                                                                | Lexical 0.52                                                                                                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React 19 in peer range                   | yes, `react: ^17 \|\| ^18 \|\| ^19` (NPM, `@tiptap/react`)                                                                              | yes, `react: >=18.x` (NPM, `@lexical/react`)                                                                                                                                                    |
| Image node                               | `@tiptap/extension-image`, MIT (NPM)                                                                                                    | none in any `@lexical/*` package; playground-only `ImageNode.tsx` (LX-IMAGE)                                                                                                                    |
| File paste / drop                        | `@tiptap/extension-file-handler`, MIT, `onPaste(editor, files, html?)` / `onDrop(editor, files, pos)` (package typings; TT-FILEHANDLER) | `DRAG_DROP_PASTE: LexicalCommand<File[]>` exported by `@lexical/rich-text`; the plugin that consumes it is playground code (LX-DDP)                                                             |
| Server-side render of stored doc         | `@tiptap/static-renderer` `renderToHTMLString` works in bare Node (PROBE)                                                               | `@lexical/html` needs a DOM; `@lexical/headless` 0.52 pulls `happy-dom` (NPM)                                                                                                                   |
| Bundle, editor + needed extensions, gzip | 126 to 130 kB (PROBE)                                                                                                                   | 124 kB without an image node (PROBE)                                                                                                                                                            |
| Versioning                               | 3.x semver, weekly minors (NPM `time`)                                                                                                  | 0.x; "breaking changes ship in minor releases", all packages upgraded together (LX-UPGRADE); each of 0.49 to 0.53 has a Breaking Changes section (https://github.com/facebook/lexical/releases) |
| License                                  | MIT, no account needed for anything used here (NPM)                                                                                     | MIT (NPM)                                                                                                                                                                                       |

Others, dismissed briefly:

- BlockNote (`@blocknote/react` 0.57.0, 2026-10-30, **MPL-2.0**, React `^18 || ^19`; Tiptap/ProseMirror underneath, built-in image block with an `uploadFile` option, recommends storing `JSON.stringify(editor.document)`; https://registry.npmjs.org/@blocknote/react, https://www.blocknotejs.org/docs) brings block handles, slash menus and its own styling, which fights the no-chrome design and adds a second abstraction over the same engine.
- Plate (`platejs` 53.5.2, MIT, React `>=18`; Slate JSON; `@platejs/media` has image upload/paste/drop; https://registry.npmjs.org/platejs, https://registry.npmjs.org/@platejs/media) and Milkdown (`@milkdown/react` 7.23.0, MIT; ProseMirror + remark, Markdown as the data format; https://registry.npmjs.org/@milkdown/react) are larger plugin frameworks aimed at document products; the Plan surface needs five node types.
- Quill 2 (`quill` 2.0.3, 2024-11-30, no release in a year; `react-quill` peers stop at React 18, only the community `react-quill-new` supports 19; stores Delta; https://registry.npmjs.org/quill, https://registry.npmjs.org/react-quill) is toolbar-centric chrome, the opposite of the brief.
- Editor.js (`@editorjs/editorjs` 2.31.7, Apache-2.0; block JSON; image is a separate plugin needing an `endpoints.byFile` contract; no first-party React binding; https://registry.npmjs.org/@editorjs/editorjs, https://github.com/editor-js/image) is a block editor, not inline rich text.
- A plain `<textarea>` with Markdown preview would avoid an editor entirely, but the brief requires inline images from paste/drop and a WYSIWYG surface, which Markdown cannot offer without an editor anyway.

## 2. Versions to pin

Cutoff rule: at least two weeks old on 2026-11-10, so published on or before 2026-10-27.

- Tiptap: pin **3.32.0** (published 2026-10-13, NPM `time`). Latest is 3.33.0 (2026-11-05), too recent. All `@tiptap/*` packages release in lockstep and peer-depend on the exact same version string (`@tiptap/pm: 3.32.0`, NPM), so every Tiptap package must share one version.
- Lexical, for the record: 0.52.0 (2026-09-28). 0.53.0 is 2026-10-28, inside the window.
- `turndown`: keep the repo's 7.2.4 (2026-04-03). 7.2.5 was published 2026-11-04.

Packages for the recommended set (all 3.32.0): `@tiptap/react`, `@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-file-handler`, `@tiptap/static-renderer`.

`@tiptap/starter-kit` 3.32.0 depends on these extensions (NPM `dependencies`): bold, code, link, list (+ list-item, bullet-list, ordered-list, list-keymap), text, italic, strike, heading, document, gapcursor, paragraph, underline, blockquote, code-block, dropcursor, hard-break, horizontal-rule, plus `@tiptap/extensions` (UndoRedo, Dropcursor, Gapcursor, TrailingNode, Placeholder, CharacterCount, Focus, Selection; package typings). So Link is already inside StarterKit in v3 and needs no separate install.

## 3. React 19 compatibility

- `@tiptap/react` 3.32.0 peerDependencies: `react` and `react-dom` `^17.0.0 || ^18.0.0 || ^19.0.0`, same range for `@types/react*` (NPM). Runtime deps are only `fast-equals` and `use-sync-external-store` (NPM).
- `useEditor` defaults `immediatelyRender` to `true` on the client and flips it to `false` when it detects SSR or Next.js (package code, `@tiptap/react/dist/index.js`; changelog 3.23.2 "Default `immediatelyRender` to `false` in SSR environments instead of throwing", TT-CHANGELOG-REACT). This app is client-only Vite, so the default is fine. `shouldRerenderOnTransaction` is off by default in v3 (https://tiptap.dev/docs/guides/upgrade-tiptap-v2); `useEditorState({ editor, selector })` re-renders only when the selected value changes (TT-PERF).
- React 19 specifics in the React package changelog: 3.0.0-beta.6 / 3.0.1 "Added support for React 19 ref in props"; 3.15.2 fixed a StrictMode race in `ReactRenderer` (TT-CHANGELOG-REACT). The docs themselves carry no separate React 19 statement; the peer range is the authoritative claim.
- `@lexical/react` 0.52.0 peerDependencies: `react >=18.x`, `react-dom >=18.x`, optional `yjs` (NPM). It also hard-depends on `@lexical/yjs`, `@lexical/table`, `@lexical/markdown`, `@floating-ui/react` and more (NPM `dependencies`); the per-file ESM entry points (`@lexical/react/LexicalComposer` etc.) keep unused ones out of the bundle (PROBE).
- Open React 19 issues on 2026-11-10. ueberdosis/tiptap: one title names React 19, #7543 "flushSync error when remounting useEditor with existing ID and ReactNodeViewRenderer in React 19" (https://github.com/ueberdosis/tiptap/issues/7543); it concerns React node views, which this plan does not use (Image without `resize` has no node view). Related StrictMode / node-view issues: #7473 BubbleMenu in strict mode (https://github.com/ueberdosis/tiptap/issues/7473), #8516 node views built twice on mount (https://github.com/ueberdosis/tiptap/issues/8516), #8400 `useEditor` with lazy/Suspense can hand out a destroyed editor (https://github.com/ueberdosis/tiptap/issues/8400); #8400 matters because the Plan page will be a lazy route, so mount the editor inside the lazily loaded component, not around the `Suspense` boundary. facebook/lexical: `gh issue list --state open --search "React 19"` returned nothing (https://github.com/facebook/lexical/issues?q=is%3Aissue+is%3Aopen+%22React+19%22); 0.47.0 release notes: "If you are already on React 18 or 19, no changes are required" (https://github.com/facebook/lexical/releases).

## 4. Bundle size (measured)

Method: scratch project outside the repo, exact versions above, `esbuild 0.25.12`, `bundle + minify`, `format: esm`, `platform: browser`, `target: es2022`, `process.env.NODE_ENV = "production"`, with `react`, `react-dom` and `react/jsx-runtime` marked external (they are already in the app bundle). Gzip level 9. Numbers are for the editor chunk only.

| Entry                                                                                                                                                                                                    | minified |     gzip |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | -------: |
| Tiptap: `useEditor` + `EditorContent` + `StarterKit.configure({...off})` + `Image`                                                                                                                       | 411.4 kB | 130.0 kB |
| same + `FileHandler`                                                                                                                                                                                     | 412.6 kB | 130.4 kB |
| Tiptap: hand-picked extensions (Document, Paragraph, Text, Bold, HardBreak, BulletList, OrderedList, ListItem, ListKeymap, Link, Image, UndoRedo, Dropcursor, Gapcursor)                                 | 396.0 kB | 126.1 kB |
| Tiptap read-only via `@tiptap/static-renderer/pm/react` + StarterKit + Image, no `useEditor`                                                                                                             | 381.3 kB | 120.4 kB |
| Lexical: `LexicalComposer`, `RichTextPlugin`, `ContentEditable`, `HistoryPlugin`, `ListPlugin`, `LinkPlugin`, `OnChangePlugin` + `ListNode`, `ListItemNode`, `LinkNode` (no image node, no paste plugin) | 375.6 kB | 123.6 kB |

Readings:

- The two engines are within 5 % of each other at this feature level; size does not decide the choice.
- Disabling StarterKit extensions via `configure({ heading: false, ... })` does not remove their code (they are still imported); hand-picking saves about 4 kB gzip. Not worth the longer import list unless the chunk is later trimmed for other reasons.
- The static renderer still pulls `@tiptap/pm` through the extensions, so it is not a cheap read-only path on the client. On the client, read-only is best done with the same editor chunk and `editable: false` (section 7); the static renderer earns its place on the server (section 5).
- `client/src/App.tsx` has no `React.lazy` today. The Plan detail page should be the first lazily loaded route so these ~130 kB gzip are fetched only when `/plans/:id` opens.

## 5. Stored format: ProseMirror JSON, plus a derived HTML column if the agents need it cheaply

Options judged on three axes from the ticket.

**Read-only rendering cost.** Closed plans are shown on `/plans/:id` with the editor chunk already loaded, so `useEditor({ editable: false, content: json })` costs nothing extra; JSON and HTML are equal here. For a future list-page preview without the editor, HTML can be dropped into `dangerouslySetInnerHTML` after sanitising, while JSON needs the static renderer (~120 kB gzip, PROBE). That is the one case where HTML wins on the client.

**Agent readability.** An agent reading a Plan wants Markdown or plain text, never ProseMirror JSON. The verified path is JSON -> `renderToHTMLString` (`@tiptap/static-renderer/pm/html-string`, runs in bare Node, no DOM, PROBE) -> `turndown` 7.2.4 -> Markdown. Probe output for a doc with bold, a link, a bullet list and an image:

```
BTC holds **4H demand** at 61k; see [the idea](https://example.com/x)

-   sweep then reclaim

![4H chart](/api/images/42)
```

`turndown` converts `<img>` to `![alt](src)` and `<ul>`/`<ol>` to list syntax out of the box (TURNDOWN). The `/api/images/42` URL is a relative path the agent can resolve against the local server if it ever needs pixels. This conversion is a pure function of the stored JSON and the extension list, so it can be run on read inside `server/db.ts` or a skill; no second column is needed for agents.

**Migration risk.** JSON is the editor's native model: `editor.getJSON()` / `setContent(json)` round-trip losslessly (TT-OUTPUT). HTML is parsed back through each extension's `parseHTML` rules, which is lossy for anything without a rule and silently depends on the extension set at read time; Tiptap's own guide does not crown either ("Both work fine"): JSON is "easier to loop through" and mirrors the internal structure, HTML "can be easily rendered in other places, for example in emails", and "disallowed tags or attributes are silently dropped" when HTML is parsed back (TT-OUTPUT). Lexical's guide is firmer: "JSON is the format for saving and restoring a document", HTML "is mostly used to exchange content with other applications" (LX-SERIAL). The real migration hazard is the same in both formats: a node type that is removed from the schema later. With JSON, ProseMirror's `Node.fromJSON` calls `schema.nodeType(json.type)`, which throws `RangeError("Unknown node type: " + name)` (PM-MODEL `schema.ts`; reproduced in PROBE via the static renderer). In the editor the default mode "removes the content it can't display and fills in missing required nodes"; `enableContentCheck: true` makes it emit `contentError` (default handler throws, so pass `onContentError`), and `emitContentError: true` reports without blocking (package code, `@tiptap/core`; TT-INVALID). Lexical's per-node `version` field is deprecated ("Nothing reads it, and parsing drops it"); its evolution path is new attributes with defaults or new node types (LX-SERIAL). With HTML, unknown tags are dropped or flattened to text without any signal. Since the Plan schema is tiny and fixed by doc-5, the practical rule is: never remove a node type without a one-off migration over `plans.marketContext` / `plan_scenarios.content` / `plan_observations.content`.

**Why not store Markdown.** Markdown cannot express the editor's exact state (e.g. a hard break inside a list item, link `rel`/`target`) and would be re-parsed on every load; the Markdown the agents need is a derived view, produced on demand as above.

Decision: store `TEXT` columns holding `JSON.stringify(editor.getJSON())`; keep the existing column names from doc-5 (`marketContext`, `content`). An empty document is `{"type":"doc","content":[{"type":"paragraph"}]}`; treat `null` and that value as empty. Do not add an HTML column in v1; add it only if a list-page preview without the editor chunk becomes a requirement.

## 6. Minimal integration sketch

Extension list (Tiptap 3.32.0):

```ts
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import FileHandler from "@tiptap/extension-file-handler";

export const PLAN_EXTENSIONS = [
  StarterKit.configure({
    // keep: document, paragraph, text, bold, bulletList, orderedList,
    // listItem, listKeymap, link, hardBreak, undoRedo, dropcursor,
    // gapcursor, trailingNode
    heading: false,
    blockquote: false,
    codeBlock: false,
    code: false,
    italic: false,
    strike: false,
    underline: false,
    horizontalRule: false,
    link: { openOnClick: false, autolink: true, linkOnPaste: true },
  }),
  Image.configure({ allowBase64: false }),
];
```

- `Image` defaults are `inline: false`, `allowBase64: false`; with `allowBase64: false` its `parseHTML` rule is `img[src]:not([src^="data:"])`, so a pasted base64 image from a web page is refused at the schema level, which enforces the doc-5 rule "no base64 in the document" (package code, `@tiptap/extension-image`; TT-IMAGE).
- `Link` defaults are `openOnClick: true`, `linkOnPaste: true`, `autolink: true` (package code, `@tiptap/extension-link`). `openOnClick: false` while editing avoids leaving the page on a mis-click; in read-only mode set it back to `true` or render links normally.
- The Link extension renders `target="_blank"` and `rel="noopener noreferrer nofollow"` by default (package code, `@tiptap/extension-link` `HTMLAttributes`; visible in the PROBE HTML output), which is what we want for links to external chart pages.
- StarterKit v3 also carries `TrailingNode` (always leaves an empty paragraph after a trailing image) and `ListKeymap` (sane Backspace/Delete in lists); keep both.

Editor component shape:

```tsx
const editor = useEditor({
  extensions: [
    ...PLAN_EXTENSIONS,
    FileHandler.configure({
      /* section 7 */
    }),
  ],
  content: initialJson,
  editable: !closed,
  shouldRerenderOnTransaction: false,
  editorProps: { attributes: { class: "plan-editor" } },
  onUpdate: ({ editor }) => scheduleSave(editor.getJSON()),
});
```

- `onUpdate` fires on every document change (TT-EVENTS). `scheduleSave` is a `useRef`-held `setTimeout` reset on every call, firing after 1000 ms; on unmount, flush it (call the mutation immediately if a timer is pending) so a navigation right after typing does not lose the last second. `visibilitychange`/`pagehide` flushing is optional for a localhost app.
- Save is a `trpc.plans.update.useMutation()`; on error `toast.error`, on success nothing but the quiet "saved hh:mm" indicator from doc-5. Do not invalidate the plan query on every autosave success (it would reset the editor); set the saved-at timestamp from the mutation result instead.
- The container is a `div` with `ProseMirror` styles only: `outline: none`, body size, `max-width: 65ch` to follow DESIGN.md body rules; lists via Tailwind typography is overkill, three CSS rules in `client/src/index.css` under `.plan-editor` cover `p`, `ul/ol`, `img`.
- Chrome: no toolbar. Bold via Cmd+B, lists via `- ` / `1. ` input rules (StarterKit), links via paste/autolink. If a visible control is wanted later, Tiptap's `BubbleMenu` is in `@tiptap/react/menus` and only appears on selection, which fits the no-chrome brief.

Read-only mode: pass `editable: false` for closed plans; toggle at runtime with `editor.setEditable(false)` on close/reopen so the same instance is reused (TT-EDITOR). `FileHandler` and the paste pipeline are inert on a closed plan: in `prosemirror-view` the `paste` and `drop` listeners live in `editHandlers`, and `initInput` only runs those when `view.editable` is true (`prosemirror-view/dist/index.js`, `initInput`: `view.editable || !(event.type in editHandlers)`), so `handlePaste`/`handleDrop` props are never reached on a non-editable view.

## 7. Paste / drop pipeline

How the bytes arrive: ProseMirror exposes `editorProps.handlePaste(view, event: ClipboardEvent, slice)` and `handleDrop(view, event: DragEvent, slice, moved)`; returning `true` stops default handling (PM-VIEW; `prosemirror-view` typings). Files are on `event.clipboardData.files` and `event.dataTransfer.files`; drop position comes from `view.posAtCoords({ left: event.clientX, top: event.clientY })` (PM-VIEW). `@tiptap/extension-file-handler` is exactly that plugin, already written (package code): it ignores internal ProseMirror drags (`application/x-prosemirror-slice`), filters by `allowedMimeTypes`, resolves the drop position, and calls `onDrop(editor, files, pos)` or `onPaste(editor, files, htmlContent)`; `consumePasteEvent: true` makes it swallow a paste that carries files plus HTML so no duplicate content is inserted (package typings).

```ts
FileHandler.configure({
  allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  consumePasteEvent: true,
  onPaste: (editor, files) =>
    insertImages(editor, files, editor.state.selection.anchor),
  onDrop: (editor, files, pos) => insertImages(editor, files, pos),
});
```

`insertImages(editor, files, pos)` per file:

1. Client-side guard: skip files over 10 MB (doc-5 limit) with `toast.error`.
2. Placeholder: `const url = URL.createObjectURL(file)`; insert `editor.chain().insertContentAt(pos, { type: "image", attrs: { src: url, alt: file.name, title: "uploading" } }).run()`. The browser renders the local bytes immediately, so the trader sees the screenshot at once with no spinner component. Style `img[title="uploading"]` at reduced opacity in CSS; this is the only "placeholder" needed.
3. Upload: `fetch("/api/images", { method: "POST", headers: { "content-type": file.type, "x-plan-id": String(planId) }, body: file })` (raw body, no multipart; see note below). Expect `{ id }`.
4. Swap: find the node whose `attrs.src === url` by walking `editor.state.doc.descendants`, then `editor.chain().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: \`/api/images/${id}\`, title: null }); return true; }).run()`. Walk by `src`rather than by the original`pos`, because the trader may have typed above the image during the upload. Then `URL.revokeObjectURL(url)`.
5. Failure: delete the placeholder node (`tr.delete(pos, pos + node.nodeSize)`), `toast.error`, revoke the URL.
6. Autosave interaction: the placeholder insert triggers `onUpdate` with a `blob:` URL in the JSON. Either filter blob images out of the payload in `scheduleSave`, or skip saving while `pendingUploads > 0` and save once the swap lands (the swap is itself an update, so the normal debounce picks it up). The second is simpler.

Notes for the companion storage ticket (POST /api/images):

- `express.json({ limit: "1mb" })` in `server/_core/index.ts` only parses `application/json`, so it does not cap image uploads; mount `express.raw({ type: "image/*", limit: "10mb" })` on the `/api/images` router only, which keeps the server free of `multer`/`busboy`. `planId` goes in a header or query param since a raw body has no fields.
- Dedupe by sha256 within a plan (doc-5) returns the existing id; the client does not need to know.
- `GET /api/images/:id` should send `Cache-Control: private, max-age=31536000, immutable`; ids are content-addressed per plan, so the browser never re-fetches a chart it has shown.

Why not Lexical for this part: `DRAG_DROP_PASTE: LexicalCommand<File[]>` exists in `@lexical/rich-text` 0.52 and `mediaFileReader(files, mimeTypes)` / `isMimeType` exist in `@lexical/utils` (package typings), but the node that receives the image, the `$createImageNode` factory, the `INSERT_IMAGE_COMMAND` and the plugin that handles `DRAG_DROP_PASTE` are all playground source, not published packages (LX-IMAGE, LX-DDP). Copying ~400 lines of `ImageNode.tsx` plus its `DecoratorNode` React component into the repo is the Lexical cost; Tiptap's equivalent is two `.configure()` calls.

## 8. Verification against official docs

Claims above that were checked against the official pages rather than only package code:

- FileHandler: installed with `npm install @tiptap/extension-file-handler`, no Pro account; options `allowedMimeTypes`, `onPaste(editor, files, htmlContent)`, `onDrop(editor, files, pos)`, `consumePasteEvent` (added 3.27.2); "It does not implement server file uploads" (TT-FILEHANDLER, TT-CHANGELOG-FH). Open-sourced in 3.0.0-beta.10 ("We open sourced our basic pro extensions", TT-CHANGELOG-FH).
- StarterKit v3 contents: Nodes Blockquote, BulletList, CodeBlock, Document, HardBreak, Heading, HorizontalRule, ListItem, OrderedList, Paragraph, Text; Marks Bold, Code, Italic, Strike, Link (new), Underline (new); Functionality Dropcursor, Gapcursor, UndoRedo, ListKeymap (new), TrailingNode (new); every entry configurable or `false` (TT-STARTER).
- Image: options `inline`, `allowBase64`, `HTMLAttributes`, `resize`; `setImage({ src, alt, title })`; "It doesn't upload images to your server" (TT-IMAGE).
- Link: `openOnClick`, `autolink`, `linkOnPaste`, `defaultProtocol`, `HTMLAttributes` default `rel="noopener noreferrer nofollow"`; `setLink()` / `unsetLink()` (TT-LINK).
- Editor API: `getJSON()`, `getHTML()`, `getText()`, `setEditable(editable, emitUpdate = true)`, `isEditable`; `editorProps` passes ProseMirror `EditorProps` through (TT-EDITOR). Events include `update`, `contentError`, `paste`, `drop` (TT-EVENTS), so an editor-level `onPaste(event, slice)` also exists if FileHandler is ever dropped.
- ProseMirror: `handlePaste(view, event, slice)`, `handleDrop(view, event, slice, moved)`, `posAtCoords({ left, top })` (PM-VIEW); `DOMSerializer.fromSchema` / `DOMParser.fromSchema` build from `toDOM` / `parseDOM` specs (PM-MODEL).
- Static renderer: `renderToHTMLString({ extensions, content })` from `@tiptap/static-renderer/pm/html-string`, also `/pm/react` and `/pm/markdown`; "doesn't require a browser, DOM or even an editor instance" (TT-STATIC). `@tiptap/html`'s `generateHTML`, by contrast, uses `happy-dom` on the server and lists it as a required peer (`^20.8.9` at 3.32.0, NPM; TT-HTML; source comment "This function requires `happy-dom` to be installed in your project", https://github.com/ueberdosis/tiptap/blob/main/packages/html/src/server/generateHTML.ts). Use the static renderer on the server.
- Lexical: `DRAG_DROP_PASTE = createCommand('DRAG_DROP_PASTE_FILE')`, dispatched from the rich-text `PASTE_COMMAND` / `DROP_COMMAND` handlers (LX-RICHTEXT); the consuming plugin is now `DragDropPasteExtension` in the playground and dispatches `INSERT_IMAGE_COMMAND` (LX-DDP); no `lexical-image` package exists under `packages/` (https://github.com/facebook/lexical/tree/main/packages). `$generateHtmlFromNodes` needs a DOM; headless use "need[s] to initialize a headless browser implementation such as JSDom" (LX-HTML), and `@lexical/headless` 0.50+ depends on `happy-dom` (NPM). Read-only via `editor.setEditable(false)` / `initialConfig.editable` (LX-EDITABLE).
- Bundlephobia cross-check (min / gzip, BUNDLEPHOBIA): `@tiptap/starter-kit@3.32.0` 339.7 kB / 106.4 kB (includes core + pm), `@tiptap/react@3.32.0` 28.6 kB / 8.8 kB, `@tiptap/extension-image@3.32.0` 1.4 kB gzip, `@tiptap/extension-file-handler@3.32.0` 0.7 kB gzip; `lexical@0.52.0` 197.8 kB / 63.0 kB, `@lexical/rich-text@0.52.0` 79.8 kB gzip (includes lexical), `@lexical/list` 77.4 kB, `@lexical/link` 75.0 kB. `@lexical/react` and `@tiptap/pm` fail to build on bundlephobia (no `.` export), which is why the PROBE numbers in section 4 are the ones to quote: they are the only measurement of the full composed editor.
- turndown: `rules.image` emits `![alt](src "title")`, `rules.list` matches `ul`/`ol`, `rules.listItem` numbers `OL` children and uses `bulletListMarker` otherwise (TURNDOWN `src/commonmark-rules.js`).

## Unconfirmed summary

- Whether `editor.getHTML()` output is byte-stable across Tiptap versions; the docs make no statement (it is `DOMSerializer` + `innerHTML`, https://github.com/ueberdosis/tiptap/blob/main/packages/core/src/helpers/getHTMLFromFragment.ts). Irrelevant when JSON is the stored format.
- Plate's documentation site returned 500s during verification; its image-upload behaviour was read from npm metadata only.
- The PROBE numbers come from a local esbuild build with the exact versions above and should be re-run if versions change.
