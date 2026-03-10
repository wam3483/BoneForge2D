import { useEffect, useState } from 'react'
import { PixiViewport } from './viewport/PixiViewport'
import { BoneHierarchy } from './components/BoneHierarchy'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { ProjectManager } from './components/ProjectManager'
import { GridSettingsModal } from './components/GridSettingsModal'
import { TimelinePanel } from './components/TimelinePanel'
import { useEditorStore } from './store'
import { initAutoSave, setSaveIndicatorCallback } from './persistence/autoSave'
import * as idb from './persistence'

export default function App() {
  const undo           = useEditorStore(s => s.undo)
  const redo           = useEditorStore(s => s.redo)
  const togglePlayback = useEditorStore(s => s.togglePlayback)
  const loadProject = useEditorStore(s => s.loadProject)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [showProjectManager, setShowProjectManager] = useState(false)
  const [showGridSettings, setShowGridSettings] = useState(false)

  // Session restore at app startup (runs BEFORE auto-save subscription)
  useEffect(() => {
    async function restoreSessionAsync(): Promise<void> {
      try {
        // First, migrate any legacy project
        await idb.migrateLegacyProject()

        // Get the last used project
        const metadata = await idb.getMetadata()

        if (metadata.lastProjectId) {
          // Load the last used project
          const project = await idb.getProject(metadata.lastProjectId)
          if (project) {
            console.log('[App] Loading last project:', project.name)
            await loadProject(project)
            // Load image buffers
            const imageBuffers = await idb.loadAllImageBuffers()
            for (const { id, buffer } of imageBuffers) {
              const asset = useEditorStore.getState().imageAssets[id]
              if (asset && !asset.dataUrl) {
                const blob = new Blob([buffer], {
                  type: asset.name.endsWith('.png') ? 'image/png' : 'image/jpeg'
                })
                useEditorStore.getState().importImage({
                  ...asset,
                  dataUrl: URL.createObjectURL(blob),
                })
              }
            }
          }
        }
      } catch (err) {
        console.error('[Session restore] Failed:', err)
      }
    }

    restoreSessionAsync()
  }, [loadProject])

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
      } else if (e.ctrlKey && e.key === 'o') {
        e.preventDefault()
        setShowProjectManager(true)
      } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        useEditorStore.getState().saveCurrentProject()
      } else if (e.ctrlKey && e.key === 'c') {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        useEditorStore.getState().copyBones()
      } else if (e.ctrlKey && e.key === 'v') {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        useEditorStore.getState().pasteBones()
      } else if (e.ctrlKey && e.key === 'g') {
        e.preventDefault()
        setShowGridSettings(true)
      } else if (e.code === 'Space' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault()
          togglePlayback()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, togglePlayback])

  return (
    <div className="h-screen flex flex-col bg-[var(--color-viewport-bg)] text-white overflow-hidden">
      {/* Top toolbar */}
      <div className="relative">
        <Toolbar onOpenGridSettings={() => setShowGridSettings(true)} />
        {/* Project Manager Button */}
        <button
          onClick={() => setShowProjectManager(true)}
          className="absolute right-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded flex items-center gap-2 transition-colors"
          title="Manage Projects (Ctrl+O)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <span>Projects</span>
        </button>
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
      <div className="flex-1 flex overflow-hidden">
        {/* Left: bone hierarchy panel */}
        <BoneHierarchy />

        {/* Canvas area */}
        <PixiViewport />

        {/* Right sidebar with image import and attachment controls */}
        <Sidebar />
      </div>

      {/* Timeline panel */}
      <TimelinePanel />

      {/* Bottom status bar */}
      <StatusBar />

      {/* Project Manager Modal */}
      {showProjectManager && (
        <ProjectManager onClose={() => setShowProjectManager(false)} />
      )}

      {/* Grid Settings Modal */}
      {showGridSettings && (
        <GridSettingsModal onClose={() => setShowGridSettings(false)} />
      )}
    </div>
  )
}
