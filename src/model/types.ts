export type EditorMode = 'pose' | 'animate'

export interface BoneTransform {
  x: number
  y: number
  rotation: number  // radians, positive = clockwise (PixiJS convention)
  scaleX: number
  scaleY: number
}

export interface Bone {
  id: string                   // crypto.randomUUID()
  name: string                 // mutable display name
  parentId: string | null      // null for root bones
  childIds: string[]           // ordered list of child IDs
  localTransform: BoneTransform  // ONLY stored transform — local space (relative to parent)
  bindTransform: BoneTransform   // rest pose — separate field, immutable once animations exist
  visible: boolean
}

export interface Skeleton {
  bones: Record<string, Bone>  // keyed by bone.id
  rootBoneIds: string[]        // top-level bones (parentId === null), ordered
}

export interface ImageAsset {
  id: string
  name: string
  dataUrl: string       // for display in sidebar thumbnails
  width: number
  height: number
  // ArrayBuffer stored separately in IndexedDB, not in Zustand
}

export interface Attachment {
  id: string
  imageId: string
  boneId: string
  offsetX: number     // pixels, offset from bone origin
  offsetY: number
  pivotX: number      // normalized 0–1, default 0.5
  pivotY: number      // normalized 0–1, default 0.5
  zOrder: number      // draw order; higher renders on top
}

export interface EditorState {
  // Document state (all mutations go through undo/redo)
  skeleton: Skeleton
  imageAssets: Record<string, ImageAsset>
  attachments: Record<string, Attachment>
  // Undo/redo stacks (Immer patches)
  undoStack: Array<{ inverse: import('immer').Patch[]; forward: import('immer').Patch[] }>
  redoStack: Array<{ inverse: import('immer').Patch[]; forward: import('immer').Patch[] }>
  // View state (NOT in undo stack)
  selectedBoneId: string | null
  hoveredBoneId: string | null
  editorMode: EditorMode
  activeTool: 'select' | 'move' | 'rotate' | 'scale'
  snapEnabled: boolean
  snapGridSize: number    // pixels, default 16
  gridVisible: boolean
  viewport: { x: number; y: number; scale: number }
  // Phase 2 forward-compat slot (empty in Phase 1)
  animations: unknown[]
}
