import { useRef, useState } from 'react'
import { useEditorStore } from '../store'
import type { Skeleton, Attachment } from '../model/types'

/** Returns true if targetId is a descendant of ancestorId. */
function isDescendant(ancestorId: string, targetId: string, skeleton: Skeleton): boolean {
  const queue = [...(skeleton.bones[ancestorId]?.childIds ?? [])]
  while (queue.length > 0) {
    const id = queue.pop()!
    if (id === targetId) return true
    const b = skeleton.bones[id]
    if (b) queue.push(...b.childIds)
  }
  return false
}

type DragCtx = {
  draggingId: string | null
  overBoneId: string | null
  setOverBoneId: (id: string | null) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDrop: (targetId: string | null) => void
}

function BoneNode({
  boneId,
  skeleton,
  depth,
  selectedBoneId,
  selectedBoneIds,
  onSelect,
  onToggle,
  onRename,
  dnd,
  attachments,
}: {
  boneId: string
  skeleton: Skeleton
  depth: number
  selectedBoneId: string | null
  selectedBoneIds: string[]
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onRename: (id: string, name: string) => void
  dnd: DragCtx
  attachments: Record<string, Attachment>
}) {
  const bone = skeleton.bones[boneId]
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [expanded, setExpanded] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  // Check if bone has any image attachments
  const hasAttachment = Object.values(attachments).some(a => a.boneId === boneId)

  if (!bone) return null

  const isSelected = selectedBoneIds.includes(boneId)
  const hasChildren = bone.childIds.length > 0
  const isDraggingThis = dnd.draggingId === boneId

  // Valid drop target: something is dragged, it's not us, and we're not one of its descendants
  const isValidTarget = dnd.draggingId !== null
    && dnd.draggingId !== boneId
    && !isDescendant(dnd.draggingId, boneId, skeleton)
  const isOver = isValidTarget && dnd.overBoneId === boneId

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setEditValue(bone.name)
    setEditing(true)
  }

  function commit() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== bone.name) onRename(boneId, trimmed)
    setEditing(false)
  }

  function cancelEdit() { setEditing(false) }

  return (
    <>
      <div
        style={{ paddingLeft: depth * 16 + 8 }}
        draggable={!editing}
        className={[
          'flex items-center h-7 gap-1.5 pr-2 cursor-pointer rounded mx-1 text-xs select-none',
          isOver
            ? 'bg-cyan-800 outline outline-1 outline-cyan-400 text-white'
            : isSelected
            ? 'bg-violet-600 text-white'
            : 'text-gray-300 hover:bg-gray-700',
          isDraggingThis ? 'opacity-40' : '',
        ].join(' ')}
        onClick={e => { e.stopPropagation(); if (e.ctrlKey || e.metaKey) { onToggle(boneId) } else { onSelect(boneId) } }}
        onDoubleClick={startEdit}
        onDragStart={e => {
          e.stopPropagation()
          dnd.onDragStart(boneId)
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', boneId) // required by Firefox
        }}
        onDragOver={e => {
          e.stopPropagation()
          if (!isValidTarget) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (dnd.overBoneId !== boneId) dnd.setOverBoneId(boneId)
        }}
        onDragLeave={e => {
          e.stopPropagation()
          // Only clear when leaving this row entirely, not moving to a child element
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            if (dnd.overBoneId === boneId) dnd.setOverBoneId(null)
          }
        }}
        onDrop={e => {
          e.preventDefault()
          e.stopPropagation()
          if (isValidTarget) dnd.onDrop(boneId)
        }}
        onDragEnd={() => dnd.onDragEnd()}
      >
        {/* Depth connector */}
        {depth > 0 && (
          <span className="text-gray-600 flex-shrink-0" style={{ marginLeft: -8 }}>╴</span>
        )}

        {/* Collapse / expand toggle */}
        {hasChildren ? (
          <button
            className={`w-3 flex-shrink-0 flex items-center justify-center leading-none ${
              isSelected || isOver ? 'text-gray-200' : 'text-gray-500 hover:text-gray-300'
            }`}
            onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
            tabIndex={-1}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}

        {/* Bone icon */}
        <span className={`w-2 h-2 rounded-sm flex-shrink-0 ${isSelected || isOver ? 'bg-white' : 'bg-violet-400'}`} />

        {/* Attachment indicator */}
        {hasAttachment && (
          <span className={`flex-shrink-0 text-xs ${isSelected || isOver ? 'text-white' : 'text-amber-400'}`} title="Has image attached">
            🖼️
          </span>
        )}

        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') cancelEdit()
              e.stopPropagation()
            }}
            onClick={e => e.stopPropagation()}
            className="flex-1 min-w-0 bg-gray-900 text-white text-xs px-1 py-0.5 rounded border border-violet-400 focus:outline-none"
          />
        ) : (
          <span className="truncate flex-1" title={bone.name}>{bone.name}</span>
        )}
      </div>

      {hasChildren && expanded && bone.childIds.map(childId => (
        <BoneNode
          key={childId}
          boneId={childId}
          skeleton={skeleton}
          depth={depth + 1}
          selectedBoneId={selectedBoneId}
          selectedBoneIds={selectedBoneIds}
          onSelect={onSelect}
          onToggle={onToggle}
          onRename={onRename}
          dnd={dnd}
          attachments={attachments}
        />
      ))}
    </>
  )
}

export function BoneHierarchy() {
  const skeleton = useEditorStore(s => s.skeleton)
  const selectedBoneId = useEditorStore(s => s.selectedBoneId)
  const selectedBoneIds = useEditorStore(s => s.selectedBoneIds)
  const setSelectedBone = useEditorStore(s => s.setSelectedBone)
  const toggleBoneSelection = useEditorStore(s => s.toggleBoneSelection)
  const renameBone = useEditorStore(s => s.renameBone)
  const reparentBone = useEditorStore(s => s.reparentBone)
  const attachments = useEditorStore(s => s.attachments)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overBoneId, setOverBoneId] = useState<string | null>(null)

  function clearDrag() {
    setDraggingId(null)
    setOverBoneId(null)
  }

  function handleDrop(targetId: string | null) {
    if (!draggingId) { clearDrag(); return }
    if (targetId === draggingId) { clearDrag(); return }
    if (targetId && isDescendant(draggingId, targetId, skeleton)) { clearDrag(); return }

    const bone = skeleton.bones[draggingId]
    if (bone && bone.parentId !== targetId) {
      reparentBone(draggingId, targetId)
    }
    clearDrag()
  }

  const dnd: DragCtx = {
    draggingId,
    overBoneId,
    setOverBoneId,
    onDragStart: setDraggingId,
    onDragEnd: clearDrag,
    onDrop: handleDrop,
  }

  // The scroll container handles drops onto panel background (→ make root)
  const isDraggingToRoot = draggingId !== null && skeleton.bones[draggingId]?.parentId !== null

  return (
    <div
      className="w-52 bg-gray-800 border-r border-gray-700 flex flex-col h-full"
      onClick={() => setSelectedBone(null)}
    >
      <div className="px-3 py-2 border-b border-gray-700 flex-shrink-0">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bones</h2>
      </div>

      <div
        className="flex-1 overflow-y-auto py-1"
        onDragOver={e => {
          // Fires only when over panel background (bones stop propagation)
          if (!draggingId) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (overBoneId !== null) setOverBoneId(null)
        }}
        onDrop={e => {
          e.preventDefault()
          handleDrop(null) // background drop → make root
        }}
        onDragLeave={e => {
          // Leaving panel entirely
          if (!e.currentTarget.contains(e.relatedTarget as Node)) clearDrag()
        }}
      >
        {skeleton.rootBoneIds.length === 0 ? (
          <p className="text-xs text-gray-500 p-3 leading-relaxed">
            No bones yet.<br />Drag on the canvas to create one.
          </p>
        ) : (
          <>
            {skeleton.rootBoneIds.map(id => (
              <BoneNode
                key={id}
                boneId={id}
                skeleton={skeleton}
                depth={0}
                selectedBoneId={selectedBoneId}
                selectedBoneIds={selectedBoneIds}
                onSelect={setSelectedBone}
                onToggle={toggleBoneSelection}
                onRename={renameBone}
                dnd={dnd}
                attachments={attachments}
              />
            ))}

            {/* Drop-to-root hint shown only when dragging a non-root bone */}
            {isDraggingToRoot && (
              <div className="mx-1 mt-1 h-6 rounded border border-dashed border-gray-600 text-xs text-gray-500 flex items-center justify-center pointer-events-none">
                drop here → make root
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
