import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../store'
import type { AnimatedProperty, InterpolationType } from '../model/types'

const INTERP_GROUPS: { label: string; values: InterpolationType[] }[] = [
  { label: 'Basic',    values: ['constant', 'linear'] },
  { label: 'Ease',     values: ['easeInQuad', 'easeOutQuad', 'easeInOutQuad'] },
  { label: 'Ease (strong)', values: ['easeInCubic', 'easeOutCubic', 'easeInOutCubic'] },
  { label: 'Custom',   values: ['bezier'] },
]

const INTERP_LABELS: Record<InterpolationType, string> = {
  constant: 'Constant',
  linear: 'Linear',
  easeInQuad: 'Ease In',
  easeOutQuad: 'Ease Out',
  easeInOutQuad: 'Ease In/Out',
  easeInCubic: 'Ease In (Strong)',
  easeOutCubic: 'Ease Out (Strong)',
  easeInOutCubic: 'Ease In/Out (Strong)',
  bezier: 'Bezier',
}

// Diamond color per interpolation type
function diamondColor(interp: InterpolationType): string {
  if (interp === 'constant')                                       return 'bg-sky-400 hover:bg-sky-300'
  if (interp === 'linear')                                         return 'bg-amber-400 hover:bg-amber-300'
  if (interp === 'easeInQuad' || interp === 'easeOutQuad' || interp === 'easeInOutQuad')   return 'bg-emerald-400 hover:bg-emerald-300'
  if (interp === 'easeInCubic' || interp === 'easeOutCubic' || interp === 'easeInOutCubic') return 'bg-green-400 hover:bg-green-300'
  return 'bg-violet-400 hover:bg-violet-300' // bezier
}

type ContextMenu = {
  x: number
  y: number
  boneId: string
  prop: AnimatedProperty
  kfIndex: number
  currentInterp: InterpolationType
} | null

const PX_PER_SEC = 100
const LABEL_W = 156
const RULER_H = 24
const TRACK_H = 20

const PROPERTIES: AnimatedProperty[] = ['x', 'y', 'rotation', 'scaleX', 'scaleY']
const PROP_LABELS: Record<AnimatedProperty, string> = {
  x: 'X', y: 'Y', rotation: 'Rotation', scaleX: 'Scale X', scaleY: 'Scale Y',
}

export function TimelinePanel() {
  const animations       = useEditorStore(s => s.animations)
  const currentAnimId    = useEditorStore(s => s.currentAnimationId)
  const currentTime      = useEditorStore(s => s.currentTime)
  const isPlaying        = useEditorStore(s => s.isPlaying)
  const skeleton         = useEditorStore(s => s.skeleton)
  const selectedBoneId   = useEditorStore(s => s.selectedBoneId)
  const editorMode       = useEditorStore(s => s.editorMode)

  const createAnimation  = useEditorStore(s => s.createAnimation)
  const deleteAnimation  = useEditorStore(s => s.deleteAnimation)
  const updateAnimation  = useEditorStore(s => s.updateAnimation)
  const setCurrentAnim   = useEditorStore(s => s.setCurrentAnimation)
  const setPlaybackTime  = useEditorStore(s => s.setPlaybackTime)
  const togglePlayback   = useEditorStore(s => s.togglePlayback)
  const addKeyframe      = useEditorStore(s => s.addKeyframe)
  const deleteKeyframe   = useEditorStore(s => s.deleteKeyframe)
  const updateKeyframe   = useEditorStore(s => s.updateKeyframe)

  const [contextMenu, setContextMenu] = useState<ContextMenu>(null)

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [contextMenu])

  const animation = currentAnimId ? animations[currentAnimId] : null

  // ── Playback RAF loop ────────────────────────────────────────────────────
  const rafRef      = useRef<number | null>(null)
  const lastNowRef  = useRef<number | null>(null)

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastNowRef.current = null
      return
    }

    const tick = (now: number) => {
      if (lastNowRef.current === null) lastNowRef.current = now
      const delta = (now - lastNowRef.current) / 1000
      lastNowRef.current = now

      const s = useEditorStore.getState()
      const anim = s.currentAnimationId ? s.animations[s.currentAnimationId] : null
      if (!anim) { s.setPlaybackState(false, 0); return }

      let t = s.currentTime + delta
      if (t >= anim.duration) {
        t = anim.loop ? t % anim.duration : anim.duration
        if (!anim.loop) { s.setPlaybackState(false, t); return }
      }
      s.setPlaybackTime(t)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying])

  // ── Ruler seek ───────────────────────────────────────────────────────────
  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!animation) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const dur = animation.duration

    const seek = (clientX: number) => {
      const x = clientX - rect.left
      setPlaybackTime(Math.max(0, Math.min(dur, x / PX_PER_SEC)))
    }
    seek(e.clientX)

    const onMove = (me: MouseEvent) => seek(me.clientX)
    const onUp   = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Set Keyframe for selected bone ───────────────────────────────────────
  const handleSetKeyframe = () => {
    if (!currentAnimId || !selectedBoneId) return
    const bone = skeleton.bones[selectedBoneId]
    if (!bone) return
    for (const prop of PROPERTIES) {
      addKeyframe(currentAnimId, selectedBoneId, prop, {
        value: bone.localTransform[prop],
        interpolation: 'linear',
      })
    }
  }

  // ── New animation form ───────────────────────────────────────────────────
  const [creating, setCreating]     = useState(false)
  const [newName, setNewName]       = useState('')
  const [newDur, setNewDur]         = useState('2')
  const nameInputRef                = useRef<HTMLInputElement>(null)

  const handleCreate = () => {
    const dur = parseFloat(newDur)
    if (!newName.trim() || isNaN(dur) || dur <= 0) return
    createAnimation(newName.trim(), dur)
    setCreating(false)
    setNewName('')
    setNewDur('2')
  }

  // ── Build track data ─────────────────────────────────────────────────────
  const channelsByBone: Record<string, AnimatedProperty[]> = {}
  if (animation) {
    for (const ch of animation.channels) {
      if (!channelsByBone[ch.boneId]) channelsByBone[ch.boneId] = []
      channelsByBone[ch.boneId].push(ch.property)
    }
  }
  const boneIds = Object.keys(channelsByBone)
  // Selected bone with channels goes first
  if (selectedBoneId && channelsByBone[selectedBoneId]) {
    const i = boneIds.indexOf(selectedBoneId)
    if (i > 0) { boneIds.splice(i, 1); boneIds.unshift(selectedBoneId) }
  }

  const trackWidth = animation ? Math.max(animation.duration * PX_PER_SEC + 80, 300) : 300

  return (
    <div className="flex flex-col bg-zinc-900 border-t border-zinc-700 flex-shrink-0" style={{ height: 200 }}>

      {/* ── Controls bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 border-b border-zinc-700 flex-shrink-0" style={{ height: 36 }}>

        {/* Animation selector */}
        <select
          className="bg-zinc-800 border border-zinc-600 rounded text-xs px-2 py-1 text-white w-36 cursor-pointer"
          value={currentAnimId ?? ''}
          onChange={e => setCurrentAnim(e.target.value || null)}
        >
          <option value="">— select —</option>
          {Object.values(animations).map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        {/* New animation */}
        <button
          onClick={() => { setCreating(true); setTimeout(() => nameInputRef.current?.focus(), 50) }}
          className="w-6 h-6 flex items-center justify-center bg-violet-600 hover:bg-violet-700 rounded text-white text-sm leading-none"
          title="New animation"
        >+</button>

        {/* Delete animation */}
        {animation && (
          <button
            onClick={() => deleteAnimation(animation.id)}
            className="w-6 h-6 flex items-center justify-center bg-zinc-700 hover:bg-red-700 rounded text-zinc-400 hover:text-white text-sm leading-none"
            title="Delete animation"
          >✕</button>
        )}

        {animation && <div className="w-px h-4 bg-zinc-700 mx-1 flex-shrink-0" />}

        {/* Play / Pause */}
        {animation && (
          <button
            onClick={togglePlayback}
            className="w-7 h-7 flex items-center justify-center bg-zinc-700 hover:bg-zinc-600 rounded text-white"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying
              ? <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="1" width="4" height="10"/><rect x="7" y="1" width="4" height="10"/></svg>
              : <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><polygon points="2,1 11,6 2,11"/></svg>
            }
          </button>
        )}

        {/* Loop */}
        {animation && (
          <button
            onClick={() => updateAnimation(animation.id, { loop: !animation.loop })}
            className={`w-7 h-7 flex items-center justify-center rounded text-sm ${animation.loop ? 'bg-violet-600 text-white' : 'bg-zinc-700 text-zinc-500'}`}
            title="Loop"
          >↻</button>
        )}

        {/* Time readout */}
        {animation && (
          <span className="text-xs text-zinc-400 font-mono tabular-nums">
            {currentTime.toFixed(2)}&thinsp;/&thinsp;{animation.duration.toFixed(2)}s
          </span>
        )}

        {/* Set Keyframe */}
        {animation && selectedBoneId && editorMode === 'animate' && (
          <button
            onClick={handleSetKeyframe}
            className="ml-1 px-2 py-1 bg-amber-600 hover:bg-amber-500 rounded text-xs text-white font-medium flex items-center gap-1"
            title="Insert keyframe for selected bone at current time"
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor">
              <polygon points="6,1 11,6 6,11 1,6"/>
            </svg>
            Set Key
          </button>
        )}

        {/* Duration — right side */}
        {animation && (
          <div className="ml-auto flex items-center gap-1">
            <span className="text-xs text-zinc-600">dur</span>
            <input
              type="number" min="0.1" step="0.5"
              value={animation.duration}
              onChange={e => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v) && v > 0) updateAnimation(animation.id, { duration: v })
              }}
              className="w-16 bg-zinc-800 border border-zinc-600 rounded text-xs px-1.5 py-0.5 text-white text-right"
            />
            <span className="text-xs text-zinc-600">s</span>
          </div>
        )}
      </div>

      {/* ── Track area ──────────────────────────────────────────────────────── */}
      {animation ? (
        <div className="flex-1 overflow-auto select-none" style={{ position: 'relative' }}>
          {/* Inner content — wide enough for full duration */}
          <div style={{ minWidth: LABEL_W + trackWidth }}>

            {/* Ruler row — sticky top */}
            <div className="flex sticky top-0 z-20" style={{ height: RULER_H }}>
              {/* Label column header */}
              <div
                className="sticky left-0 z-30 bg-zinc-900 border-b border-r border-zinc-700 flex-shrink-0 flex items-center px-2"
                style={{ width: LABEL_W }}
              >
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Bone / Property</span>
              </div>

              {/* Ruler track */}
              <div
                className="relative bg-zinc-800 border-b border-zinc-600 cursor-crosshair overflow-hidden flex-shrink-0"
                style={{ width: trackWidth }}
                onMouseDown={handleRulerMouseDown}
              >
                <RulerTicks duration={animation.duration} pxPerSec={PX_PER_SEC} />
                {/* Playhead in ruler */}
                <div
                  className="absolute inset-y-0 w-px bg-amber-400 pointer-events-none"
                  style={{ left: currentTime * PX_PER_SEC }}
                />
              </div>
            </div>

            {/* Bone + property rows */}
            {boneIds.map(boneId => {
              const bone = skeleton.bones[boneId]
              const props = channelsByBone[boneId]
              const isSelected = boneId === selectedBoneId
              return (
                <div key={boneId}>
                  {/* Bone header row */}
                  <div className="flex" style={{ height: TRACK_H }}>
                    <div
                      className={`sticky left-0 z-10 flex-shrink-0 flex items-center px-2 border-b border-r border-zinc-700 ${isSelected ? 'bg-violet-900/40' : 'bg-zinc-800'}`}
                      style={{ width: LABEL_W }}
                    >
                      <span className="text-xs font-medium text-zinc-300 truncate">
                        {bone?.name ?? boneId.slice(0, 8)}
                      </span>
                    </div>
                    <div
                      className={`flex-shrink-0 border-b border-zinc-700 ${isSelected ? 'bg-violet-900/10' : 'bg-zinc-800/30'}`}
                      style={{ width: trackWidth }}
                    />
                  </div>

                  {/* Property rows */}
                  {props.map(prop => {
                    const channel = animation.channels.find(c => c.boneId === boneId && c.property === prop)
                    return (
                      <div key={prop} className="flex" style={{ height: TRACK_H }}>
                        {/* Label */}
                        <div
                          className="sticky left-0 z-10 flex-shrink-0 flex items-center px-4 border-b border-r border-zinc-700/50 bg-zinc-900"
                          style={{ width: LABEL_W }}
                        >
                          <span className="text-[11px] text-zinc-500">{PROP_LABELS[prop]}</span>
                        </div>

                        {/* Track */}
                        <div
                          className="relative flex-shrink-0 border-b border-zinc-700/40 bg-zinc-900/50"
                          style={{ width: trackWidth }}
                        >
                          {/* Playhead */}
                          <div
                            className="absolute inset-y-0 w-px bg-amber-400/25 pointer-events-none"
                            style={{ left: currentTime * PX_PER_SEC }}
                          />

                          {/* Keyframe diamonds */}
                          {channel?.keyframes.map((kf, i) => (
                            <div
                              key={i}
                              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 cursor-pointer z-10 transition-colors ${diamondColor(kf.interpolation)}`}
                              style={{ left: kf.time * PX_PER_SEC }}
                              title={`${PROP_LABELS[prop]} = ${kf.value.toFixed(3)} @ ${kf.time.toFixed(3)}s [${INTERP_LABELS[kf.interpolation]}]\nRight-click to change interpolation`}
                              onClick={() => setPlaybackTime(kf.time)}
                              onContextMenu={e => {
                                e.preventDefault()
                                e.stopPropagation()
                                setContextMenu({
                                  x: e.clientX,
                                  y: e.clientY,
                                  boneId,
                                  prop,
                                  kfIndex: i,
                                  currentInterp: kf.interpolation,
                                })
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Empty state when no bone has keyframes yet */}
            {boneIds.length === 0 && (
              <div className="flex items-center justify-center text-zinc-600 text-xs" style={{ height: 100 }}>
                {editorMode === 'animate'
                  ? 'Select a bone and click "Set Key" to create keyframes'
                  : 'Switch to Animate mode to add keyframes'}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
          {Object.keys(animations).length === 0
            ? 'No animations — click + to create one'
            : 'Select an animation above'}
        </div>
      )}

      {/* ── Keyframe interpolation context menu ─────────────────────────────── */}
      {contextMenu && (
        <div
          className="fixed z-[100] bg-zinc-800 border border-zinc-600 rounded shadow-xl py-1 min-w-[170px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] text-zinc-500 uppercase tracking-wider border-b border-zinc-700 mb-1">
            Interpolation
          </div>
          {INTERP_GROUPS.map(group => (
            <div key={group.label}>
              <div className="px-3 py-0.5 text-[9px] text-zinc-600 uppercase tracking-wider mt-1">{group.label}</div>
              {group.values.map(interp => (
                <button
                  key={interp}
                  className={`w-full text-left px-4 py-1 text-xs flex items-center gap-2 hover:bg-zinc-700 transition-colors ${contextMenu.currentInterp === interp ? 'text-white' : 'text-zinc-400'}`}
                  onClick={() => {
                    updateKeyframe(currentAnimId!, contextMenu.boneId, contextMenu.prop, contextMenu.kfIndex, { interpolation: interp })
                    setContextMenu(null)
                  }}
                >
                  <span className={`w-2 h-2 rotate-45 flex-shrink-0 ${diamondColor(interp).split(' ')[0]}`} />
                  {INTERP_LABELS[interp]}
                  {contextMenu.currentInterp === interp && <span className="ml-auto text-violet-400">✓</span>}
                </button>
              ))}
            </div>
          ))}
          <div className="border-t border-zinc-700 mt-1 pt-1">
            <button
              className="w-full text-left px-4 py-1 text-xs text-red-400 hover:bg-zinc-700 hover:text-red-300 transition-colors"
              onClick={() => {
                deleteKeyframe(currentAnimId!, contextMenu.boneId, contextMenu.prop, contextMenu.kfIndex)
                setContextMenu(null)
              }}
            >
              Delete keyframe
            </button>
          </div>
        </div>
      )}

      {/* ── New animation modal ──────────────────────────────────────────────── */}
      {creating && (
        <div
          className="absolute inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setCreating(false) }}
        >
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-5 w-72 shadow-xl">
            <h3 className="text-white font-semibold mb-4 text-sm">New Animation</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Name</label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
                  placeholder="walk, idle, attack…"
                  className="w-full bg-zinc-700 border border-zinc-500 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Duration (seconds)</label>
                <input
                  type="number" min="0.1" step="0.5"
                  value={newDur}
                  onChange={e => setNewDur(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
                  className="w-full bg-zinc-700 border border-zinc-500 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setCreating(false)}
                  className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm text-white"
                >Cancel</button>
                <button
                  onClick={handleCreate}
                  className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 rounded text-sm text-white font-medium"
                >Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Ruler tick marks ──────────────────────────────────────────────────────────
function RulerTicks({ duration, pxPerSec }: { duration: number; pxPerSec: number }) {
  const minPxBetweenLabels = 50
  const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10]
  const interval = candidates.find(c => c * pxPerSec >= minPxBetweenLabels) ?? 10

  const ticks: React.ReactNode[] = []
  let t = 0
  while (t <= duration + interval * 0.001) {
    const x = Math.round(t * pxPerSec)
    ticks.push(
      <div key={t} className="absolute bottom-0 flex flex-col items-center pointer-events-none" style={{ left: x }}>
        <span className="text-[9px] text-zinc-500 -translate-x-1/2 leading-none mb-0.5">
          {t % 1 === 0 ? `${t}s` : `${t.toFixed(2)}`}
        </span>
        <div className="w-px bg-zinc-500" style={{ height: 6 }} />
      </div>
    )
    t = Math.round((t + interval) * 10000) / 10000
  }
  return <>{ticks}</>
}
