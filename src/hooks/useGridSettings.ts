import { useState, useEffect } from 'react'
import type { GridSettings } from '../model/types'

const STORAGE_KEY = 'boneforge-grid-settings'

const DEFAULT_SETTINGS: GridSettings = {
  gridSize: 16,
  minorLines: 4,
  color: '#333355',
  colorAlpha: 0.3,
  majorColor: '#555577',
  majorColorAlpha: 0.6,
}

function loadSettings(): GridSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
    }
  } catch (e) {
    console.error('Failed to load grid settings:', e)
  }
  return DEFAULT_SETTINGS
}

function saveSettings(settings: GridSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save grid settings:', e)
  }
}

export function useGridSettings() {
  const [settings, setSettings] = useState<GridSettings>(loadSettings)

  useEffect(() => {
    setSettings(loadSettings())
  }, [])

  const updateSettings = (updates: Partial<GridSettings>) => {
    const newSettings = { ...settings, ...updates }
    setSettings(newSettings)
    saveSettings(newSettings)
  }

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS)
    saveSettings(DEFAULT_SETTINGS)
  }

  return { settings, updateSettings, resetSettings }
}
