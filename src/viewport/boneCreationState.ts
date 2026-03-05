/**
 * Shared mutable state for the drag-to-create-child-bone gesture.
 *
 * Written by BoneRenderer when the user presses down on a bone in select/pose mode.
 * Read by ViewportCamera to determine the parent bone when the drag crosses the
 * movement threshold and bone creation activates.
 *
 * This module-level singleton avoids any reliance on PixiJS capture-phase routing
 * or store subscription timing — both of which can race with stopPropagation().
 */
export const boneDragSource = {
  /** The bone that was pressed. null = no bone is the current drag source. */
  boneId: null as string | null,
  /** Screen X at the moment of pointerdown. */
  screenX: 0,
  /** Screen Y at the moment of pointerdown. */
  screenY: 0,
}
