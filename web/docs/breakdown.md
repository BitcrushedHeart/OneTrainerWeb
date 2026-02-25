# OneTrainerWeb -- Implementation Breakdown

## Overview

OneTrainerWeb replaces the legacy customtkinter desktop GUI of the OneTrainer
diffusion-model training framework with a modern Electron + React web frontend
backed by a FastAPI bridge layer. The existing Python backend (`modules/`) is
left completely untouched -- the bridge imports it directly and exposes its
functionality through REST endpoints and WebSocket streams.

The result is a fully featured training UI that supports all 21+ model
architectures, 4 training methods, and 40+ optimizers while adding real-time
GPU monitoring, interactive TensorBoard charts, dataset tools, video
utilities, and standalone sampling -- all in a responsive, accessible,
dark/light themed interface.

---

## Architecture

| Layer | Technology | Role |
|-------|-----------|------|
| **Renderer** | React 19.2 + Vite 7.3 + Tailwind 4.2 + TypeScript (strict) | Single-page app, lazy-loaded tab pages |
| **Main process** | Electron 40.6 | Window management, spawns FastAPI child process |
| **Backend bridge** | FastAPI + Uvicorn (Python 3.12) | REST config CRUD, WebSocket progress/metrics |
| **Training backend** | PyTorch 2.8, Hugging Face diffusers | Unchanged `modules/` -- imported directly |

### Communication Pattern

```
React UI  --REST/WebSocket-->  FastAPI Bridge  --TrainCallbacks/TrainCommands-->  GenericTrainer
```

### State Management

- **configStore** (Zustand + Immer) -- holds the 200+ field `TrainConfig`,
  debounced sync to backend, preset load/save, optimizer switching
- **trainingStore** (Zustand) -- training status, progress, sample URLs,
  lifecycle commands (start/stop/sample/backup/save)
- **uiStore** (Zustand) -- active tab, theme, backend connectivity

### Process Lifecycle

1. Electron main process spawns `uvicorn web.backend.main:app` as a child
   process.
2. Health-check polling (`GET /api/health`) waits for the backend to be ready.
3. React renderer loads, fetches config, auto-loads the last-used preset.
4. WebSocket connections (`/ws/training`, `/ws/system`) stream real-time data.
5. On quit, Electron terminates the child process.

---

## Phase 0: Scaffolding & CI

- Created `web/gui/` with Vite 7 + React 19 + TypeScript strict mode.
- Configured Tailwind CSS 4 with custom design tokens (orchid/violet palette).
- Set up ESLint with strict TypeScript rules.
- Configured Vitest for unit tests and Playwright for E2E tests.
- Created `web/backend/` with FastAPI app, CORS middleware, and health endpoint.
- Added GitHub Actions workflow (`web-tests.yml`) for CI.
- Set up Ruff linting for Python (120 char lines, import ordering).

---

## Phase 1: Config API & State Management

### Backend

- **ConfigService** (`web/backend/services/config_service.py`) -- thread-safe
  singleton owning the authoritative `TrainConfig` instance. Supports
  get/update/defaults/validate/export operations and reproduces the legacy
  preset-loading algorithm (version injection, secrets merge, optimizer
  defaults).
- **SingletonMixin** (`web/backend/services/_singleton.py`) -- double-checked
  locking base class used by all services.
- **Config router** (`web/backend/routers/config.py`) -- `GET /api/config`,
  `PUT /api/config`, `GET /api/config/defaults`, `GET /api/config/schema`,
  `POST /api/config/export`.
- **Presets router** (`web/backend/routers/presets.py`) -- list, load, save,
  delete presets. Built-in presets (filename starts with `#`) are read-only.
- **Concepts router** (`web/backend/routers/concepts.py`) -- CRUD for training
  concepts and sample definitions.
- **Samples router** (`web/backend/routers/samples.py`) -- separate sample
  definition management.
- **Secrets router** (`web/backend/routers/secrets.py`) -- read/write
  `secrets.json` with value masking on read.

### Frontend

- **configStore** (`web/gui/src/renderer/store/configStore.ts`) -- Zustand
  store with Immer middleware. Dot-notation `updateField()` with 500 ms
  debounced backend sync, stale-response protection via generation counter.
  Preset auto-load (last-used > Z-Image > first built-in).
- **configApi** (`web/gui/src/renderer/api/configApi.ts`) -- typed REST
  client for all config, preset, concept, sample, secret, tensorboard, and
  wiki endpoints. Protocol-aware base URL for Vite dev and Electron production.

### Tests

- **Config round-trip tests** (`web/backend/tests/test_config_roundtrip.py`)
  -- 25 tests loading every built-in preset, serializing, deserializing, and
  diffing to zero.
- **Preset load tests** (`web/backend/tests/test_preset_load.py`) -- 27 tests
  covering load, save, delete, built-in protection, and optimizer defaults.
- **Config API tests** (`web/backend/tests/test_config_api.py`) -- 33 tests
  for REST endpoints.

---

## Phase 2: Component Library & Layout

### Shared Components (`web/gui/src/renderer/components/shared/`)

| Component | Purpose |
|-----------|---------|
| `Button` | Primary/ghost/icon variants with gradient hover |
| `IconButton` | Compact icon-only button |
| `Card` | Elevated surface container |
| `SectionCard` | Collapsible titled card for form sections |
| `Toggle` | Accessible switch with animated thumb |
| `Select` | Enum dropdown (string options) |
| `SelectKV` | Key-value dropdown (label/value pairs) |
| `SelectAdvanced` | Filterable dropdown with search |
| `FormEntry` | Text/number input bound to config field |
| `FormFieldWrapper` | Label + tooltip wrapper for any field |
| `TimeEntry` | Value + unit selector (steps/seconds/etc.) |
| `LayerFilterEntry` | Multi-line layer filter text area |
| `PathPicker` / `FilePicker` / `DirPicker` | File system path inputs |
| `ProgressBar` / `DualProgress` | Training progress indicators |
| `SchemaField` | Schema-driven field renderer (dispatches to correct component) |
| `ArrayItemHeader` | Reorderable array item with move/delete buttons |
| `Skeleton` | Loading placeholder |
| `Tooltip` | Hover/focus tooltip with positioning |
| `ScalarChart` | TensorBoard scalar chart (Canvas-based) |

### Layout Components (`web/gui/src/renderer/components/layout/`)

| Component | Purpose |
|-----------|---------|
| `TopBar` | Logo, preset selector, theme toggle, backend indicator |
| `BottomBar` | Training controls, progress bars, status text, aria-live region |
| `TabNavigation` | Horizontal tab bar with keyboard navigation (arrow keys, Home/End) |

### Modal Components (`web/gui/src/renderer/components/modals/`)

| Modal | Purpose |
|-------|---------|
| `ModalBase` | Accessible dialog with focus trapping, Escape to close |
| `ConceptEditorModal` | Full concept editor (paths, augmentation, captions) |
| `OptimizerParamsModal` | Per-optimizer hyperparameter editing |
| `SchedulerParamsModal` | LR scheduler configuration |
| `SampleParamsModal` | Sample parameter editing |
| `ManualSamplingModal` | Custom sampling during training |
| `TimestepDistModal` | Timestep distribution configuration |
| `OffloadingModal` | Model offloading settings |
| `MuonAdamModal` | Muon+Adam dual optimizer configuration |
| `ProfilingPanel` | Training profiling settings |
| `ConvertModelModal` | Model format conversion dialog |
| `CaptionToolModal` | Batch caption generation |
| `MaskToolModal` | Batch mask generation |
| `VideoToolModal` | Video clip/image extraction, yt-dlp download |
| `StandaloneSamplingModal` | Standalone model sampling |

### Theme System

- CSS custom properties defined in `globals.css` under `@theme` directive.
- Dark/light mode via `data-theme` attribute on `<body>`.
- `theme.ts` detects system preference, persists user choice to localStorage.
- Design tokens: `--orchid-600: #C218E8`, `--violet-500: #8A4DFF`,
  `--surface-dark: #120B17`, `--surface-light: #F9F5FF`.

---

## Phase 3: All Tabs & Dynamic UI

### Tab Pages (`web/gui/src/renderer/pages/`)

| Page | Tab | Description |
|------|-----|-------------|
| `GeneralPage` | General | Workspace, output, debug, cloud settings |
| `ModelPage` | Model | Schema-driven per-model-type settings (21 schemas) |
| `ConceptsPage` | Concepts | Concept card grid with add/edit/delete/reorder |
| `TrainingPage` | Training | Schema-driven per-model-type training params |
| `SamplingPage` | Sampling | Sample definition management |
| `BackupPage` | Backup | Backup scheduling and configuration |
| `ToolsPage` | Tools | Dataset tools, model converter, video tools |
| `LoraPage` | LoRA | LoRA-specific settings (visible when training_method=LORA) |
| `EmbeddingPage` | Embedding | Embedding settings (visible when training_method=EMBEDDING) |
| `AdditionalEmbeddingsPage` | Embeddings | Additional embedding management |
| `CloudPage` | Cloud | Cloud training provider configuration |
| `TensorboardPage` | TensorBoard | Interactive scalar charts from event files |
| `PerformancePage` | Performance | Real-time GPU/CPU/RAM monitoring |
| `RunPage` | Run | Live training view with TensorBoard charts |
| `HelpPage` | Help | Wiki page browser |

### Schema-Driven Rendering

Rather than large if/elif chains, the Model and Training tabs use declarative
schema definitions:

- **`modelSchemas.ts`** -- per-`ModelType` section/field definitions for the
  Model tab. Each schema specifies sections (Base Model, UNet/Transformer,
  Text Encoder(s), VAE, Output) with typed field definitions.
- **`trainingSchemas.ts`** -- per-`ModelType` three-column layout schemas for
  the Training tab (optimizer, text encoder, noise/loss settings, etc.).
- **`fieldTypes.ts`** -- `FieldDef` and `SectionDef` interfaces that drive
  `SchemaField` rendering.

The `SchemaField` component reads a `FieldDef` and dispatches to the
appropriate input component (`FormEntry`, `Toggle`, `Select`, etc.).

### Dynamic Tab Visibility

The `TabNavigation` component reads `config.training_method` from the config
store and conditionally shows/hides the LoRA and Embedding tabs based on the
selected training method.

---

## Phase 4: Training Integration

### Backend Services

- **TrainerService** (`web/backend/services/trainer_service.py`) -- singleton
  managing the full training lifecycle. Spawns a daemon thread that calls
  `create.create_trainer()`, wires up `TrainCallbacks` for progress/status/
  sample events, and forwards them to WebSocket clients via a pluggable
  broadcast callback. Supports start, stop, sample (default and custom),
  backup, and save commands. Manages always-on TensorBoard subprocess.

- **TensorboardService** (`web/backend/services/tensorboard_service.py`) --
  reads TensorBoard event files directly (without running a TensorBoard
  server) to provide scalar data via REST endpoints.

### WebSocket Handlers

- **training_ws** (`web/backend/ws/training_ws.py`) -- `/ws/training`
  endpoint. `ConnectionManager` tracks active clients. `broadcast_sync()`
  bridges the synchronous training thread to the async event loop via
  `asyncio.run_coroutine_threadsafe`. Message types: `progress`, `status`,
  `sample`, `sample_progress`, `error`.

### Frontend Integration

- **trainingStore** (`web/gui/src/renderer/store/trainingStore.ts`) -- Zustand
  store for training state (status, progress, samples, error). Lifecycle
  actions call the REST API; WebSocket messages update state.
- **trainingApi** (`web/gui/src/renderer/api/trainingApi.ts`) -- typed REST
  client for start/stop/sample/backup/save/status.
- **useTrainingWebSocket** (`web/gui/src/renderer/hooks/useTrainingWebSocket.ts`)
  -- hook that connects to `/ws/training`, dispatches messages to the
  training store. Reconnects with exponential backoff (1s to 30s). Progress
  messages are throttled via `requestAnimationFrame` to cap UI updates at
  ~60fps.

### Training Router

- **training router** (`web/backend/routers/training.py`) -- `POST start`,
  `POST stop`, `POST sample`, `POST sample/custom`, `POST backup`,
  `POST save`, `GET status`.

---

## Phase 5: New Features & Sub-Applications

### Performance Tab

- **MonitorService** (`web/backend/services/monitor_service.py`) -- collects
  CPU/RAM (via psutil) and GPU metrics (pynvml with torch.cuda fallback).
  Reports utilization, temperature, VRAM usage per device.
- **system_ws** (`web/backend/ws/system_ws.py`) -- `/ws/system` endpoint that
  pushes metrics to clients at ~1 second intervals.
- **PerformancePage** -- displays real-time CPU, RAM, and per-GPU gauges.

### Run Mode

- **RunPage** -- live training dashboard combining progress display with
  interactive TensorBoard scalar charts for loss, learning rate, and other
  training scalars.
- **ScalarChart** component -- Canvas-based chart rendering for scalar data.
- **chartUtils** -- shared chart layout and data transformation utilities.

### Dataset Tools

- **ToolService** (`web/backend/services/tool_service.py`) -- wraps caption
  and mask generation tools from the existing backend.
- **Tools router** (`web/backend/routers/tools.py`) -- endpoints for batch
  caption and mask generation.
- **CaptionToolModal** / **MaskToolModal** -- frontend dialogs for dataset
  tool configuration and execution.

### Model Converter

- **Converter router** (`web/backend/routers/converter.py`) -- model format
  conversion endpoint.
- **ConvertModelModal** -- dialog for selecting source/target format and
  triggering conversion.

### Video Tools

- **VideoService** (`web/backend/services/video_service.py`) -- video clip
  extraction, frame extraction, and yt-dlp video downloading.
- **Video tools router** (`web/backend/routers/video_tools.py`) -- REST
  endpoints for video operations.
- **VideoToolModal** -- frontend dialog for video tool configuration.
- **videoToolsApi** (`web/gui/src/renderer/api/videoToolsApi.ts`) -- typed
  client for video endpoints.

### Standalone Sampling

- **SamplerService** (`web/backend/services/sampler_service.py`) -- loads a
  model and runs inference outside of training.
- **Sampling router** (`web/backend/routers/sampling.py`) -- standalone
  sampling endpoint.
- **StandaloneSamplingModal** -- dialog for model selection and sampling.
- **samplingApi** (`web/gui/src/renderer/api/samplingApi.ts`) -- typed client
  for sampling endpoints.

### Wiki / Help

- **Wiki router** (`web/backend/routers/wiki.py`) -- serves wiki markdown
  pages from the repository's `docs/` directory.
- **HelpPage** -- browsable wiki page viewer with section navigation.

---

## Phase 6: Polish, Accessibility & Packaging

### Accessibility (WCAG AA)

- Twin-gradient focus rings (`--color-orchid-600` to `--color-violet-500`)
  applied to all interactive elements via `globals.css`.
- Keyboard navigation for `TabNavigation` (arrow keys, Home/End, tab order).
- `role="tabpanel"`, `aria-labelledby`, `aria-selected` on tab panels.
- `aria-live="polite"` region in `BottomBar` for training status announcements.
- `@media (prefers-contrast: more)` high-contrast mode overrides.
- Focus-visible styling with `outline-offset` for clear focus indicators.

### Motion & Animation

- CSS `@keyframes` for section reveals (`reveal-up`), tab transitions
  (`tab-slide-in`), and subtle hover effects on cards and buttons.
- `@media (prefers-reduced-motion: reduce)` disables all animations.
- Gradient hover effects on buttons, smooth theme transitions.

### Performance Optimization

- **Code splitting**: all 15 tab pages lazy-loaded via `React.lazy()` +
  `Suspense` with skeleton fallbacks.
- **WebSocket throttling**: progress messages buffered and flushed once per
  animation frame via `requestAnimationFrame`.
- **Debounced config sync**: field changes batched over 500ms before PUT.
- **Schema memoization**: model and training schemas looked up via `useMemo`
  keyed on `model_type`.
- **Lazy Python imports**: heavy modules (torch, diffusers, pynvml) imported
  at call time, not at module scope, so the FastAPI server starts in <1s.

### E2E Test Suite (Playwright)

7 spec files with 49 E2E tests:

| Spec File | Tests | Coverage |
|-----------|-------|----------|
| `smoke.spec.ts` | 4 | App loads, tabs render, backend health |
| `config-roundtrip.spec.ts` | 10 | Load preset, modify field, save, reload, diff |
| `model-type-switching.spec.ts` | 5 | Switch model types, verify schema changes |
| `training-method-rules.spec.ts` | 4 | Tab visibility per training method |
| `training-flow.spec.ts` | 9 | Start/stop training, progress updates, samples |
| `dynamic-ui.spec.ts` | 10 | Dynamic field rendering per model type |
| `optimizer-change.spec.ts` | 7 | Optimizer switching, defaults, caching |

### Unit Tests (Vitest)

4 component test files with 16 tests covering Button, Card, Toggle, and
Select rendering, interaction, and accessibility attributes.

### Backend Tests (pytest)

6 test files with 95 tests:

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `test_health.py` | 1 | Health endpoint |
| `test_config_api.py` | 33 | Config CRUD, validation, schema, export |
| `test_config_roundtrip.py` | 25 | All 47 built-in presets (some parametrized) |
| `test_preset_load.py` | 27 | Preset lifecycle, built-in protection |
| `test_parameter_parity.py` | 5 | React forms match TrainConfig fields |
| `test_training_method_rules.py` | 4 | Tab visibility rules per method |

### Electron Packaging

- `electron-builder.yml` configuration for Windows (NSIS), macOS (DMG), and
  Linux (AppImage) builds.
- Build scripts in `package.json` (`build:electron`, `pack`, `dist`).
- Electron main process (`web/gui/src/main/index.ts`) spawns the FastAPI
  backend and manages the application window.
- Preload script (`web/gui/src/main/preload.ts`) exposes a safe IPC bridge.

---

## File Inventory

### Frontend -- `web/gui/`

```
src/
  main/
    index.ts                    Electron main process
    preload.ts                  Preload script (IPC bridge)
  shared/
    ipc-channels.ts             IPC channel constants
    electron-api.ts             Electron API type definitions
  renderer/
    main.tsx                    React entry point
    App.tsx                     App shell (lazy tabs, health polling, WS)
    vite-env.d.ts               Vite type declarations
    test-setup.ts               Vitest setup

    api/
      configApi.ts              Config/preset/concept/sample/secret REST client
      trainingApi.ts            Training lifecycle REST client
      toolsApi.ts               Dataset tools REST client
      videoToolsApi.ts          Video tools REST client
      samplingApi.ts            Standalone sampling REST client

    store/
      configStore.ts            Config state (Zustand + Immer)
      trainingStore.ts          Training state (Zustand)
      uiStore.ts                UI state: active tab, theme, connectivity

    hooks/
      useConfigField.ts         Config field binding hook
      useArrayField.ts          Array field management hook
      useTrainingWebSocket.ts   WebSocket connection with rAF throttling

    schemas/
      fieldTypes.ts             FieldDef / SectionDef interfaces
      modelSchemas.ts           Per-model-type Model tab schemas
      trainingSchemas.ts        Per-model-type Training tab schemas

    pages/
      GeneralPage.tsx           Workspace, output, debug, cloud
      ModelPage.tsx             Schema-driven model settings
      ConceptsPage.tsx          Concept card grid
      TrainingPage.tsx          Schema-driven training params
      SamplingPage.tsx          Sample definition management
      BackupPage.tsx            Backup scheduling
      ToolsPage.tsx             Dataset tools launcher
      LoraPage.tsx              LoRA settings
      EmbeddingPage.tsx         Embedding settings
      AdditionalEmbeddingsPage.tsx  Additional embeddings
      CloudPage.tsx             Cloud training config
      TensorboardPage.tsx       Interactive TensorBoard charts
      PerformancePage.tsx       Real-time system monitoring
      RunPage.tsx               Live training dashboard
      HelpPage.tsx              Wiki page browser
      DataPage.tsx              Data settings

    components/
      shared/                   21 reusable UI components (see Phase 2)
      layout/                   TopBar, BottomBar, TabNavigation
      modals/                   15 modal dialogs (see Phase 2)
      concepts/
        ConceptCard.tsx         Individual concept display card
        ConceptGrid.tsx         Drag-and-drop concept grid

    utils/
      enumLabels.ts             Human-readable enum labels
      tooltips.ts               Tooltip content definitions
      inputStyles.ts            Shared input styling utilities
      chartUtils.ts             TensorBoard chart helpers

    types/
      generated/
        enums.ts                TypeScript enums (from Python)
        config.ts               TrainConfig TypeScript interface
        metadata.ts             Field metadata types
      electron.d.ts             Electron API declarations

    styles/
      globals.css               Design tokens, dark/light theme, focus rings
      app.css                   App shell and layout styles
      theme.ts                  Theme detection and persistence
```

### Backend -- `web/backend/`

```
main.py                         FastAPI app, CORS, router registration
paths.py                        PROJECT_ROOT, PRESETS_DIR, SECRETS_PATH
conftest.py                     pytest fixtures (TestClient, cleanup)

routers/
  __init__.py
  health.py                     GET /api/health
  config.py                     Config CRUD endpoints
  presets.py                    Preset management endpoints
  concepts.py                   Concept CRUD endpoints
  samples.py                    Sample definition endpoints
  secrets.py                    Secrets read/write (masked)
  training.py                   Training lifecycle endpoints
  tensorboard.py                TensorBoard scalar data endpoints
  wiki.py                       Wiki page serving
  system.py                     System info endpoint
  tools.py                      Dataset tool endpoints
  converter.py                  Model conversion endpoint
  video_tools.py                Video tool endpoints
  sampling.py                   Standalone sampling endpoint

services/
  __init__.py
  _singleton.py                 Thread-safe singleton base class
  _serialization.py             Sample output serialization helpers
  config_service.py             Config state management singleton
  trainer_service.py            Training lifecycle singleton
  tensorboard_service.py        TensorBoard event file reader
  monitor_service.py            CPU/RAM/GPU metrics collector
  concept_service.py            Concept/sample file I/O
  tool_service.py               Dataset tool wrappers
  sampler_service.py            Standalone sampling service
  video_service.py              Video tool wrappers

ws/
  __init__.py
  training_ws.py                /ws/training -- progress/status/sample stream
  system_ws.py                  /ws/system -- CPU/GPU metrics stream

models/
  __init__.py                   Pydantic request/response models

tests/
  __init__.py
  test_health.py                Health endpoint test
  test_config_api.py            Config CRUD tests
  test_config_roundtrip.py      Preset round-trip tests
  test_preset_load.py           Preset lifecycle tests
  test_parameter_parity.py      React/TrainConfig field parity
  test_training_method_rules.py Tab visibility rules
```

---

## Key Design Decisions

1. **Schema-driven UI rendering** -- Model and Training tabs use declarative
   `SectionDef[]` schemas per model type instead of imperative if/elif chains.
   Adding support for a new model type requires only adding a schema object.

2. **Zustand over Redux** -- simpler API, smaller bundle, Immer integration
   provides immutable updates with mutable syntax. Three focused stores
   instead of one monolithic store.

3. **WebSocket for real-time, REST for config** -- progress updates at 60fps
   need WebSocket; config CRUD is naturally request/response. Clean separation
   of concerns.

4. **Lazy Python imports** -- all heavy modules (torch, diffusers, PIL,
   pynvml) are imported at call time inside functions. This keeps the FastAPI
   server startup under 1 second and avoids GPU memory allocation until
   training actually begins.

5. **SingletonMixin pattern** -- all backend services use a thread-safe
   double-checked locking singleton. This ensures a single authoritative
   instance per service while remaining compatible with FastAPI's async
   request handling.

6. **Committed type generation** -- TypeScript types for enums and config are
   checked into the repository (`types/generated/`) rather than generated at
   build time. This avoids a Python dependency in the frontend build chain.

7. **Protocol-aware API URLs** -- the frontend detects `file://` protocol
   (Electron production) vs. `http://` (Vite dev) and adjusts API base URLs
   accordingly. No build-time configuration needed.

8. **rAF-based progress throttling** -- WebSocket progress messages are
   buffered and flushed once per animation frame, preventing layout thrashing
   during high-frequency training updates.

9. **Config sync with generation counter** -- debounced PUT requests include a
   generation counter to discard stale responses from overlapping requests.

10. **Preset auto-load cascade** -- on startup, the frontend tries the
    last-used preset (from localStorage), then a Z-Image preset, then the
    first built-in preset. This ensures the UI always starts with a valid
    configuration.

---

## No Backend Modifications

The FastAPI bridge imports `modules/` directly via `sys.path.insert()`. Zero
files were changed in `modules/`, `scripts/`, or `training_presets/`. The
existing CLI training workflow (`python scripts/train.py --config-path ...`)
remains fully functional and unaffected.
