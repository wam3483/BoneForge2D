import { useEditorStore } from '../store'
import { saveProjectData } from './indexeddb'
import type { EditorState } from '../model/types'

/** Serialize document state (exclude view state from save) */
function serializeDocument(state: EditorState): { skeleton: object; imageAssets: Record<string, object>; attachments: Record<string, object>; animations: Record<string, object> } {
  return {
    skeleton: state.skeleton,
    imageAssets: state.imageAssets,      // dataUrl stored here for display; ArrayBuffer stored separately
    attachments: state.attachments,
    animations: state.animations,
  }
}

/** Simple debounce - last call wins */
function debounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }) as T
}

let saveIndicatorCallback: ((saved: boolean) => void) | null = null

export function setSaveIndicatorCallback(cb: (saved: boolean) => void): void {
  saveIndicatorCallback = cb
}

const debouncedSave = debounce(async (state: EditorState) => {
  try {
    const projectId = state.currentProjectId
    if (projectId) {
      await saveProjectData(projectId, serializeDocument(state))
      saveIndicatorCallback?.(true)
    }
  } catch (err) {
    console.error('[AutoSave] Failed to save project:', err)
    saveIndicatorCallback?.(false)
  }
}, 500)

/** Call once at app startup. Returns cleanup function. */
export function initAutoSave(): () => void {
  // Subscribe to store; filter to document state changes only
  // NOTE: undoStack/redoStack changes also trigger save (they are part of document fidelity)
  // View state (selectedBoneId, viewport, editorMode, activeTool) is NOT saved - it is ephemeral
  let prevSkeleton = useEditorStore.getState().skeleton
  let prevImageAssets = useEditorStore.getState().imageAssets
  let prevAttachments = useEditorStore.getState().attachments
  let prevAnimations = useEditorStore.getState().animations

  const unsub = useEditorStore.subscribe((state) => {
    // Only save when document state actually changed
    if (
      state.skeleton !== prevSkeleton ||
      state.imageAssets !== prevImageAssets ||
      state.attachments !== prevAttachments ||
      state.animations !== prevAnimations
    ) {
      prevSkeleton = state.skeleton
      prevImageAssets = state.imageAssets
      prevAttachments = state.attachments
      prevAnimations = state.animations
      debouncedSave(state)
    }
  })

  return unsub
}
