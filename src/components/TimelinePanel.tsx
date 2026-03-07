import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../store'
import type { AnimatedProperty, InterpolationType } from '../model/types'

const INTERP_GROUPS: { label: string; values: InterpolationType[] }[] = [
  { label: 'Basic',             values: ['constant', 'linear'] },
  { label: 'Smooth',            values: ['smooth', 'smooth2', 'smoother'] },
  { label: 'Polynomial — Quad', values: ['easeInQuad', 'easeOutQuad', 'easeInOutQuad'] },
  { label: 'Polynomial — Cubic',   values: ['easeInCubic', 'easeOutCubic', 'easeInOutCubic'] },
  { label: 'Polynomial — Quartic', values: ['pow4In', 'pow4Out', 'pow4'] },
  { label: 'Polynomial — Quintic', values: ['pow5In', 'pow5Out', 'pow5'] },
  { label: 'Sine',              values: ['sineIn', 'sineOut', 'sine'] },
  { label: 'Circle',            values: ['circleIn', 'circleOut', 'circle'] },
  { label: 'Exponential ×5',   values: ['exp5In', 'exp5Out', 'exp5'] },
  { label: 'Exponential ×10',  values: ['exp10In', 'exp10Out', 'exp10'] },
  { label: 'Elastic',           values: ['elasticIn', 'elasticOut', 'elastic'] },
  { label: 'Bounce',            values: ['bounceIn', 'bounceOut', 'bounce'] },
  { label: 'Swing',             values: ['swingIn', 'swingOut', 'swing'] },
  { label: 'Custom',            values: ['bezier'] },
]

const INTERP_LABELS: Record<InterpolationType, string> = {
  constant: 'Constant',
  linear: 'Linear',
  smooth: 'Smooth',
  smooth2: 'Smooth²',
  smoother: 'Smoother',
  easeInQuad: 'Ease In',
  easeOutQuad: 'Ease Out',
  easeInOutQuad: 'Ease In/Out',
  easeInCubic: 'Ease In',
  easeOutCubic: 'Ease Out',
  easeInOutCubic: 'Ease In/Out',
  pow4In: 'Ease In',
  pow4Out: 'Ease Out',
  pow4: 'Ease In/Out',
  pow5In: 'Ease In',
  pow5Out: 'Ease Out',
  pow5: 'Ease In/Out',
  sineIn: 'Sine In',
  sineOut: 'Sine Out',
  sine: 'Sine In/Out',
  circleIn: 'Circle In',
  circleOut: 'Circle Out',
  circle: 'Circle In/Out',
  exp5In: 'Exp5 In',
  exp5Out: 'Exp5 Out',
  exp5: 'Exp5 In/Out',
  exp10In: 'Exp10 In',
  exp10Out: 'Exp10 Out',
  exp10: 'Exp10 In/Out',
  elasticIn: 'Elastic In',
  elasticOut: 'Elastic Out',
  elastic: 'Elastic In/Out',
  bounceIn: 'Bounce In',
  bounceOut: 'Bounce Out',
  bounce: 'Bounce In/Out',
  swingIn: 'Swing In',
  swingOut: 'Swing Out',
  swing: 'Swing In/Out',
  bezier: 'Bezier',
}

// Diamond color per interpolation type (Tailwind classes)
function diamondColor(interp: InterpolationType): string {
  switch (interp) {
    case 'constant':                                                  return 'bg-sky-400 hover:bg-sky-300'
    case 'linear':                                                    return 'bg-amber-400 hover:bg-amber-300'
    case 'smooth': case 'smooth2': case 'smoother':                   return 'bg-slate-400 hover:bg-slate-300'
    case 'easeInQuad': case 'easeOutQuad': case 'easeInOutQuad':      return 'bg-emerald-400 hover:bg-emerald-300'
    case 'easeInCubic': case 'easeOutCubic': case 'easeInOutCubic':   return 'bg-green-400 hover:bg-green-300'
    case 'pow4In': case 'pow4Out': case 'pow4':                       return 'bg-lime-400 hover:bg-lime-300'
    case 'pow5In': case 'pow5Out': case 'pow5':                       return 'bg-yellow-400 hover:bg-yellow-300'
    case 'sineIn': case 'sineOut': case 'sine':                       return 'bg-cyan-400 hover:bg-cyan-300'
    case 'circleIn': case 'circleOut': case 'circle':                 return 'bg-pink-400 hover:bg-pink-300'
    case 'exp5In': case 'exp5Out': case 'exp5':                       return 'bg-orange-400 hover:bg-orange-300'
    case 'exp10In': case 'exp10Out': case 'exp10':                    return 'bg-red-400 hover:bg-red-300'
    case 'elasticIn': case 'elasticOut': case 'elastic':              return 'bg-fuchsia-400 hover:bg-fuchsia-300'
    case 'bounceIn': case 'bounceOut': case 'bounce':                 return 'bg-indigo-400 hover:bg-indigo-300'
    case 'swingIn': case 'swingOut': case 'swing':                    return 'bg-purple-400 hover:bg-purple-300'
    default:                                                          return 'bg-violet-400 hover:bg-violet-300'
  }
}

// Tiny easing curve SVG shown next to each interpolation option
function InterpCurve({ interp }: { interp: InterpolationType }) {
  const W = 40, H = 22, PAD = 2
  const pW = W - PAD * 2
  const pH = H - PAD * 2
  const color = interpHex(interp)

  const sample = (t: number): number => {
    const u = 1 - t
    switch (interp) {
      case 'constant':        return t >= 1 ? 1 : 0
      case 'linear':          return t
      case 'smooth':          return t * t * (3 - 2 * t)
      case 'smooth2':         { const s = t * t * (3 - 2 * t); return s * s * (3 - 2 * s) }
      case 'smoother':        return t * t * t * (t * (6 * t - 15) + 10)
      case 'easeInQuad':      return t * t
      case 'easeOutQuad':     return 1 - u * u
      case 'easeInOutQuad':   return t < 0.5 ? 2 * t * t : 1 - 2 * u * u
      case 'easeInCubic':     return t * t * t
      case 'easeOutCubic':    return 1 - u * u * u
      case 'easeInOutCubic':  return t < 0.5 ? 4 * t * t * t : 1 - 4 * u * u * u
      case 'pow4In':          return t * t * t * t
      case 'pow4Out':         return 1 - u * u * u * u
      case 'pow4':            return t < 0.5 ? Math.pow(2*t,4)/2 : Math.pow((t-1)*2,4)/-2+1
      case 'pow5In':          return t * t * t * t * t
      case 'pow5Out':         return 1 - u * u * u * u * u
      case 'pow5':            return t < 0.5 ? Math.pow(2*t,5)/2 : Math.pow((t-1)*2,5)/2+1
      case 'sineIn':          return 1 - Math.cos(t * Math.PI / 2)
      case 'sineOut':         return Math.sin(t * Math.PI / 2)
      case 'sine':            return (1 - Math.cos(t * Math.PI)) / 2
      case 'circleIn':        return 1 - Math.sqrt(1 - t * t)
      case 'circleOut':       return Math.sqrt(1 - (t-1)*(t-1))
      case 'circle':          return t < 0.5 ? (1-Math.sqrt(1-(2*t)*(2*t)))/2 : (Math.sqrt(1-(2*t-2)*(2*t-2))+1)/2
      case 'exp5In':          { const m=Math.pow(2,-5),s=1/(1-m); return (Math.pow(2,5*(t-1))-m)*s }
      case 'exp5Out':         { const m=Math.pow(2,-5),s=1/(1-m); return 1-(Math.pow(2,-5*t)-m)*s }
      case 'exp5':            { const m=Math.pow(2,-5),s=1/(1-m); return t<=0.5?(Math.pow(2,5*(2*t-1))-m)*s/2:(2-(Math.pow(2,-5*(2*t-1))-m)*s)/2 }
      case 'exp10In':         { const m=Math.pow(2,-10),s=1/(1-m); return (Math.pow(2,10*(t-1))-m)*s }
      case 'exp10Out':        { const m=Math.pow(2,-10),s=1/(1-m); return 1-(Math.pow(2,-10*t)-m)*s }
      case 'exp10':           { const m=Math.pow(2,-10),s=1/(1-m); return t<=0.5?(Math.pow(2,10*(2*t-1))-m)*s/2:(2-(Math.pow(2,-10*(2*t-1))-m)*s)/2 }
      case 'elasticIn':       { if(t===0)return 0; if(t===1)return 1; const c=(2*Math.PI)/3; return -Math.pow(2,10*t-10)*Math.sin((10*t-10.75)*c) }
      case 'elasticOut':      { if(t===0)return 0; if(t===1)return 1; const c=(2*Math.PI)/3; return Math.pow(2,-10*t)*Math.sin((10*t-0.75)*c)+1 }
      case 'elastic':         { if(t===0)return 0; if(t===1)return 1; const c=(2*Math.PI)/4.5; return t<0.5?-(Math.pow(2,20*t-10)*Math.sin((20*t-11.125)*c))/2:(Math.pow(2,-20*t+10)*Math.sin((20*t-11.125)*c))/2+1 }
      case 'bounceIn':        return 1 - bounceOutSample(1 - t)
      case 'bounceOut':       return bounceOutSample(t)
      case 'bounce':          return t<0.5?(1-bounceOutSample(1-2*t))/2:(bounceOutSample(2*t-1)+1)/2
      case 'swingIn':         return t*t*(2.5*t-1.5)
      case 'swingOut':        { const a=t-1; return a*a*(2.5*a+1.5)+1 }
      case 'swing':           { return t<=0.5?(()=>{const a=2*t;return a*a*(4*a-3)/2})():(()=>{const a=2*t-2;return a*a*(4*a+3)/2+1})() }
      case 'bezier':          return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2
    }
  }

  const toX = (t: number) => PAD + t * pW
  // Elastic/bounce overshoot beyond [0,1] — clamp to keep curve inside the box
  const toY = (y: number) => PAD + (1 - Math.max(-0.15, Math.min(1.15, y))) * pH

  const N = 32
  const pts = Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N
    return `${toX(t).toFixed(1)},${toY(sample(t)).toFixed(1)}`
  }).join(' ')

  // Constant: flat then vertical step
  if (interp === 'constant') {
    const sx = toX(0), sy = toY(0)
    const mx = toX(1), my = toY(0)
    const ey = toY(1)
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0">
        <rect x={PAD} y={PAD} width={pW} height={pH} fill="#18181b" rx="1" />
        <polyline points={`${sx},${sy} ${mx},${my} ${mx},${ey}`}
          fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  // Bezier: show curve + dashed handle lines + control point dots
  if (interp === 'bezier') {
    const sx = toX(0), sy = toY(0)
    const ex = toX(1), ey = toY(1)
    const c1x = toX(0.1), c1y = toY(0.85)
    const c2x = toX(0.9), c2y = toY(0.15)
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0">
        <rect x={PAD} y={PAD} width={pW} height={pH} fill="#18181b" rx="1" />
        <line x1={sx} y1={sy} x2={c1x} y2={c1y} stroke={color} strokeWidth="0.75" strokeDasharray="2,1.5" opacity="0.55" />
        <line x1={ex} y1={ey} x2={c2x} y2={c2y} stroke={color} strokeWidth="0.75" strokeDasharray="2,1.5" opacity="0.55" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={c1x} cy={c1y} r="1.5" fill={color} opacity="0.9" />
        <circle cx={c2x} cy={c2y} r="1.5" fill={color} opacity="0.9" />
      </svg>
    )
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0">
      <rect x={PAD} y={PAD} width={pW} height={pH} fill="#18181b" rx="1" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Bounce helper for curve preview (mirrors transforms.ts bounceOut)
function bounceOutSample(t: number): number {
  const n = 7.5625, d = 2.75
  if (t < 1/d)       return n*t*t
  if (t < 2/d)       { t -= 1.5/d;  return n*t*t+0.75 }
  if (t < 2.5/d)     { t -= 2.25/d; return n*t*t+0.9375 }
  t -= 2.625/d;      return n*t*t+0.984375
}

// Hex colors for connector segments and curve previews (inline styles)
function interpHex(interp: InterpolationType): string {
  switch (interp) {
    case 'constant':                                                  return '#38bdf8'  // sky-400
    case 'linear':                                                    return '#fbbf24'  // amber-400
    case 'smooth': case 'smooth2': case 'smoother':                   return '#94a3b8'  // slate-400
    case 'easeInQuad': case 'easeOutQuad': case 'easeInOutQuad':      return '#34d399'  // emerald-400
    case 'easeInCubic': case 'easeOutCubic': case 'easeInOutCubic':   return '#4ade80'  // green-400
    case 'pow4In': case 'pow4Out': case 'pow4':                       return '#a3e635'  // lime-400
    case 'pow5In': case 'pow5Out': case 'pow5':                       return '#facc15'  // yellow-400
    case 'sineIn': case 'sineOut': case 'sine':                       return '#22d3ee'  // cyan-400
    case 'circleIn': case 'circleOut': case 'circle':                 return '#f472b6'  // pink-400
    case 'exp5In': case 'exp5Out': case 'exp5':                       return '#fb923c'  // orange-400
    case 'exp10In': case 'exp10Out': case 'exp10':                    return '#f87171'  // red-400
    case 'elasticIn': case 'elasticOut': case 'elastic':              return '#e879f9'  // fuchsia-400
    case 'bounceIn': case 'bounceOut': case 'bounce':                 return '#818cf8'  // indigo-400
    case 'swingIn': case 'swingOut': case 'swing':                    return '#c084fc'  // purple-400
    default:                                                          return '#a78bfa'  // violet-400 bezier
  }
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

                          {/* Connector segments between consecutive keyframes */}
                          {channel?.keyframes.map((kf, i) => {
                            const next = channel.keyframes[i + 1]
                            if (!next) return null
                            const x1 = kf.time * PX_PER_SEC
                            const x2 = next.time * PX_PER_SEC
                            return (
                              <div
                                key={`seg-${i}`}
                                className="absolute top-1/2 -translate-y-1/2 z-0 cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
                                style={{
                                  left: x1,
                                  width: x2 - x1,
                                  height: 2,
                                  backgroundColor: interpHex(kf.interpolation),
                                }}
                                title={`${INTERP_LABELS[kf.interpolation]} — click to change`}
                                onClick={e => {
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
                            )
                          })}

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
      {contextMenu && (() => {
        const MENU_H = 520
        const MENU_W = 210
        const top  = contextMenu.y + MENU_H > window.innerHeight ? contextMenu.y - MENU_H : contextMenu.y
        const left = contextMenu.x + MENU_W > window.innerWidth  ? contextMenu.x - MENU_W : contextMenu.x
        return (
        <div
          className="fixed z-[100] bg-zinc-800 border border-zinc-600 rounded shadow-xl py-1 min-w-[200px] overflow-y-auto"
          style={{ top: Math.max(8, top), left: Math.max(8, left), maxHeight: Math.min(MENU_H, window.innerHeight - 16) }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] text-zinc-500 uppercase tracking-wider border-b border-zinc-700 mb-1">
            Interpolation (outgoing)
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
                  <span className="ml-auto flex items-center gap-1.5">
                    <InterpCurve interp={interp} />
                    {contextMenu.currentInterp === interp && <span className="text-violet-400">✓</span>}
                  </span>
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
        )
      })()}

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
