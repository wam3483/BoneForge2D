import { useEffect } from 'react'
import { PixiViewport } from './viewport/PixiViewport'
import { useEditorStore } from './store'

export default function App() {
  const undo = useEditorStore(s => s.undo)
  const redo = useEditorStore(s => s.redo)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
      } else if (e.ctrlKey && (e.key === 'y' || (e.key === 'y' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  return (
    <div className="h-screen flex flex-col bg-[var(--color-viewport-bg)] text-white overflow-hidden">
      {/* Top toolbar placeholder */}
      <div className="h-12 bg-gray-900 flex items-center px-4 border-b border-gray-700">
        <h1 className="text-lg font-bold">BoneForge 2D</h1>
      </div>

      {/* Middle row */}
      <div className="flex-1 flex">
        {/* Canvas area */}
        <PixiViewport />

        {/* Right sidebar placeholder */}
        <div className="w-60 bg-gray-800 border-l border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-sm font-semibold text-gray-300">Properties</h2>
          </div>
          <div className="p-4 text-sm text-gray-500">
            Sidebar content will be added in Plan 04
          </div>
        </div>
      </div>

      {/* Bottom status bar placeholder */}
      <div className="h-8 bg-gray-900 border-t border-gray-700 flex items-center px-4 text-xs text-gray-400">
        <span>Status bar content will be added in Plan 05</span>
      </div>
    </div>
  )
}
