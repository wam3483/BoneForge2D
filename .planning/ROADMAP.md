# Roadmap: BoneForge2D

## Overview

BoneForge2D ships in four phases driven by build-order dependencies. The data model and viewport core come first because four of six identified critical pitfalls are data model decisions that cannot be retrofitted; every subsequent component reads from the same store. The animation engine follows immediately after because it is a pure function with no UI dependencies and because the timeline is meaningless without it. Export, save/load, and the PixiJS runtime ship together in Phase 3 because the runtime's correctness depends on a stable export format — they must be built in that order within the phase. Panels and polish land last because the core animation loop (Phases 1-3) carries all project risk; validating it before panel work begins lets scope decisions be made from real usage rather than speculation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Data model, store, viewport, bones, attachments, undo/redo, and session auto-save
- [ ] **Phase 2: Animation** - Keyframe system, animation engine, timeline panel, and real-time playback
- [ ] **Phase 3: Export and Runtime** - BoneForge JSON export, project save/load, and PixiJS runtime package
- [ ] **Phase 4: Panels and Polish** - Hierarchy panel, properties panel, animation list panel, and theming

## Phase Details

### Phase 1: Foundation
**Goal**: Users can build a rigged character skeleton in the browser — create bones, attach images, manipulate transforms in the viewport, and trust the session survives a page refresh
**Depends on**: Nothing (first phase)
**Requirements**: BONE-01, BONE-02, BONE-03, BONE-04, BONE-05, BONE-06, BONE-07, BONE-08, BONE-09, BONE-10, ATTACH-01, ATTACH-02, ATTACH-03, ATTACH-04, ATTACH-05, VIEW-01, VIEW-02, VIEW-03, VIEW-04, VIEW-05, PERSIST-01, PERSIST-02, PERSIST-03
**Success Criteria** (what must be TRUE):
  1. User can create bones, name them, arrange them into a parent-child hierarchy, and manipulate each bone's position, rotation, and scale using viewport gizmos — and the hierarchy correctly inherits transforms down the chain
  2. User can import PNG or JPG images, attach them to bones with a configurable pivot/offset and draw order, and see them follow the bone's world transform in the viewport
  3. User can switch between Pose Mode (editing bind pose) and Animate Mode without corrupting existing bone transforms
  4. User can undo and redo any editing action, and the project state before and after each undo/redo is visually correct
  5. User can close and reopen the browser tab and resume editing without any data loss (auto-saved to IndexedDB)
**Plans**: 6 plans

Plans:
- [ ] 01-01-PLAN.md — Project scaffold, TypeScript data model, Zustand store with Immer patch undo/redo
- [ ] 01-02-PLAN.md — PixiJS viewport mount, camera pan/zoom, Spine-style bone rendering, grid overlay
- [ ] 01-03-PLAN.md — Move/Rotate/Scale gizmos with globalpointermove drag, click-to-create bone workflow
- [ ] 01-04-PLAN.md — Image import sidebar, attachment rendering (PixiJS Sprites following bone transforms), IndexedDB image storage
- [ ] 01-05-PLAN.md — Editor shell toolbar, mode toggle with visual enforcement, status bar, bone rename
- [ ] 01-06-PLAN.md — IndexedDB auto-save (debounced 500ms), session restore on page load

### Phase 2: Animation
**Goal**: Users can animate a rigged skeleton — create named animations, set keyframes on any bone property, scrub the timeline, and preview the result playing back in real time
**Depends on**: Phase 1
**Requirements**: ANIM-01, ANIM-02, ANIM-03, ANIM-04, ANIM-05, ANIM-06, ANIM-07, ANIM-08, ANIM-09
**Success Criteria** (what must be TRUE):
  1. User can create, rename, and delete named animations (e.g. "idle", "walk", "attack") and switch between them without losing keyframe data
  2. User can add and delete keyframes independently for position, rotation, and scale on any bone at any time point, with each property channel operating independently
  3. User can drag the timeline scrubber to any point in time and the viewport immediately shows the correctly interpolated pose for all bones
  4. User can set a keyframe's interpolation to linear (smooth tween) or stepped (instant snap) and see the difference during scrub and playback
  5. User can press play and watch the animation loop in real time in the viewport with smooth bone movement
**Plans**: TBD

### Phase 3: Export and Runtime
**Goal**: Users can get their animation into a PixiJS game — export a JSON file that a provided npm runtime package loads and plays back, and save/restore full projects between sessions
**Depends on**: Phase 2
**Requirements**: PERSIST-04, PERSIST-05, PERSIST-06, RUNTIME-01, RUNTIME-02, RUNTIME-03, RUNTIME-04, RUNTIME-05
**Success Criteria** (what must be TRUE):
  1. User can export the skeleton and animations as a BoneForge JSON file that is valid and complete (bones, keyframes, image references, format version)
  2. User can download a full project backup file and re-import it in a new browser session to resume editing exactly where they left off
  3. A PixiJS game developer can install the BoneForge2D runtime npm package, load the exported JSON, and call `sprite.play("walk", { loop: true })` to drive a live animation in a PixiJS v8 scene
  4. The runtime dispatches a completion event when a non-looping animation finishes, so game code can chain animation states
  5. Non-npm users can load the runtime via a UMD/IIFE bundle without a build tool
**Plans**: TBD

### Phase 4: Panels and Polish
**Goal**: Users have a complete, navigable editor UI — hierarchy panel, properties panel, animation list panel, and a theme toggle — so every editing operation is reachable without memorizing viewport interactions
**Depends on**: Phase 3
**Requirements**: PANEL-01, PANEL-02, PANEL-03, PANEL-04, THEME-01, THEME-02
**Success Criteria** (what must be TRUE):
  1. User can see the full bone hierarchy in a collapsible tree panel, click any bone to select it (selection syncs with the viewport), and drag bones to reparent them
  2. User can view and type exact numeric values for position X/Y, rotation, and scale X/Y of the selected bone in a properties panel, and the viewport reflects changes immediately
  3. User can see all animations in a list panel and click to switch the active animation without losing keyframe data
  4. User can toggle between light mode and dark mode at any time, and the preference persists across sessions
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/6 | In Progress|  |
| 2. Animation | 0/TBD | Not started | - |
| 3. Export and Runtime | 0/TBD | Not started | - |
| 4. Panels and Polish | 0/TBD | Not started | - |
