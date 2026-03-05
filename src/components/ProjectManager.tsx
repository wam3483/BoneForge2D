import { useEffect, useState } from 'react'
import { useEditorStore } from '../store'
import * as idb from '../persistence'
import type { Project } from '../model/types'

export function ProjectManager({ onClose }: { onClose: () => void }) {
  const currentProjectId = useEditorStore(s => s.currentProjectId)
  const [projects, setProjects] = useState<Project[]>([])
  const [newProjectName, setNewProjectName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    try {
      await idb.migrateLegacyProject()
      const allProjects = await idb.listProjects()
      setProjects(allProjects)
    } catch (e) {
      console.error('Failed to load projects:', e)
    }
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) return
    try {
      await useEditorStore.getState().newProject(newProjectName.trim())
      setNewProjectName('')
      await loadProjects()
      onClose()
    } catch (e) {
      console.error('Failed to create project:', e)
    }
  }

  async function handleLoadProject(project: Project) {
    try {
      await useEditorStore.getState().loadProject(project)
      onClose()
    } catch (e) {
      console.error('Failed to load project:', e)
    }
  }

  async function handleDeleteProject(projectId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this project?')) return
    try {
      await useEditorStore.getState().deleteProject(projectId)
      await loadProjects()
    } catch (e) {
      console.error('Failed to delete project:', e)
    }
  }

  async function handleStartRename(project: Project, e: React.MouseEvent) {
    e.stopPropagation()
    setRenamingId(project.id)
    setRenameValue(project.name)
  }

  async function handleCommitRename(projectId: string) {
    if (!renameValue.trim()) {
      setRenamingId(null)
      setRenameValue('')
      return
    }
    try {
      await useEditorStore.getState().renameProject(projectId, renameValue.trim())
      await loadProjects()
      setRenamingId(null)
      setRenameValue('')
    } catch (e) {
      console.error('Failed to rename project:', e)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, projectId: string) {
    if (e.key === 'Enter') {
      handleCommitRename(projectId)
    } else if (e.key === 'Escape') {
      setRenamingId(null)
      setRenameValue('')
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Projects</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Create new project */}
        <div className="p-4 border-b border-gray-700 flex gap-2">
          <input
            type="text"
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
            placeholder="New project name..."
            className="flex-1 bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-violet-500 focus:outline-none"
          />
          <button
            onClick={handleCreateProject}
            disabled={!newProjectName.trim()}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            Create
          </button>
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-y-auto p-2">
          {projects.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No projects yet. Create one to get started!
            </div>
          ) : (
            <div className="space-y-1">
              {projects.map(project => (
                <div
                  key={project.id}
                  onClick={() => handleLoadProject(project)}
                  className={`group flex items-center gap-3 p-3 rounded cursor-pointer transition-colors ${
                    currentProjectId === project.id
                      ? 'bg-violet-600/30 border border-violet-500'
                      : 'bg-gray-700/50 hover:bg-gray-700 border border-transparent'
                  }`}
                >
                  {/* Current indicator */}
                  {currentProjectId === project.id && (
                    <div className="w-2 h-2 bg-violet-500 rounded-full flex-shrink-0" />
                  )}

                  {/* Project info */}
                  <div className="flex-1 min-w-0">
                    {renamingId === project.id ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => handleCommitRename(project.id)}
                        onKeyDown={e => handleKeyDown(e, project.id)}
                        autoFocus
                        className="w-full bg-gray-600 text-white px-2 py-1 rounded border border-violet-500 focus:outline-none"
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <div className="text-white font-medium truncate">{project.name}</div>
                    )}
                    <div className="text-xs text-gray-400">
                      Last modified: {formatDate(project.lastModified)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => handleStartRename(project, e)}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-600 rounded transition-colors"
                      title="Rename"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={e => handleDeleteProject(project.id, e)}
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded transition-colors"
                      title="Delete"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-700 text-xs text-gray-500 text-center">
          Projects are stored in your browser's IndexedDB
        </div>
      </div>
    </div>
  )
}
