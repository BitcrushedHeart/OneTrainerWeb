# OneTrainerWeb Finish Plan

## Summary

Investigation revealed the remaining gaps are narrower than initially assessed.
Six concrete work items bring OneTrainerWeb to full feature completion.

---

## Task 1: Wire ManualSamplingModal to backend

**Files:** `web/gui/src/renderer/components/ManualSamplingModal.tsx`

The `handleSample` function is currently stubbed with a `setTimeout` placeholder
and a comment `// Future: POST /api/training/sample/custom`. The backend endpoint
and API client (`trainingApi.sampleCustom()`) both exist and are fully functional.

**Work:**
- Replace the `setTimeout` stub with a call to `trainingApi.sampleCustom(params)`
- Map modal form fields to the request payload
- Display success/error feedback from the response

**Effort:** Small (~15 lines changed)

---

## Task 2: Enable page-level Sample/Backup/Save buttons during training

**Files:**
- `web/gui/src/renderer/pages/BackupPage.tsx`
- `web/gui/src/renderer/pages/SamplingPage.tsx`

The "Backup Now", "Save Now", and "Sample Now" buttons on these pages are
permanently `disabled` with no `onClick` handler. The BottomBar already has
working versions that appear during training, so the API wiring exists.

**Work:**
- Import `useTrainingStore` to read `status` and action methods
- Set `disabled={status !== "training"}` instead of `disabled`
- Wire `onClick` to `backupNow()` / `saveNow()` / `sampleNow()` from the store
- This gives users two ways to trigger these actions (page button + bottom bar)

**Effort:** Small (~20 lines across 2 files)

---

## Task 3: Add `dataloader_threads` to the General or Data page

**Files:** `web/gui/src/renderer/pages/GeneralPage.tsx` or `DataPage.tsx`

The original GUI exposes `dataloader_threads` in the General tab. The web UI
does not expose it anywhere. The config field exists in TrainConfig and the
TypeScript types.

**Work:**
- Add a numeric `FormEntry` for `dataloader_threads` to GeneralPage (matching
  original placement) or DataPage (where it arguably fits better)
- Include the original tooltip text about data loader threading

**Effort:** Trivial (~5 lines)

---

## Task 4: Cloud training — expose `reattach` workflow in UI

**Files:**
- `web/gui/src/renderer/pages/CloudPage.tsx`
- `web/gui/src/renderer/api/trainingApi.ts`
- `web/gui/src/renderer/store/trainingStore.ts`

The backend fully supports cloud training including the `reattach` flag on
`POST /api/training/start`. The frontend currently always calls `start()`
without passing `reattach`.

**Work:**
- Update `trainingApi.start()` to accept an optional `{ reattach: boolean }`
- Update `trainingStore.startTraining()` to accept and forward the flag
- Add a "Reattach" button on CloudPage (or in BottomBar when cloud is enabled
  and status is idle) that calls `startTraining({ reattach: true })`
- Conditionally show "Reattach" vs "Start" based on `config.cloud.enabled`
  and whether a `run_id` exists

**Effort:** Medium (~50 lines across 3 files)

---

## Task 5: Add `/api/shutdown` endpoint for graceful Electron exit

**Files:**
- `web/backend/routers/health.py` (or new `web/backend/routers/lifecycle.py`)
- `web/backend/main.py` (register router if new file)

The Electron main process (`web/gui/src/main/index.ts`, line ~350) attempts
`POST /api/shutdown` for graceful backend termination before force-killing.
This endpoint does not exist — the health check passes but shutdown falls
through to `taskkill /T /F`.

**Work:**
- Add `POST /api/shutdown` endpoint that triggers `os._exit(0)` or signals
  the uvicorn server to stop (e.g., via `server.should_exit = True` or
  raising `SystemExit`)
- Register the route in `main.py`

**Effort:** Small (~15 lines)

---

## Task 6: Concept editor — per-concept image augmentation settings

**Files:** `web/gui/src/renderer/components/ConceptEditorModal.tsx` (or similar)

The original GUI (`modules/ui/ConceptWindow.py`, lines 203-310) exposes 15+
per-concept image augmentation settings (random flip, rotate, brightness,
contrast, saturation, hue, circular mask, resolution override). These live
in `ConceptConfig.image: ConceptImageConfig`.

The TypeScript types already include all `ConceptImageConfig` fields. The
concept editor modal needs an "Image Augmentation" section.

**Work:**
- Add an "Image Augmentation" section/tab to the concept editor
- Expose toggles and numeric inputs for each augmentation setting
- Group by type: flip, rotation, brightness, contrast, saturation, hue, masks
- Each group has enable toggle + strength/angle parameter

**Effort:** Medium-Large (~100-150 lines of form fields)

---

## Execution Order

Tasks are independent and could be done in parallel, but a logical order:

1. **Task 1** (ManualSamplingModal) — quick win, unblocks sampling workflow
2. **Task 2** (page buttons) — quick win, better UX
3. **Task 3** (dataloader_threads) — trivial field addition
4. **Task 5** (shutdown endpoint) — small backend fix
5. **Task 4** (cloud reattach) — medium, needs design thought
6. **Task 6** (concept augmentations) — largest item, most form fields

Tasks 1-3 and 5 are each under 30 minutes. Task 4 is ~1 hour. Task 6 is ~2 hours.
