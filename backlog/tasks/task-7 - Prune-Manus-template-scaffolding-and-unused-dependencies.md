---
id: TASK-7
title: Prune Manus-template scaffolding and unused dependencies
status: Done
assignee:
  - '@agent'
created_date: '2026-06-18 01:24'
updated_date: '2026-06-18 01:57'
labels:
  - tech-debt
  - cleanup
dependencies: []
documentation:
  - plans/004-prune-template-scaffolding.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implementation plan: plans/004-prune-template-scaffolding.md. Delete 8 unreachable server modules, 5 unreachable client widgets/pages, trim systemRouter to just health, and drop the 7 dependencies whose only callers were the deleted files. Follow the plan file step-by-step (three separate commits per the plan).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All server-side dead files listed in the plan are deleted (llm, voiceTranscription, imageGeneration, map, dataApi, notification, storage, types/cookie.d.ts)
- [x] #2 All client-side dead files listed in the plan are deleted (Home.tsx, ComponentShowcase.tsx, Map.tsx, AIChatBox.tsx, ManusDialog.tsx)
- [x] #3 server/\_core/systemRouter.ts contains only the health procedure
- [x] #4 grep finds no live calls to transcribeAudio, generateImage, notifyOwner, callDataApi, storagePut, storageGet, invokeLLM, makeRequest
- [x] #5 Each verified-dead dep is removed from package.json (or accompanied by a note in the commit if a hidden importer was found)
- [x] #6 npm run check, npm run test, and npm run build all exit 0; test count unchanged
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pruned all Manus-template scaffolding and unused dependencies in three commits.

Changes:
- Deleted 8 unreachable server modules: llm, voiceTranscription, imageGeneration, map, dataApi, notification, storage, types/cookie.d.ts
- Deleted 5 unreachable client widgets/pages: Home.tsx, ComponentShowcase.tsx, Map.tsx, AIChatBox.tsx, ManusDialog.tsx
- Trimmed systemRouter.ts to contain only the health procedure
- Removed 7 orphaned dependencies from package.json: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, axios, streamdown, jose, cookie, @types/google.maps
- Updated package-lock.json after dependency removals
- Updated plans/README.md status for plan 004 to DONE

Verification:
- grep for dead symbols (transcribeAudio, generateImage, notifyOwner, callDataApi, storagePut, storageGet, invokeLLM, makeRequest) returns zero matches
- npm run check exits 0
- npm run test: 104 tests pass (count unchanged)
- npm run build exits 0 and produces dist/index.js + dist/public/
<!-- SECTION:FINAL_SUMMARY:END -->
