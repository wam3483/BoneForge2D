# Phase 1: Foundation - Research

**Researched:** 2026-02-28
**Domain:** PixiJS v8 viewport, Zustand v5 + Immer patch-based undo/redo, IndexedDB persistence, React 19 + Vite 6 project scaffolding
**Confidence:** HIGH (stack verified against live npm registry; API patterns verified against official docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Viewport Renderer**
- Use PixiJS v8 for the editor viewport (not Canvas 2D)
- Rationale: The editor viewport preview IS the runtime — using PixiJS for both means the interpolation and transform math is identical, with no preview-vs-export discrepancy. The editor imports its own runtime package directly.
- The PixiJS application is mounted inside a React ref; lifecycle managed with useEffect mount/unmount + ResizeObserver for canvas sizing

**Bone Visual Style**
- Spine-style "fish-bone" shape: diamond at the bone head (origin), tapered body toward the tip
- Bone length is determined by child bone position (or a default length for leaf bones)
- Selected bones: highlighted color (e.g. bright yellow/orange)
- Hovered bones: lighter highlight
- Bone names rendered as small labels near the bone head
- Bones render as PixiJS Graphics objects, redrawn on each state change

**Bone Creation Workflow**
- Root bone: Toolbar "Add Bone" button OR keyboard shortcut (B) — places bone at viewport center
- Child bone: With a bone selected, click in the viewport to place a child at that position — the selected bone becomes the parent automatically
- Connection: Parent-child relationship is set at creation time; reparenting is done via the hierarchy panel (Phase 4) or drag in the hierarchy tree
- Newly created bones are immediately selected and enter "move" mode so user can drag to position

**Bone Transform Gizmos**
- Three separate tool modes: Select/Move (G), Rotate (R), Scale (S) — keyboard shortcut switching, Blender conventions
- Active tool shown in toolbar with visual indicator
- Move gizmo: X/Y axis arrows + free-move center square
- Rotate gizmo: circular arc handle around bone origin
- Scale gizmo: axis handles with square endpoints
- Click on bone in viewport to select it regardless of active tool

**Editor Shell Layout (Phase 1 minimal chrome)**
- Full-viewport canvas taking ~80% of the screen
- Top toolbar: app logo/name | tool buttons (Select, Move, Rotate, Scale) | mode toggle (Pose / Animate) | undo/redo buttons | import image button
- Right sidebar (narrow, ~240px): image asset list — thumbnails of imported images, click to attach to selected bone
- No hierarchy panel, no properties panel, no animation panel in Phase 1 (all Phase 4)
- Status bar at bottom: selected bone name, current mode, zoom level

**Data Model Architecture (critical — locks downstream phases)**
- All bone transforms stored in local space (relative to parent) — NEVER world space
- `bone.localTransform: { x, y, rotation, scaleX, scaleY }` — the only stored transform
- `bone.bindTransform: { x, y, rotation, scaleX, scaleY }` — immutable after first animation is created
- World transforms are always ephemeral computed values: `evaluateWorldTransform(bone, skeleton) → WorldTransform`
- Bone IDs are UUIDs internally; display names are separate mutable strings
- Coordinate system: Y-down, positive rotation = clockwise, matching PixiJS v8 conventions

**Undo / Redo**
- Immer-patch-based undo/redo integrated into Zustand store from the first mutation
- Every store mutation produces an Immer patch + inverse patch pair
- Undo stack: array of inverse patches (max 100 entries)
- Redo stack: cleared on new mutation, repopulated on undo
- Undoable: all bone operations (create, delete, rename, reparent, transform), image import, image attach/detach, pivot/offset changes, draw order changes, mode toggle
- NOT undoable: viewport pan/zoom, selection changes (these are view state, not document state)

**Image Attachment Workflow**
- Images imported via `<input type="file" accept="image/png,image/jpeg">` triggered by toolbar button
- Imported images stored in Zustand store as `{ id, name, dataUrl, width, height }`
- Also persisted to IndexedDB as ArrayBuffer for session recovery
- Attaching: select a bone, then click an image in the right sidebar → image attached to bone
- Alternatively: drag image from sidebar onto a bone in the viewport
- Attachment stores: `{ imageId, boneId, offsetX, offsetY, pivotX, pivotY, zOrder }`
- Pivot is normalized (0–1 range, default 0.5, 0.5 = center)

**Pose Mode / Animate Mode**
- Single toggle button in toolbar (keyboard: Tab)
- Pose Mode: gizmo operations modify `bone.bindTransform` directly — this is the rest pose
- Animate Mode: gizmo operations create keyframes at `currentTime` (Phase 2 concern, but the mode must be enforced from Phase 1 so the distinction is never ambiguous)
- Visual indicator: mode shown clearly in toolbar + status bar; viewport border color changes (e.g. blue border = Pose Mode, orange border = Animate Mode)
- In Phase 1 (before animation system), Animate Mode shows "No active animation — create one in Phase 2" guidance

**Session Persistence (IndexedDB)**
- Auto-save on every document mutation (debounced 500ms)
- Saves to IndexedDB key: `boneforge2d-project` (single project for v1)
- On app load: check IndexedDB, restore if found, otherwise show empty canvas
- Images stored as ArrayBuffer in IndexedDB (not dataUrl, to avoid size limits)
- No explicit "save" button in Phase 1 — auto-save is the only save mechanism until Phase 3 adds export

### Claude's Discretion
- Exact gizmo handle sizes, colors, and hit areas
- PixiJS v8 EventSystem / FederatedPointerEvent specifics for bone hit testing
- ResizeObserver implementation for canvas sizing
- Debounce timing for IndexedDB writes
- Exact status bar content and positioning
- Error handling for unsupported image formats or oversized files

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope (user proceeded with defaults, no scope additions)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BONE-01 | User can create a bone in the viewport with a default name | PixiJS Graphics API for bone shape; UUID generation for IDs; store mutation pattern |
| BONE-02 | User can rename a bone | Zustand store mutation with Immer patches; store holds `bone.name` separate from `bone.id` |
| BONE-03 | User can delete a bone (children become children of deleted bone's parent) | Store mutation with reparenting logic; Immer patches for undo |
| BONE-04 | User can assign a parent to a bone to create a hierarchy | Data model: `bone.parentId`; store mutation; `evaluateWorldTransform` traversal |
| BONE-05 | User can reparent a bone by dragging in the hierarchy panel | Phase 4 panel deferred — Phase 1 must lay store foundation with reparent action |
| BONE-06 | User can move a bone in the viewport using a translate gizmo | PixiJS FederatedPointerEvent on gizmo Graphics; viewport-to-local coordinate transform |
| BONE-07 | User can rotate a bone in the viewport using a rotate gizmo | Circular arc gizmo with atan2 angle calculation; local space rotation storage |
| BONE-08 | User can scale a bone in the viewport using a scale gizmo | Axis handle gizmos; delta-distance to scale factor conversion |
| BONE-09 | User can switch between Pose Mode and Animate Mode | Store boolean `editorMode`; toolbar toggle; viewport border color via CSS |
| BONE-10 | User can toggle visibility of individual bones in the viewport | `bone.visible` flag in store; PixiJS Graphics `visible` prop |
| ATTACH-01 | User can import PNG and JPG image files | FileReader API → ArrayBuffer; store `imageAssets[]`; IndexedDB persistence |
| ATTACH-02 | User can attach an image to a bone so it follows world transform | Attachment record in store; PixiJS Sprite parented to bone's Container node |
| ATTACH-03 | User can detach an image from a bone | Store mutation removing attachment; Immer patches for undo |
| ATTACH-04 | User can adjust draw order (z-index) of attachments | `attachment.zOrder`; `container.zIndex` or `sortableChildren` in PixiJS |
| ATTACH-05 | User can adjust pivot/offset of attachment relative to bone origin | `attachment.offsetX/Y`, `attachment.pivotX/Y`; Sprite position and pivot in PixiJS |
| VIEW-01 | User can zoom in/out of the canvas viewport | Viewport Container scale; wheel event on stage |
| VIEW-02 | User can pan the canvas viewport | Viewport Container position; drag on stage background |
| VIEW-03 | User can toggle a grid overlay on the viewport | PixiJS Graphics grid drawn in a dedicated Container layer |
| VIEW-04 | User can enable snapping so transforms snap to grid increments | Snap rounding in gizmo delta-apply logic; configurable grid size |
| VIEW-05 | User can toggle visibility of individual bones without deleting them | `bone.visible` in store; conditional PixiJS `graphics.visible` |
| PERSIST-01 | User can undo the last editing action (Ctrl+Z) | Immer inversePatches stack; `applyPatches` on undo |
| PERSIST-02 | User can redo an undone action (Ctrl+Y / Ctrl+Shift+Z) | Immer patches stack repopulated on undo; `applyPatches` on redo |
| PERSIST-03 | Active project auto-persists to IndexedDB on every mutation | Debounced 500ms write; `indexedDB.open('boneforge2d', 1)`; ArrayBuffer for images |
</phase_requirements>

---

## Summary

Phase 1 establishes every critical architectural foundation that all later phases build on. The data model, store architecture, coordinate system, and undo mechanism must all be correct before any UI or animation code is written — four of the six project-critical pitfalls identified in prior research are data model decisions that cannot be cheaply retrofitted.

The verified stack is React 19.2.4 + TypeScript 5.9.3 + Vite 7.3.1 + PixiJS 8.16.0 + @pixi/react 8.0.5 + Zustand 5.0.11 + Immer 11.1.4 + Tailwind CSS 4.2.1 + @tailwindcss/vite 4.2.1. All versions confirmed against live npm registry on 2026-02-28.

The two highest-risk implementation areas are the PixiJS gizmo interaction system and the Zustand + Immer patch-based undo/redo wiring. PixiJS v8 changed the interaction API significantly from v7: `InteractionManager` is gone, replaced by `EventSystem` with `FederatedPointerEvent`; `pointermove` now fires only when the pointer is over a display object (use `globalpointermove` for unrestricted tracking needed during gizmo drag). The Immer patch pattern requires `enablePatches()` at app startup and `produceWithPatches` wrapping each store mutation — NOT the standard Immer middleware's `produce`, which does not emit patches.

**Primary recommendation:** Scaffold Vite 6 + React 19 + TypeScript, wire the Zustand store with Immer patch undo/redo first, implement `evaluateWorldTransform` with unit tests, then build the PixiJS viewport around that verified data model.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pixi.js | 8.16.0 | Editor viewport renderer and scene graph | Locked decision: editor IS the runtime; WebGL2/WebGPU backend |
| @pixi/react | 8.0.5 | React integration layer for PixiJS v8 | Official package; React 19-compatible; v8 complete rewrite for reconciler |
| react | 19.2.4 | UI shell | Locked decision; project constraint |
| typescript | 5.9.3 | Type safety | Locked decision; strict mode mandatory |
| vite | 7.3.1 | Build tool | Locked decision; native ESM; fastest cold start |
| zustand | 5.0.11 | Global editor state | Locked decision; v5 stable confirmed |
| immer | 11.1.4 | Immutable mutations + patch-based undo/redo | Locked decision; patches enable low-overhead undo |
| tailwindcss | 4.2.1 | Utility CSS | Locked decision; v4 uses @tailwindcss/vite plugin |
| @tailwindcss/vite | 4.2.1 | Vite plugin for Tailwind v4 | Replaces PostCSS config; required for v4 with Vite |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-dialog | 1.1.15 | Accessible modal dialogs | Import image dialog |
| vitest | 4.0.18 | Unit testing | Transform math, undo/redo logic, world transform computation |
| uuid | latest | UUID v4 generation for bone IDs | `crypto.randomUUID()` is viable alternative in modern browsers |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @pixi/react | Imperative PixiJS in useRef | useRef approach avoids @pixi/react JSX pragma overhead but requires manual PixiJS lifecycle management; @pixi/react is better for sidebar/toolbar React components that need to interact with the canvas |
| Immer patches (hand-rolled) | zundo library | zundo is simpler but stores full state snapshots by default; Immer patches store only diffs — correct for image-heavy editor state |
| IndexedDB raw API | idb library | idb wraps IndexedDB in Promises; raw API is verbose but has no extra dependency; either works |

**Installation:**
```bash
npm create vite@latest boneforge2d -- --template react-ts
cd boneforge2d
npm install pixi.js@^8.16.0 @pixi/react@^8.0.5
npm install zustand@^5.0.11 immer@^11.1.4
npm install tailwindcss@^4.2.1 @tailwindcss/vite@^4.2.1
npm install @radix-ui/react-dialog
npm install -D vitest @vitest/ui
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── model/               # TypeScript interfaces (Bone, Skeleton, EditorState, etc.)
│   ├── types.ts         # All domain types in one file (Phase 1 is small enough)
│   └── transforms.ts    # evaluateWorldTransform, localToWorld, worldToLocal
├── store/               # Zustand store
│   ├── index.ts         # createStore + compose slices
│   ├── slices/
│   │   ├── skeletonSlice.ts    # bones, skeleton mutations
│   │   ├── attachmentSlice.ts  # imageAssets, attachments
│   │   └── editorSlice.ts      # selection, mode, viewport, undo/redo stacks
│   └── undoRedo.ts      # produceWithPatches wrapper middleware
├── viewport/            # PixiJS canvas layer
│   ├── PixiViewport.tsx # React component: mounts PixiJS via @pixi/react
│   ├── BoneRenderer.ts  # Imperative: draws bones as Graphics objects
│   ├── GizmoLayer.ts    # Imperative: move/rotate/scale gizmo handles
│   └── ViewportCamera.ts # Pan/zoom container management
├── components/          # React UI
│   ├── Toolbar.tsx
│   ├── Sidebar.tsx      # Image asset list
│   └── StatusBar.tsx
├── persistence/
│   └── indexeddb.ts     # open, save, load project
└── main.tsx
```

### Pattern 1: Zustand Store with Immer Patch Undo/Redo

**What:** Every document mutation goes through `produceWithPatches`, yielding forward + inverse patches stored in undo/redo stacks.
**When to use:** Every function that mutates `skeleton`, `imageAssets`, or `attachments` — NOT viewport/selection state.

```typescript
// Source: Immer docs + pmndrs/zustand GitHub issue #464
import { enablePatches, produceWithPatches, applyPatches, Patch } from 'immer'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

enablePatches() // MUST be called once at app startup

interface UndoRedoState {
  undoStack: Patch[][]   // array of inversePatches arrays
  redoStack: Patch[][]   // array of patches arrays
}

// Wrap any document mutation to capture patches
function withPatches<T>(
  state: T,
  recipe: (draft: T) => void
): [T, Patch[], Patch[]] {
  return produceWithPatches(state, recipe)
}

// In store: undo action
undo: () => set((state) => {
  const inversePatches = state.undoStack.pop()
  if (!inversePatches) return
  const redoPatches = state.redoStack[state.redoStack.length - 1] // track forward
  state.skeleton = applyPatches(state.skeleton, inversePatches)
})
```

**Critical:** `enablePatches()` must be called before any `produce`/`produceWithPatches` call. Without it, Immer silently returns undefined patches.

### Pattern 2: PixiJS Mounted via @pixi/react Application Component

**What:** Use `<Application resizeTo={containerRef}>` from `@pixi/react` as the root; extend with required PixiJS classes; access app instance via `useApplication()` hook in children.
**When to use:** Whenever mounting the PixiJS canvas inside React.

```typescript
// Source: react.pixijs.io + pixijs.com/blog/pixi-react-v8-live
import { Application, extend, useApplication } from '@pixi/react'
import { Container, Graphics, Sprite, Text } from 'pixi.js'
import { useRef } from 'react'

// Register all PixiJS classes used in JSX — required before use
extend({ Container, Graphics, Sprite, Text })

const EditorCanvas = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <Application resizeTo={containerRef} antialias background="#1a1a2e">
        <ViewportLayer />
        <GizmoLayer />
      </Application>
    </div>
  )
}

// Access PixiJS app from child components
const ViewportLayer = () => {
  const { app } = useApplication()
  // app.stage, app.renderer, app.ticker available here
  return <pixiContainer />
}
```

**Critical note:** `useApplication()` does NOT work in the same component that renders `<Application>`. It only works in child components. Access the PixiJS app from a child wrapper.

### Pattern 3: PixiJS v8 Interactive Bone / Gizmo Hit Testing

**What:** Set `eventMode = 'static'` on interactive Graphics; attach `FederatedPointerEvent` listeners; use `globalpointermove` during drag to track pointer even when off the object.
**When to use:** All bone selection, gizmo handle dragging, viewport click-to-place.

```typescript
// Source: pixijs.com/8.x/guides/components/events
import { Graphics, FederatedPointerEvent, Point } from 'pixi.js'

// Bone hit area — set eventMode and optional hitArea for custom bounds
const boneGraphics = new Graphics()
boneGraphics.eventMode = 'static'
boneGraphics.cursor = 'pointer'
// Optional: override bounds-based hit testing with explicit polygon
boneGraphics.hitArea = new Polygon([/* diamond points */])

boneGraphics.on('pointerdown', (e: FederatedPointerEvent) => {
  selectBone(boneId)
})
boneGraphics.on('pointerover', () => setHovered(boneId))
boneGraphics.on('pointerout', () => clearHovered())

// CRITICAL v8 change: use 'globalpointermove' during drag, NOT 'pointermove'
// 'pointermove' fires only when pointer is over the object — useless for drag
app.stage.on('globalpointermove', (e: FederatedPointerEvent) => {
  if (isDragging) applyGizmoDelta(e)
})
app.stage.eventMode = 'static' // stage must also be interactive
```

**v7 to v8 breaking change:** `InteractionManager` is removed entirely. Do NOT look for `app.renderer.plugins.interaction`. The event system is now built into the renderer automatically. Use `app.renderer.events` to access `EventSystem`.

### Pattern 4: Viewport-to-World Coordinate Conversion

**What:** Convert screen pointer coordinates to the viewport's local coordinate space for correct bone placement and gizmo delta calculation.
**When to use:** Every time a pointer event position is used to place or move a bone.

```typescript
// Source: pixijs.download/dev/docs/scene.ToLocalGlobalMixin.html
import { Container, Point } from 'pixi.js'

// viewportContainer is the pan/zoom container — its transform represents camera
const viewportContainer = new Container()

// Convert FederatedPointerEvent screen position → viewport local coordinates
function screenToWorld(
  screenX: number,
  screenY: number,
  viewportContainer: Container
): Point {
  return viewportContainer.toLocal(new Point(screenX, screenY))
}

// Convert local bone position → world (for gizmo handle placement)
function boneToScreen(boneLocalX: number, boneLocalY: number, boneContainer: Container): Point {
  return boneContainer.toGlobal(new Point(boneLocalX, boneLocalY))
}

// FederatedPointerEvent provides global (screen) coordinates
boneGraphics.on('pointerdown', (e: FederatedPointerEvent) => {
  const worldPos = screenToWorld(e.global.x, e.global.y, viewportContainer)
})
```

### Pattern 5: Tailwind CSS v4 with Vite — CSS-first Configuration

**What:** v4 drops `tailwind.config.js`. Use `@tailwindcss/vite` plugin + single `@import "tailwindcss"` in CSS. Dark theme defined with `@theme` directive and CSS custom properties.
**When to use:** Project setup only.

```typescript
// vite.config.ts — Source: tailwindcss.com/docs/installation/using-vite
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

```css
/* src/index.css — that's the entire config for basic setup */
@import "tailwindcss";

/* Custom design tokens for editor dark theme */
@theme {
  --color-bone-selected: #f59e0b;
  --color-bone-hover: #fcd34d;
  --color-viewport-bg: #1a1a2e;
  --color-mode-pose: #3b82f6;
  --color-mode-animate: #f97316;
}
```

### Pattern 6: IndexedDB Project Auto-Save with ArrayBuffer Images

**What:** Open a versioned IndexedDB database; save the full project document (minus React/Zustand metadata) plus image ArrayBuffers; restore on app load.
**When to use:** Debounced 500ms after every document mutation.

```typescript
// Source: developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
const DB_NAME = 'boneforge2d'
const DB_VERSION = 1
const STORE_PROJECT = 'project'
const STORE_IMAGES = 'images'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_PROJECT)) {
        db.createObjectStore(STORE_PROJECT) // keyPath-less, use explicit key
      }
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: 'id' })
      }
    }
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error)
  })
}

async function saveProject(db: IDBDatabase, skeleton: Skeleton): Promise<void> {
  const tx = db.transaction([STORE_PROJECT], 'readwrite')
  tx.objectStore(STORE_PROJECT).put(skeleton, 'current')
  return new Promise((resolve) => tx.oncomplete = () => resolve())
}

async function saveImageBuffer(db: IDBDatabase, id: string, buffer: ArrayBuffer): Promise<void> {
  const tx = db.transaction([STORE_IMAGES], 'readwrite')
  tx.objectStore(STORE_IMAGES).put({ id, buffer })
  return new Promise((resolve) => tx.oncomplete = () => resolve())
}
```

**Critical:** Store images as `ArrayBuffer` NOT `dataUrl`. `dataUrl` is a base64 string — ~33% larger than the binary, and IndexedDB has no practical size limit for binary data but strings inflate memory unnecessarily.

### Anti-Patterns to Avoid

- **World-space transforms stored on Bone:** World transforms must be computed on demand via `evaluateWorldTransform`. Storing them permanently corrupts reparenting and makes rotation inheritance impossible.
- **Single Graphics object for all bones:** Each bone needs its own `Graphics` instance so hit testing, eventMode, and visibility work per-bone. Do NOT draw all bones into one shared Graphics and attempt manual hit testing.
- **Using `pointermove` for gizmo drag:** PixiJS v8 fires `pointermove` only when pointer is over the object. The gizmo handle is small — the pointer leaves it immediately on drag start. Use `globalpointermove` on `app.stage`.
- **Calling `useApplication()` in the same component as `<Application>`:** The hook only resolves inside children of `<Application>`. The parent component cannot access `app`.
- **Starting Immer patches without `enablePatches()`:** Immer silently returns empty arrays for patches if `enablePatches()` was not called. No error is thrown.
- **Storing images as `dataUrl` in IndexedDB:** Use ArrayBuffer. DataUrls are strings that balloon memory and IndexedDB payload size.
- **Using `onRender` override pattern from PixiJS v7 tutorials:** `updateTransform()` no longer runs every frame in v8. Use `useTick` (in @pixi/react) or `app.ticker.add()` for per-frame logic.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Undo/redo diffing | Custom JSON diff | Immer `produceWithPatches` + `applyPatches` | Immer produces structurally correct JSON Patch-format diffs with zero extra logic; handles nested objects, arrays, and deletions correctly |
| Coordinate transforms | Custom matrix math | PixiJS `container.toLocal()` / `container.toGlobal()` | PixiJS already maintains the full world transform matrix on every Container; delegating to it avoids accumulated floating-point error and sync bugs |
| Bone hit testing polygon | Custom ray-polygon test | PixiJS `hitArea` on Graphics + built-in event system | PixiJS EventSystem walks the scene graph and resolves hits using the display tree — implement `hitArea` as a Polygon for the bone shape and get correct bubbling for free |
| Debounced auto-save | setTimeout/clearTimeout | Standard `debounce` utility or `useDeferredValue` pattern | Simple to implement but easy to get wrong with React strict mode double-invocation; use a well-tested debounce from `lodash-es` or write a simple closure |
| IndexedDB Promise wrappers | Custom IDB service | Raw IndexedDB API (or idb library) | IndexedDB raw API is verbose but straightforward; `idb` (1KB) wraps it in Promises if preferred — do NOT build a full service layer |

**Key insight:** PixiJS's scene graph IS the spatial data structure. Delegating coordinate math and hit testing to it costs nothing and eliminates an entire class of viewport bugs.

---

## Common Pitfalls

### Pitfall 1: World-Space Bone Storage

**What goes wrong:** Bone `x, y, rotation` values are stored as absolute world coordinates. Rotating a parent bone does not rotate child bones correctly. Reparenting corrupts all existing transforms.
**Why it happens:** It feels simpler — screen position IS the value you just clicked. The mental model of "where the bone is on screen" maps directly to world space.
**How to avoid:** `bone.localTransform` ONLY. `evaluateWorldTransform(bone, skeleton)` is always a computed value, never stored. Write this function and its unit tests before writing any gizmo code.
**Warning signs:** Gizmo works for root bones but child bones teleport or rotate incorrectly when parent moves.

### Pitfall 2: `pointermove` Instead of `globalpointermove` for Drag

**What goes wrong:** Gizmo drag starts fine but the handle "sticks" or stops responding after the pointer moves 2px off the handle center.
**Why it happens:** PixiJS v8 changed `pointermove` to fire only when the pointer is over a registered interactive display object. The gizmo handle is small; the pointer immediately exits its bounds.
**How to avoid:** Attach drag handling to `app.stage.on('globalpointermove', ...)` on pointer down, remove on pointer up. `globalpointermove` fires on every pointer move regardless of hit target.
**Warning signs:** Drag works perfectly when moving slowly, fails when moving quickly.

### Pitfall 3: `enablePatches()` Not Called Before Store Init

**What goes wrong:** Undo does nothing — `undoStack` fills with empty arrays.
**Why it happens:** Immer patches are opt-in since Immer v6. Calling `produceWithPatches` without `enablePatches()` returns `[nextState, [], []]` — no error, no warning.
**How to avoid:** Call `enablePatches()` at the very top of `main.tsx`, before any Zustand store is created or any Immer produce call is made.
**Warning signs:** Undo button appears to function (no errors) but state does not revert.

### Pitfall 4: Bind Pose / Animated Pose Conflation

**What goes wrong:** Editing bone position in Pose Mode after animations exist shifts all keyframe-driven motion because keyframes are offsets from bindTransform, not absolute values.
**Why it happens:** Both `localTransform` and `bindTransform` look identical before any animation exists. The distinction is invisible until Phase 2.
**How to avoid:** Implement `bone.bindTransform` as a separate field from day one. Pose Mode mutations write to `bindTransform`. Animate Mode mutations create keyframes (Phase 2). The data model distinction must be in place even though Phase 1 has no keyframes yet.
**Warning signs:** This pitfall does not manifest until Phase 2 — which is why it must be addressed now.

### Pitfall 5: Vite Top-Level Await with PixiJS

**What goes wrong:** Production build fails or runtime errors on `await app.init()` at module top level.
**Why it happens:** PixiJS v8 requires async initialization (`await app.init(options)`). Top-level await works in Vite dev mode but can fail in production builds in Vite <=6.0.6.
**How to avoid:** Wrap all PixiJS initialization in an `async` function, not at module top level. With @pixi/react's `<Application>`, the init is handled internally — this pitfall mainly affects imperative PixiJS usage outside React.
**Warning signs:** Works in `npm run dev`, breaks in `npm run build` preview.

### Pitfall 6: Missing `extend()` Call for PixiJS Components

**What goes wrong:** Runtime error: "Component not found: pixiGraphics" or similar when using JSX PixiJS components.
**Why it happens:** @pixi/react v8 uses an opt-in `extend()` registry to keep bundle sizes small. Unlike v7, components are NOT available by default.
**How to avoid:** Call `extend({ Container, Graphics, Sprite, Text })` (or `useExtend()` hook) before any JSX that uses those components.
**Warning signs:** Error thrown at runtime, not at compile time. TypeScript types work fine but the component is not registered.

### Pitfall 7: Zustand v5 `setState` Replace Flag Type Strictness

**What goes wrong:** TypeScript error when using `setState({}, true)` to clear state.
**Why it happens:** Zustand v5 requires the complete state shape when `replace: true`. Passing an empty object is now a type error.
**How to avoid:** Always provide the full state object when using replace, or use `replace: false` (default) and set fields individually.
**Warning signs:** TypeScript compilation errors on existing Zustand v4 code migrated to v5.

---

## Code Examples

### Spine-Style Bone Shape Drawing

```typescript
// Source: pixijs.download/dev/docs/scene.Graphics.html + design decision
import { Graphics } from 'pixi.js'

function drawBone(
  g: Graphics,
  length: number,
  width: number,
  color: number,
  selected: boolean
): void {
  g.clear()
  const hw = width / 2    // half-width at widest point (1/4 along length)
  const dw = width * 0.15 // diamond half-width at head

  // Spine-style fish bone: diamond at head (0,0), tapers to tip at (length, 0)
  g.setFillStyle({ color: selected ? 0xf59e0b : color, alpha: 0.85 })
  g.setStrokeStyle({ width: 1, color: selected ? 0xfbbf24 : 0x888888 })

  g.moveTo(0, 0)            // bone head origin (diamond top)
  g.lineTo(dw, -dw)         // diamond right
  g.lineTo(length * 0.25, -hw) // widest point
  g.lineTo(length, 0)       // tip
  g.lineTo(length * 0.25, hw)  // widest point (bottom)
  g.lineTo(dw, dw)          // diamond left
  g.closePath()
  g.fill()
  g.stroke()

  // Origin dot at bone head
  g.setFillStyle({ color: 0xffffff, alpha: 1 })
  g.circle(0, 0, dw * 1.5)
  g.fill()
}
```

### World Transform Evaluation

```typescript
// Source: Architecture decision — local-space storage pattern
import type { Bone, Skeleton } from './types'

interface WorldTransform {
  x: number; y: number; rotation: number; scaleX: number; scaleY: number
}

function evaluateWorldTransform(boneId: string, skeleton: Skeleton): WorldTransform {
  const bone = skeleton.bones[boneId]
  if (!bone.parentId) {
    // Root bone — local IS world
    return { ...bone.localTransform }
  }
  const parentWorld = evaluateWorldTransform(bone.parentId, skeleton)

  // Forward kinematics: apply local transform on top of parent world transform
  const cos = Math.cos(parentWorld.rotation)
  const sin = Math.sin(parentWorld.rotation)
  const lx = bone.localTransform.x * parentWorld.scaleX
  const ly = bone.localTransform.y * parentWorld.scaleY

  return {
    x: parentWorld.x + cos * lx - sin * ly,
    y: parentWorld.y + sin * lx + cos * ly,
    rotation: parentWorld.rotation + bone.localTransform.rotation,
    scaleX: parentWorld.scaleX * bone.localTransform.scaleX,
    scaleY: parentWorld.scaleY * bone.localTransform.scaleY,
  }
}
```

### Zustand Store Skeleton Slice with Immer

```typescript
// Source: zustand docs + pmndrs/zustand issue #464 pattern
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enablePatches, produceWithPatches, applyPatches, Patch } from 'immer'

enablePatches() // Must be called at module load, before create()

interface EditorState {
  skeleton: Skeleton
  imageAssets: Record<string, ImageAsset>
  attachments: Record<string, Attachment>
  // Undo/redo (document mutations only — NOT viewport/selection)
  undoStack: Array<{ inverse: Patch[]; forward: Patch[] }>
  redoStack: Array<{ inverse: Patch[]; forward: Patch[] }>
  // View state (NOT in undo stack)
  selectedBoneId: string | null
  editorMode: 'pose' | 'animate'
  viewport: { x: number; y: number; scale: number }
}

// Helper: wrap a document mutation to capture patches
function mutateDoc<T extends object>(
  current: T,
  recipe: (draft: T) => void,
  store: EditorState
): T {
  const [next, patches, inversePatches] = produceWithPatches(current, recipe)
  store.undoStack.push({ inverse: inversePatches, forward: patches })
  store.redoStack = [] // new mutation clears redo
  if (store.undoStack.length > 100) store.undoStack.shift()
  return next
}

const useEditorStore = create<EditorState>()(
  immer((set) => ({
    // ... initial state ...
    createBone: (parentId: string | null) => set((state) => {
      state.skeleton = mutateDoc(state.skeleton, (draft) => {
        const id = crypto.randomUUID()
        draft.bones[id] = {
          id, name: `Bone_${Object.keys(draft.bones).length}`,
          parentId, childIds: [],
          localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
          bindTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
          visible: true,
        }
        if (parentId) draft.bones[parentId].childIds.push(id)
      }, state)
    }),
    undo: () => set((state) => {
      const entry = state.undoStack.pop()
      if (!entry) return
      state.skeleton = applyPatches(state.skeleton, entry.inverse)
      state.redoStack.push(entry)
    }),
    redo: () => set((state) => {
      const entry = state.redoStack.pop()
      if (!entry) return
      state.skeleton = applyPatches(state.skeleton, entry.forward)
      state.undoStack.push(entry)
    }),
  }))
)
```

### PixiJS v8 Gizmo Drag Pattern

```typescript
// Source: pixijs.com/8.x/guides/components/events
import { Graphics, FederatedPointerEvent, Application } from 'pixi.js'

function setupMoveGizmo(
  app: Application,
  gizmoContainer: Graphics,
  onDelta: (dx: number, dy: number) => void
): void {
  let dragging = false
  let lastPos = { x: 0, y: 0 }

  gizmoContainer.eventMode = 'static'
  gizmoContainer.cursor = 'grab'

  gizmoContainer.on('pointerdown', (e: FederatedPointerEvent) => {
    dragging = true
    lastPos = { x: e.global.x, y: e.global.y }
    e.stopPropagation()
  })

  // MUST use globalpointermove — regular pointermove stops when pointer exits object
  app.stage.on('globalpointermove', (e: FederatedPointerEvent) => {
    if (!dragging) return
    const dx = e.global.x - lastPos.x
    const dy = e.global.y - lastPos.y
    onDelta(dx, dy)
    lastPos = { x: e.global.x, y: e.global.y }
  })

  app.stage.on('pointerup', () => { dragging = false })
  app.stage.on('pointerupoutside', () => { dragging = false })
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PixiJS v7 `InteractionManager` | v8 `EventSystem` with `FederatedPointerEvent` | PixiJS v8 (2024) | `app.renderer.plugins.interaction` is gone; use `app.renderer.events`; event modes replace `interactive: true` |
| Tailwind v3 `tailwind.config.js` + PostCSS | v4 `@tailwindcss/vite` plugin + `@import "tailwindcss"` in CSS | Tailwind v4 (early 2025) | No config file required; `@theme` directive for custom tokens in CSS; `darkMode: 'class'` config gone |
| @pixi/react v7 wrapper components | v8 JSX pragma + `extend()` registry | @pixi/react v8 (2025) | Complete rewrite; React 19 only; `<Stage>` replaced by `<Application>`; all components need `extend()` |
| Zustand v4 default exports | v5 named exports only | Zustand v5 (2024) | `import create from 'zustand'` → `import { create } from 'zustand'` |
| PixiJS v8 `updateTransform()` override | `useTick()` / `app.ticker.add()` | PixiJS v8 (2024) | `updateTransform` no longer runs every frame; per-frame logic must use ticker |

**Deprecated/outdated:**
- `app.renderer.plugins.interaction`: Removed in v8. Use `app.renderer.events` for `EventSystem`.
- `displayObject.interactive = true`: Replaced by `displayObject.eventMode = 'static'` (or other mode). `interactive` still works as an alias in some builds but is deprecated.
- `tailwind.config.js` with `darkMode: 'class'`: Gone in v4. Use `@media (prefers-color-scheme: dark)` or `@variant dark` in CSS.
- `@pixi/react` `<Stage>` component: Replaced by `<Application>` in v8.

---

## Open Questions

1. **@pixi/react vs. Imperative PixiJS for the viewport layer**
   - What we know: @pixi/react v8 works well for the React/PixiJS boundary. The `<Application resizeTo={ref}>` handles sizing. `useApplication()` gives imperative access inside children.
   - What's unclear: Whether bone rendering (hundreds of Graphics redraws per frame) should live inside @pixi/react JSX or in a single imperative PixiJS Container updated outside React's reconciler.
   - Recommendation: Use @pixi/react for the shell (Application, camera container); use imperative PixiJS Graphics inside a single `useTick`-driven renderer for bones. Mixing JSX Graphics with high-frequency redraws triggers React reconciliation overhead on every frame.

2. **Immer `mutateDoc` wrapper placement in Zustand**
   - What we know: The pattern of calling `produceWithPatches` inside the Zustand `set` callback works (verified via GitHub issue #464).
   - What's unclear: Whether the Zustand `immer` middleware and explicit `produceWithPatches` conflict — the `immer` middleware internally wraps `set` with `produce`, not `produceWithPatches`.
   - Recommendation: Do NOT use the Zustand `immer` middleware for document mutations. Use raw `set` and call `produceWithPatches` explicitly for document state. Use the `immer` middleware ONLY for view state mutations (selection, viewport) where patches are not needed. This avoids double-wrapping.

3. **IndexedDB Schema for Phase 2 forward compatibility**
   - What we know: Phase 2 adds `animations: Animation[]` to the schema. Phase 1 must reserve space for it.
   - What's unclear: Whether to include `animations: []` in the stored document from Phase 1 or add it in a DB version upgrade in Phase 2.
   - Recommendation: Include `animations: []` as an empty array in the Phase 1 stored document. Increment `DB_VERSION` to 2 in Phase 2 if schema migration is needed. Do not pre-empt DB versioning — add `onupgradeneeded` logic only when the schema actually changes.

---

## Sources

### Primary (HIGH confidence)
- Live npm registry (2026-02-28) — pixi.js@8.16.0, @pixi/react@8.0.5, zustand@5.0.11, immer@11.1.4, tailwindcss@4.2.1, vite@7.3.1 confirmed
- https://pixijs.com/8.x/guides/components/events — PixiJS v8 event system, FederatedPointerEvent, eventMode values, globalpointermove
- https://pixijs.download/dev/docs/events.EventSystem.html — EventSystem API, features property, rootBoundary
- https://pixijs.download/dev/docs/scene.ToLocalGlobalMixin.html — toLocal / toGlobal method signatures and examples
- https://pixijs.download/dev/docs/scene.Graphics.html — Graphics API: moveTo, lineTo, arc, fill, stroke, clear, setFillStyle, setStrokeStyle
- https://immerjs.github.io/immer/patches/ — enablePatches(), produceWithPatches, applyPatches, patch format
- https://tailwindcss.com/docs/installation/using-vite — Tailwind v4 Vite plugin installation, @import directive
- https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API — IndexedDB open, objectStore, put/get, ArrayBuffer storage
- https://react.pixijs.io/components/application/ — Application component API, resizeTo prop, useApplication hook
- https://github.com/pixijs/pixi-react — extend() API, JSX pragma, useExtend, useTick, useApplication

### Secondary (MEDIUM confidence)
- https://pixijs.com/blog/pixi-react-v8-live — v8 rewrite rationale, JSX pragma, complete rewrite for React 19
- https://pmnd.rs/blog/announcing-zustand-v5 — Zustand v5 release notes, breaking changes from v4
- https://github.com/pmndrs/zustand/releases/tag/v5.0.0 — v5 breaking changes: default exports removed, setState strict types
- https://github.com/pmndrs/zustand/issues/464 — Zustand + Immer + patches implementation pattern; `produceWithPatches` wrapper approach
- https://pixijs.com/8.x/guides/components/scene-objects — Container transform properties, pivot, interactive setup

### Tertiary (LOW confidence — validate before committing)
- https://github.com/charkour/zundo — zundo library as alternative undo/redo middleware (not used; referenced for comparison)
- Community pattern: `useTick`-driven imperative bone rendering preferred over per-frame JSX re-render (inferred from @pixi/react GitHub issues; verify before implementation)

---

## Metadata

**Confidence breakdown:**
- Standard stack versions: HIGH — confirmed against live npm registry 2026-02-28
- PixiJS v8 EventSystem / FederatedPointerEvent: HIGH — verified against official PixiJS v8 docs
- @pixi/react v8 mounting pattern: HIGH — verified against official react.pixijs.io docs and GitHub
- Immer patch undo/redo: HIGH — verified against immerjs.github.io/immer/patches and community implementation
- Tailwind CSS v4 installation: HIGH — verified against tailwindcss.com/docs/installation/using-vite
- IndexedDB patterns: HIGH — verified against MDN
- Zustand v5 breaking changes: HIGH — verified against release notes and migration guide
- Architecture patterns (evaluateWorldTransform, gizmo structure): MEDIUM — design decisions grounded in prior SUMMARY.md research and PixiJS scene graph docs; specific implementation details need validation in code

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 for stable libraries (30 days); 2026-03-07 for @pixi/react (fast-moving, 7 days)
