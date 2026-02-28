# Code Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Strip LLM telltale artifacts, fix bugs, harden security, and reduce duplication across the entire OneTrainerWeb codebase before squashing commits and raising the upstream PR.

**Architecture:** No architecture changes. Pure cleanup (comment stripping, deduplication), bug fixes (race conditions, SSRF, stdout redirect), and build fixes (icon, fuser, fonts). ~40 files modified, 0 files created.

**Tech Stack:** Python 3.12 (FastAPI), TypeScript (React 19, Zustand, Electron), CSS, Bash/Batch

---

### Task 1: Strip LLM artifacts from Python backend services

Every service file uses identical `# -----...` section separators, numbered-step docstrings, module-level banners, and mechanical one-liners. The upstream OneTrainer codebase has none of these patterns.

**Files:**
- Modify: `web/backend/services/config_service.py`
- Modify: `web/backend/services/trainer_service.py`
- Modify: `web/backend/services/tool_service.py`
- Modify: `web/backend/services/sampler_service.py`
- Modify: `web/backend/services/monitor_service.py`
- Modify: `web/backend/services/tensorboard_service.py`
- Modify: `web/backend/services/video_service.py`
- Modify: `web/backend/services/log_service.py`
- Modify: `web/backend/services/concept_service.py`
- Modify: `web/backend/services/_singleton.py`
- Modify: `web/backend/services/_serialization.py`

**Step 1: Apply these rules to every file**

1. Delete every `# --...` section separator line (dashed dividers). Replace with a single blank line if one doesn't exist already.
2. Delete module-level `"""..."""` docstrings at top of file that explain what the file does.
3. Delete numbered-step docstrings — docstrings containing `1.`, `2.`, `3.` algorithm steps. Replace with a one-line summary only if the function name isn't self-explanatory.
4. Delete numbered inline comments (`# 1. Deep-copy...`, `# 2. Flush...`). Keep comments only where WHY is non-obvious.
5. Delete mechanical one-liners that restate the function name (e.g. `"""Return the process-wide instance."""` on `get_instance`).
6. Keep docstrings that explain non-obvious behaviour (e.g. why `sys.stdout` is redirected, why `suppress(Exception)` is used).
7. Vary what remains — not every function needs a docstring. Leave some bare.

Example transform in `trainer_service.py`:
```python
# BEFORE:
    # ------------------------------------------------------------------
    # Training lifecycle
    # ------------------------------------------------------------------

    def start_training(self, reattach: bool = False) -> dict:
        """
        Begin a training run.

        Parameters
        ----------
        reattach: ...
        Returns a dict with ...
        """
        with self._status_lock:
            ...
        # 1. Deep-copy the config first so every subsequent read uses a
        #    consistent snapshot, immune to concurrent REST mutations.
        config_service = ConfigService.get_instance()

# AFTER:
    def start_training(self, reattach: bool = False) -> dict:
        with self._status_lock:
            ...
        # Snapshot config so training isn't affected by concurrent edits
        config_service = ConfigService.get_instance()
```

**Step 2:** Verify syntax: `python -m py_compile web/backend/services/config_service.py` (repeat for each)

**Step 3:** Run: `cd web/backend && python -m pytest tests/ -x -q`

**Step 4:** Commit.
```bash
git add web/backend/services/
git commit -m "Strip verbose comments from backend services"
```

---

### Task 2: Strip LLM artifacts from Python routers, WS handlers, main.py, and generate_types.py

**Files:**
- Modify: all 12 files in `web/backend/routers/`
- Modify: `web/backend/ws/training_ws.py`
- Modify: `web/backend/ws/system_ws.py`
- Modify: `web/backend/ws/terminal_ws.py`
- Modify: `web/backend/main.py`
- Modify: `web/scripts/generate_types.py`

**Step 1: Apply the same rules as Task 1.** Additionally:
- In routers: delete mechanical endpoint docstrings like `"""Return the current training configuration."""` — the URL path + function name say it all. Keep docstrings only on endpoints with non-obvious behaviour (e.g. validation, optimizer change, wiki image proxy).
- In `main.py`: the CORS comment block (lines 47-59) explains a real configuration choice — trim to 2 lines max.
- In `training_ws.py`: the protocol-documentation module docstring is useful — keep it but trim.

**Step 2:** Run: `cd web/backend && python -m pytest tests/ -x -q`

**Step 3:** Commit.
```bash
git add web/backend/routers/ web/backend/ws/ web/backend/main.py web/scripts/generate_types.py
git commit -m "Strip verbose comments from routers, WS handlers, and scripts"
```

---

### Task 3: Strip LLM artifacts from TypeScript API layer and stores

**Files:**
- Modify: `web/gui/src/renderer/api/request.ts`
- Modify: `web/gui/src/renderer/api/configApi.ts`
- Modify: `web/gui/src/renderer/api/trainingApi.ts`
- Modify: `web/gui/src/renderer/api/samplingApi.ts`
- Modify: `web/gui/src/renderer/api/toolsApi.ts`
- Modify: `web/gui/src/renderer/api/videoToolsApi.ts`
- Modify: `web/gui/src/renderer/store/configStore.ts`
- Modify: `web/gui/src/renderer/store/trainingStore.ts`
- Modify: `web/gui/src/renderer/store/uiStore.ts`

**Step 1: Apply these rules:**

1. Delete all `// -----------...` section separators and `// -- Name ---` inline separators.
2. Delete module-level JSDoc banners at top of files.
3. Delete all `/** Verb the noun. */` one-liner JSDoc on API methods — the function names are self-documenting.
4. In `request.ts`: delete the verbose `@param`/`@returns`/`@throws` JSDoc on `request()`. Delete class comments on error classes.
5. In `configStore.ts`: delete verbose JSDoc on interface properties (`isDirty`, `isLoading`, `error` etc. are self-documenting). Delete `// -- methodName ---` separators on every store action.
6. In hooks: delete module-level banners, `@param`/`@returns`/`@typeParam`/`@example` blocks.
7. Keep `/** Base URL for REST API calls. */` and `/** Base URL for WebSocket connections. */` — useful for consumers.

**Step 2:** Run: `cd web/gui && npx tsc --noEmit`

**Step 3:** Commit.
```bash
git add web/gui/src/renderer/api/ web/gui/src/renderer/store/
git commit -m "Strip verbose comments from API layer and stores"
```

---

### Task 4: Strip LLM artifacts from hooks, components, and pages

**Files:**
- Modify: `web/gui/src/renderer/hooks/useConfigField.ts`
- Modify: `web/gui/src/renderer/hooks/useArrayField.ts`
- Modify: `web/gui/src/renderer/hooks/useTrainingWebSocket.ts`
- Modify: `web/gui/src/renderer/hooks/useReconnectingWebSocket.ts`
- Modify: `web/gui/src/renderer/hooks/useTerminalWebSocket.ts`
- Modify: `web/gui/src/renderer/hooks/useElapsedTime.ts`
- Modify: `web/gui/src/renderer/pages/PerformancePage.tsx`
- Modify: `web/gui/src/renderer/pages/RunPage.tsx`
- Modify: `web/gui/src/renderer/pages/TensorboardPage.tsx`
- Modify: `web/gui/src/renderer/pages/HelpPage.tsx`
- Modify: `web/gui/src/renderer/components/shared/ScalarChart.tsx`
- Modify: `web/gui/src/renderer/components/modals/ModalBase.tsx`
- Modify: `web/gui/src/renderer/components/modals/ConvertModelModal.tsx`
- Modify: `web/gui/src/renderer/components/modals/VideoToolModal.tsx`
- Modify: `web/gui/src/renderer/components/modals/StandaloneSamplingModal.tsx`
- Modify: `web/gui/src/renderer/components/ErrorBoundary.tsx`
- Modify: `web/gui/src/main/index.ts`
- Modify: `web/gui/src/main/splash.ts` (if exists)

**Step 1: Apply these rules:**

1. Delete all `// -----------...` separators and `// ── Name ──` inline separators.
2. Delete JSX comments labelling obvious sections (`{/* Header */}`, `{/* Body */}`, `{/* Grid lines */}`, etc.). Keep only genuinely ambiguous ones.
3. Delete module-level JSDoc banners (e.g. PerformancePage's 7-line block).
4. Delete `@param` blocks on splash.ts functions.
5. Delete mechanical constant comments (`/** Maximum number of data points... */`, `/** Chart dimensions... */`).
6. Keep SVG-related WHY comments if they explain a non-obvious rendering choice.

**Step 2:** Run: `cd web/gui && npx tsc --noEmit`

**Step 3:** Commit.
```bash
git add web/gui/src/renderer/hooks/ web/gui/src/renderer/pages/ web/gui/src/renderer/components/ web/gui/src/main/
git commit -m "Strip verbose comments from hooks, components, and pages"
```

---

### Task 5: Strip LLM artifacts from CSS, shell scripts, .env, and docs

**Files:**
- Modify: `web/gui/src/renderer/styles/app.css`
- Modify: `web/gui/src/renderer/styles/globals.css`
- Modify: `run_web.sh`
- Modify: `run_web_dev.sh`
- Modify: `run_web.bat`
- Modify: `run_web_dev.bat`
- Modify: `web/.env.example`
- Modify: `web/docs/breakdown.md`

**Step 1: CSS** — Keep section comments but simplify from `/* ── Top Bar ── */` to `/* Top Bar */`. Delete WHAT comments like `/* Inner wrapper constrains content width... */`.

**Step 2: Shell scripts** — Replace `# ── Kill stale backend ────...` with plain `# Kill stale backend`. Match existing `start-ui.bat`/`start-ui.sh` style (minimal comments).

**Step 3: `.env.example`** — Trim the PYTHONUNBUFFERED comment from 2 lines to 1: `# Disable buffering for real-time logs`.

**Step 4: `breakdown.md` rewrite.** This is the biggest LLM red flag. Rewrite:
- Cut overview to 3-4 sentences. Remove marketing language ("fully featured", "responsive, accessible, dark/light themed").
- Keep architecture table but remove bold from layer names.
- Delete the entire "File Inventory" section (lines 401-539) — the repo speaks for itself.
- Cut "Key Design Decisions" from 10 numbered items to 5-6 bullet points, each one sentence.
- Keep "No Backend Modifications" as-is.
- Tone: experienced developer explaining to peers, not a tutorial.

**Step 5:** Run: `cd web/gui && npx tsc --noEmit`

**Step 6:** Commit.
```bash
git add web/gui/src/renderer/styles/ run_web.sh run_web_dev.sh run_web.bat run_web_dev.bat web/.env.example web/docs/breakdown.md
git commit -m "Clean up CSS comments, script headers, and docs"
```

---

### Task 6: Fix `validate_config` stdout redirect

`sys.stdout` is redirected globally during validation. Other threads lose output during this window.

**Files:**
- Modify: `web/backend/services/config_service.py:238-263`

**Step 1:** Replace the raw `sys.stdout` swap with `contextlib.redirect_stdout`:

```python
import contextlib

with self._validate_lock:
    captured = io.StringIO()
    # from_dict() uses bare print() for validation errors — must capture
    # globally since we can't patch modules/. Serialised and fast.
    with contextlib.redirect_stdout(captured):
        try:
            test_config = TrainConfig.default_values()
            test_config.from_dict(validation_data)
        except Exception as exc:
            errors.append(str(exc))
```

**Step 2:** Run: `cd web/backend && python -m pytest tests/ -x -q`

**Step 3:** Commit.
```bash
git add web/backend/services/config_service.py
git commit -m "Use redirect_stdout in validate_config"
```

---

### Task 7: Extract error-handling helper and debounce helper in configStore

The `set(draft => { isLoading: true; error: null })` → try/catch → `set(draft => { error: ...; isLoading: false })` pattern is duplicated 6 times. The debounce-and-sync is duplicated between `updateField` and `updateConfig`.

**Files:**
- Modify: `web/gui/src/renderer/store/configStore.ts`

**Step 1:** Add helpers near the top (after `setByPath`/`getByPath`):

```typescript
function scheduleDebouncedSync(get: () => ConfigState): void {
  cancelPendingSync();
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void get().syncToBackend();
  }, SYNC_DEBOUNCE_MS);
}

async function withLoading(
  set: (fn: (draft: ConfigState) => void) => void,
  fn: () => Promise<void>,
): Promise<void> {
  set((draft) => { draft.isLoading = true; draft.error = null; });
  try {
    await fn();
  } catch (err) {
    set((draft) => {
      draft.error = err instanceof Error ? err.message : String(err);
      draft.isLoading = false;
    });
  }
}
```

**Step 2:** Refactor `loadConfig`, `loadPreset`, `savePreset`, `changeOptimizer`, `loadDefaults` to use `withLoading`. Refactor `updateField` and `updateConfig` to use `scheduleDebouncedSync(get)`.

**Step 3:** Run: `cd web/gui && npx tsc --noEmit && npm test`

**Step 4:** Commit.
```bash
git add web/gui/src/renderer/store/configStore.ts
git commit -m "Extract withLoading and scheduleDebouncedSync helpers"
```

---

### Task 8: Extract `_start_background_task` helper in tool_service

`generate_captions()` and `generate_masks()` are structurally identical: lock check → set status → spawn thread.

**Files:**
- Modify: `web/backend/services/tool_service.py`

**Step 1:** Add a `_start_background_task` method:

```python
def _start_background_task(self, target, args, thread_name: str) -> dict:
    task_id = str(uuid.uuid4())
    with self._lock:
        if self._status == "running":
            return {"ok": False, "error": "A tool operation is already running"}
        self._status = "running"
        self._progress = 0
        self._max_progress = 0
        self._error_message = None
        self._task_id = task_id
        self._cancel_flag = False

    thread = threading.Thread(
        target=target, args=(*args, task_id),
        daemon=True, name=thread_name,
    )
    self._thread = thread
    thread.start()
    return {"ok": True, "task_id": task_id}
```

**Step 2:** Refactor `generate_captions` and `generate_masks` to delegate:

```python
def generate_captions(self, request) -> dict:
    return self._start_background_task(
        self._caption_thread_fn, (request,), "OneTrainerWeb-caption-tool",
    )
```

**Step 3:** Remove `CAPTION_MODE_MAP` identity mapping (maps every key to itself). Replace `CAPTION_MODE_MAP.get(request.mode, "fill")` with `request.mode or "fill"` (or just `request.mode` if already validated). Keep `MASK_MODE_MAP` since it has the valid set for validation.

**Step 4:** Run: `cd web/backend && python -m pytest tests/ -x -q`

**Step 5:** Commit.
```bash
git add web/backend/services/tool_service.py
git commit -m "Extract _start_background_task, remove identity map"
```

---

### Task 9: Fix `request.ts` Content-Type header

Unconditionally sets `Content-Type: application/json` even for GET requests.

**Files:**
- Modify: `web/gui/src/renderer/api/request.ts:73-78`

**Step 1:** Only set when body is present:

```typescript
const res = await fetch(`${API_BASE}${path}`, {
  ...options,
  headers: {
    ...(options?.body ? { "Content-Type": "application/json" } : {}),
    ...options?.headers,
  },
});
```

**Step 2:** Run: `cd web/gui && npx tsc --noEmit`

**Step 3:** Commit.
```bash
git add web/gui/src/renderer/api/request.ts
git commit -m "Only set Content-Type when request has body"
```

---

### Task 10: Refresh preset list after save in TopBar

After saving a new preset, the dropdown doesn't update until page reload.

**Files:**
- Modify: `web/gui/src/renderer/components/layout/TopBar.tsx:43-46`

**Step 1:** Make `handleSavePresetConfirm` async and re-fetch:

```typescript
const handleSavePresetConfirm = async (name: string) => {
  await savePreset(name);
  setShowSaveModal(false);
  try {
    const updated = await configApi.listPresets();
    setPresets(updated);
  } catch { /* best-effort refresh */ }
};
```

**Step 2:** Run: `cd web/gui && npx tsc --noEmit`

**Step 3:** Commit.
```bash
git add web/gui/src/renderer/components/layout/TopBar.tsx
git commit -m "Refresh preset list after save"
```

---

### Task 11: Fix wiki image proxy SSRF via redirects

`urllib.request.urlopen` follows redirects. A GitHub URL that 302s to a non-GitHub host bypasses the domain check.

**Files:**
- Modify: `web/backend/routers/wiki.py:162-207`

**Step 1:** Add a redirect handler that validates each hop:

```python
_ALLOWED_PREFIXES = (
    "https://github.com/",
    "https://raw.githubusercontent.com/",
    "https://user-images.githubusercontent.com/",
)

class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not newurl.startswith(_ALLOWED_PREFIXES):
            raise urllib.error.URLError(f"Redirect to disallowed domain: {newurl}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

_opener = urllib.request.build_opener(_SafeRedirectHandler)
```

Then change `urllib.request.urlopen(req, timeout=15)` to `_opener.open(req, timeout=15)`.

Also refactor the inline domain check to use `_ALLOWED_PREFIXES`:

```python
if not url.startswith(_ALLOWED_PREFIXES):
    return Response(status_code=403, content="Forbidden: only GitHub image URLs are allowed")
```

**Step 2:** Run: `cd web/backend && python -m pytest tests/ -x -q`

**Step 3:** Commit.
```bash
git add web/backend/routers/wiki.py
git commit -m "Block cross-domain redirects in wiki image proxy"
```

---

### Task 12: Fix electron-builder.yml — icon.icns + __pycache__ filter

**Files:**
- Modify: `web/gui/electron-builder.yml`

**Step 1:** Change mac icon to `icon.png` (electron-builder auto-converts):

```yaml
mac:
  ...
  icon: build/icon.png
```

**Step 2:** Add `__pycache__` exclusion to extraResources:

```yaml
extraResources:
  - from: ../../modules/
    to: modules/
    filter:
      - "**/*"
      - "!**/__pycache__/**"
      - "!**/*.pyc"
  - from: ../../scripts/
    to: scripts/
    filter:
      - "**/*"
      - "!**/__pycache__/**"
      - "!**/*.pyc"
```

**Step 3:** Commit.
```bash
git add web/gui/electron-builder.yml
git commit -m "Fix mac icon path, exclude __pycache__ from bundle"
```

---

### Task 13: Fix shell scripts — `fuser` portability

`fuser` doesn't exist on macOS. The `|| true` means the stale-port kill silently fails.

**Files:**
- Modify: `run_web.sh`
- Modify: `run_web_dev.sh`

**Step 1:** Replace `fuser -k "$PORT/tcp" 2>/dev/null || true` with:

```bash
if command -v fuser &>/dev/null; then
    fuser -k "$PORT/tcp" 2>/dev/null || true
elif command -v lsof &>/dev/null; then
    lsof -ti :"$PORT" | xargs kill 2>/dev/null || true
fi
```

Apply in both files (line 15 of each, plus line 83 of `run_web_dev.sh`).

**Step 2:** Commit.
```bash
git add run_web.sh run_web_dev.sh
git commit -m "Use cross-platform stale port kill"
```

---

### Task 14: Narrow ESLint pre-commit hook file pattern

The `files` pattern matches any `.ts/.tsx` in the entire repo, triggering on files outside `web/gui/`.

**Files:**
- Modify: `.pre-commit-config.yaml`

**Step 1:** Change `files: '\.(ts|tsx)$'` to `files: '^web/gui/.*\.(ts|tsx)$'`.

**Step 2:** Commit.
```bash
git add .pre-commit-config.yaml
git commit -m "Narrow ESLint pre-commit hook to web/gui files"
```

---

### Task 15: Fix CSS animation delay typo

Child 7 jumps from 500ms to 700ms (200ms gap) while all others increment by 100ms.

**Files:**
- Modify: `web/gui/src/renderer/styles/app.css:228-237`

**Step 1:** Fix the sequence:

```css
.tab-content-inner > *:nth-child(1) { animation-delay: 0ms; }
.tab-content-inner > *:nth-child(2) { animation-delay: 100ms; }
.tab-content-inner > *:nth-child(3) { animation-delay: 200ms; }
.tab-content-inner > *:nth-child(4) { animation-delay: 300ms; }
.tab-content-inner > *:nth-child(5) { animation-delay: 400ms; }
.tab-content-inner > *:nth-child(6) { animation-delay: 500ms; }
.tab-content-inner > *:nth-child(7) { animation-delay: 600ms; }
.tab-content-inner > *:nth-child(8) { animation-delay: 700ms; }
.tab-content-inner > *:nth-child(9) { animation-delay: 800ms; }
.tab-content-inner > *:nth-child(10) { animation-delay: 900ms; }
```

**Step 2:** Commit.
```bash
git add web/gui/src/renderer/styles/app.css
git commit -m "Fix animation delay sequence"
```

---

### Task 16: Deduplicate Google Fonts loading

Fonts loaded in both `globals.css` (`@import`) and `index.html` (`<link>`) with different subsets.

**Files:**
- Modify: `web/gui/src/renderer/styles/globals.css:1`
- Modify: `web/gui/index.html:13-16`

**Step 1:** Remove `@import url(...)` from `globals.css` line 1. File should start with `@import "tailwindcss";`.

**Step 2:** Update `index.html` `<link>` to include all variants that were in the CSS import (italics for Instrument Sans, full weight range for JetBrains Mono):

```html
<link
  href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap"
  rel="stylesheet"
/>
```

**Step 3:** Run: `cd web/gui && npx tsc --noEmit`

**Step 4:** Commit.
```bash
git add web/gui/src/renderer/styles/globals.css web/gui/index.html
git commit -m "Deduplicate Google Fonts loading"
```

---

### Task 17: Final verification

**Step 1:** Run Python tests: `cd web/backend && python -m pytest tests/ -v`

**Step 2:** Run TypeScript checks: `cd web/gui && npx tsc --noEmit`

**Step 3:** Run frontend tests: `cd web/gui && npm test`

**Step 4:** Run ESLint: `cd web/gui && npx eslint --max-warnings 0 src/`

**Step 5:** Run Ruff: `ruff check web/backend/ web/scripts/`

**Step 6:** Spot-check 5-6 files to verify the comment style looks natural — some functions have comments, some don't, no mechanical uniformity.

**Step 7:** If all pass, final commit for any stragglers.
```bash
git add -A
git commit -m "Final verification — all checks pass"
```
