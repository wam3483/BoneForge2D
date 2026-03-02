import { useEditorStore } from '../store'

// Simple SVG icons for the toolbar
const Icons = {
  bone: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 10a3 3 0 0 0-3-3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3v-1z" />
      <path d="M4 12l4-4 4 4" />
      <path d="M16 16l4 4" />
    </svg>
  ),
  select: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    </svg>
  ),
  move: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M4.93 4.93l2.83 2.83" />
      <path d="M16.24 16.24l2.83 2.83" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="M4.93 19.07l2.83-2.83" />
      <path d="M16.24 7.76l2.83-2.83" />
    </svg>
  ),
  rotate: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  ),
  scale: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </svg>
  ),
  undo: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  ),
  redo: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
    </svg>
  ),
  upload: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
}

export function Toolbar() {
  const store = useEditorStore

  const activeTool = useEditorStore(s => s.activeTool)
  const editorMode = useEditorStore(s => s.editorMode)
  const undoStack = useEditorStore(s => s.undoStack)
  const redoStack = useEditorStore(s => s.redoStack)

  function handleToolClick(tool: 'select' | 'move' | 'rotate' | 'scale'): void {
    store.getState().setActiveTool(tool)
  }

  function handleModeToggle(): void {
    const state = store.getState()
    const newMode = state.editorMode === 'pose' ? 'animate' : 'pose'
    store.getState().setEditorMode(newMode)
  }

  function handleUndo(): void {
    store.getState().undo()
  }

  function handleRedo(): void {
    store.getState().redo()
  }

  function handleImportImage(): void {
    const fileInput = document.getElementById('image-import-input') as HTMLInputElement
    fileInput?.click()
  }

  const toolButtons: Array<{
    tool: 'select' | 'move' | 'rotate' | 'scale'
    icon: React.ReactNode
    label: string
    shortcut: string
  }> = [
    { tool: 'select', icon: Icons.select, label: 'Select', shortcut: 'Esc' },
    { tool: 'move', icon: Icons.move, label: 'Move', shortcut: 'G' },
    { tool: 'rotate', icon: Icons.rotate, label: 'Rotate', shortcut: 'R' },
    { tool: 'scale', icon: Icons.scale, label: 'Scale', shortcut: 'S' },
  ]

  return (
    <div className="h-12 bg-gray-900 flex items-center px-4 gap-4 border-b border-gray-700">
      {/* App branding */}
      <div className="flex items-center gap-2 mr-4">
        <span className="text-amber-500">{Icons.bone}</span>
        <h1 className="text-lg font-bold text-white">BoneForge 2D</h1>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-gray-700" />

      {/* Tool buttons */}
      <div className="flex items-center gap-1">
        {toolButtons.map(({ tool, icon, label, shortcut }) => (
          <button
            key={tool}
            onClick={() => handleToolClick(tool)}
            aria-pressed={activeTool === tool}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded transition-colors ${
              activeTool === tool
                ? 'bg-amber-500 text-black'
                : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
            }`}
            title={`${label} (${shortcut})`}
          >
            <span className="flex items-center justify-center">
              {icon}
            </span>
            <span className="text-[10px] opacity-60 mt-0.5">{shortcut}</span>
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-gray-700" />

      {/* Mode toggle */}
      <button
        onClick={handleModeToggle}
        className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
          editorMode === 'pose'
            ? 'bg-blue-600 text-white'
            : 'bg-orange-500 text-white'
        }`}
        title={`Switch to ${editorMode === 'pose' ? 'Animate' : 'Pose'} mode (Tab)`}
      >
        {editorMode === 'pose' ? 'Pose Mode' : 'Animate Mode'}
      </button>

      {/* Divider */}
      <div className="w-px h-6 bg-gray-700" />

      {/* Undo/Redo buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          className={`p-1.5 rounded transition-colors ${
            undoStack.length === 0
              ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
              : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
          }`}
          title="Undo (Ctrl+Z)"
        >
          {Icons.undo}
        </button>
        <button
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          className={`p-1.5 rounded transition-colors ${
            redoStack.length === 0
              ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
              : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
          }`}
          title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
        >
          {Icons.redo}
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Import Image button */}
      <button
        onClick={handleImportImage}
        className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded flex items-center gap-2 transition-colors"
        title="Import image"
      >
        {Icons.upload}
        <span>Import</span>
      </button>
    </div>
  )
}
