import type { Project, AppMetadata } from '../model/types'

const DB_NAME = 'boneforge2d'
const DB_VERSION = 2  // Incremented to support multiple projects
const STORE_PROJECTS = 'projects'
const STORE_IMAGES = 'images'
const STORE_METADATA = 'metadata'
const KEY_METADATA = 'app'

let dbPromise: Promise<IDBDatabase> | null = null

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      // Projects store - supports multiple projects
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const projectsStore = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' })
        projectsStore.createIndex('lastModified', 'lastModified')
      }
      // Images store
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: 'id' })
      }
      // App metadata store - tracks last used project
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA)
      }
    }
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = (e) => { dbPromise = null; reject((e.target as IDBOpenDBRequest).error) }
  })
  return dbPromise
}

// --- Project CRUD operations ---

export async function createProject(name: string): Promise<Project> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      lastModified: Date.now(),
    }
    const tx = db.transaction([STORE_PROJECTS], 'readwrite')
    tx.objectStore(STORE_PROJECTS).add(project)
    tx.oncomplete = () => {
      // Set as last used project
      setLastProjectId(project.id).then(() => resolve(project))
    }
    tx.onerror = () => reject(tx.error)
  })
}

export async function listProjects(): Promise<Project[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECTS], 'readonly')
    const req = tx.objectStore(STORE_PROJECTS).getAll()
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.lastModified - a.lastModified))
    req.onerror = () => reject(req.error)
  })
}

export async function getProject(id: string): Promise<Project | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECTS], 'readonly')
    const req = tx.objectStore(STORE_PROJECTS).get(id)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'thumbnail'>>): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECTS], 'readwrite')
    const store = tx.objectStore(STORE_PROJECTS)
    const req = store.get(id)
    req.onsuccess = () => {
      if (req.result) {
        const updated = { ...req.result, ...updates, lastModified: Date.now() }
        store.put(updated)
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECTS], 'readwrite')
    tx.objectStore(STORE_PROJECTS).delete(id)
    tx.oncomplete = () => {
      // Clear last project if it was the deleted one
      getMetadata().then(meta => {
        if (meta.lastProjectId === id) {
          setLastProjectId(null)
        }
        resolve()
      })
    }
    tx.onerror = () => reject(tx.error)
  })
}

export async function saveProjectData(projectId: string, data: {
  skeleton: object
  imageAssets: Record<string, object>
  attachments: Record<string, object>
  animations: Record<string, object>
}): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECTS], 'readwrite')
    const store = tx.objectStore(STORE_PROJECTS)
    const req = store.get(projectId)
    req.onsuccess = () => {
      if (req.result) {
        const updated = { ...req.result, ...data, lastModified: Date.now() }
        store.put(updated)
        // Update last used project
        setLastProjectId(projectId)
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadProjectData(projectId: string): Promise<{
  skeleton: object
  imageAssets: Record<string, object>
  attachments: Record<string, object>
  animations: Record<string, object>
} | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECTS], 'readonly')
    const req = tx.objectStore(STORE_PROJECTS).get(projectId)
    req.onsuccess = () => {
      const result = req.result
      if (result && result.skeleton) {
        resolve({
          skeleton: result.skeleton,
          imageAssets: result.imageAssets || {},
          attachments: result.attachments || {},
          animations: result.animations || {},
        })
      } else {
        resolve(null)
      }
    }
    req.onerror = () => reject(req.error)
  })
}

// --- Metadata operations ---

export async function getMetadata(): Promise<AppMetadata> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_METADATA], 'readonly')
    const req = tx.objectStore(STORE_METADATA).get(KEY_METADATA)
    req.onsuccess = () => resolve(req.result || { lastProjectId: null })
    req.onerror = () => reject(req.error)
  })
}

export async function setLastProjectId(projectId: string | null): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_METADATA], 'readwrite')
    tx.objectStore(STORE_METADATA).put({ lastProjectId: projectId }, KEY_METADATA)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// --- Legacy compatibility (migrate old 'current' project to new system) ---

export async function migrateLegacyProject(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    // Check if legacy 'current' key exists
    const tx = db.transaction([STORE_PROJECTS], 'readonly')
    const req = tx.objectStore(STORE_PROJECTS).get('current')
    req.onsuccess = async () => {
      if (req.result) {
        // Legacy project found, migrate it
        const project = await createProject('Migrated Project')
        await saveProjectData(project.id, {
          skeleton: req.result.skeleton || {},
          imageAssets: req.result.imageAssets || {},
          attachments: req.result.attachments || {},
          animations: req.result.animations || {},
        })
        // Delete legacy data
        const delTx = db.transaction([STORE_PROJECTS], 'readwrite')
        delTx.objectStore(STORE_PROJECTS).delete('current')
        delTx.oncomplete = () => resolve()
      } else {
        resolve()
      }
    }
    req.onerror = () => reject(req.error)
  })
}

// --- Image buffer operations ---

export async function saveImageBuffer(id: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_IMAGES], 'readwrite')
    tx.objectStore(STORE_IMAGES).put({ id, buffer })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadAllImageBuffers(): Promise<Array<{ id: string; buffer: ArrayBuffer }>> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_IMAGES], 'readonly')
    const req = tx.objectStore(STORE_IMAGES).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

export async function deleteImageBuffers(ids: string[]): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_IMAGES], 'readwrite')
    const store = tx.objectStore(STORE_IMAGES)
    ids.forEach(id => store.delete(id))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
