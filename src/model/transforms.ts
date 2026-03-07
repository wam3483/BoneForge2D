import type { Animation, BoneTransform, Keyframe, Skeleton } from './types'

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

/**
 * Evaluates an animation at a given time, returning a map of boneId → BoneTransform.
 * Each bone starts from its bindTransform and has animated channels overlaid on top.
 * Only bones that have at least one channel in the animation are included in the result.
 */
export function evaluatePose(
  animation: Animation,
  time: number,
  skeleton: Skeleton
): Record<string, BoneTransform> {
  const clampedTime = Math.max(0, Math.min(time, animation.duration))
  const result: Record<string, BoneTransform> = {}

  for (const channel of animation.channels) {
    const { boneId, property, keyframes } = channel
    const bone = skeleton.bones[boneId]
    if (!bone || keyframes.length === 0) continue

    if (!result[boneId]) {
      result[boneId] = { ...bone.bindTransform }
    }

    result[boneId][property] = sampleChannel(keyframes, clampedTime)
  }

  return result
}

function sampleChannel(keyframes: Keyframe[], time: number): number {
  if (keyframes.length === 1) return keyframes[0].value

  if (time <= keyframes[0].time) return keyframes[0].value

  const last = keyframes[keyframes.length - 1]
  if (time >= last.time) return last.value

  // Find the two surrounding keyframes
  let leftIdx = 0
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (keyframes[i].time <= time && time < keyframes[i + 1].time) {
      leftIdx = i
      break
    }
  }

  const kf0 = keyframes[leftIdx]
  const kf1 = keyframes[leftIdx + 1]
  const t = (time - kf0.time) / (kf1.time - kf0.time)

  return interpolateKeyframes(kf0, kf1, t)
}

function interpolateKeyframes(kf0: Keyframe, kf1: Keyframe, t: number): number {
  const v0 = kf0.value
  const v1 = kf1.value
  const dv = v1 - v0

  switch (kf0.interpolation) {
    case 'constant':
      return v0

    case 'linear':
      return v0 + dv * t

    case 'easeInQuad':
      return v0 + dv * t * t

    case 'easeOutQuad':
      return v0 + dv * (1 - (1 - t) * (1 - t))

    case 'easeInOutQuad': {
      const e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)
      return v0 + dv * e
    }

    case 'easeInCubic':
      return v0 + dv * t * t * t

    case 'easeOutCubic': {
      const inv = 1 - t
      return v0 + dv * (1 - inv * inv * inv)
    }

    case 'easeInOutCubic': {
      const e = t < 0.5 ? 4 * t * t * t : 1 - 4 * (1 - t) * (1 - t) * (1 - t)
      return v0 + dv * e
    }

    case 'bezier': {
      // 1D cubic bezier. Control points defined as offsets relative to the value range.
      // controlOut on kf0: tangent leaving kf0; controlIn on kf1: tangent arriving kf1.
      const p0 = v0
      const p3 = v1
      const p1 = v0 + (kf0.bezier?.controlOut ?? 0.33) * dv
      const p2 = v1 + (kf1.bezier?.controlIn ?? -0.33) * dv
      const inv = 1 - t
      return inv * inv * inv * p0 + 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t * p3
    }

    default:
      return v0 + dv * t
  }
}
