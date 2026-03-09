import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { EditorState, Skeleton, ImageAsset, Attachment, Bone, BoneTransform, Project, Animation, AnimatedProperty, Keyframe } from '../model/types'
import { withUndo, applyPatches } from './undoRedo'
import { evaluateWorldTransform, evaluateBindWorldTransform, worldToLocal } from '../model/transforms'
import type { PatchEntry } from './undoRedo'
import * as idb from '../persistence/indexeddb'

// Import undoRedo to ensure enablePatches() is called before store creation
import './undoRedo'

const initialSkeleton = (): Skeleton => ({ bones: {}, rootBoneIds: [] })

// Helper to count existing bones for naming
function getNextBoneName(bones: Record<string, Bone>): string {
  let max = 0
  for (const bone of Object.values(bones)) {
    const match = bone.name.match(/^Bone_(\d+)$/)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > max) max = num
    }
  }
  return `Bone_${max + 1}`
}

export type EditorStore = EditorState & {
  // Skeleton actions
  createBone: (parentId: string | null, length?: number, initialTransform?: Partial<BoneTransform>) => string
  renameBone: (boneId: string, name: string) => void
  deleteBone: (boneId: string) => void
  deleteBoneSubtree: (boneId: string) => void
  reparentBone: (boneId: string, newParentId: string | null) => void
  setBoneTransform: (boneId: string, transform: Partial<BoneTransform>) => void
  setBoneTransformSilent: (boneId: string, transform: Partial<BoneTransform>) => void
  commitTransformDrag: (boneId: string, preDragSkeleton: Skeleton) => void
  commitMultiTransformDrag: (boneIds: string[], preDragSkeleton: Skeleton) => void
  commitBoneDrop: (boneId: string, newParentId: string | null, newLocalTransform: Partial<BoneTransform>, preDragSkeleton: Skeleton) => void
  setBoneLength: (boneId: string, length: number) => void
  setBoneColor: (boneId: string, color: string, colorAlpha: number) => void
  setBoneVisibility: (boneId: string, visible: boolean) => void
  importImage: (asset: ImageAsset) => void
  attachImage: (attachment: Attachment) => void
  detachImage: (attachmentId: string) => void
  updateAttachment: (attachmentId: string, patch: Partial<Attachment>) => void
  undo: () => void
  redo: () => void
  restoreSession: (doc: { skeleton: Skeleton; imageAssets: Record<string, ImageAsset>; attachments: Record<string, Attachment> }) => void

  // Editor actions
  setSelectedBone: (id: string | null) => void
  setPrimarySelectedBone: (id: string) => void
  toggleBoneSelection: (id: string) => void
  addBonesToSelection: (ids: string[]) => void
  setHoveredBone: (id: string | null) => void
  setEditorMode: (mode: 'pose' | 'animate') => void
  setActiveTool: (tool: 'select' | 'rotate' | 'scale') => void
  setSnapEnabled: (enabled: boolean) => void
  setGridVisible: (visible: boolean) => void
  setViewport: (patch: Partial<{ x: number; y: number; scale: number }>) => void

  // Project actions
  newProject: (name: string) => Promise<void>
  loadProject: (project: Project) => Promise<void>
  saveCurrentProject: () => Promise<void>
  deleteProject: (projectId: string) => Promise<void>
  renameProject: (projectId: string, name: string) => Promise<void>
  setProjectId: (projectId: string | null) => void

  // Animation document actions (undo/redo)
  createAnimation: (name: string, duration: number) => string
  deleteAnimation: (animationId: string) => void
  updateAnimation: (animationId: string, patch: { name?: string; duration?: number; loop?: boolean }) => void
  addKeyframe: (animationId: string, boneId: string, property: AnimatedProperty, keyframe: Omit<Keyframe, 'time'>) => void
  updateKeyframe: (animationId: string, boneId: string, property: AnimatedProperty, keyframeIndex: number, patch: Partial<Omit<Keyframe, 'time'>>) => void
  deleteKeyframe: (animationId: string, boneId: string, property: AnimatedProperty, keyframeIndex: number) => void

  // Animation playback state (no undo)
  setCurrentAnimation: (animationId: string | null) => void
  setPlaybackTime: (time: number) => void
  togglePlayback: () => void
  setPlaybackState: (playing: boolean, time: number) => void

  // Clipboard actions
  copyBones: () => void
  pasteBones: () => void
}

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    // Initial document state
    skeleton: initialSkeleton(),
    imageAssets: {},
    attachments: {},
    undoStack: [],
    redoStack: [],

    // Initial view state
    selectedBoneId: null,
    selectedBoneIds: [],
    hoveredBoneId: null,
    editorMode: 'pose',
    activeTool: 'select',
    snapEnabled: false,
    snapGridSize: 16,
    gridVisible: true,
    viewport: { x: 0, y: 0, scale: 1 },
    currentProjectId: null,
    currentProjectName: null,
    clipboard: null,
    currentAnimationId: null,
    currentTime: 0,
    isPlaying: false,
    animations: {},

    // Skeleton slice actions
    createBone: (parentId: string | null, length = 60, initialTransform?: Partial<BoneTransform>) => {
      const boneId = crypto.randomUUID()
      const state = get()
      const boneName = getNextBoneName(state.skeleton.bones)

      const { next: newSkeleton, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.skeleton,
        (draft: Skeleton) => {
          const newBone: Bone = {
            id: boneId,
            name: boneName,
            parentId,
            childIds: [],
            length,
            localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...initialTransform },
            bindTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...initialTransform },
            visible: true,
            color: '#7c3aed',
            colorAlpha: 0.85,
          }

          draft.bones[boneId] = newBone

          if (parentId) {
            const parent = draft.bones[parentId]
            if (parent) {
              parent.childIds.push(boneId)
            }
          } else {
            draft.rootBoneIds.push(boneId)
          }
        },
        state.undoStack,
        state.redoStack
      )

      set((state) => {
        state.skeleton = newSkeleton
        state.undoStack = newUndo
        state.redoStack = newRedo
      })

      return boneId
    },

    renameBone: (boneId: string, name: string) => {
      const state = get()
      const { next: newSkeleton, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.skeleton,
        (draft: Skeleton) => {
          const bone = draft.bones[boneId]
          if (bone) {
            bone.name = name
          }
        },
        state.undoStack,
        state.redoStack
      )

      set((state) => {
        state.skeleton = newSkeleton
        state.undoStack = newUndo
        state.redoStack = newRedo
      })
    },

    deleteBone: (boneId: string) => {
      const state = get()
      const { next: newSkeleton, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.skeleton,
        (draft: Skeleton) => {
          const bone = draft.bones[boneId]
          if (!bone) return

          // Re-parent children to the deleted bone's parent
          const grandChildren = [...bone.childIds]
          for (const childId of grandChildren) {
            const child = draft.bones[childId]
            if (child) {
              child.parentId = bone.parentId
              // Update parent's childIds
              if (bone.parentId) {
                const oldParent = draft.bones[bone.parentId]
                if (oldParent) {
                  const idx = oldParent.childIds.indexOf(boneId)
                  if (idx >= 0) oldParent.childIds.splice(idx, 1)
                  oldParent.childIds.push(childId)
                }
              } else {
                const rootIdx = draft.rootBoneIds.indexOf(boneId)
                if (rootIdx >= 0) draft.rootBoneIds.splice(rootIdx, 1)
                draft.rootBoneIds.push(childId)
              }
            }
          }

          // Remove from parent's childIds
          if (bone.parentId) {
            const parent = draft.bones[bone.parentId]
            if (parent) {
              const idx = parent.childIds.indexOf(boneId)
              if (idx >= 0) parent.childIds.splice(idx, 1)
            }
          }

          // Remove from rootBoneIds if it's a root
          const rootIdx = draft.rootBoneIds.indexOf(boneId)
          if (rootIdx >= 0) draft.rootBoneIds.splice(rootIdx, 1)

          // Delete the bone
          delete draft.bones[boneId]
        },
        state.undoStack,
        state.redoStack
      )

      set((state) => {
        state.skeleton = newSkeleton
        state.undoStack = newUndo
        state.redoStack = newRedo
      })
    },

    deleteBoneSubtree: (boneId: string) => {
      const state = get()
      const { next: newSkeleton, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.skeleton,
        (draft: Skeleton) => {
          const bone = draft.bones[boneId]
          if (!bone) return

          // Collect the full subtree (BFS)
          const toDelete = new Set<string>()
          const queue = [boneId]
          while (queue.length > 0) {
            const id = queue.pop()!
            toDelete.add(id)
            const b = draft.bones[id]
            if (b) queue.push(...b.childIds)
          }

          // Detach root of subtree from its parent / rootBoneIds
          if (bone.parentId) {
            const parent = draft.bones[bone.parentId]
            if (parent) {
              parent.childIds = parent.childIds.filter(id => id !== boneId)
            }
          } else {
            draft.rootBoneIds = draft.rootBoneIds.filter(id => id !== boneId)
          }

          // Delete every bone in the subtree
          for (const id of toDelete) {
            delete draft.bones[id]
          }
        },
        state.undoStack,
        state.redoStack
      )

      set((state) => {
        state.skeleton = newSkeleton
        state.undoStack = newUndo
        state.redoStack = newRedo
      })
    },

    reparentBone: (boneId: string, newParentId: string | null) => {
      const state = get()

      // Compute world transforms before any mutation so we can preserve visual position
      const boneWorldLocal = evaluateWorldTransform(boneId, state.skeleton)
      const boneWorldBind  = evaluateBindWorldTransform(boneId, state.skeleton)

      const newLocalTransform = newParentId
        ? worldToLocal(boneWorldLocal, evaluateWorldTransform(newParentId, state.skeleton))
        : { ...boneWorldLocal }
      const newBindTransform = newParentId
        ? worldToLocal(boneWorldBind, evaluateBindWorldTransform(newParentId, state.skeleton))
        : { ...boneWorldBind }

      const { next: newSkeleton, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.skeleton,
        (draft: Skeleton) => {
          const bone = draft.bones[boneId]
          if (!bone) return

          const oldParentId = bone.parentId

          // Remove from old parent's childIds or rootBoneIds
          if (oldParentId) {
            const oldParent = draft.bones[oldParentId]
            if (oldParent) {
              const idx = oldParent.childIds.indexOf(boneId)
              if (idx >= 0) oldParent.childIds.splice(idx, 1)
            }
          } else {
            const rootIdx = draft.rootBoneIds.indexOf(boneId)
            if (rootIdx >= 0) draft.rootBoneIds.splice(rootIdx, 1)
          }

          // Recompute local transforms so the bone stays in the same world position
          bone.localTransform = newLocalTransform
          bone.bindTransform  = newBindTransform

          // Set new parent
          bone.parentId = newParentId

          // Add to new parent's childIds or rootBoneIds
          if (newParentId) {
            const newParent = draft.bones[newParentId]
            if (newParent) {
              newParent.childIds.push(boneId)
            }
          } else {
            draft.rootBoneIds.push(boneId)
          }
        },
        state.undoStack,
        state.redoStack
      )

      set((state) => {
        state.skeleton = newSkeleton
        state.undoStack = newUndo
        state.redoStack = newRedo
      })
    },

    setBoneTransform: (boneId: string, transform: Partial<BoneTransform>) => {
      const state = get()
      const { next: newSkeleton, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.skeleton,
        (draft: Skeleton) => {
          const bone = draft.bones[boneId]
          if (!bone) return

          // Merge into localTransform
          Object.assign(bone.localTransform, transform)

          // Update bindTransform when in pose mode
          if (state.editorMode === 'pose') {
            Object.assign(bone.bindTransform, transform)
          }
        },
        state.undoStack,
        state.redoStack
      )

      set((state) => {
        state.skeleton = newSkeleton
        state.undoStack = newUndo
        state.redoStack = newRedo
      })
    },

    // Live update during drag — no undo entry pushed
    setBoneTransformSilent: (boneId: string, transform: Partial<BoneTransform>) => {
      set((state) => {
        const bone = state.skeleton.bones[boneId]
        if (!bone) return
        Object.assign(bone.localTransform, transform)
        if (state.editorMode === 'pose') {
          Object.assign(bone.bindTransform, transform)
        }
      })
    },

    // Commit any transform drag as a single undo entry using a pre-drag skeleton snapshot.
    // Handles x/y (bone drag), rotation (rotate gizmo), and scaleX/scaleY (scale gizmo).
    commitTransformDrag: (boneId: string, preDragSkeleton: Skeleton) => {
      const state = get()
      const currentBone = state.skeleton.bones[boneId]
      if (!currentBone) return

      const final = currentBone.localTransform
      const preDragBone = preDragSkeleton.bones[boneId]

      // Skip if nothing changed (click without drag)
      if (preDragBone) {
        const p = preDragBone.localTransform
        if (p.x === final.x && p.y === final.y && p.rotation === final.rotation &&
            p.scaleX === final.scaleX && p.scaleY === final.scaleY) {
          return
        }
      }

      const finalTransform = { ...final }
      const editorMode = state.editorMode
      const { next, undoStack: newUndo, redoStack: newRedo } = withUndo(
        preDragSkeleton,
        (draft: Skeleton) => {
          const bone = draft.bones[boneId]
          if (bone) {
            Object.assign(bone.localTransform, finalTransform)
            if (editorMode === 'pose') {
              Object.assign(bone.bindTransform, finalTransform)
            }
          }
        },
        state.undoStack,
        state.redoStack
      )

      set((state) => {
        state.skeleton = next
        state.undoStack = newUndo
        state.redoStack = newRedo
      })
    },

    commitMultiTransformDrag: (boneIds: string[], preDragSkeleton: Skeleton) => {
      const state = get()
      const editorMode = state.editorMode
      const finalTransforms: Record<string, BoneTransform> = {}
      let anyChanged = false
      for (const boneId of boneIds) {
        const currentBone = state.skeleton.bones[boneId]
        if (!currentBone) continue
        const preBone = preDragSkeleton.bones[boneId]
        if (preBone) {
          const p = preBone.localTransform
          const f = currentBone.localTransform
          if (p.x !== f.x || p.y !== f.y || p.rotation !== f.rotation || p.scaleX !== f.scaleX || p.scaleY !== f.scaleY) {
            anyChanged = true
          }
        }
        finalTransforms[boneId] = { ...currentBone.localTransform }
      }
      if (!anyChanged) return
      const { next, undoStack: newUndo, redoStack: newRedo } = withUndo(
        preDragSkeleton,
        (draft: Skeleton) => {
          for (const [boneId, transform] of Object.entries(finalTransforms)) {
            const bone = draft.bones[boneId]
            if (bone) {
              Object.assign(bone.localTransform, transform)
              if (editorMode === 'pose') {
                Object.assign(bone.bindTransform, transform)
              }
            }
          }
        },
        state.undoStack,
        state.redoStack
      )
      set((state) => {
        state.skeleton = next
        state.undoStack = newUndo
        state.redoStack = newRedo
      })
    },

    setBoneLength: (boneId: string, length: number) => {
      const state = get()
      const { next: newSkeleton, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.skeleton,
        (draft: Skeleton) => {
          const bone = draft.bones[boneId]
          if (bone) {
            bone.length = Math.max(0, length)
          }
        },
        state.undoStack,
        state.redoStack
      )

      set((state) => {
        state.skeleton = newSkeleton
        state.undoStack = newUndo
        state.redoStack = newRedo
      })
    },

    setBoneColor: (boneId: string, color: string, colorAlpha: number) => {
      const state = get()
      const { next: newSkeleton, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.skeleton,
        (draft: Skeleton) => {
          const bone = draft.bones[boneId]
          if (bone) {
            bone.color = color
            bone.colorAlpha = Math.max(0, Math.min(1, colorAlpha))
          }
        },
        state.undoStack,
        state.redoStack
      )

      set((state) => {
        state.skeleton = newSkeleton
        state.undoStack = newUndo
        state.redoStack = newRedo
      })
    },

    setBoneVisibility: (boneId: string, visible: boolean) => {
      const state = get()
      const { next: newSkeleton, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.skeleton,
        (draft: Skeleton) => {
          const bone = draft.bones[boneId]
          if (bone) {
            bone.visible = visible
          }
        },
        state.undoStack,
        state.redoStack
      )

      set((state) => {
        state.skeleton = newSkeleton
        state.undoStack = newUndo
        state.redoStack = newRedo
      })
    },

    importImage: (asset: ImageAsset) => {
      const state = get()
      const { next: newImageAssets, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.imageAssets,
        (draft: Record<string, ImageAsset>) => {
          draft[asset.id] = asset
        },
        state.undoStack,
        state.redoStack
      )

      set((state) => {
        state.imageAssets = newImageAssets
        state.undoStack = newUndo
        state.redoStack = newRedo
      })
    },

    attachImage: (attachment: Attachment) => {
      const state = get()
      const { next: newAttachments, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.attachments,
        (draft: Record<string, Attachment>) => {
          draft[attachment.id] = attachment
        },
        state.undoStack,
        state.redoStack
      )

      set((state) => {
        state.attachments = newAttachments
        state.undoStack = newUndo
        state.redoStack = newRedo
      })
    },

    detachImage: (attachmentId: string) => {
      const state = get()
      const { next: newAttachments, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.attachments,
        (draft: Record<string, Attachment>) => {
          delete draft[attachmentId]
        },
        state.undoStack,
        state.redoStack
      )

      set((state) => {
        state.attachments = newAttachments
        state.undoStack = newUndo
        state.redoStack = newRedo
      })
    },

    updateAttachment: (attachmentId: string, patch: Partial<Attachment>) => {
      const state = get()
      const { next: newAttachments, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.attachments,
        (draft: Record<string, Attachment>) => {
          const attachment = draft[attachmentId]
          if (attachment) {
            Object.assign(attachment, patch)
          }
        },
        state.undoStack,
        state.redoStack
      )

      set((state) => {
        state.attachments = newAttachments
        state.undoStack = newUndo
        state.redoStack = newRedo
      })
    },

    commitBoneDrop: (boneId: string, newParentId: string | null, newLocalTransform: Partial<BoneTransform>, preDragSkeleton: Skeleton) => {
      const state = get()
      const editorMode = state.editorMode
      const { next, undoStack: newUndo, redoStack: newRedo } = withUndo(
        preDragSkeleton,
        (draft: Skeleton) => {
          const bone = draft.bones[boneId]
          if (!bone) return
          const oldParentId = bone.parentId
          // Remove from old parent
          if (oldParentId) {
            const oldParent = draft.bones[oldParentId]
            if (oldParent) {
              const idx = oldParent.childIds.indexOf(boneId)
              if (idx >= 0) oldParent.childIds.splice(idx, 1)
            }
          } else {
            const idx = draft.rootBoneIds.indexOf(boneId)
            if (idx >= 0) draft.rootBoneIds.splice(idx, 1)
          }
          // Update bone
          bone.parentId = newParentId
          Object.assign(bone.localTransform, newLocalTransform)
          if (editorMode === 'pose') Object.assign(bone.bindTransform, newLocalTransform)
          // Add to new parent
          if (newParentId) {
            const newParent = draft.bones[newParentId]
            if (newParent) newParent.childIds.push(boneId)
          } else {
            draft.rootBoneIds.push(boneId)
          }
        },
        state.undoStack,
        state.redoStack
      )
      set((s) => { s.skeleton = next; s.undoStack = newUndo; s.redoStack = newRedo })
    },

    undo: () => {
      set((state) => {
        const entry: PatchEntry | undefined = state.undoStack.pop()
        if (!entry) return

        if ((entry.slice ?? 'skeleton') === 'animations') {
          state.animations = applyPatches(state.animations as any, entry.inverse) as Record<string, Animation>
        } else {
          state.skeleton = applyPatches(state.skeleton as any, entry.inverse) as Skeleton
        }
        state.redoStack.push(entry)
      })
    },

    redo: () => {
      set((state) => {
        const entry: PatchEntry | undefined = state.redoStack.pop()
        if (!entry) return

        if ((entry.slice ?? 'skeleton') === 'animations') {
          state.animations = applyPatches(state.animations as any, entry.forward) as Record<string, Animation>
        } else {
          state.skeleton = applyPatches(state.skeleton as any, entry.forward) as Skeleton
        }
        state.undoStack.push(entry)
      })
    },

    restoreSession: (doc: { skeleton: Skeleton; imageAssets: Record<string, ImageAsset>; attachments: Record<string, Attachment>; animations?: Record<string, Animation> }) => {
      set((state) => {
        state.skeleton = doc.skeleton
        state.imageAssets = doc.imageAssets
        state.attachments = doc.attachments
        state.animations = doc.animations ?? {}
        state.undoStack = []
        state.redoStack = []
      })
    },

    // Editor slice actions
    setSelectedBone: (id: string | null) => {
      set((state) => {
        state.selectedBoneId = id
        state.selectedBoneIds = id ? [id] : []
      })
    },

    // Updates the primary selected bone without clearing the multi-selection.
    // Use when clicking an already-selected bone to start a multi-drag.
    setPrimarySelectedBone: (id: string) => {
      set((state) => {
        state.selectedBoneId = id
      })
    },

    toggleBoneSelection: (id: string) => {
      set((state) => {
        const idx = state.selectedBoneIds.indexOf(id)
        if (idx === -1) {
          state.selectedBoneIds.push(id)
          state.selectedBoneId = id  // last toggled becomes primary
        } else {
          state.selectedBoneIds.splice(idx, 1)
          // primary becomes last remaining, or null
          state.selectedBoneId = state.selectedBoneIds[state.selectedBoneIds.length - 1] ?? null
        }
      })
    },

    addBonesToSelection: (ids: string[]) => {
      set((state) => {
        const existing = new Set(state.selectedBoneIds)
        for (const id of ids) {
          if (!existing.has(id)) state.selectedBoneIds.push(id)
        }
        if (ids.length > 0) {
          state.selectedBoneId = state.selectedBoneIds[state.selectedBoneIds.length - 1] ?? null
        }
      })
    },

    setHoveredBone: (id: string | null) => {
      set((state) => {
        state.hoveredBoneId = id
      })
    },

    setEditorMode: (mode: 'pose' | 'animate') => {
      set((state) => {
        state.editorMode = mode
      })
    },

    setActiveTool: (tool: 'select' | 'rotate' | 'scale') => {
      set((state) => {
        state.activeTool = tool
      })
    },

    setSnapEnabled: (enabled: boolean) => {
      set((state) => {
        state.snapEnabled = enabled
      })
    },

    setGridVisible: (visible: boolean) => {
      set((state) => {
        state.gridVisible = visible
      })
    },

    setViewport: (patch: Partial<{ x: number; y: number; scale: number }>) => {
      set((state) => {
        Object.assign(state.viewport, patch)
      })
    },

    // Project actions
    setProjectId: (projectId: string | null) => {
      set((state) => {
        state.currentProjectId = projectId
      })
    },

    newProject: async (name: string) => {
      const project = await idb.createProject(name)
      set((state) => {
        state.currentProjectId = project.id
        state.currentProjectName = project.name
        state.skeleton = initialSkeleton()
        state.imageAssets = {}
        state.attachments = {}
        state.animations = {}
        state.undoStack = []
        state.redoStack = []
        state.selectedBoneId = null
        state.selectedBoneIds = []
        state.hoveredBoneId = null
        state.viewport = { x: 0, y: 0, scale: 1 }
        state.currentAnimationId = null
        state.currentTime = 0
        state.isPlaying = false
      })
    },

    loadProject: async (project: Project) => {
      const data = await idb.loadProjectData(project.id)
      if (data) {
        set((state) => {
          state.currentProjectId = project.id
          state.currentProjectName = project.name
          state.skeleton = data.skeleton as Skeleton
          state.imageAssets = data.imageAssets as Record<string, ImageAsset>
          state.attachments = data.attachments as Record<string, Attachment>
          state.animations = (data.animations ?? {}) as Record<string, Animation>
          state.undoStack = []
          state.redoStack = []
          state.selectedBoneId = null
          state.selectedBoneIds = []
          state.hoveredBoneId = null
          state.currentAnimationId = null
          state.currentTime = 0
          state.isPlaying = false
        })
      }
    },

    saveCurrentProject: async () => {
      const state = get()
      if (!state.currentProjectId) return
      await idb.saveProjectData(state.currentProjectId, {
        skeleton: state.skeleton,
        imageAssets: state.imageAssets,
        attachments: state.attachments,
        animations: state.animations,
      })
    },

    deleteProject: async (projectId: string) => {
      await idb.deleteProject(projectId)
      // Also delete associated image buffers
      const project = await idb.getProject(projectId)
      if (project) {
        const imageIds = Object.keys((await idb.loadProjectData(projectId))?.imageAssets || {})
        await idb.deleteImageBuffers(imageIds)
      }
      set((state) => {
        if (state.currentProjectId === projectId) {
          state.currentProjectId = null
          state.currentProjectName = null
          state.skeleton = initialSkeleton()
          state.imageAssets = {}
          state.attachments = {}
          state.undoStack = []
          state.redoStack = []
          state.selectedBoneId = null
          state.selectedBoneIds = []
          state.hoveredBoneId = null
        }
      })
    },

    renameProject: async (projectId: string, name: string) => {
      await idb.updateProject(projectId, { name })
      // Update currentProjectName if renaming the current project
      const state = get()
      if (state.currentProjectId === projectId) {
        set((state) => {
          state.currentProjectName = name
        })
      }
    },

    copyBones: () => {
      const state = get()
      const selectedId = state.selectedBoneId
      if (!selectedId) return

      // Collect the bone and all its descendants
      const bonesToCopy: Bone[] = []
      const queue = [state.skeleton.bones[selectedId]]
      const idMap: Record<string, string> = {}

      while (queue.length > 0) {
        const bone = queue.shift()!
        if (!bone) continue
        bonesToCopy.push(bone)
        idMap[bone.id] = bone.id

        // Add children to queue
        for (const childId of bone.childIds) {
          queue.push(state.skeleton.bones[childId])
        }
      }

      set((state) => {
        state.clipboard = {
          bones: bonesToCopy.map(b => ({
            id: b.id,
            name: b.name,
            parentId: b.parentId,
            childIds: b.childIds,
            length: b.length,
            localTransform: b.localTransform,
            bindTransform: b.bindTransform,
            visible: b.visible,
            color: b.color ?? '#7c3aed',
            colorAlpha: b.colorAlpha ?? 0.85,
          })),
          idMap,
        }
      })
    },

    // --- Animation document actions ---

    createAnimation: (name: string, duration: number) => {
      const animId = crypto.randomUUID()
      const state = get()
      const { next: newAnimations, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.animations,
        (draft: Record<string, Animation>) => {
          draft[animId] = { id: animId, name, duration, loop: true, channels: [] }
        },
        state.undoStack,
        state.redoStack,
        'animations'
      )
      set((s) => {
        s.animations = newAnimations
        s.undoStack = newUndo
        s.redoStack = newRedo
        s.currentAnimationId = animId
        s.currentTime = 0
        s.isPlaying = false
      })
      return animId
    },

    deleteAnimation: (animationId: string) => {
      const state = get()
      const { next: newAnimations, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.animations,
        (draft: Record<string, Animation>) => {
          delete draft[animationId]
        },
        state.undoStack,
        state.redoStack,
        'animations'
      )
      set((s) => {
        s.animations = newAnimations
        s.undoStack = newUndo
        s.redoStack = newRedo
        if (s.currentAnimationId === animationId) {
          const remaining = Object.keys(newAnimations)
          s.currentAnimationId = remaining[0] ?? null
          s.currentTime = 0
          s.isPlaying = false
        }
      })
    },

    updateAnimation: (animationId: string, patch: { name?: string; duration?: number; loop?: boolean }) => {
      const state = get()
      const { next: newAnimations, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.animations,
        (draft: Record<string, Animation>) => {
          const anim = draft[animationId]
          if (anim) Object.assign(anim, patch)
        },
        state.undoStack,
        state.redoStack,
        'animations'
      )
      set((s) => {
        s.animations = newAnimations
        s.undoStack = newUndo
        s.redoStack = newRedo
      })
    },

    addKeyframe: (animationId: string, boneId: string, property: AnimatedProperty, keyframe: Omit<Keyframe, 'time'>) => {
      const state = get()
      const time = state.currentTime
      const { next: newAnimations, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.animations,
        (draft: Record<string, Animation>) => {
          const anim = draft[animationId]
          if (!anim) return

          let channel = anim.channels.find(c => c.boneId === boneId && c.property === property)
          if (!channel) {
            channel = { boneId, property, keyframes: [] }
            anim.channels.push(channel)
          }

          const existingIdx = channel.keyframes.findIndex(kf => kf.time === time)
          const newKf = { time, ...keyframe }
          if (existingIdx >= 0) {
            channel.keyframes[existingIdx] = newKf
          } else {
            const insertIdx = channel.keyframes.findIndex(kf => kf.time > time)
            if (insertIdx === -1) {
              channel.keyframes.push(newKf)
            } else {
              channel.keyframes.splice(insertIdx, 0, newKf)
            }
          }
        },
        state.undoStack,
        state.redoStack,
        'animations'
      )
      set((s) => {
        s.animations = newAnimations
        s.undoStack = newUndo
        s.redoStack = newRedo
      })
    },

    updateKeyframe: (animationId: string, boneId: string, property: AnimatedProperty, keyframeIndex: number, patch: Partial<Omit<Keyframe, 'time'>>) => {
      const state = get()
      const { next: newAnimations, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.animations,
        (draft: Record<string, Animation>) => {
          const anim = draft[animationId]
          if (!anim) return
          const channel = anim.channels.find(c => c.boneId === boneId && c.property === property)
          if (!channel) return
          const kf = channel.keyframes[keyframeIndex]
          if (kf) Object.assign(kf, patch)
        },
        state.undoStack,
        state.redoStack,
        'animations'
      )
      set((s) => {
        s.animations = newAnimations
        s.undoStack = newUndo
        s.redoStack = newRedo
      })
    },

    deleteKeyframe: (animationId: string, boneId: string, property: AnimatedProperty, keyframeIndex: number) => {
      const state = get()
      const { next: newAnimations, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.animations,
        (draft: Record<string, Animation>) => {
          const anim = draft[animationId]
          if (!anim) return
          const channelIdx = anim.channels.findIndex(c => c.boneId === boneId && c.property === property)
          if (channelIdx === -1) return
          const channel = anim.channels[channelIdx]
          channel.keyframes.splice(keyframeIndex, 1)
          if (channel.keyframes.length === 0) {
            anim.channels.splice(channelIdx, 1)
          }
        },
        state.undoStack,
        state.redoStack,
        'animations'
      )
      set((s) => {
        s.animations = newAnimations
        s.undoStack = newUndo
        s.redoStack = newRedo
      })
    },

    // --- Animation playback state (no undo) ---

    setCurrentAnimation: (animationId: string | null) => {
      set((s) => {
        s.currentAnimationId = animationId
        s.currentTime = 0
        s.isPlaying = false
      })
    },

    setPlaybackTime: (time: number) => {
      set((s) => { s.currentTime = time })
    },

    togglePlayback: () => {
      set((s) => { s.isPlaying = !s.isPlaying })
    },

    setPlaybackState: (playing: boolean, time: number) => {
      set((s) => { s.isPlaying = playing; s.currentTime = time })
    },

    pasteBones: () => {
      const state = get()
      const clipboard = state.clipboard
      if (!clipboard || clipboard.bones.length === 0) return

      // Generate new IDs and create mapping
      const newIdMap: Record<string, string> = {}
      clipboard.bones.forEach(bone => {
        newIdMap[bone.id] = crypto.randomUUID()
      })

      // Determine paste offset - paste at viewport center or offset from original
      // For now, offset by 20 pixels from original positions
      const pasteOffsetX = 20
      const pasteOffsetY = 20

      const { next: newSkeleton, undoStack: newUndo, redoStack: newRedo } = withUndo(
        state.skeleton,
        (draft: Skeleton) => {
          // Add all bones with new IDs
          clipboard.bones.forEach(bone => {
            const newId = newIdMap[bone.id]

            // Determine new parent ID
            let newParentId = bone.parentId
            if (bone.parentId) {
              // If parent is in the clipboard, use its new ID
              newParentId = clipboard.idMap[bone.parentId] ? newIdMap[bone.parentId] : bone.parentId
            }

            // Create new bone
            const newBone: Bone = {
              id: newId,
              name: bone.name,  // Keep original name for now
              parentId: newParentId,
              childIds: bone.childIds.map(childId => newIdMap[childId]),
              length: bone.length,
              localTransform: {
                x: bone.localTransform.x + pasteOffsetX,
                y: bone.localTransform.y + pasteOffsetY,
                rotation: bone.localTransform.rotation,
                scaleX: bone.localTransform.scaleX,
                scaleY: bone.localTransform.scaleY,
              },
              bindTransform: {
                x: bone.bindTransform.x + pasteOffsetX,
                y: bone.bindTransform.y + pasteOffsetY,
                rotation: bone.bindTransform.rotation,
                scaleX: bone.bindTransform.scaleX,
                scaleY: bone.bindTransform.scaleY,
              },
              visible: bone.visible,
              color: bone.color ?? '#7c3aed',
              colorAlpha: bone.colorAlpha ?? 0.85,
            }

            draft.bones[newId] = newBone

            // Update parent's childIds if parent exists (and parent is NOT in clipboard)
            if (newParentId && bone.parentId && !clipboard.idMap[bone.parentId]) {
              const parent = draft.bones[newParentId]
              if (parent) {
                parent.childIds.push(newId)
              }
            }

            // Add to rootBoneIds if it's a root bone
            if (!newParentId) {
              draft.rootBoneIds.push(newId)
            }
          })
        },
        state.undoStack,
        state.redoStack
      )

      set((state) => {
        state.skeleton = newSkeleton
        state.undoStack = newUndo
        state.redoStack = newRedo
        // Select the first pasted bone (the root of the copied hierarchy)
        if (clipboard.bones.length > 0) {
          const rootBone = clipboard.bones.find(b => !b.parentId)
          if (rootBone) {
            state.selectedBoneId = newIdMap[rootBone.id]
          }
        }
      })
    },
  }))
)
