# Requirements: BoneForge2D

**Defined:** 2026-02-28
**Core Value:** A solo indie dev can rig a character, animate it, and drop it into their PixiJS game — for free, in the browser, without a Spine license.

## v1 Requirements

### Bones

- [x] **BONE-01**: User can create a bone in the viewport with a default name
- [x] **BONE-02**: User can rename a bone
- [x] **BONE-03**: User can delete a bone (its children become children of the deleted bone's parent)
- [x] **BONE-04**: User can assign a parent to a bone to create a hierarchy
- [x] **BONE-05**: User can reparent a bone by dragging it in the hierarchy panel
- [x] **BONE-06**: User can move a bone in the viewport using a translate gizmo
- [x] **BONE-07**: User can rotate a bone in the viewport using a rotate gizmo
- [x] **BONE-08**: User can scale a bone in the viewport using a scale gizmo
- [x] **BONE-09**: User can switch between Pose Mode (edit bind pose) and Animate Mode (add keyframes) — modes are mutually exclusive
- [x] **BONE-10**: User can toggle the visibility of individual bones in the viewport

### Attachments

- [x] **ATTACH-01**: User can import PNG and JPG image files into the project
- [x] **ATTACH-02**: User can attach an imported image to a bone so it follows the bone's world transform
- [x] **ATTACH-03**: User can detach an image from a bone
- [x] **ATTACH-04**: User can adjust the draw order (z-index) of attachments so bones render in the correct stacking order
- [x] **ATTACH-05**: User can adjust the pivot/offset of an attachment relative to its bone's origin point

### Animation

- [ ] **ANIM-01**: User can create a named animation (e.g. "idle", "walk", "attack")
- [ ] **ANIM-02**: User can rename an animation
- [ ] **ANIM-03**: User can delete an animation
- [ ] **ANIM-04**: User can set the duration (length in seconds) of an animation
- [ ] **ANIM-05**: User can add a keyframe for position, rotation, and/or scale independently on any bone at any time point
- [ ] **ANIM-06**: User can delete a keyframe
- [ ] **ANIM-07**: User can set the interpolation mode of a keyframe to linear (smooth tween) or stepped (instant snap)
- [ ] **ANIM-08**: User can scrub the timeline to preview the animation at any point in time
- [ ] **ANIM-09**: User can play and pause the animation in a real-time looping preview

### Viewport

- [x] **VIEW-01**: User can zoom in and out of the canvas viewport
- [x] **VIEW-02**: User can pan the canvas viewport
- [x] **VIEW-03**: User can toggle a grid overlay on the viewport
- [x] **VIEW-04**: User can enable snapping so bone transform operations snap to grid increments
- [x] **VIEW-05**: User can toggle visibility of individual bones without deleting them

### Persistence

- [x] **PERSIST-01**: User can undo the last editing action (Ctrl+Z)
- [x] **PERSIST-02**: User can redo an undone action (Ctrl+Y / Ctrl+Shift+Z)
- [x] **PERSIST-03**: User's active project is automatically persisted to browser storage (IndexedDB) so it survives page refresh without manual saving
- [ ] **PERSIST-04**: User can export the full project (bones, attachments, animations, images) as a downloadable file for backup or transfer between devices
- [ ] **PERSIST-05**: User can import a previously exported project file to resume editing from where they left off
- [ ] **PERSIST-06**: User can export the skeleton and animations as a BoneForge JSON file for use in a PixiJS game via the runtime package

### Runtime

- [ ] **RUNTIME-01**: A PixiJS runtime npm package is provided that loads a BoneForge JSON file and plays back animations within a PixiJS v8 scene
- [ ] **RUNTIME-02**: The runtime exposes an API to play a named animation (e.g. `sprite.play("walk", { loop: true })`)
- [ ] **RUNTIME-03**: The runtime dispatches an event when a non-looping animation completes
- [ ] **RUNTIME-04**: The runtime is distributed as a UMD/IIFE bundle in addition to the npm package for non-npm users
- [ ] **RUNTIME-05**: The runtime has pixi.js ^8 as a peer dependency and zero editor dependencies

### Panels

- [ ] **PANEL-01**: User can view all bones in a collapsible hierarchy panel that reflects parent-child nesting
- [ ] **PANEL-02**: User can select a bone by clicking it in the hierarchy panel (synced with viewport selection)
- [ ] **PANEL-03**: User can view and edit exact numeric values for position (X/Y), rotation (degrees), and scale (X/Y) of the selected bone in a properties panel
- [ ] **PANEL-04**: User can view all animations in a list panel and click to switch the active animation

### Theming

- [ ] **THEME-01**: User can toggle between light mode and dark mode
- [ ] **THEME-02**: The theme system uses CSS custom properties (design tokens) so additional themes (e.g. sepia, grayscale, high-contrast) can be added without UI refactoring

---

## v2 Requirements

### Animation — Easing

- **EASE-01**: User can edit Bezier easing curves on keyframes via a curve editor
- **EASE-02**: User can select easing presets (ease-in, ease-out, ease-in-out)

### Animation — Power Features

- **ANIM-EXT-01**: User can add named animation events at specific timeline points that the runtime dispatches as game-engine events
- **ANIM-EXT-02**: User can enable onion skinning (semi-transparent ghost frames adjacent to current frame in viewport)
- **ANIM-EXT-03**: User can set loop region markers (in/out points) for looping preview of a sub-range
- **ANIM-EXT-04**: User can copy and paste keyframes or ranges of keyframes between animations

### Rigging — Advanced

- **RIG-01**: User can use Inverse Kinematics (IK) to animate bones by moving an end effector
- **RIG-02**: User can define skin sets for a skeleton and switch between them at runtime (e.g. character outfit variants)

### Quality of Life

- **QOL-01**: User can use keyboard shortcuts for common operations (S=select, G=move, R=rotate, Delete=delete bone)
- **QOL-02**: User can see a skeleton preview at a configurable runtime scale (e.g. at 1x game resolution)
- **QOL-03**: User can set the animation preview FPS (24, 30, 60) independently of the editor's frame rate

### Runtime — Additional Engines

- **RT-EXT-01**: Runtime packages are provided for additional engines (Godot, Unity) if project gains traction

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mesh / FFD deformation | Separate multi-week product in its own right; not core to bone-based animation |
| Sprite atlas packing | User provides individual image files; out of scope for v1 |
| Collaborative editing | Local single-user tool for v1; no server infrastructure |
| Cloud sync / cloud storage | Local-first; complex infrastructure; not core value |
| Spine-compatible export format | License ambiguity; format constraints would limit format design |
| Bone physics (jiggle, spring) | High complexity; niche use case for target audience |
| Video / GIF export | Out of scope; game devs need runtime, not video |
| Plugin system | Premature architecture for v1 |
| File System Access API (browser) | Firefox support gaps make it unreliable for v1; IndexedDB + download/upload instead |

---

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BONE-01 | Phase 1 | Complete |
| BONE-02 | Phase 1 | Complete |
| BONE-03 | Phase 1 | Complete |
| BONE-04 | Phase 1 | Complete |
| BONE-05 | Phase 1 | Complete |
| BONE-06 | Phase 1 | Complete |
| BONE-07 | Phase 1 | Complete |
| BONE-08 | Phase 1 | Complete |
| BONE-09 | Phase 1 | Complete |
| BONE-10 | Phase 1 | Complete |
| ATTACH-01 | Phase 1 | Complete |
| ATTACH-02 | Phase 1 | Complete |
| ATTACH-03 | Phase 1 | Complete |
| ATTACH-04 | Phase 1 | Complete |
| ATTACH-05 | Phase 1 | Complete |
| VIEW-01 | Phase 1 | Complete |
| VIEW-02 | Phase 1 | Complete |
| VIEW-03 | Phase 1 | Complete |
| VIEW-04 | Phase 1 | Complete |
| VIEW-05 | Phase 1 | Complete |
| PERSIST-01 | Phase 1 | Complete |
| PERSIST-02 | Phase 1 | Complete |
| PERSIST-03 | Phase 1 | Complete |
| ANIM-01 | Phase 2 | Pending |
| ANIM-02 | Phase 2 | Pending |
| ANIM-03 | Phase 2 | Pending |
| ANIM-04 | Phase 2 | Pending |
| ANIM-05 | Phase 2 | Pending |
| ANIM-06 | Phase 2 | Pending |
| ANIM-07 | Phase 2 | Pending |
| ANIM-08 | Phase 2 | Pending |
| ANIM-09 | Phase 2 | Pending |
| PERSIST-04 | Phase 3 | Pending |
| PERSIST-05 | Phase 3 | Pending |
| PERSIST-06 | Phase 3 | Pending |
| RUNTIME-01 | Phase 3 | Pending |
| RUNTIME-02 | Phase 3 | Pending |
| RUNTIME-03 | Phase 3 | Pending |
| RUNTIME-04 | Phase 3 | Pending |
| RUNTIME-05 | Phase 3 | Pending |
| PANEL-01 | Phase 4 | Pending |
| PANEL-02 | Phase 4 | Pending |
| PANEL-03 | Phase 4 | Pending |
| PANEL-04 | Phase 4 | Pending |
| THEME-01 | Phase 4 | Pending |
| THEME-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 46 total
- Mapped to phases: 46
- Unmapped: 0

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 after roadmap creation — all 46 v1 requirements mapped to phases*
