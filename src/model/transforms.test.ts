import { describe, it, expect } from 'vitest'
import type { Bone, BoneTransform, Skeleton } from './types'
import { evaluateWorldTransform } from './transforms'

describe('evaluateWorldTransform', () => {
  function makeBone(
    id: string,
    parentId: string | null,
    transform: Partial<BoneTransform> = {}
  ): Bone {
    return {
      id,
      name: `Bone_${id}`,
      parentId,
      childIds: [],
      localTransform: {
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        ...transform,
      },
      bindTransform: {
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        ...transform,
      },
      visible: true,
    }
  }

  function makeSkeleton(...bones: Bone[]): Skeleton {
    const boneMap: Record<string, Bone> = {}
    const rootIds: string[] = []

    for (const bone of bones) {
      boneMap[bone.id] = bone
      if (!bone.parentId) {
        rootIds.push(bone.id)
      }
    }

    return { bones: boneMap, rootBoneIds: rootIds }
  }

  it('root bone: localTransform IS world transform (no parent math)', () => {
    const bone = makeBone('root', null, { x: 100, y: 200, rotation: Math.PI / 4, scaleX: 2, scaleY: 3 })
    const skeleton = makeSkeleton(bone)

    const result = evaluateWorldTransform('root', skeleton)

    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
    expect(result.rotation).toBeCloseTo(Math.PI / 4, 5)
    expect(result.scaleX).toBe(2)
    expect(result.scaleY).toBe(3)
  })

  it('single child: parent at (100, 0, 0 rot, 1 scale), child local (50, 0) -> world (150, 0)', () => {
    const parent = makeBone('parent', null, { x: 100, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
    const child = makeBone('child', 'parent', { x: 50, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
    const skeleton = makeSkeleton(parent, child)

    const result = evaluateWorldTransform('child', skeleton)

    expect(result.x).toBe(150)
    expect(result.y).toBe(0)
    expect(result.rotation).toBe(0)
    expect(result.scaleX).toBe(1)
    expect(result.scaleY).toBe(1)
  })

  it('rotated parent: parent at (0, 0, 90deg rotation), child local (50, 0) -> world approx (0, 50)', () => {
    const parent = makeBone('parent', null, { x: 0, y: 0, rotation: Math.PI / 2, scaleX: 1, scaleY: 1 })
    const child = makeBone('child', 'parent', { x: 50, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
    const skeleton = makeSkeleton(parent, child)

    const result = evaluateWorldTransform('child', skeleton)

    // cos(90deg) = 0, sin(90deg) = 1
    // world.x = 0 + 0 * 50 - 1 * 0 = 0
    // world.y = 0 + 1 * 50 + 0 * 0 = 50
    expect(result.x).toBeCloseTo(0, 5)
    expect(result.y).toBeCloseTo(50, 5)
    expect(result.rotation).toBeCloseTo(Math.PI / 2, 5)
  })

  it('scale propagation: parent scaleX=2, child localX=10 -> world X = parent.x + 2*10', () => {
    const parent = makeBone('parent', null, { x: 0, y: 0, rotation: 0, scaleX: 2, scaleY: 1 })
    const child = makeBone('child', 'parent', { x: 10, y: 5, rotation: 0, scaleX: 1, scaleY: 1 })
    const skeleton = makeSkeleton(parent, child)

    const result = evaluateWorldTransform('child', skeleton)

    expect(result.x).toBeCloseTo(20, 5)  // 0 + 2 * 10
    expect(result.y).toBeCloseTo(5, 5)   // 0 + 1 * 5
    expect(result.scaleX).toBe(2)
    expect(result.scaleY).toBe(1)
  })

  it('deep chain (3 bones): transforms compose correctly through all levels', () => {
    const bone1 = makeBone('bone1', null, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
    const bone2 = makeBone('bone2', 'bone1', { x: 100, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
    const bone3 = makeBone('bone3', 'bone2', { x: 0, y: 50, rotation: 0, scaleX: 1, scaleY: 1 })
    const skeleton = makeSkeleton(bone1, bone2, bone3)

    const result = evaluateWorldTransform('bone3', skeleton)

    expect(result.x).toBeCloseTo(100, 5)
    expect(result.y).toBeCloseTo(50, 5)
  })

  it('deep chain with rotation and scale', () => {
    const root = makeBone('root', null, { x: 0, y: 0, rotation: Math.PI / 4, scaleX: 2, scaleY: 2 })
    const child = makeBone('child', 'root', { x: 50, y: 0, rotation: Math.PI / 2, scaleX: 1.5, scaleY: 1 })
    const grandchild = makeBone('grandchild', 'child', { x: 20, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
    const skeleton = makeSkeleton(root, child, grandchild)

    const result = evaluateWorldTransform('grandchild', skeleton)

    // Root: (0, 0), rot 45deg, scale (2, 2)
    // Child local: (50, 0), rot 90deg, scale (1.5, 1)
    // Child world after root:
    //   cos(45) ≈ 0.707, sin(45) ≈ 0.707
    //   scaledX = 50 * 2 = 100, scaledY = 0 * 2 = 0
    //   world.x = 0 + 0.707 * 100 - 0.707 * 0 = 70.71
    //   world.y = 0 + 0.707 * 100 + 0.707 * 0 = 70.71
    //   world.rotation = 45deg + 90deg = 135deg
    //   world.scale = (2*1.5, 2*1) = (3, 2)
    //
    // Grandchild local: (20, 0)
    // After child world rotation (135deg):
    //   cos(135) ≈ -0.707, sin(135) ≈ 0.707
    //   scaledX = 20 * 3 = 60, scaledY = 0 * 2 = 0
    //   world.x = 70.71 + (-0.707) * 60 + 0.707 * 0 = 70.71 - 42.42 = 28.29
    //   world.y = 70.71 + 0.707 * 60 + 0.707 * 0 = 70.71 + 42.42 = 113.13
    //   world.rotation = 135deg + 0 = 135deg
    //   world.scale = (3, 2)

    expect(result.x).toBeCloseTo(28.29, 1)
    expect(result.y).toBeCloseTo(113.13, 1)
    expect(result.rotation).toBeCloseTo(3 * Math.PI / 4, 5)  // 135deg
    expect(result.scaleX).toBeCloseTo(3, 5)
    expect(result.scaleY).toBeCloseTo(2, 5)
  })
})

describe('Bone transform structure', () => {
  it('bone has both localTransform and bindTransform as separate fields', () => {
    const bone: Bone = {
      id: 'test-bone',
      name: 'Test Bone',
      parentId: null,
      childIds: [],
      localTransform: { x: 10, y: 20, rotation: Math.PI / 4, scaleX: 1, scaleY: 1 },
      bindTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      visible: true,
    }

    expect(bone.localTransform.x).toBe(10)
    expect(bone.bindTransform.x).toBe(0)
    expect(bone.localTransform.rotation).toBe(Math.PI / 4)
    expect(bone.bindTransform.rotation).toBe(0)
  })
})
