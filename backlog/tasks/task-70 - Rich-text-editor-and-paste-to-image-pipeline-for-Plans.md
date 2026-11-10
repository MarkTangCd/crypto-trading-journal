---
id: TASK-70
title: Rich text editor and paste-to-image pipeline for Plans
status: Done
assignee: []
created_date: '2026-11-10 03:09'
updated_date: '2026-11-10 03:25'
labels:
  - 'wayfinder:research'
dependencies: []
references:
  - backlog/docs/doc-5 - Trading-plan-map.md
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Which rich text editor should the Plan pages use, how should a pasted or dropped screenshot be turned into an image row (see the companion image-storage ticket), and in which format should the document be stored?

Constraints already settled on the Trading plan map (doc-5): React 19 + Vite + Tailwind 4; the editor needs only paragraphs, bold, bullet and numbered lists, links and images (no headings, tables, colors, alignment); autosave fires after about 1 s of inactivity; read-only rendering is needed on closed plans; the design is mono-forward paper-and-ink (DESIGN.md), so the editor chrome must be minimal or hideable; turndown and react-markdown are already dependencies.

Resolve: (1) Tiptap vs Lexical vs other, with bundle size and React 19 compatibility verified against primary docs; (2) how the paste/drop handler receives File bytes, shows a placeholder, uploads to POST /api/images and swaps in <img src="/api/images/:id">; (3) stored format, ProseMirror/Lexical JSON vs HTML, judged on read-only rendering cost, future agent readability, and migration risk; (4) the minimal integration sketch (extensions list, onUpdate debounce). Capture findings on branch research/plan-rich-text-editor.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Recommendation: Tiptap 3 (pin 3.32.0, all @tiptap/* in lockstep; MIT, React peer ^17||^18||^19) over Lexical 0.52 (React >=18 but no published image node or file-paste plugin, 0.x minors break; both playground-only). Extensions: StarterKit.configure({ heading/blockquote/codeBlock/code/italic/strike/underline/horizontalRule: false, link: { openOnClick: false } }) + Image({ allowBase64: false }) + FileHandler; no toolbar. Stored format: ProseMirror JSON (editor.getJSON()) as TEXT in marketContext/content; read-only via editable: false on closed plans; agents read JSON -> @tiptap/static-renderer renderToHTMLString (DOM-free in Node) -> turndown 7.2.4 -> Markdown (verified in a probe). Paste pipeline: FileHandler onPaste(editor, files)/onDrop(editor, files, pos) -> insert image node with URL.createObjectURL(file) as placeholder (dimmed via title=uploading) -> fetch POST /api/images raw body (express.raw image/* 10mb on that route, planId in header) -> find node by blob src and setNodeMarkup to /api/images/:id, revoke URL; on failure delete node + toast.error; hold autosave while uploads pending. Autosave: onUpdate -> 1000 ms setTimeout, flushed on unmount. Bundle (esbuild min/gzip, react external): Tiptap StarterKit+Image 411/130 kB, +FileHandler 130.4 kB gzip, hand-picked extensions 126 kB; Lexical equivalent without image node 124 kB; lazy-load the /plans/:id route. Findings: docs/research/plan-rich-text-editor.md on branch research/plan-rich-text-editor.
<!-- SECTION:FINAL_SUMMARY:END -->
