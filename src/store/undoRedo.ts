import { enablePatches, produceWithPatches, applyPatches, Patch } from 'immer'

// MUST be called once before any produce call. Place here so it runs at module load.
enablePatches()

export type PatchEntry = { inverse: Patch[]; forward: Patch[] }

/** Wraps a document mutation to capture Immer patches for undo/redo. */
export function withUndo<T extends object>(
  current: T,
  recipe: (draft: T) => void,
  undoStack: PatchEntry[],
  _redoStack: PatchEntry[],
  maxStack = 100
): { next: T; undoStack: PatchEntry[]; redoStack: PatchEntry[] } {
  const [next, patches, inversePatches] = produceWithPatches(current, recipe)
  const entry: PatchEntry = { inverse: inversePatches, forward: patches }
  const newUndo = [...undoStack, entry]
  if (newUndo.length > maxStack) newUndo.shift()
  return { next, undoStack: newUndo, redoStack: [] } // new mutation clears redo
}

export { applyPatches }
