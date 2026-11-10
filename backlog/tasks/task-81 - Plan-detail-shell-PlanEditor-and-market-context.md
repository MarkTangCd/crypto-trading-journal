---
id: TASK-81
title: 'Plan detail shell, PlanEditor and market context'
status: Done
assignee:
  - '@myself'
created_date: '2026-11-10 06:50'
updated_date: '2026-11-10 11:46'
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
- [x] #1 Installs @tiptap/core, @tiptap/pm, @tiptap/react, @tiptap/starter-kit, @tiptap/extension-image and @tiptap/extension-file-handler pinned to exactly 3.32.0; @tiptap/static-renderer and turndown are not installed
- [x] #2 client/src/components/plans/PlanEditor.tsx configures StarterKit, Image and FileHandler as the spec lists (no headings, blockquote, code, italic, strike, underline, horizontal rule; links openOnClick false, autolink, linkOnPaste; no toolbar), editable toggled with editor.setEditable, shouldRerenderOnTransaction false
- [x] #3 Paste/drop: files over MAX_IMAGE_BYTES rejected with toast.error; a blob: placeholder with title="uploading" is inserted, POSTed to /api/images?planId=…, swapped to /api/images/<id> via setNodeMarkup and the URL revoked; on failure the node is removed, toast.error, URL revoked
- [x] #4 Autosave: onUpdate arms a 1000 ms debounce held in a ref, flushed on unmount, skipped while any upload is pending; success sets the saved-at time from the mutation result and does not invalidate plan.get
- [x] #5 A .plan-editor block in client/src/index.css styles p, ul/ol, img and a dimmed img[title="uploading"], body text capped near 65ch per DESIGN.md
- [x] #6 PlanDetail.tsx replaces the placeholder: single column max-w-3xl, '← plans' and the quiet 'saved hh:mm', the symbol as display-size hero editable in place while open (plan.update, rejection → toast.error), meta line 'open · since <day hh:mm> · <duration>' or 'closed <day hh:mm> · was open <duration>', and the market context section bound to plan.update; explicit not-found state for an unknown id; loading block
- [x] #7 Tiptap stays out of the main bundle: npm run build puts it only in the lazy PlanDetail chunk
- [x] #8 Verified on the dev server against a temp copy of the DB on :3100 (see the dev-server UI verification memory), compared with variant A on branch prototype/plans-ui (client/src/components/plans-prototype/VariantA.tsx); read DESIGN.md and PRODUCT.md first; on the dev server: bold, both list kinds, a link, a pasted and a dropped image survive a reload and are served from /api/images/:id
- [x] #9 devbox run -- npm run check and npm run test pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. npm install -E the six @tiptap/* packages at 3.32.0 (inside devbox).
2. client/src/components/plans/PlanEditor.tsx: props planId, content (RichTextDoc | null), editable, onSave(doc), className. Extensions per spec; editable synced via setEditable; shouldRerenderOnTransaction false. Paste/drop: size guard toast, blob placeholder title=uploading, POST /api/images?planId=, swap via setNodeMarkup found by src, revoke; failure removes node + toast + revoke; skip if editor destroyed. Autosave: ref-held 1000 ms debounce, skipped while pending uploads > 0, scheduled once the last upload settles, flushed on unmount.
3. .plan-editor block in index.css (p, ul/ol, li, strong, a, img, img[title=uploading] dimmed, max-width 65ch).
4. PlanDetail.tsx: plan.get with NOT_FOUND state + loading; top row '← plans' + 'saved hh:mm' (after first save this visit); symbol hero input (blur/Enter -> plan.update, invalidate get/list, BAD_REQUEST toast + revert; closed -> static h1); meta line; market context section -> plan.update({ marketContext: isEmptyDoc ? null : doc }) setting savedAt from result, no invalidation.
5. npm run build and confirm tiptap only in the PlanDetail chunk.
6. Dev server :3100 on temp DB: bold, both lists, link, pasted + dropped image survive reload and load from /api/images/:id; screenshots vs variant A.
7. format, check, test.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Plan detail shell with the shared PlanEditor and market context.

- Deps: @tiptap/core, pm, react, starter-kit, extension-image, extension-file-handler pinned to 3.32.0, plus @tiptap/extensions 3.32.0 for Placeholder (approved deviation; already a starter-kit dependency). No static-renderer; turndown not added (it pre-exists for the webFetch skill).
- client/src/components/plans/PlanEditor.tsx: props planId, content, editable, onSave, placeholder, className. StarterKit/Image/FileHandler per spec, setEditable sync, shouldRerenderOnTransaction false. Paste/drop: size guard toast, blob placeholder title=uploading, POST /api/images?planId=, swap by src via setNodeMarkup, failure removes node + toast; URL revoked either way; skipped if the editor was destroyed. Autosave: 1000 ms ref debounce, skipped while uploads are pending and re-scheduled when the last one settles, flushed on unmount.
- index.css: .plan-editor block (p spacing, lists, strong, links, images, dimmed uploading image, placeholder), max-width 65ch.
- PlanDetail.tsx: loading block, 'plan not found' state, '← plans' + 'saved hh:mm' (shown after the first save this visit), symbol hero input (blur/Enter -> plan.update, invalidates get/list; BAD_REQUEST -> 'invalid symbol' toast + revert; static h1 when closed), meta line, market context autosave (empty doc saved as null; no plan.get invalidation). Closed plan with no context shows an explicit line.
- Build: tiptap/ProseMirror appear only in the lazy PlanDetail chunk (146.6 kB gzip); main chunk unchanged (+0.12 kB gzip).

Verified on :3100 with a temp DB: bold, bullet and ordered lists, autolinked URL, pasted and dropped PNGs (201 uploads) survive reload and load from /api/images/1 and /2; saved mark appears; invalid symbol toasts and reverts, valid symbol saves; unknown id shows not found; closed plan is read-only. npm run check and npm run test (499) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
