import { useRef, useEffect } from 'react'
import { Application, extend } from '@pixi/react'
import { Container, Graphics, Sprite, Text } from 'pixi.js'
import { BoneRendererLayer } from './BoneRenderer'
import { AttachmentRendererLayer } from './AttachmentRenderer'
import { useEditorStore } from '../store'

// Register all PixiJS classes used in JSX — MUST happen before any JSX render
extend({ Container, Graphics, Sprite, Text })

export function PixiViewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorMode = useEditorStore(s => s.editorMode)
  const borderColor = editorMode === 'pose' ? 'border-[--color-mode-pose]' : 'border-[--color-mode-animate]'

  // Keyboard shortcuts
  useEffect(() => {
    const store = useEditorStore

    function handleKeyDown(e: KeyboardEvent): void {
      const state = store.getState()

      // Ignore if focused on an input element
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Don't interfere with Ctrl+Z/Y (undo/redo - handled in App.tsx)
      if (e.ctrlKey || e.metaKey) {
        return
      }

      const key = e.key.toLowerCase()

      switch (key) {
        case 'b': // Create root bone at viewport center
          const newBoneId = state.createBone(null)
          // Place at center of viewport
          store.getState().setBoneTransform(newBoneId, { x: 0, y: 0 })
          store.getState().setSelectedBone(newBoneId)
          store.getState().setActiveTool('move')
          e.preventDefault()
          break

        case 'g': // Move tool
          store.getState().setActiveTool('move')
          e.preventDefault()
          break

        case 'r': // Rotate tool
          store.getState().setActiveTool('rotate')
          e.preventDefault()
          break

        case 's': // Scale tool
          store.getState().setActiveTool('scale')
          e.preventDefault()
          break

        case 'escape': // Deselect and return to select tool
          store.getState().setSelectedBone(null)
          store.getState().setActiveTool('select')
          e.preventDefault()
          break

        case 'delete':
        case 'backspace': // Delete selected bone
          if (state.selectedBoneId) {
            state.deleteBone(state.selectedBoneId)
            store.getState().setSelectedBone(null)
            e.preventDefault()
          }
          break

        case 'tab': // Toggle editor mode
          e.preventDefault()
          const newMode = state.editorMode === 'pose' ? 'animate' : 'pose'
          store.getState().setEditorMode(newMode)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div
      ref={containerRef}
      className={`relative flex-1 border-4 ${borderColor} transition-colors`}
      onContextMenu={e => e.preventDefault()}
    >
      <Application resizeTo={containerRef} antialias background={0x1a1a2e}>
        <AttachmentRendererLayer />
        <BoneRendererLayer />
      </Application>
    </div>
  )
}
