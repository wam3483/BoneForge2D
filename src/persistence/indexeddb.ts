const DB_NAME = 'boneforge2d'
const DB_VERSION = 1
const STORE_PROJECT = 'project'
const STORE_IMAGES = 'images'

let dbPromise: Promise<IDBDatabase> | null = null

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_PROJECT)) db.createObjectStore(STORE_PROJECT)
      if (!db.objectStoreNames.contains(STORE_IMAGES)) db.createObjectStore(STORE_IMAGES, { keyPath: 'id' })
    }
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = (e) => { dbPromise = null; reject((e.target as IDBOpenDBRequest).error) }
  })
  return dbPromise
}

export async function saveProject(data: object): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECT], 'readwrite')
    tx.objectStore(STORE_PROJECT).put(data, 'current')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadProject(): Promise<object | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECT], 'readonly')
    const req = tx.objectStore(STORE_PROJECT).get('current')
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

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
