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
 * Like evaluateWorldTransform but uses bindTransform instead of localTransform.
 */
export function evaluateBindWorldTransform(boneId: string, skeleton: Skeleton): WorldTransform {
  const bone = skeleton.bones[boneId]
  if (!bone) throw new Error(`Bone not found: ${boneId}`)

  if (!bone.parentId) {
    return { ...bone.bindTransform }
  }

  const parentWorld = evaluateBindWorldTransform(bone.parentId, skeleton)
  const local = bone.bindTransform

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
 * Converts a world transform into a local transform relative to a given parent world transform.
 * Inverse of the parent-child composition in evaluateWorldTransform.
 */
export function worldToLocal(world: WorldTransform, parentWorld: WorldTransform): BoneTransform {
  const cos = Math.cos(parentWorld.rotation)
  const sin = Math.sin(parentWorld.rotation)
  const dx = world.x - parentWorld.x
  const dy = world.y - parentWorld.y
  return {
    x:        (cos * dx + sin * dy) / parentWorld.scaleX,
    y:        (-sin * dx + cos * dy) / parentWorld.scaleY,
    rotation: world.rotation - parentWorld.rotation,
    scaleX:   world.scaleX / parentWorld.scaleX,
    scaleY:   world.scaleY / parentWorld.scaleY,
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

    const bindValue = bone.bindTransform[property]
    result[boneId][property] = sampleChannel(keyframes, clampedTime, bindValue)
  }

  return result
}

function sampleChannel(keyframes: Keyframe[], time: number, bindValue: number): number {
  // Before the first keyframe: hold the bind pose value
  if (time < keyframes[0].time) return bindValue

  if (keyframes.length === 1) return keyframes[0].value

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

// bounce-out helper (standard 4-segment formula)
function bounceOut(t: number): number {
  const n = 7.5625, d = 2.75
  if (t < 1 / d)        return n * t * t
  if (t < 2 / d)        { t -= 1.5 / d;   return n * t * t + 0.75 }
  if (t < 2.5 / d)      { t -= 2.25 / d;  return n * t * t + 0.9375 }
  t -= 2.625 / d;       return n * t * t + 0.984375
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

    // ── Polynomial — quadratic ────────────────────────────────────────────
    case 'easeInQuad':
      return v0 + dv * t * t

    case 'easeOutQuad':
      return v0 + dv * (1 - (1 - t) * (1 - t))

    case 'easeInOutQuad': {
      const e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)
      return v0 + dv * e
    }

    // ── Polynomial — cubic ────────────────────────────────────────────────
    case 'easeInCubic':
      return v0 + dv * t * t * t

    case 'easeOutCubic': {
      const u = 1 - t
      return v0 + dv * (1 - u * u * u)
    }

    case 'easeInOutCubic': {
      const e = t < 0.5 ? 4 * t * t * t : 1 - 4 * (1 - t) * (1 - t) * (1 - t)
      return v0 + dv * e
    }

    // ── Polynomial — quartic (pow4) ────────────────────────────────
    case 'pow4In':
      return v0 + dv * t * t * t * t

    case 'pow4Out': {
      const u = 1 - t
      return v0 + dv * (1 - u * u * u * u)
    }

    case 'pow4': {
      const e = t < 0.5
        ? Math.pow(2 * t, 4) / 2
        : Math.pow((t - 1) * 2, 4) / -2 + 1
      return v0 + dv * e
    }

    // ── Polynomial — quintic (pow5) ────────────────────────────────
    case 'pow5In':
      return v0 + dv * t * t * t * t * t

    case 'pow5Out': {
      const u = 1 - t
      return v0 + dv * (1 - u * u * u * u * u)
    }

    case 'pow5': {
      const e = t < 0.5
        ? Math.pow(2 * t, 5) / 2
        : Math.pow((t - 1) * 2, 5) / 2 + 1
      return v0 + dv * e
    }

    // ── Sine (sine / sineIn / sineOut) ────────────────────────────
    case 'sineIn':
      return v0 + dv * (1 - Math.cos(t * Math.PI / 2))

    case 'sineOut':
      return v0 + dv * Math.sin(t * Math.PI / 2)

    case 'sine':
      return v0 + dv * ((1 - Math.cos(t * Math.PI)) / 2)

    // ── Circle (circle / circleIn / circleOut) ────────────────────
    case 'circleIn':
      return v0 + dv * (1 - Math.sqrt(1 - t * t))

    case 'circleOut': {
      const u = t - 1
      return v0 + dv * Math.sqrt(1 - u * u)
    }

    case 'circle': {
      const e = t < 0.5
        ? (1 - Math.sqrt(1 - (2 * t) * (2 * t))) / 2
        : (Math.sqrt(1 - (2 * t - 2) * (2 * t - 2)) + 1) / 2
      return v0 + dv * e
    }

    // ── Exponential ×5 (exp5 — base 2, power 5) ───────────────────
    case 'exp5In': {
      const min = Math.pow(2, -5), sc = 1 / (1 - min)
      return v0 + dv * (Math.pow(2, 5 * (t - 1)) - min) * sc
    }
    case 'exp5Out': {
      const min = Math.pow(2, -5), sc = 1 / (1 - min)
      return v0 + dv * (1 - (Math.pow(2, -5 * t) - min) * sc)
    }
    case 'exp5': {
      const min = Math.pow(2, -5), sc = 1 / (1 - min)
      const e = t <= 0.5
        ? (Math.pow(2, 5 * (2 * t - 1)) - min) * sc / 2
        : (2 - (Math.pow(2, -5 * (2 * t - 1)) - min) * sc) / 2
      return v0 + dv * e
    }

    // ── Exponential ×10 (exp10 — base 2, power 10) ────────────────
    case 'exp10In': {
      const min = Math.pow(2, -10), sc = 1 / (1 - min)
      return v0 + dv * (Math.pow(2, 10 * (t - 1)) - min) * sc
    }
    case 'exp10Out': {
      const min = Math.pow(2, -10), sc = 1 / (1 - min)
      return v0 + dv * (1 - (Math.pow(2, -10 * t) - min) * sc)
    }
    case 'exp10': {
      const min = Math.pow(2, -10), sc = 1 / (1 - min)
      const e = t <= 0.5
        ? (Math.pow(2, 10 * (2 * t - 1)) - min) * sc / 2
        : (2 - (Math.pow(2, -10 * (2 * t - 1)) - min) * sc) / 2
      return v0 + dv * e
    }

    // ── Elastic (spring overshoot) ────────────────────────────────────────
    case 'elasticIn': {
      if (t === 0) return v0
      if (t === 1) return v0 + dv
      const c = (2 * Math.PI) / 3
      return v0 + dv * (-Math.pow(2, 10 * t - 10) * Math.sin((10 * t - 10.75) * c))
    }
    case 'elasticOut': {
      if (t === 0) return v0
      if (t === 1) return v0 + dv
      const c = (2 * Math.PI) / 3
      return v0 + dv * (Math.pow(2, -10 * t) * Math.sin((10 * t - 0.75) * c) + 1)
    }
    case 'elastic': {
      if (t === 0) return v0
      if (t === 1) return v0 + dv
      const c = (2 * Math.PI) / 4.5
      const e = t < 0.5
        ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c)) / 2
        : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c)) / 2 + 1
      return v0 + dv * e
    }

    // ── Bounce (ball-drop) ────────────────────────────────────────────────
    case 'bounceOut':
      return v0 + dv * bounceOut(t)

    case 'bounceIn':
      return v0 + dv * (1 - bounceOut(1 - t))

    case 'bounce': {
      const e = t < 0.5
        ? (1 - bounceOut(1 - 2 * t)) / 2
        : (bounceOut(2 * t - 1) + 1) / 2
      return v0 + dv * e
    }

    // ── Swing (overshoot, scale=1.5) ──────────────────────────────
    case 'swingIn': {
      const s = 1.5
      return v0 + dv * (t * t * ((s + 1) * t - s))
    }
    case 'swingOut': {
      const s = 1.5, u = t - 1
      return v0 + dv * (u * u * ((s + 1) * u + s) + 1)
    }
    case 'swing': {
      const s = 3.0 // doubles scale for InOut
      const e = t <= 0.5
        ? (() => { const a = 2 * t; return a * a * ((s + 1) * a - s) / 2 })()
        : (() => { const a = 2 * t - 2; return a * a * ((s + 1) * a + s) / 2 + 1 })()
      return v0 + dv * e
    }

    // ── Smooth (smooth / smooth2 / smoother) ───────────────────────
    case 'smooth':
      return v0 + dv * (t * t * (3 - 2 * t))

    case 'smooth2': {
      const s = t * t * (3 - 2 * t)
      return v0 + dv * (s * s * (3 - 2 * s))
    }

    case 'smoother':
      return v0 + dv * (t * t * t * (t * (6 * t - 15) + 10))

    // ── Bezier ────────────────────────────────────────────────────────────
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
