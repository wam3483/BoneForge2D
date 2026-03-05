# BoneForge2D — Claude Code Instructions

## What This Project Is

BoneForge2D is a browser-based 2D skeletal animation editor. Users build bone hierarchies, attach images to bones, create keyframe animations, preview them in real time, and export a custom `.bfanim` JSON file for playback via a bundled PixiJS runtime. It is a free alternative for indie devs and hobbyists building games.

## Tech Stack

- **React 19** + **TypeScript 5** — UI shell, panels, all React components
- **PixiJS 8** + **@pixi/react 8** — editor viewport renderer (imperative scene graph, not React-driven)
- **Zustand 5** + **Immer 11** — single global store, immutable updates via patches
- **Tailwind CSS 4** — utility-class styling, dark-theme-first
- **Radix UI** — accessible unstyled primitives (dialogs, etc.)
- **Vite 6** — dev server and build tool
- **Vitest 3** — unit tests for pure logic only

## Commands

```bash
npm run dev          # start dev server
npm run build        # tsc + vite build
npm run test         # vitest (unit tests)
npm run test:ui      # vitest with UI
npm run lint         # eslint
```

## Project Structure

```
src/
  model/
    types.ts          # ALL type definitions (Bone, Skeleton, EditorState, etc.)
    transforms.ts     # Pure math utilities (world transform computation)
    transforms.test.ts
  store/
    index.ts          # Zustand store — all state + actions
    undoRedo.ts       # Immer patch-based undo/redo helpers
  viewport/
    PixiViewport.tsx  # React component wrapping the PixiJS canvas
    BoneRenderer.ts   # Imperative PixiJS rendering of bones
    BoneCreation.ts   # Drag-to-create bone interaction
    GizmoLayer.ts     # Transform gizmos (select/rotate/scale handles)
    ViewportCamera.ts # Pan, zoom, and coordinate transforms
    AttachmentRenderer.ts
    AttachmentsRef.ts
  components/
    App.tsx           # Root layout
    Sidebar.tsx       # Left panel (hierarchy + images + attachments)
    BoneHierarchy.tsx # Bone tree panel
    BonePropertiesPanel.tsx
    Toolbar.tsx
    StatusBar.tsx
    ProjectManager.tsx
    GridSettingsModal.tsx
  persistence/
    indexeddb.ts      # All IndexedDB reads/writes
    autoSave.ts       # Auto-save logic
    index.ts
  hooks/
    useGridSettings.ts
```

## Architecture Rules — Follow These

### State lives in the Zustand store
All project data (skeleton, imageAssets, attachments, animations) lives in `src/store/index.ts`. Components are read-only consumers. Never store bone or animation data in component `useState`.

### Undo/redo via Immer patches
All document mutations go through `withUndo()` from `src/store/undoRedo.ts`. This produces Immer forward/inverse patches pushed onto `undoStack` / `redoStack`. View state (selectedBoneId, viewport pan/zoom, editorMode, activeTool) is NOT on the undo stack — mutate it directly via `set()`.

### Transforms: local only in the store
`Bone.localTransform` is the only stored transform — position/rotation/scale relative to parent. World transforms are **always computed fresh** (never stored). Use `src/model/transforms.ts` utilities.

### `bindTransform` vs `localTransform`
- `localTransform` — current pose (mutable during animation)
- `bindTransform` — rest/bind pose (updated when in `pose` editorMode, frozen once animations exist)
In pose mode, mutations update both. In animate mode, only `localTransform` changes.

### Viewport is imperative PixiJS, not React-rendered
Keep the main PixiJS scene graph in imperative TypeScript (`BoneRenderer.ts`, `GizmoLayer.ts`, etc.). `@pixi/react` is used sparingly for UI-adjacent elements only. Do **not** drive the PixiJS animation loop through React renders.

### Coordinate systems
All mouse/pointer events from the canvas are in screen space. Always transform them to world space before applying to bone data:
```ts
// ViewportCamera.ts has screenToWorld() / worldToScreen()
const worldPos = camera.screenToWorld(e.globalX, e.globalY)
```

### Drag interactions use silent + commit pattern
Live drag: call `setBoneTransformSilent()` (no undo entry). On drag end: call `commitTransformDrag(boneId, preDragSkeleton)` which produces one undo entry for the full drag. Snapshot `get().skeleton` before any drag begins.

### Topological order for bone traversal
Always process bones root-to-leaf. Children depend on parent world transforms. Use the topological sort utility in `transforms.ts`.

## Key Type Conventions

- Rotation is in **radians** (PixiJS convention), **not degrees**. The UI converts for display only.
- `Bone.id` is always `crypto.randomUUID()` — stable, never reused.
- `Skeleton.rootBoneIds` — ordered array of top-level bone IDs (parentId === null).
- `Skeleton.bones` — flat `Record<string, Bone>` keyed by ID.
- Image pixel data (ArrayBuffer) is stored in **IndexedDB only**, not in Zustand. `ImageAsset.dataUrl` (base64) is in the store for display thumbnails.

## What NOT to Do

- Do not store computed world transforms on `Bone` objects in the store.
- Do not evaluate animation interpolation inside React components or the Timeline panel — that belongs in a pure `evaluatePose()` function.
- Do not use raw canvas/screen coordinates as bone positions without running them through `ViewportCamera`.
- Do not design the JSON export to match any popular existing software's format — BoneForge uses its own schema.
- Do not embed editor-only state (`selectedBoneId`, viewport pan/zoom) in the export JSON.
- Do not add `console.log` debug statements without removing them before committing (or mark with `// TODO: remove`).

## Testing

Tests live next to the files they test (`transforms.test.ts`). Vitest runs in `node` environment. Only test pure logic — transforms, interpolation, serialization. Do not try to test PixiJS rendering or DOM interactions.

```bash
npm run test
```

## Export Format

The exported file is a custom `.bfanim` JSON. Key constraints:
- Bones serialized in topological order (root before children)
- No editor metadata (no selectedBoneId, viewport state, etc.)
- Images embedded as base64 by default
- `"version": "1.0"` field required for migration compatibility

## Persistence

Projects are stored in **IndexedDB** via `src/persistence/indexeddb.ts`. Image ArrayBuffers are stored separately from the main project document. Auto-save is handled by `src/persistence/autoSave.ts`.
