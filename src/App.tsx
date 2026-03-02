import { useEffect, useState } from 'react'
import { PixiViewport } from './viewport/PixiViewport'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { useEditorStore } from './store'
import { initAutoSave, setSaveIndicatorCallback } from './persistence/autoSave'
import { loadProject, loadAllImageBuffers } from './persistence/indexeddb'

export default function App() {
  const undo = useEditorStore(s => s.undo)
  const redo = useEditorStore(s => s.redo)
  const restoreSession = useEditorStore(s => s.restoreSession)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  // Session restore at app startup (runs BEFORE auto-save subscription)
  useEffect(() => {
    async function restoreSessionAsync(): Promise<void> {
      try {
        const [savedDoc, imageBuffers] = await Promise.all([
          loadProject(),
          loadAllImageBuffers(),
        ])

        if (!savedDoc) return // no previous session - start fresh

        const doc = savedDoc as {
          skeleton: { bones: Record<string, unknown>; rootBoneIds: string[] }
          imageAssets: Record<string, { id: string; name: string; width: number; height: number; dataUrl?: string }>
          attachments: Record<string, unknown>
          version: number
        }

        // Reconstruct dataUrls from ArrayBuffers for images that are in the document
        const reconstructedAssets: Record<string, { id: string; name: string; width: number; height: number; dataUrl: string }> = {}
        for (const { id, buffer } of imageBuffers) {
          const savedAsset = doc.imageAssets[id]
          if (savedAsset) {
            const blob = new Blob([buffer], {
              type: savedAsset.name.endsWith('.png') ? 'image/png' : 'image/jpeg'
            })
            reconstructedAssets[id] = {
              ...savedAsset,
              dataUrl: URL.createObjectURL(blob),
            }
          }
        }

        // Hydrate the store
        restoreSession({
          skeleton: doc.skeleton as any,
          imageAssets: reconstructedAssets as any,
          attachments: doc.attachments as any,
        })
      } catch (err) {
        console.error('[Session restore] Failed:', err)
      }
    }

    restoreSessionAsync()
  }, [restoreSession])

  // Wire auto-save initialization
  useEffect(() => {
    const cleanup = initAutoSave()
    setSaveIndicatorCallback((saved) => {
      setSaveStatus(saved ? 'saved' : 'error')
      if (saved) {
        setTimeout(() => setSaveStatus('idle'), 2000)
      }
    })
    return cleanup
  }, [])

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
      {/* Top toolbar */}
      <div className="relative">
        <Toolbar />
        {/* Save indicator overlay */}
        {saveStatus !== 'idle' && (
          <span className={`absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 text-xs px-3 py-1 rounded-full ${
            saveStatus === 'saved' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {saveStatus === 'saved' ? 'Saved' : 'Save failed'}
          </span>
        )}
      </div>

      {/* Middle row */}
      <div className="flex-1 flex">
        {/* Canvas area */}
        <PixiViewport />

        {/* Right sidebar with image import and attachment controls */}
        <Sidebar />
      </div>

      {/* Bottom status bar */}
      <StatusBar />
    </div>
  )
}
