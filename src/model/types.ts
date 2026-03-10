export type EditorMode = 'pose' | 'animate'

export interface Project {
  id: string
  name: string
  lastModified: number  // timestamp
  thumbnail?: string     // base64 image of the viewport
}

export interface AppMetadata {
  lastProjectId: string | null
}

export interface GridSettings {
  gridSize: number           // pixels between major grid lines
  minorLines: number        // minor lines between major lines (0 = none)
  color: string             // hex color for minor lines
  colorAlpha: number        // 0-1, minor line alpha
  majorColor: string        // hex color for major lines
  majorColorAlpha: number   // 0-1, major line alpha
}

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
  length: number               // visual length in local units; owned by the bone, not derived from children
  localTransform: BoneTransform  // ONLY stored transform — local space (relative to parent)
  bindTransform: BoneTransform   // rest pose — separate field, immutable once animations exist
  visible: boolean
  color: string                // hex fill color, e.g. '#7c3aed'
  colorAlpha: number           // 0–1 fill opacity
}

export interface Skeleton {
  bones: Record<string, Bone>  // keyed by bone.id
  rootBoneIds: string[]        // top-level bones (parentId === null), ordered
}

export type BoneClipboard = {
  bones: Array<{
    id: string
    name: string
    parentId: string | null
    childIds: string[]
    length: number
    localTransform: BoneTransform
    bindTransform: BoneTransform
    visible: boolean
    color: string
    colorAlpha: number
  }>
  idMap: Record<string, string>  // Maps old IDs to new IDs for pasting
} | null

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


// --- Animation types ---

export type InterpolationType =
  | 'constant'   // hold value until next keyframe
  | 'linear'     // simple LERP
  // Polynomial — quadratic (pow2)
  | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
  // Polynomial — cubic (pow3)
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  // Polynomial — quartic (pow4)
  | 'pow4In' | 'pow4Out' | 'pow4'
  // Polynomial — quintic (pow5)
  | 'pow5In' | 'pow5Out' | 'pow5'
  // Sine
  | 'sineIn' | 'sineOut' | 'sine'
  // Circle
  | 'circleIn' | 'circleOut' | 'circle'
  // Exponential (base 2, power ×5 and ×10 — exp5 / exp10)
  | 'exp5In' | 'exp5Out' | 'exp5'
  | 'exp10In' | 'exp10Out' | 'exp10'
  // Elastic (spring overshoot)
  | 'elasticIn' | 'elasticOut' | 'elastic'
  // Bounce (ball-drop)
  | 'bounceIn' | 'bounceOut' | 'bounce'
  // Swing (slight overshoot, scale=1.5)
  | 'swingIn' | 'swingOut' | 'swing'
  // Smooth (smoothstep variants — smooth / smooth2 / smoother)
  | 'smooth' | 'smooth2' | 'smoother'
  | 'bezier'     // custom cubic bezier

export type AnimatedProperty = 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'

export interface Keyframe {
  time: number           // seconds
  value: number
  interpolation: InterpolationType
  bezier?: {
    controlIn: number // only for bezier, -1 to 1
    controlOut: number // only for bezier, -1 to 1
  }
}

export interface AnimationChannel {
  boneId: string
  property: AnimatedProperty
  keyframes: Keyframe[]    // sorted by time
}

export interface AnimationLinkedGroups {
  position: boolean   // x ↔ y
  scale: boolean      // scaleX ↔ scaleY
}

export interface Animation {
  id: string
  name: string
  duration: number         // seconds
  loop: boolean
  linkedGroups: AnimationLinkedGroups
  channels: AnimationChannel[]
}

// --- Editor state ---

export interface EditorState {
  // Document state (all mutations go through undo/redo)
  skeleton: Skeleton
  imageAssets: Record<string, ImageAsset>
  attachments: Record<string, Attachment>
  animations: Record<string, Animation>
  // Undo/redo stacks (Immer patches — single-slice or compound)
  undoStack: Array<import('../store/undoRedo').PatchEntry>
  redoStack: Array<import('../store/undoRedo').PatchEntry>
  // View state (NOT in undo stack)
  selectedBoneId: string | null
  selectedBoneIds: string[]
  hoveredBoneId: string | null
  editorMode: EditorMode
  activeTool: 'select' | 'rotate' | 'scale'
  snapEnabled: boolean
  snapGridSize: number    // pixels, default 16
  gridVisible: boolean
  viewport: { x: number; y: number; scale: number }
  // Animation playback state
  currentAnimationId: string | null
  currentTime: number      // seconds
  isPlaying: boolean
  // Project state
  currentProjectId: string | null
  currentProjectName: string | null
  // Clipboard
  clipboard: BoneClipboard
}
