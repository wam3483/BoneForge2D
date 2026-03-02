import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { EditorState, Skeleton, ImageAsset, Attachment, Bone, BoneTransform } from '../model/types'
import { withUndo, applyPatches } from './undoRedo'
import type { PatchEntry } from './undoRedo'

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
  createBone: (parentId: string | null) => string
  renameBone: (boneId: string, name: string) => void
  deleteBone: (boneId: string) => void
  reparentBone: (boneId: string, newParentId: string | null) => void
  setBoneTransform: (boneId: string, transform: Partial<BoneTransform>) => void
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
  setHoveredBone: (id: string | null) => void
  setEditorMode: (mode: 'pose' | 'animate') => void
  setActiveTool: (tool: 'select' | 'move' | 'rotate' | 'scale') => void
  setSnapEnabled: (enabled: boolean) => void
  setGridVisible: (visible: boolean) => void
  setViewport: (patch: Partial<{ x: number; y: number; scale: number }>) => void
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
    hoveredBoneId: null,
    editorMode: 'pose',
    activeTool: 'select',
    snapEnabled: false,
    snapGridSize: 16,
    gridVisible: false,
    viewport: { x: 0, y: 0, scale: 1 },
    animations: [],

    // Skeleton slice actions
    createBone: (parentId: string | null) => {
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
            localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
            bindTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
            visible: true,
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

    reparentBone: (boneId: string, newParentId: string | null) => {
      const state = get()
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

    undo: () => {
      set((state) => {
        const entry: PatchEntry | undefined = state.undoStack.pop()
        if (!entry) return

        state.skeleton = applyPatches(state.skeleton as any, entry.inverse) as Skeleton
        state.redoStack.push(entry)
      })
    },

    redo: () => {
      set((state) => {
        const entry: PatchEntry | undefined = state.redoStack.pop()
        if (!entry) return

        state.skeleton = applyPatches(state.skeleton as any, entry.forward) as Skeleton
        state.undoStack.push(entry)
      })
    },

    restoreSession: (doc: { skeleton: Skeleton; imageAssets: Record<string, ImageAsset>; attachments: Record<string, Attachment> }) => {
      set((state) => {
        state.skeleton = doc.skeleton
        state.imageAssets = doc.imageAssets
        state.attachments = doc.attachments
        state.undoStack = []
        state.redoStack = []
      })
    },

    // Editor slice actions
    setSelectedBone: (id: string | null) => {
      set((state) => {
        state.selectedBoneId = id
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

    setActiveTool: (tool: 'select' | 'move' | 'rotate' | 'scale') => {
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
  }))
)
