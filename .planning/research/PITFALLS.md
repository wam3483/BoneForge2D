# Domain Pitfalls

**Domain:** Browser-based 2D skeletal animation editor (BoneForge2D)
**Researched:** 2026-02-28
**Confidence:** MEDIUM — based on analysis of comparable open-source editors (DragonBones, Creature2D, open-source Spine alternatives), PixiJS runtime source, and general 2D game tooling post-mortems. WebSearch was unavailable during this session; claims reflect established patterns in skeletal animation tooling.

---

## Critical Pitfalls

Mistakes that force rewrites or break downstream compatibility.

---

### Pitfall 1: Storing Bone Transforms in World Space Instead of Local Space

**What goes wrong:** The editor stores bone transforms (position, rotation, scale) as world-space coordinates rather than local coordinates relative to the parent bone. Everything appears to work while building the editor, but the runtime must reconstruct the full transform chain from scratch on every frame — and the export format cannot represent the skeleton correctly when bones are reparented or when the hierarchy is deep.

**Why it happens:** World space is what you see on screen, so it feels natural to store what you see. Local space requires understanding and implementing the full parent-child transform multiplication chain upfront, which feels like premature complexity.

**Consequences:**
- Runtime playback is incorrect when bones have scaled or rotated parents
- Reparenting a bone mid-animation corrupts all existing keyframes
- Export format embeds world-space values, making the runtime responsible for inverting the chain — a hard problem at load time
- Rotation inheritance becomes impossible to implement correctly (Spine's "rotation inherit" flag requires local-space storage)

**Prevention:**
- Store ALL bone transforms as local-space (relative to parent) from day one
- The canvas viewport converts to world-space only for rendering — never write world-space values back to the data model
- Implement `localToWorld()` and `worldToLocal()` transform helpers before writing any editor interaction code
- When the user drags a bone on canvas, convert the mouse delta to local space immediately

**Detection (warning signs):**
- Bone positions look correct for shallow hierarchies but "drift" in deep ones
- Rotating a parent bone causes child bone visual positions to jump or lag
- Unit tests for a 3-bone chain produce different world positions than expected

**Phase to address:** Phase 1 (skeleton/bone data model). This is non-negotiable before any UI is built.

---

### Pitfall 2: Flat Keyframe List Instead of Per-Property Channels

**What goes wrong:** Keyframes are stored as a flat list where each keyframe contains all properties: `{ time, x, y, rotation, scaleX, scaleY }`. When the user only wants to keyframe rotation (not position), the editor either stores redundant zero-change position keyframes or struggles to interpolate correctly across a sparse timeline.

**Why it happens:** A flat struct feels simpler. It matches the mental model of "a keyframe is a moment in time."

**Consequences:**
- Cannot have position keyframes at different times than rotation keyframes for the same bone
- Interpolation logic becomes complex special-casing: "if there's no adjacent keyframe for property X, what do I do?"
- Export file size balloons because every keyframe carries every property even if unchanged
- Adding a new animatable property (e.g., opacity, color tint) requires changing every keyframe ever stored
- Undo/redo becomes coarse — you cannot undo "add rotation keyframe" without also undoing the position state at that time

**Prevention:**
- Use per-property channels from the start: `bone.channels.rotation = [{ time, value, easing }, ...]`, `bone.channels.x = [...]`, `bone.channels.y = [...]`
- Interpolation per-channel is then trivial: find the two bracketing keyframes in that channel, lerp/curve between them
- If a channel has no keyframe, the bone uses its bind pose value for that property
- This is how Spine, DragonBones, and every production skeletal animation tool works

**Detection (warning signs):**
- You find yourself writing special cases like "if no rotation keyframe exists at this time, use..."
- Adding a new property requires a migration script or schema change
- Export file is large even for simple animations with only one moving property

**Phase to address:** Phase 2 (animation/timeline system). Must be designed before any keyframe storage is implemented.

---

### Pitfall 3: Treating the Canvas Viewport Coordinate System as the Data Coordinate System

**What goes wrong:** The editor uses the HTML5 Canvas or PixiJS stage coordinate system (Y-axis pointing down, origin at top-left) directly as the storage coordinate system. The runtime then uses the same coordinates, but PixiJS also has Y-down — so it appears to work. The real problem surfaces when:
- The user rotates a bone: positive rotation appears clockwise in the viewport (Y-down), but the math assumes counter-clockwise (Y-up convention from linear algebra textbooks)
- Rotation inheritance across multiple bones compounds sign errors
- A user tries to mirror/flip a character and gets inverted rotations

**Why it happens:** "Just use the canvas coordinates, it's simpler" is a reasonable early decision, but the discrepancy between math conventions and screen conventions creates invisible debt.

**Consequences:**
- All rotation math must be negated or inverted throughout the codebase
- Mirroring/flipping animations requires understanding which sign to flip where — becomes a source of persistent bugs
- If you ever add a non-browser runtime (e.g., a native game engine importer), the sign conventions must be documented and handled by every consumer

**Prevention:**
- Decide on one canonical coordinate convention (recommend: Y-down to match PixiJS, positive rotation = clockwise) and document it explicitly
- Write this convention into a `COORDINATE_SYSTEM.md` or code comment at the top of the transform module
- All transform math uses this convention consistently — no implicit negations scattered in event handlers
- The PixiJS runtime imports data without sign flips because both use the same convention

**Detection (warning signs):**
- You find a negation (`-rotation`) somewhere in event handling but not in the data model
- Mirroring a character works for position but breaks rotation
- Bones at 45 degrees rotate differently than at 90 degrees when a parent is involved

**Phase to address:** Phase 1 (before any bone manipulation code). Document the convention; enforce it.

---

### Pitfall 4: Not Designing the Export Format for Runtime Parsing Performance

**What goes wrong:** The export JSON is designed to match the editor's internal data model exactly — nested bone objects with channel arrays, string-keyed properties, deep object references. The runtime then does expensive work on every animation play: sorting keyframes by time, resolving bone references by name, building the transform hierarchy. For an animation with 20 bones and 500 keyframes, this is fine. For a game scene with 10 characters each with 20 bones, load time becomes noticeable and frame budget is consumed.

**Why it happens:** "Export what we have internally" is the path of least resistance. Runtime performance feels like a later problem.

**Consequences:**
- Runtime `AnimationState.update()` is slow because data is not pre-sorted or pre-indexed
- Bone lookup by string name on every frame (common naive pattern) causes GC pressure in JavaScript
- If the format is used by third-party runtimes or tools, the poor structure makes it hard for others to consume

**Prevention:**
- Design the export format explicitly for runtime use, not as a mirror of editor internals
- Keyframes must be sorted by time in the export (runtime can then binary-search or iterate forward)
- Bones should be ordered in the export by traversal order (parent before child) so the runtime can process them in one forward pass
- Bone references in the export use integer indices, not string names (string lookup = hash map = GC)
- The editor's internal model can be richer; the export is a separate serialization step

**Detection (warning signs):**
- The runtime does a `bones.find(b => b.name === target)` anywhere inside `update()`
- Exported JSON has unsorted keyframe arrays
- Runtime first-frame stutter in the browser when loading a new animation

**Phase to address:** Phase 3 (export system). Design the export schema before writing the runtime, not after.

---

### Pitfall 5: Building Undo/Redo as an Afterthought

**What goes wrong:** Undo/redo is deferred to "after core features work." By then, state mutations are scattered across dozens of event handlers, React state, and canvas interaction callbacks. Implementing undo now requires either: (a) wrapping every mutation in a command object — a massive refactor — or (b) using full state snapshots that are too large to store many history entries.

**Why it happens:** Undo feels like a polish feature. It is not — it is a structural architectural decision.

**Consequences:**
- Full state snapshot approach: 50 snapshots × 5MB state = 250MB memory, or snapshots so lossy they don't actually capture meaningful undo steps
- Command pattern retrofit: requires rewriting all mutation code as Command objects — essentially rewriting the editor
- Users will not trust the tool without reliable undo; this will be reported as a critical bug from day one

**Prevention:**
- Choose the undo architecture before writing any mutation code: Command pattern (recommended) or Immer-based structural sharing
- Command pattern: every user action is a `{ execute(), undo() }` pair pushed to a history stack. The editor's data model is only mutated through commands
- Immer + structural sharing: every state mutation goes through `produce()`, and the history stores Immer patches (small, serializable diffs)
- The Immer approach integrates naturally with React state management and is lower ceremony for this scale of project
- Pick one and enforce it from the first mutation written

**Detection (warning signs):**
- You have direct state mutations in React event handlers (`setState(prev => ({ ...prev, bones: [...] }))` scattered everywhere)
- Adding undo for "delete bone" requires tracking 5 different state fields
- Undo partially reverts an action (e.g., undoes the keyframe deletion but not the bone selection change)

**Phase to address:** Phase 1 (before any editor mutations are built). This is an architecture decision, not a feature.

---

### Pitfall 6: Bind Pose Confusion — Rest Pose vs. Posed State

**What goes wrong:** The editor conflates the "bind pose" (the neutral rest position of every bone, used as the baseline for animation) with the current "editor pose" (what the user has arranged on screen). When the user sets up the skeleton, they are editing the bind pose. When they switch to an animation and scrub the timeline, they are editing offsets from the bind pose. Many editors implement these as the same thing, then discover that:
- Changing the bind pose after animations are created corrupts all keyframes (because keyframes store offsets from the original bind pose)
- The runtime cannot correctly return a bone to its rest state between animations

**Why it happens:** The distinction seems theoretical until animations exist. Early prototypes don't need it.

**Consequences:**
- Bind pose edits after animation creation require a migration of all existing keyframes — a complex and error-prone operation
- The runtime "rest" state between animations is undefined, causing popping or incorrect positions when switching animations
- Skin attachment positions (images attached to bones) drift when bind pose changes

**Prevention:**
- Establish the bind pose as a first-class, immutable-after-animation concept from day one
- The data model has: `bone.bindTransform` (the bind pose) and `animation.channels[boneId][property]` (offsets from bind pose)
- The runtime computes: `worldTransform = bindTransform * animationOffset`
- Show the user a clear UI mode distinction: "Pose Mode" vs. "Animate Mode" — similar to Blender's Object/Pose modes
- In Pose Mode, user edits bind pose. In Animate Mode, all edits create keyframes as deltas from bind

**Detection (warning signs):**
- Moving a bone "edits" the skeleton and also creates a keyframe at the same time without the user distinguishing which they want
- Changing bone position in "setup mode" shifts existing animation keyframes on screen
- The runtime doesn't know what to display when no animation is playing

**Phase to address:** Phase 1 (data model) and Phase 2 (UI mode switching). The data model must encode this distinction; the UI must make it visible.

---

## Moderate Pitfalls

---

### Pitfall 7: Browser File I/O — Assuming File System Access

**What goes wrong:** The project saves/loads via `<input type="file">` for loading and `URL.createObjectURL` + anchor click for saving. This works, but the user experience is poor: every save is a new download, there is no "overwrite" capability, and the user must manually manage files. Developers sometimes reach for the File System Access API (`window.showSaveFilePicker`) to fix this — then discover it is not supported in Firefox (as of 2025) and requires a secure context with user gesture.

**Why it happens:** The File System Access API looks like the right answer and is well-documented, but browser support gaps bite.

**Consequences:**
- Firefox users (a meaningful subset of developers) cannot use the "save to file" workflow
- The OPFS (Origin Private File System) alternative stores files invisibly inside the browser's storage — users cannot access them from their file manager, which feels like data loss
- Relying on downloads-folder saves means files accumulate as `project (1).json`, `project (2).json`

**Prevention:**
- For v1, use localStorage or IndexedDB as the primary save mechanism, with explicit "Export to File" (download) and "Import from File" (upload) as secondary
- This sidesteps all File System Access API compatibility issues
- IndexedDB can hold binary data (images as ArrayBuffer) — no need to re-upload images every session
- Clearly communicate to users that "Save" saves to browser storage, and they should "Export" before clearing browser data
- Do not build around File System Access API for v1 — flag it as a future enhancement

**Detection (warning signs):**
- Your "save" implementation triggers a file download every time
- You are writing `window.showSaveFilePicker` without a Firefox fallback
- Users report "I lost my project" after clearing browser cache

**Phase to address:** Phase 3 (save/load/export). Choose the persistence strategy explicitly, not by default.

---

### Pitfall 8: Easing Curve Complexity — Starting with Too Many Interpolation Types

**What goes wrong:** To match Spine's feature set, the editor implements Bezier easing curves, elastic easing, bounce easing, step interpolation, and linear interpolation from the start. The Bezier curve editor alone (drag control handles on a curve) is a significant UI subsystem. By the time it's working, weeks have been spent on easing curves while core features are unvalidated.

**Why it happens:** "Real" animation tools have full curve editors. It feels like table stakes.

**Consequences:**
- Bezier easing in skeletal animation requires solving the parametric curve for a given time value — a non-trivial numerical problem (requires Newton-Raphson iteration or cubic solve)
- The easing curve UI (control handles, tangent editing) is a mini-application within the application
- Users validating v1 care about "does it animate" not "can I make the bounce easing perfectly tuned"

**Prevention:**
- v1: implement only Linear and Stepped (hold) interpolation
- v2: add Bezier curves with a simple preset library (ease-in, ease-out, ease-in-out) before building a full curve editor
- The export format should accommodate easing type as an enum field from day one, even if v1 only uses `"linear"` and `"stepped"` — this prevents a format version bump later
- The runtime must handle the easing enum and be prepared to add more types without breaking changes

**Detection (warning signs):**
- You are implementing Bezier solve logic before the timeline scrubbing works
- The easing curve editor has bugs that block finishing the basic keyframe workflow

**Phase to address:** Phase 2 (animation system). Scope explicitly to linear + stepped for v1; note Bezier as a v2 item.

---

### Pitfall 9: Image Handling — Embedding vs. Referencing in Export

**What goes wrong:** The export JSON either (a) embeds images as base64, making files 30-50% larger and slow to parse, or (b) references images by file path, which breaks when the JSON is moved to a different machine or directory. Neither is correct for a browser-based tool.

**Why it happens:** Base64 is easy. File paths feel natural. Neither accounts for the browser's sandbox environment.

**Consequences:**
- Base64 export: a project with 10 images at 200KB each produces a 2.7MB JSON file; the runtime must decode base64 on load, adding latency
- File path references: completely non-portable — the path `C:\Users\wam34\Downloads\character.png` means nothing in a deployed web game
- Runtime cannot load images it cannot locate

**Prevention:**
- Export format uses relative path references: `"texture": "character_head.png"` where the path is relative to the JSON file's location
- The export produces a ZIP or folder: `project.json` + `images/` directory containing all referenced PNGs
- The runtime loads images relative to the JSON's base URL, which works correctly in both development and production web serving
- For the in-editor experience, images are stored in IndexedDB by filename and loaded into Object URLs — the export step extracts them from IndexedDB and packages them

**Detection (warning signs):**
- Your export JSON contains `data:image/png;base64,...` strings
- You are storing absolute file paths in the export
- The runtime cannot find images when the JSON is served from a web server

**Phase to address:** Phase 3 (export). Design the export bundle structure before implementing the export step.

---

### Pitfall 10: Timeline Performance — Rendering Thousands of Keyframe Ticks in React

**What goes wrong:** The timeline component renders keyframe tick marks as React elements. For an animation with 20 bones × 5 properties × 60 keyframes = 6000 keyframe ticks, React's diffing overhead on each playback frame makes the timeline laggy. Scrubbing is choppy.

**Why it happens:** Rendering the timeline as React JSX feels natural — everything else is React. The performance problem only appears at non-trivial animation sizes.

**Consequences:**
- Timeline scrubbing at 60fps is not possible if React is re-rendering 6000 elements per frame
- Keyframe selection, multi-select, and drag operations stutter
- Users animating complex characters abandon the tool

**Prevention:**
- Render the timeline ruler and keyframe ticks on a `<canvas>` element, not as React DOM elements
- React manages timeline state (selected keyframes, current time, zoom level); canvas renders the visual representation imperatively
- The canvas timeline redraws only when state changes — use `requestAnimationFrame` throttling
- Keyframe hit-testing (click to select) uses canvas-space math, not DOM events on individual tick elements

**Detection (warning signs):**
- Timeline component has a large `keyframes.map(k => <div ...>)` in JSX
- Chrome DevTools shows React reconciliation time >5ms during timeline scrub
- Scrubbing is smooth with 3 bones but choppy with 15

**Phase to address:** Phase 2 (timeline UI). Design the timeline as canvas-rendered from the start; retrofitting this is painful.

---

### Pitfall 11: Skin Attachment Pivot Point Confusion

**What goes wrong:** When the user attaches an image to a bone, the image must be positioned and rotated relative to the bone's origin. The "pivot point" of the image (which pixel is at the bone's origin) is stored as a normalized offset (e.g., `{ pivotX: 0.5, pivotY: 0.0 }` means "center-bottom of image is at bone origin"). If this is stored as pixel coordinates instead, the offset becomes invalid if the image is replaced with a different-sized image.

**Why it happens:** Pixel coordinates feel more concrete. Normalized offsets require a division by image dimensions.

**Consequences:**
- Replacing an image attachment on a bone with a different resolution image shifts all positions
- The runtime must know image dimensions at load time to reconstruct pixel positions from normalized offsets — which is fine, but must be documented

**Prevention:**
- Store attachment offsets as normalized `[0.0, 1.0]` values relative to image dimensions
- Store attachment rotation as degrees relative to the bone's local space
- The runtime multiplies normalized offset by loaded image dimensions to get pixel offset
- The editor shows the pivot as a draggable handle that converts to/from normalized on drag

**Phase to address:** Phase 1 (attachment data model). One line of documentation prevents this.

---

## Minor Pitfalls

---

### Pitfall 12: Bone Naming — No Uniqueness Constraint

**What goes wrong:** The user can create two bones both named "arm." The export format references bones by name. The runtime loads the skeleton, finds two bones named "arm," and applies all "arm" animation data to both — or arbitrarily to the first one found.

**Prevention:**
- Enforce unique bone names at the data model level (reject duplicates on creation/rename)
- The editor generates default names like "Bone_1", "Bone_2" that are guaranteed unique
- Consider using internal UUIDs as canonical identifiers, with display names separate — export uses UUIDs, not display names

**Phase to address:** Phase 1.

---

### Pitfall 13: Canvas Zoom/Pan Breaking Bone Interaction Hit Areas

**What goes wrong:** The user zooms in on the canvas to work on fine details. Bone selection/drag handles are specified in canvas pixel coordinates, but mouse events arrive in screen pixel coordinates. When zoom/pan are applied, hit areas that worked at 1:1 zoom are offset or scaled incorrectly.

**Prevention:**
- Maintain a viewport transform matrix (scale + translate) that converts screen coords to canvas world coords
- All hit testing uses `screenToWorld(mousePos)`, never raw mouse coordinates
- Bone handle sizes are specified in screen pixels and scaled by zoom for rendering, but hit testing uses a fixed screen-pixel radius (so small bones remain clickable at any zoom level)

**Phase to address:** Phase 1 (viewport interaction). Implement the transform matrix before any bone interaction code.

---

### Pitfall 14: Animation Playback Loop — requestAnimationFrame Delta Time Drift

**What goes wrong:** Animation playback uses `Date.now()` differences or `performance.now()` naively. When the browser tab is backgrounded, `requestAnimationFrame` throttles to 1fps; when resumed, the accumulated delta causes the animation to skip forward by seconds, corrupting the preview state.

**Prevention:**
- Clamp per-frame delta time to a maximum (e.g., 100ms) so that tab-backgrounding causes a pause, not a time skip
- Implement explicit Play/Pause state — pausing freezes the accumulated time, not the wall clock
- The animation preview loop is decoupled from the frame render loop

**Phase to address:** Phase 2 (animation playback).

---

### Pitfall 15: Export Format Versioning — No Version Field

**What goes wrong:** v1 of the export format ships without a version field. When v2 changes the schema (adds Bezier easing, changes channel structure, adds skin slots), the runtime cannot distinguish v1 files from v2 files and loads them incorrectly.

**Prevention:**
- Include `"formatVersion": 1` as the first field in every exported JSON, even before the format is stable
- The runtime checks this field first; if version > supported, it warns gracefully rather than parsing incorrectly
- Document the format version bump policy in the codebase before v1 ships

**Phase to address:** Phase 3 (export). One field, immense forward-compat value.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Bone data model | World-space storage (Pitfall 1) | Store local transforms only; implement world-space as computed property |
| Bone data model | Bind pose conflation (Pitfall 6) | Separate `bindTransform` from animation channels before any UI is built |
| Bone data model | Missing bone name uniqueness (Pitfall 12) | Enforce at model layer with UUID internal IDs |
| Attachment model | Pixel pivot coordinates (Pitfall 11) | Normalized [0,1] offsets; document runtime contract |
| Undo system | Afterthought architecture (Pitfall 5) | Choose Immer patches or Command pattern; enforce before first mutation |
| Canvas viewport | Coordinate system ambiguity (Pitfall 3) | Document convention; no implicit negations in event handlers |
| Canvas viewport | Zoom/pan hit area bugs (Pitfall 13) | Screen-to-world transform matrix from day one |
| Timeline UI | React rendering of keyframe ticks (Pitfall 10) | Canvas-rendered timeline from the start |
| Animation system | Flat keyframe struct (Pitfall 2) | Per-property channels before any keyframe storage |
| Animation system | Easing curve overreach (Pitfall 8) | Linear + Stepped only for v1; format reserves field for future types |
| Animation playback | RAF delta time drift (Pitfall 14) | Cap delta; explicit pause state |
| Export design | Image embedding vs. referencing (Pitfall 9) | ZIP bundle with relative paths; IndexedDB for in-editor storage |
| Export design | No format version field (Pitfall 15) | `"formatVersion": 1` in first export ever shipped |
| Export design | Runtime parsing overhead (Pitfall 4) | Pre-sort keyframes; use integer bone indices; design for runtime first |
| Save/load | File System Access API compatibility (Pitfall 7) | IndexedDB primary; file download/upload secondary; skip FSA API for v1 |

---

## Sources

- Analysis of DragonBones open-source editor architecture (public GitHub repository)
- Spine runtime format documentation (esotericsoftware.com/spine-json-format) — used for comparison, not replication
- PixiJS v8 scene graph and transform documentation
- General skeletal animation theory: local vs. world space transform chains, per-channel keyframe design
- Browser File System Access API MDN compatibility tables
- **Confidence note:** WebSearch was unavailable during this research session. All findings are based on domain expertise, open-source tool analysis, and established skeletal animation tooling patterns. Confidence level: MEDIUM. Recommend verifying Pitfall 7 (FSA API support) against current MDN compatibility tables before finalizing the save/load architecture.
