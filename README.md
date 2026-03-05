# BoneForge2D

A browser-based 2D skeletal animation editor. Build bone hierarchies, attach images to bones, create keyframe animations, preview in real time, and export a custom `.bfanim` JSON file for playback via a bundled PixiJS runtime.

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

## Architecture

### Project Structure

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

### State Management (Zustand + Immer)

All project data lives in a single Zustand store (`src/store/index.ts`):

```typescript
// Document state (all mutations go through undo/redo)
skeleton: Skeleton
imageAssets: Record<string, ImageAsset>
attachments: Record<string, Attachment>
undoStack: Array<{ inverse: Patch[]; forward: Patch[] }>
redoStack: Array<{ inverse: Patch[]; forward: Patch[] }>

// View state (NOT in undo stack)
selectedBoneId: string | null
selectedBoneIds: string[]
hoveredBoneId: string | null
editorMode: 'pose' | 'animate'
activeTool: 'select' | 'rotate' | 'scale'
snapEnabled: boolean
snapGridSize: number
gridVisible: boolean
viewport: { x: number; y: number; scale: number }
currentProjectId: string | null
clipboard: BoneClipboard
animations: unknown[]  // Future: animation data
```

**Undo/Redo**: All document mutations go through `withUndo()` which produces Immer forward/inverse patches. View state is mutated directly via `set()` without tracking.

### Bone Transform System

**Core Principle**: Only `localTransform` is stored. World transforms are computed fresh every frame.

```typescript
// Stored on each bone
interface BoneTransform {
  x: number
  y: number
  rotation: number  // radians, positive = clockwise (PixiJS convention)
  scaleX: number
  scaleY: number
}

// Separated fields on each bone
interface Bone {
  localTransform: BoneTransform  // Current pose (mutable during animation)
  bindTransform: BoneTransform   // Rest/bind pose (frozen once animations exist)
  // ... other fields
}
```

**World Transform Computation** (`src/model/transforms.ts`):
- Bones are processed in **topological order** (root-to-leaf)
- Each bone's world transform = parent world transform × local transform
- Handles rotation, scale, position hierarchically

### Editor Modes

**pose mode**: Editing the rest/bind pose
- Mutations update both `localTransform` and `bindTransform`
- Used for setting up the skeleton structure

**animate mode**: Creating keyframe animations
- `bindTransform` is frozen (read-only)
- Only `localTransform` changes for playback
- Future: Add/edit keyframes at current time

### Coordinate Systems

All mouse/pointer events from the canvas are in **screen space**. They must be transformed to **world space** before applying to bone data:

```typescript
// ViewportCamera.ts provides these transforms:
camera.screenToWorld(screenX, screenY) → {x, y}
camera.worldToScreen(worldX, worldY) → {x, y}
```

### Viewport Rendering

**Imperative PixiJS, Not React-Driven**: The main scene graph is managed imperatively in TypeScript (`BoneRenderer.ts`, `GizmoLayer.ts`, etc.). `@pixi/react` is only used for UI-adjacent elements.

**Render Loop** (`useTick` in `PixiViewport.tsx`):
1. Clear all bone graphics
2. For each bone, compute world transform
3. Draw bone shape
4. Update attachment thumbnails
5. Draw gizmos if bone selected
6. Draw overlays (snap highlights, rect selection, etc.)

### Persistence

**IndexedDB** (`src/persistence/indexeddb.ts`):
- Project documents stored in `projects` store
- Image ArrayBuffers stored separately in `images` store
- Auto-save on every document mutation

**Export Format** (`src/persistence/index.ts`):
- Custom `.bfanim` JSON format
- Bones serialized in topological order
- Images embedded as base64 by default
- `"version": "1.0"` for migration compatibility
- No editor metadata (selectedBoneId, viewport state, etc.)

### Drag Interactions

**Silent + Commit Pattern**:
- Live drag: call `setBoneTransformSilent()` (no undo entry)
- Drag end: call `commitTransformDrag()` which produces one undo entry
- Snapshot `get().skeleton` before any drag begins

**Multi-bone Drag**: When dragging a bone with co-selected bones:
- Compute world delta from dragged bone
- Apply same delta to all root-most co-selected bones
- Commit as one undo entry

**Bone-to-Bone Snapping**:
- Drag bone near another bone's start or tip (15px threshold)
- Snap to position and automatically reparent
- Ctrl+drag locks axis (X or Y)

### Attachment System

**Images attached to bones** for sprite rendering:
- Each `Attachment` links an `imageId` to a `boneId`
- Supports offset, pivot, and z-order
- Rendered as thumbnails in viewport
- Indicator emoji (🖼️) shown in hierarchy tree

## Testing

Tests live next to the files they test (`transforms.test.ts`). Vitest runs in Node environment. Only test pure logic — transforms, interpolation, serialization. Do not test PixiJS rendering or DOM interactions.

```bash
npm run test
```

## Export Format

`.bfanim` files contain:
- Skeleton structure (bones, hierarchy, transforms)
- Embedded images (base64)
- Version field for migration
- No editor-only state

Playback via bundled PixiJS runtime (future).

## Roadmap

### Current (Phase 1)
- ✅ Bone creation, selection, hierarchy
- ✅ Transforms (position, rotation, scale)
- ✅ Image attachments
- ✅ Grid system
- ✅ Undo/redo
- ✅ Persistence (IndexedDB + auto-save)

### Next (Phase 2)
- ⏳ Timeline panel
- ⏳ Keyframe system
- ⏳ Pose evaluation (interpolation)
- ⏳ Playback controls
- ⏳ Animation export/import

## License

MIT
