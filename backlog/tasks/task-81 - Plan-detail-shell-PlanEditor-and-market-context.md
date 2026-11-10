---
id: TASK-81
title: 'Plan detail shell, PlanEditor and market context'
status: To Do
assignee: []
created_date: '2026-11-10 06:50'
updated_date: '2026-11-10 06:51'
labels:
  - ready-for-agent
dependencies:
  - TASK-78
  - TASK-80
references:
  - backlog/docs/doc-6 - Trading-plan-spec.md
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec doc-6, sections Editor and UI → /plans/:id; findings in research/plan-rich-text-editor §7 (paste/drop pipeline). Builds PlanEditor, the shared rich-text component TASK-82 (scenarios) and TASK-83 (observations) reuse, and the page shell with its first consumer, market context.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Installs @tiptap/core, @tiptap/pm, @tiptap/react, @tiptap/starter-kit, @tiptap/extension-image and @tiptap/extension-file-handler pinned to exactly 3.32.0; @tiptap/static-renderer and turndown are not installed
- [ ] #2 client/src/components/plans/PlanEditor.tsx configures StarterKit, Image and FileHandler as the spec lists (no headings, blockquote, code, italic, strike, underline, horizontal rule; links openOnClick false, autolink, linkOnPaste; no toolbar), editable toggled with editor.setEditable, shouldRerenderOnTransaction false
- [ ] #3 Paste/drop: files over MAX_IMAGE_BYTES rejected with toast.error; a blob: placeholder with title="uploading" is inserted, POSTed to /api/images?planId=…, swapped to /api/images/<id> via setNodeMarkup and the URL revoked; on failure the node is removed, toast.error, URL revoked
- [ ] #4 Autosave: onUpdate arms a 1000 ms debounce held in a ref, flushed on unmount, skipped while any upload is pending; success sets the saved-at time from the mutation result and does not invalidate plan.get
- [ ] #5 A .plan-editor block in client/src/index.css styles p, ul/ol, img and a dimmed img[title="uploading"], body text capped near 65ch per DESIGN.md
- [ ] #6 PlanDetail.tsx replaces the placeholder: single column max-w-3xl, '← plans' and the quiet 'saved hh:mm', the symbol as display-size hero editable in place while open (plan.update, rejection → toast.error), meta line 'open · since <day hh:mm> · <duration>' or 'closed <day hh:mm> · was open <duration>', and the market context section bound to plan.update; explicit not-found state for an unknown id; loading block
- [ ] #7 Tiptap stays out of the main bundle: npm run build puts it only in the lazy PlanDetail chunk
- [ ] #8 Verified on the dev server against a temp copy of the DB on :3100 (see the dev-server UI verification memory), compared with variant A on branch prototype/plans-ui (client/src/components/plans-prototype/VariantA.tsx); read DESIGN.md and PRODUCT.md first; on the dev server: bold, both list kinds, a link, a pasted and a dropped image survive a reload and are served from /api/images/:id
- [ ] #9 devbox run -- npm run check and npm run test pass
<!-- AC:END -->
