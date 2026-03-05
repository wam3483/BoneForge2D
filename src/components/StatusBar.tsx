import { useState, useEffect } from 'react'
import { useEditorStore } from '../store'

export function StatusBar() {
  const store = useEditorStore

  const selectedBoneId = useEditorStore(s => s.selectedBoneId)
  const editorMode = useEditorStore(s => s.editorMode)
  const viewportScale = useEditorStore(s => s.viewport.scale)
  const skeleton = useEditorStore(s => s.skeleton)

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  // Reset rename state when selection changes
  useEffect(() => {
    setRenaming(false)
    setRenameValue('')
  }, [selectedBoneId])

  function startRename(): void {
    if (!selectedBoneId) return
    const bone = skeleton.bones[selectedBoneId]
    if (bone) {
      setRenameValue(bone.name)
      setRenaming(true)
    }
  }

  function commitRename(): void {
    if (!selectedBoneId || !renameValue.trim()) {
      setRenaming(false)
      return
    }
    store.getState().renameBone(selectedBoneId, renameValue.trim())
    setRenaming(false)
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      commitRename()
    } else if (e.key === 'Escape') {
      setRenaming(false)
    }
  }

  const selectedBoneName = selectedBoneId ? skeleton.bones[selectedBoneId]?.name ?? 'Unknown' : 'No selection'
  const zoomPercentage = Math.round(viewportScale * 100)

  return (
    <div className="h-8 bg-gray-800 border-t border-gray-700 flex items-center px-4 text-xs text-gray-400 gap-4">
      {/* Selected bone name with rename */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-gray-500">Bone:</span>
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleRenameKeyDown}
            className="bg-gray-700 text-white px-1.5 py-0.5 rounded text-xs w-32 border border-gray-600 focus:border-violet-500 focus:outline-none"
          />
        ) : (
          <span
            onDoubleClick={startRename}
            className="cursor-pointer hover:text-white transition-colors max-w-[150px] truncate"
            title="Double-click to rename"
          >
            {selectedBoneName}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-gray-700" />

      {/* Mode indicator */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`w-1.5 h-1.5 rounded-full ${editorMode === 'pose' ? 'bg-blue-500' : 'bg-orange-500'}`} />
        <span className={editorMode === 'pose' ? 'text-blue-400' : 'text-orange-400'}>
          {editorMode === 'pose' ? 'Pose' : 'Animate'} Mode
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-gray-700" />

      {/* Zoom level */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-gray-500">Zoom:</span>
        <span>{zoomPercentage}%</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Keyboard legend */}
      <div className="text-[10px] text-gray-500">
        B:Bone R:Rotate S:Scale Tab:Mode Del:Delete Ctrl+C/V:Copy/Paste Ctrl+Drag:Axis Lock
      </div>
    </div>
  )
}
