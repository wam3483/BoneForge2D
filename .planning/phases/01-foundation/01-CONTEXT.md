# Phase 1: Foundation - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the entire editor core: TypeScript data model, Zustand store with undo/redo, PixiJS viewport with bone manipulation gizmos, bone hierarchy, image import and attachment, Pose Mode / Animate Mode split, and IndexedDB auto-save. This phase has no UI panels (those are Phase 4) but must ship a functional editor shell that lets a user rig a character and trust their work survives a page refresh.

</domain>

<decisions>
## Implementation Decisions

### Viewport Renderer
- Use PixiJS v8 for the editor viewport (not Canvas 2D)
- Rationale: The editor viewport preview IS the runtime — using PixiJS for both means the interpolation and transform math is identical, with no preview-vs-export discrepancy. The editor imports its own runtime package directly.
- The PixiJS application is mounted inside a React ref; lifecycle managed with useEffect mount/unmount + ResizeObserver for canvas sizing

### Bone Visual Style
- Spine-style "fish-bone" shape: diamond at the bone head (origin), tapered body toward the tip
- Bone length is determined by child bone position (or a default length for leaf bones)
- Selected bones: highlighted color (e.g. bright yellow/orange)
- Hovered bones: lighter highlight
- Bone names rendered as small labels near the bone head
- Bones render as PixiJS Graphics objects, redrawn on each state change

### Bone Creation Workflow
- **Root bone**: Toolbar "Add Bone" button OR keyboard shortcut (B) — places bone at viewport center
- **Child bone**: With a bone selected, click in the viewport to place a child at that position — the selected bone becomes the parent automatically
- **Connection**: Parent-child relationship is set at creation time; reparenting is done via the hierarchy panel (Phase 4) or drag in the hierarchy tree
- Newly created bones are immediately selected and enter "move" mode so user can drag to position

### Bone Transform Gizmos
- Three separate tool modes: Select/Move (G), Rotate (R), Scale (S) — keyboard shortcut switching, Blender conventions
- Active tool shown in toolbar with visual indicator
- Move gizmo: X/Y axis arrows + free-move center square
- Rotate gizmo: circular arc handle around bone origin
- Scale gizmo: axis handles with square endpoints
- Click on bone in viewport to select it regardless of active tool

### Editor Shell Layout (Phase 1 minimal chrome)
- Full-viewport canvas taking ~80% of the screen
- Top toolbar: app logo/name | tool buttons (Select, Move, Rotate, Scale) | mode toggle (Pose / Animate) | undo/redo buttons | import image button
- Right sidebar (narrow, ~240px): image asset list — thumbnails of imported images, click to attach to selected bone
- No hierarchy panel, no properties panel, no animation panel in Phase 1 (all Phase 4)
- Status bar at bottom: selected bone name, current mode, zoom level

### Data Model Architecture (critical — locks downstream phases)
- All bone transforms stored in **local space** (relative to parent) — NEVER world space
- `bone.localTransform: { x, y, rotation, scaleX, scaleY }` — the only stored transform
- `bone.bindTransform: { x, y, rotation, scaleX, scaleY }` — immutable after first animation is created
- World transforms are always ephemeral computed values: `evaluateWorldTransform(bone, skeleton) → WorldTransform`
- Bone IDs are UUIDs internally; display names are separate mutable strings
- Coordinate system: Y-down, positive rotation = clockwise, matching PixiJS v8 conventions

### Undo / Redo
- Immer-patch-based undo/redo integrated into Zustand store from the first mutation
- Every store mutation produces an Immer patch + inverse patch pair
- Undo stack: array of inverse patches (max 100 entries)
- Redo stack: cleared on new mutation, repopulated on undo
- Undoable: all bone operations (create, delete, rename, reparent, transform), image import, image attach/detach, pivot/offset changes, draw order changes, mode toggle
- NOT undoable: viewport pan/zoom, selection changes (these are view state, not document state)

### Image Attachment Workflow
- Images imported via `<input type="file" accept="image/png,image/jpeg">` triggered by toolbar button
- Imported images stored in Zustand store as `{ id, name, dataUrl, width, height }`
- Also persisted to IndexedDB as ArrayBuffer for session recovery
- Attaching: select a bone, then click an image in the right sidebar → image attached to bone
- Alternatively: drag image from sidebar onto a bone in the viewport
- Attachment stores: `{ imageId, boneId, offsetX, offsetY, pivotX, pivotY, zOrder }`
- Pivot is normalized (0–1 range, default 0.5, 0.5 = center)

### Pose Mode / Animate Mode
- Single toggle button in toolbar (keyboard: Tab)
- **Pose Mode**: gizmo operations modify `bone.bindTransform` directly — this is the rest pose
- **Animate Mode**: gizmo operations create keyframes at `currentTime` (Phase 2 concern, but the mode must be enforced from Phase 1 so the distinction is never ambiguous)
- Visual indicator: mode shown clearly in toolbar + status bar; viewport border color changes (e.g. blue border = Pose Mode, orange border = Animate Mode)
- In Phase 1 (before animation system), Animate Mode shows "No active animation — create one in Phase 2" guidance

### Session Persistence (IndexedDB)
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

</decisions>

<specifics>
## Specific Ideas

- Bone visual style should follow Spine's fish-bone convention — this is what the target audience (indie devs familiar with skeletal animation) already knows
- Keyboard shortcuts follow Blender conventions (G=grab/move, R=rotate, S=scale, B=add bone) — familiar to the game dev audience
- Viewport border color change between Pose/Animate modes is a strong visual signal to prevent the most common user mistake (editing bind pose when they meant to keyframe)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- Stack is locked: React 19 + TypeScript 5 + Vite 6 + PixiJS v8 + Zustand v5 + Immer v10 + Radix UI Primitives + Tailwind CSS v4
- Verify npm versions before scaffolding: `npm view pixi.js version`, `npm view zustand version`, `npm view tailwindcss version`

### Integration Points
- Phase 2 (Animation) will add keyframe logic to the Zustand store — the store schema must reserve space for `animations: Animation[]` even if Phase 1 doesn't populate it
- Phase 3 (Export) will consume the store's document state — exporter needs a stable schema from Phase 1
- Phase 4 (Panels) will read the same Zustand store — hierarchy panel reads `skeleton.bones`, properties panel reads `selectedBoneId`

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope (user proceeded with defaults, no scope additions)

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-28*
