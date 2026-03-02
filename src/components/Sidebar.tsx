import { useRef, useState, useEffect } from 'react'
import { useEditorStore } from '../store'
import { saveImageBuffer } from '../persistence/indexeddb'
import type { ImageAsset, Attachment } from '../model/types'

// Truncate filename to fit thumbnail area
function truncateName(name: string, maxLen = 16): string {
  if (name.length <= maxLen) return name
  const ext = name.slice(name.lastIndexOf('.'))
  const base = name.slice(0, name.lastIndexOf('.'))
  return base.slice(0, maxLen - ext.length - 3) + '...' + ext
}

export function Sidebar() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const store = useEditorStore

  const imageAssets = useEditorStore(s => s.imageAssets)
  const attachments = useEditorStore(s => s.attachments)
  const selectedBoneId = useEditorStore(s => s.selectedBoneId)

  const [importError, setImportError] = useState<string | null>(null)

  // Clear import error after 3 seconds
  useEffect(() => {
    if (!importError) return undefined
    const timer = setTimeout(() => setImportError(null), 3000)
    return () => clearTimeout(timer)
  }, [importError])

  // Get attachments for the currently selected bone
  const selectedBoneAttachments = Object.values(attachments).filter(
    att => att.boneId === selectedBoneId
  ).sort((a, b) => a.zOrder - b.zOrder)

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setImportError('Only PNG and JPG images are supported.')
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      setImportError('Image is too large (max 20 MB).')
      return
    }

    try {
      // Read as ArrayBuffer (for IndexedDB) and dataUrl (for display)
      const buffer = await file.arrayBuffer()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      })

      // Get dimensions
      const img = new Image()
      img.src = dataUrl
      await new Promise(r => img.onload = r)

      const asset: ImageAsset = {
        id: crypto.randomUUID(),
        name: file.name,
        dataUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
      }

      store.getState().importImage(asset)
      await saveImageBuffer(asset.id, buffer)
      setImportError(null)
    } catch (err) {
      setImportError('Failed to import image.')
      console.error('[Sidebar] Import error:', err)
    }

    e.target.value = '' // reset so same file can be re-imported
  }

  function handleAttach(assetId: string): void {
    if (!selectedBoneId) {
      setImportError('Select a bone first')
      return
    }

    // Check if this image is already attached to the selected bone
    const existing = Object.values(attachments).find(
      att => att.imageId === assetId && att.boneId === selectedBoneId
    )
    if (existing) {
      setImportError('Image already attached to this bone')
      return
    }

    const attachment: Attachment = {
      id: crypto.randomUUID(),
      imageId: assetId,
      boneId: selectedBoneId,
      offsetX: 0,
      offsetY: 0,
      pivotX: 0.5,
      pivotY: 0.5,
      zOrder: 0,
    }

    store.getState().attachImage(attachment)
    setImportError(null)
  }

  function handleDetach(attachmentId: string): void {
    store.getState().detachImage(attachmentId)
  }

  function handleUpdateAttachment(
    attachmentId: string,
    patch: Partial<Attachment>
  ): void {
    store.getState().updateAttachment(attachmentId, patch)
  }

  return (
    <div className="w-60 bg-gray-800 border-l border-gray-700 flex flex-col h-full">
      {/* Import section */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Assets</h2>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded transition-colors"
        >
          Import Image
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          hidden
          onChange={handleFileSelect}
        />
        {importError && (
          <p className="text-xs text-red-400 mt-2">{importError}</p>
        )}
      </div>

      {/* Image asset list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {Object.values(imageAssets).length === 0 ? (
          <p className="text-sm text-gray-500">No images imported yet.</p>
        ) : (
          Object.values(imageAssets).map(asset => (
            <div key={asset.id} className="flex items-center gap-2 p-2 bg-gray-700 rounded">
              <div className="w-12 h-12 bg-gray-600 rounded flex items-center justify-center flex-shrink-0">
                <img
                  src={asset.dataUrl}
                  alt={asset.name}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-300 truncate" title={asset.name}>
                  {truncateName(asset.name)}
                </p>
                <p className="text-xs text-gray-500">
                  {asset.width}x{asset.height}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleAttach(asset.id)}
                className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
                title={selectedBoneId ? 'Attach to selected bone' : 'Select a bone first'}
              >
                Attach
              </button>
            </div>
          ))
        )}
      </div>

      {/* Selected bone attachments */}
      <div className="border-t border-gray-700 max-h-64 overflow-y-auto">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-gray-300">Attachments</h2>
        </div>
        <div className="p-3 space-y-3">
          {!selectedBoneId ? (
            <p className="text-xs text-gray-500">Select a bone to see attachments.</p>
          ) : selectedBoneAttachments.length === 0 ? (
            <p className="text-xs text-gray-500">No attachments for this bone.</p>
          ) : (
            selectedBoneAttachments.map(att => {
              const asset = imageAssets[att.imageId]
              if (!asset) return null
              return (
                <div key={att.id} className="bg-gray-700 rounded p-2">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-gray-600 rounded flex items-center justify-center flex-shrink-0">
                      <img
                        src={asset.dataUrl}
                        alt={asset.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <p className="text-xs text-gray-300 truncate flex-1" title={asset.name}>
                      {truncateName(asset.name)}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleDetach(att.id)}
                      className="px-2 py-0.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                    >
                      Detach
                    </button>
                  </div>
                  {/* zOrder control */}
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-xs text-gray-400 w-12">zOrder:</label>
                    <button
                      type="button"
                      onClick={() => handleUpdateAttachment(att.id, { zOrder: att.zOrder - 1 })}
                      className="px-1.5 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded"
                    >
                      -
                    </button>
                    <span className="text-xs text-gray-300 w-6 text-center">{att.zOrder}</span>
                    <button
                      type="button"
                      onClick={() => handleUpdateAttachment(att.id, { zOrder: att.zOrder + 1 })}
                      className="px-1.5 py-0.5 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded"
                    >
                      +
                    </button>
                  </div>
                  {/* Pivot controls */}
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-xs text-gray-400 w-12">Pivot:</label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={att.pivotX}
                      onChange={(e) => handleUpdateAttachment(att.id, {
                        pivotX: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.5))
                      })}
                      className="w-14 px-1 py-0.5 text-xs bg-gray-600 text-white rounded border-0 focus:ring-1 focus:ring-violet-500"
                    />
                    <span className="text-xs text-gray-500">X</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={att.pivotY}
                      onChange={(e) => handleUpdateAttachment(att.id, {
                        pivotY: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0.5))
                      })}
                      className="w-14 px-1 py-0.5 text-xs bg-gray-600 text-white rounded border-0 focus:ring-1 focus:ring-violet-500"
                    />
                    <span className="text-xs text-gray-500">Y</span>
                  </div>
                  {/* Offset controls */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 w-12">Offset:</label>
                    <input
                      type="number"
                      step="1"
                      value={att.offsetX}
                      onChange={(e) => handleUpdateAttachment(att.id, {
                        offsetX: parseFloat(e.target.value) || 0
                      })}
                      className="w-14 px-1 py-0.5 text-xs bg-gray-600 text-white rounded border-0 focus:ring-1 focus:ring-violet-500"
                    />
                    <span className="text-xs text-gray-500">X</span>
                    <input
                      type="number"
                      step="1"
                      value={att.offsetY}
                      onChange={(e) => handleUpdateAttachment(att.id, {
                        offsetY: parseFloat(e.target.value) || 0
                      })}
                      className="w-14 px-1 py-0.5 text-xs bg-gray-600 text-white rounded border-0 focus:ring-1 focus:ring-violet-500"
                    />
                    <span className="text-xs text-gray-500">Y</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
