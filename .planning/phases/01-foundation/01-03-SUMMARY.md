---
phase: 01-foundation
plan: 03
subsystem: bone-tools
tags: [pixijs, gizmos, bone-creation, keyboard-shortcuts, viewport]

# Dependency graph
requires: [01-01, 01-02]
provides:
  - Move, Rotate, and Scale gizmos for bone manipulation
  - Click-to-create bone workflow in viewport
  - Keyboard shortcuts for tool switching and bone operations
  - Grid snapping in all gizmo operations
  - Globalpointermove drag handling for fast pointer movement
affects: [01-04-image-assets, 01-06-persistence]

# Tech tracking
tech-stack:
  added: []
  patterns: [Gizmo pattern with imperative Graphics, globalpointermove for drag tracking, coordinate conversion chain (screen->world->local), keyboard shortcut handling in viewport]

key-files:
  created: [src/viewport/GizmoLayer.ts, src/viewport/BoneCreation.ts]
  modified: [src/viewport/BoneRenderer.ts, src/viewport/PixiViewport.tsx]

key-decisions:
  - "globalpointermove on app.stage for drag - tracks pointer even when outside gizmo handle bounds"
  - "Transform deltas computed in local space - screen->world->local conversion with parent rotation"
  - "Gizmo render order - z-index 1000 to render above bones"
  - "Axis-constrained dragging - X/Y handles for move and scale tools"
  - "Rotation snap to 15-degree increments when grid snap enabled"

patterns-established:
  - "Pattern 5: Gizmo layer pattern - imperative Graphics classes nested in GizmoLayer manager"
  - "Pattern 6: globalpointermove drag tracking - listeners on app.stage, removed on pointerup"
  - "Pattern 7: Coordinate conversion chain - screen->world->local for gizmo deltas"
  - "Pattern 8: Keyboard shortcut handling - window keydown listener with input element detection"

requirements-completed: [BONE-06, BONE-07, BONE-08, VIEW-04]

# Metrics
duration: 8min
completed: 2026-03-02T04:32:22Z
---

# Phase 1 Plan 3: Bone Tools Summary

**Move, Rotate, and Scale gizmos with click-to-create bone workflow - transforms viewport into active rigging tool**

## Performance

- **Duration:** 8 minutes
- **Started:** 2026-03-02T04:23:47Z
- **Completed:** 2026-03-02T04:32:22Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

### Task 1: Move and Rotate gizmos with globalpointermove drag
- **Commit:** 7e91b3d
- Created GizmoLayer.ts with three gizmo classes (MoveGizmo, RotateGizmo, ScaleGizmo)
- MoveGizmo: X axis arrow (red), Y axis arrow (green), center square (white) for free-move dragging
- RotateGizmo: Circular arc handle at 50px radius from bone origin with angle indicator
- ScaleGizmo: X and Y axis handles with square endpoints at 50px for axis-constrained scaling
- Gizmos render above bones at z-index 1000 in camera container
- Drag uses globalpointermove on app.stage to handle fast pointer movement outside handle bounds
- Transform deltas computed in local space: screen delta -> world delta -> local delta with parent rotation compensation
- Grid snapping applied to all gizmo operations when snapEnabled=true
- Axis-constrained dragging for move (X/Y axis handles) and scale (X/Y handles)
- Rotation snaps to 15-degree increments (PI/12) when grid snap enabled
- Scale factor clamped to minimum 0.01 to prevent inversion
- Gizmo visibility controlled by activeTool (select mode hides all gizmos)

### Task 2: Click-to-create bone workflow + keyboard shortcuts
- **Commit:** 77f6c85
- Created BoneCreation.ts with stage pointerdown handler for bone creation
- Clicking empty canvas with select tool and no selection creates root bone at click position
- Clicking empty canvas with select tool and bone selected creates child bone at click position
- New bones placed in parent's local space using world-to-local coordinate conversion with parent rotation and scale compensation
- Newly created bone automatically selected and Move tool activated for immediate repositioning
- Keyboard shortcuts in PixiViewport.tsx:
  - B: Create root bone at viewport center (0, 0 world coordinates)
  - G: Switch to Move tool
  - R: Switch to Rotate tool
  - S: Switch to Scale tool
  - Escape: Deselect bone and return to Select tool
  - Delete/Backspace: Delete selected bone (children reparented to deleted bone's parent)
  - Tab: Toggle editor mode between Pose and Animate
- Keyboard shortcuts ignored when focused on input elements to avoid conflicts
- Ctrl+Z/Y (undo/redo) not overridden (handled in App.tsx)

## Files Created/Modified

### Created:
- `src/viewport/GizmoLayer.ts` - Imperative gizmo system with MoveGizmo, RotateGizmo, and ScaleGizmo classes
- `src/viewport/BoneCreation.ts` - Click-to-create bone workflow handler

### Modified:
- `src/viewport/BoneRenderer.ts` - Integrated GizmoLayer and BoneCreation setup, updated useTick for gizmo updates
- `src/viewport/PixiViewport.tsx` - Added keyboard shortcut handling for tool switching and bone operations

## Decisions Made

- **globalpointermove for drag tracking:** Following research recommendation, used globalpointermove on app.stage instead of pointermove on gizmo handles. This is critical because gizmo handles are small, and the pointer exits the handle bounds immediately on fast drag. globalpointermove fires regardless of pointer position.
- **Local-space transform deltas:** All gizmo operations compute deltas in local space by converting screen deltas through world space to local space using the parent's world rotation. This ensures bone transforms remain in local space (relative to parent) as required by the data model.
- **Gizmo render order:** Gizmos render at z-index 1000 above bones to ensure they're always visible and interactable.
- **Axis-constrained operations:** Move and Scale gizmos provide X and Y axis handles for constrained manipulation, in addition to the center/free-move handle.
- **Rotation snap to 15-degree increments:** When grid snap is enabled, rotation snaps to 15-degree increments (PI/12 radians) for precise angular control.
- **Keyboard shortcut input detection:** Keyboard shortcuts are ignored when the focused element is an input or textarea to avoid conflicts with text editing.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Unrelated pre-existing files:** The project had AttachmentRenderer.ts, AttachmentsRef.ts, and ViewportContext.tsx files that were not part of Plan 01-03. These files appear to be from a different plan or user modification. They were not modified or used in this plan's execution.

## User Setup Required

None - no external service configuration required. The bone tools work immediately upon running `npm run dev`.

## Next Phase Readiness

- Gizmos are fully functional with Move, Rotate, and Scale modes
- Click-to-create workflow allows building bone hierarchies entirely through viewport interaction
- Keyboard shortcuts provide efficient tool switching
- Grid snapping works correctly for all gizmo operations
- Transform deltas correctly computed in local space
- TypeScript compiles clean: `npx tsc --noEmit` reports 0 errors
- Dev server starts without errors: `npm run dev` runs on http://localhost:5173

No blockers or concerns for next phase.

## Integration Test Sequence

The plan specifies the following integration test sequence:
1. Press B -> root bone appears at center
2. Press G -> move gizmo appears (X/Y arrows + center square)
3. Drag center square -> bone moves to new position
4. Press R -> rotate gizmo appears (arc)
5. Drag arc -> bone rotates
6. Press S -> scale gizmo appears (axis endpoints)
7. Drag endpoint -> bone scales
8. Click empty canvas with bone selected -> child bone created
9. Build 3-bone chain, verify transforms compose correctly via visual inspection
10. Enable snap (store.setSnapEnabled(true)), move bone -> moves snap to grid

## Self-Check: PASSED

**Created files verified:**
- FOUND: src/viewport/GizmoLayer.ts
- FOUND: src/viewport/BoneCreation.ts
- FOUND: .planning/phases/01-foundation/01-03-SUMMARY.md

**Commits verified:**
- FOUND: 7e91b3d (feat commit - Task 1)
- FOUND: 77f6c85 (feat commit - Task 2)

**TypeScript compilation:**
- PASSED: npx tsc --noEmit reports 0 errors

---
*Phase: 01-foundation*
*Completed: 2026-03-02T04:32:22Z*
