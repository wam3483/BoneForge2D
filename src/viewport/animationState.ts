/**
 * Shared animation rendering state — updated each tick by BoneRendererLayer,
 * consumed by AttachmentRendererLayer and GizmoLayer.
 *
 * This avoids re-computing effectiveSkeleton in multiple useTick hooks
 * and gives imperative classes (GizmoLayer) access to the posed skeleton.
 */
import type { Skeleton } from '../model/types'

let _effectiveSkeleton: Skeleton | null = null

/** The bone ID currently being dragged by BoneRenderer (position drag). */
let _boneRendererDragId: string | null = null

/** The bone ID currently being dragged by GizmoLayer (rotate/scale drag). */
let _gizmoDragId: string | null = null

export function setEffectiveSkeleton(s: Skeleton): void {
  _effectiveSkeleton = s
}

export function getEffectiveSkeleton(fallback: Skeleton): Skeleton {
  return _effectiveSkeleton ?? fallback
}

export function setBoneRendererDragId(id: string | null): void {
  _boneRendererDragId = id
}

export function getBoneRendererDragId(): string | null {
  return _boneRendererDragId
}

export function setGizmoDragId(id: string | null): void {
  _gizmoDragId = id
}

export function getGizmoDragId(): string | null {
  return _gizmoDragId
}

/** Combined excluded IDs for effectiveSkeleton computation. */
export function getDragExcludedIds(): Set<string> {
  const s = new Set<string>()
  if (_boneRendererDragId) s.add(_boneRendererDragId)
  if (_gizmoDragId) s.add(_gizmoDragId)
  return s
}
