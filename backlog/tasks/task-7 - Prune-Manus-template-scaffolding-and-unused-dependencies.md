---
id: TASK-7
title: Prune Manus-template scaffolding and unused dependencies
status: To Do
assignee: []
created_date: "2026-06-18 01:24"
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

- [ ] #1 All server-side dead files listed in the plan are deleted (llm, voiceTranscription, imageGeneration, map, dataApi, notification, storage, types/cookie.d.ts)
- [ ] #2 All client-side dead files listed in the plan are deleted (Home.tsx, ComponentShowcase.tsx, Map.tsx, AIChatBox.tsx, ManusDialog.tsx)
- [ ] #3 server/\_core/systemRouter.ts contains only the health procedure
- [ ] #4 grep finds no live calls to transcribeAudio, generateImage, notifyOwner, callDataApi, storagePut, storageGet, invokeLLM, makeRequest
- [ ] #5 Each verified-dead dep is removed from package.json (or accompanied by a note in the commit if a hidden importer was found)
- [ ] #6 npm run check, npm run test, and npm run build all exit 0; test count unchanged
<!-- AC:END -->
