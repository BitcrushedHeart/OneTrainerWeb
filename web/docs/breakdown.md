# OneTrainerWeb -- Implementation Breakdown

## Overview

OneTrainerWeb replaces the legacy customtkinter GUI with an Electron + React frontend backed by a FastAPI bridge layer. The existing Python backend (`modules/`) is imported directly by the bridge -- zero files changed. The frontend covers all 21+ model types, 4 training methods, and 40+ optimizers with dark/light theming and WCAG AA accessibility.

---

## Architecture

| Layer | Technology | Role |
|-------|-----------|------|
| Renderer | React 19.2 + Vite 7.3 + Tailwind 4.2 + TypeScript (strict) | Single-page app, lazy-loaded tab pages |
| Main process | Electron 40.6 | Window management, spawns FastAPI child process |
| Backend bridge | FastAPI + Uvicorn (Python 3.12) | REST config CRUD, WebSocket progress/metrics |
| Training backend | PyTorch 2.8, Hugging Face diffusers | Unchanged `modules/` -- imported directly |

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

- **ConfigService** -- thread-safe singleton owning the authoritative
  `TrainConfig` instance. Supports get/update/defaults/validate/export and
  reproduces the legacy preset-loading algorithm (version injection, secrets
  merge, optimizer defaults).
- **SingletonMixin** -- double-checked locking base class used by all services.
- **Config router** -- `GET /api/config`, `PUT /api/config`,
  `GET /api/config/defaults`, `GET /api/config/schema`,
  `POST /api/config/export`.
- **Presets router** -- list, load, save, delete presets. Built-in presets
  (filename starts with `#`) are read-only.
- **Concepts router** -- CRUD for training concepts and sample definitions.
- **Samples router** -- separate sample definition management.
- **Secrets router** -- read/write `secrets.json` with value masking on read.

### Frontend

- **configStore** -- Zustand store with Immer middleware. Dot-notation
  `updateField()` with 500ms debounced backend sync, stale-response protection
  via generation counter. Preset auto-load (last-used > Z-Image > first
  built-in).
- **configApi** -- typed REST client for all config, preset, concept, sample,
  secret, tensorboard, and wiki endpoints. Protocol-aware base URL for Vite dev
  and Electron production.

### Tests

- **Config round-trip tests** -- 25 tests loading every built-in preset,
  serializing, deserializing, and diffing to zero.
- **Preset load tests** -- 27 tests covering load, save, delete, built-in
  protection, and optimizer defaults.
- **Config API tests** -- 33 tests for REST endpoints.

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

- **TrainerService** -- singleton managing the full training lifecycle. Spawns a
  daemon thread that calls `create.create_trainer()`, wires up `TrainCallbacks`
  for progress/status/sample events, and forwards them to WebSocket clients.
  Supports start, stop, sample (default and custom), backup, and save commands.
  Manages always-on TensorBoard subprocess.

- **TensorboardService** -- reads TensorBoard event files directly (without
  running a TensorBoard server) to provide scalar data via REST endpoints.

### WebSocket Handlers

- **training_ws** -- `/ws/training` endpoint. `ConnectionManager` tracks active
  clients. `broadcast_sync()` bridges the synchronous training thread to the
  async event loop via `asyncio.run_coroutine_threadsafe`. Message types:
  `progress`, `status`, `sample`, `sample_progress`, `error`.

### Frontend Integration

- **trainingStore** -- Zustand store for training state (status, progress,
  samples, error). Lifecycle actions call the REST API; WebSocket messages
  update state.
- **trainingApi** -- typed REST client for start/stop/sample/backup/save/status.
- **useTrainingWebSocket** -- hook that connects to `/ws/training`, dispatches
  messages to the training store. Reconnects with exponential backoff (1s to
  30s). Progress messages throttled via `requestAnimationFrame` to cap UI
  updates at ~60fps.

### Training Router

- **training router** -- `POST start`, `POST stop`, `POST sample`,
  `POST sample/custom`, `POST backup`, `POST save`, `GET status`.

---

## Phase 5: New Features & Sub-Applications

### Performance Tab

- **MonitorService** -- collects CPU/RAM (via psutil) and GPU metrics (pynvml
  with torch.cuda fallback). Reports utilization, temperature, VRAM usage per
  device.
- **system_ws** -- `/ws/system` endpoint that pushes metrics at ~1s intervals.
- **PerformancePage** -- real-time CPU, RAM, and per-GPU gauges.

### Run Mode

- **RunPage** -- live training dashboard combining progress display with
  interactive TensorBoard scalar charts.
- **ScalarChart** -- Canvas-based chart rendering for scalar data.

### Dataset Tools

- **ToolService** -- wraps caption and mask generation tools from the existing
  backend.
- **Tools router** -- endpoints for batch caption and mask generation.

### Model Converter

- **Converter router** -- model format conversion endpoint.
- **ConvertModelModal** -- source/target format selection dialog.

### Video Tools

- **VideoService** -- video clip extraction, frame extraction, yt-dlp
  downloading.
- **Video tools router** -- REST endpoints for video operations.

### Standalone Sampling

- **SamplerService** -- loads a model and runs inference outside of training.
- **Sampling router** -- standalone sampling endpoint.

### Wiki / Help

- **Wiki router** -- serves wiki markdown pages from the repository's `docs/`
  directory.
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

- CSS `@keyframes` for section reveals, tab transitions, and hover effects.
- `@media (prefers-reduced-motion: reduce)` disables all animations.

### Performance Optimization

- **Code splitting**: all 15 tab pages lazy-loaded via `React.lazy()` +
  `Suspense` with skeleton fallbacks.
- **WebSocket throttling**: progress messages buffered and flushed once per
  animation frame via `requestAnimationFrame`.
- **Debounced config sync**: field changes batched over 500ms before PUT.
- **Schema memoization**: model and training schemas looked up via `useMemo`
  keyed on `model_type`.
- **Lazy Python imports**: heavy modules (torch, diffusers, pynvml) imported
  at call time so the FastAPI server starts in <1s.

### Test Suite

**E2E (Playwright):** 7 spec files, 49 tests covering smoke, config round-trip,
model type switching, training method rules, training flow, dynamic UI, and
optimizer changes.

**Unit (Vitest):** 4 component test files, 16 tests covering Button, Card,
Toggle, and Select.

**Backend (pytest):** 6 test files, 95 tests covering health, config CRUD,
preset round-trips, preset lifecycle, parameter parity, and training method
rules.

### Electron Packaging

- `electron-builder.yml` for Windows (NSIS), macOS (DMG), and Linux (AppImage).
- Electron main process spawns FastAPI backend and manages the application
  window. Preload script exposes a safe IPC bridge.

---

## Key Design Decisions

- **Schema-driven UI rendering** -- Model and Training tabs use declarative `SectionDef[]` schemas per model type; adding a new model type means adding one schema object.
- **Zustand over Redux** -- simpler API, smaller bundle, Immer integration for immutable updates with mutable syntax; three focused stores instead of one monolithic store.
- **WebSocket for real-time, REST for config** -- progress updates at 60fps need WebSocket; config CRUD is request/response.
- **Lazy Python imports** -- all heavy modules imported at call time inside functions, keeping FastAPI startup under 1s and avoiding GPU allocation until training begins.
- **Committed type generation** -- TypeScript types for enums and config are checked into `types/generated/` rather than generated at build time, avoiding a Python dependency in the frontend build chain.
- **rAF-based progress throttling** -- WebSocket messages buffered and flushed once per animation frame, preventing layout thrashing during high-frequency updates.

---

## No Backend Modifications

The FastAPI bridge imports `modules/` directly via `sys.path.insert()`. Zero
files were changed in `modules/`, `scripts/`, or `training_presets/`. The
existing CLI training workflow (`python scripts/train.py --config-path ...`)
remains fully functional and unaffected.
