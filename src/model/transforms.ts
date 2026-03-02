import type { Bone, BoneTransform, Skeleton } from './types'

export interface WorldTransform extends BoneTransform {}

export function evaluateWorldTransform(boneId: string, skeleton: Skeleton): WorldTransform {
  const bone = skeleton.bones[boneId]
  if (!bone) throw new Error(`Bone not found: ${boneId}`)

  if (!bone.parentId) {
    // Root bone — local IS world
    return { ...bone.localTransform }
  }

  const parentWorld = evaluateWorldTransform(bone.parentId, skeleton)
  const local = bone.localTransform

  // Apply parent's rotation to the child's local position offset
  const cos = Math.cos(parentWorld.rotation)
  const sin = Math.sin(parentWorld.rotation)
  const scaledX = local.x * parentWorld.scaleX
  const scaledY = local.y * parentWorld.scaleY

  return {
    x: parentWorld.x + cos * scaledX - sin * scaledY,
    y: parentWorld.y + sin * scaledX + cos * scaledY,
    rotation: parentWorld.rotation + local.rotation,
    scaleX: parentWorld.scaleX * local.scaleX,
    scaleY: parentWorld.scaleY * local.scaleY,
  }
}
