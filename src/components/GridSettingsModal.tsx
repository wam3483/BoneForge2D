import { useEditorStore } from '../store'
import { useGridSettings } from '../hooks/useGridSettings'

export function GridSettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings, resetSettings } = useGridSettings()
  const gridVisible = useEditorStore(s => s.gridVisible)
  const setGridVisible = useEditorStore(s => s.setGridVisible)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg shadow-xl w-[400px] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Grid Settings</h2>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-gray-400">Show Grid</span>
            <input
              type="checkbox"
              checked={gridVisible}
              onChange={e => setGridVisible(e.target.checked)}
              className="w-4 h-4 accent-violet-500 cursor-pointer"
            />
          </label>
        </div>

        {/* Settings */}
        <div className="p-4 space-y-4">
          {/* Grid Size */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Grid Size (px)</label>
            <input
              type="number"
              min="4"
              max="100"
              value={settings.gridSize}
              onChange={e => updateSettings({ gridSize: Number(e.target.value) })}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-violet-500 focus:outline-none"
            />
          </div>

          {/* Minor Lines */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Minor Lines Between Major (0 = none)</label>
            <input
              type="number"
              min="0"
              max="10"
              value={settings.minorLines}
              onChange={e => updateSettings({ minorLines: Number(e.target.value) })}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-violet-500 focus:outline-none"
            />
          </div>

          {/* Colors + Alpha */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-sm text-gray-400">Minor Line Color</label>
              <input
                type="color"
                value={settings.color}
                onChange={e => updateSettings({ color: e.target.value })}
                className="w-full h-10 bg-gray-700 rounded cursor-pointer border border-gray-600"
              />
              <label className="block text-xs text-gray-500">Alpha: {Math.round(settings.colorAlpha * 100)}%</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.colorAlpha}
                onChange={e => updateSettings({ colorAlpha: Number(e.target.value) })}
                className="w-full accent-violet-600"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm text-gray-400">Major Line Color</label>
              <input
                type="color"
                value={settings.majorColor}
                onChange={e => updateSettings({ majorColor: e.target.value })}
                className="w-full h-10 bg-gray-700 rounded cursor-pointer border border-gray-600"
              />
              <label className="block text-xs text-gray-500">Alpha: {Math.round(settings.majorColorAlpha * 100)}%</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.majorColorAlpha}
                onChange={e => updateSettings({ majorColorAlpha: Number(e.target.value) })}
                className="w-full accent-violet-600"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex justify-between items-center">
          <button
            onClick={() => {
              resetSettings()
              onClose()
            }}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
          >
            Reset to Defaults
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
