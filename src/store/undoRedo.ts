import { enablePatches, produceWithPatches, applyPatches, Patch } from 'immer'

// MUST be called once before any produce call. Place here so it runs at module load.
enablePatches()

export type PatchSlice = 'skeleton' | 'animations'

/** Single-slice entry (skeleton OR animations). */
export type SinglePatchEntry = { compound?: false; inverse: Patch[]; forward: Patch[]; slice?: PatchSlice }

/** Compound entry — patches for BOTH skeleton and animations in one atomic undo step. */
export type CompoundPatchEntry = {
  compound: true
  skeleton: { inverse: Patch[]; forward: Patch[] }
  animations: { inverse: Patch[]; forward: Patch[] }
}

export type PatchEntry = SinglePatchEntry | CompoundPatchEntry

/** Wraps a document mutation to capture Immer patches for undo/redo. */
export function withUndo<T extends object>(
  current: T,
  recipe: (draft: T) => void,
  undoStack: PatchEntry[],
  _redoStack: PatchEntry[],
  slice: PatchSlice = 'skeleton',
  maxStack = 100
): { next: T; undoStack: PatchEntry[]; redoStack: PatchEntry[] } {
  const [next, patches, inversePatches] = produceWithPatches(current, recipe)
  const entry: PatchEntry = { inverse: inversePatches, forward: patches, slice }
  const newUndo = [...undoStack, entry]
  if (newUndo.length > maxStack) newUndo.shift()
  return { next, undoStack: newUndo, redoStack: [] } // new mutation clears redo
}

/** Wraps mutations to BOTH skeleton and animations into a single compound undo entry. */
export function withUndoCompound<S extends object, A extends object>(
  currentSkeleton: S,
  skeletonRecipe: (draft: S) => void,
  currentAnimations: A,
  animationsRecipe: (draft: A) => void,
  undoStack: PatchEntry[],
  maxStack = 100
): { nextSkeleton: S; nextAnimations: A; undoStack: PatchEntry[]; redoStack: PatchEntry[] } {
  const [nextSkeleton, skelPatches, skelInverse] = produceWithPatches(currentSkeleton, skeletonRecipe)
  const [nextAnimations, animPatches, animInverse] = produceWithPatches(currentAnimations, animationsRecipe)
  const entry: CompoundPatchEntry = {
    compound: true,
    skeleton: { inverse: skelInverse, forward: skelPatches },
    animations: { inverse: animInverse, forward: animPatches },
  }
  const newUndo = [...undoStack, entry]
  if (newUndo.length > maxStack) newUndo.shift()
  return { nextSkeleton, nextAnimations, undoStack: newUndo, redoStack: [] }
}

export { applyPatches }
