import { useState, useEffect, useRef } from 'react'
import { useEditorStore } from '../store'

function toDeg(rad: number): number {
  return Math.round((rad * 180) / Math.PI * 1000) / 1000
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function alphaToHex(a: number): string {
  return Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, '0')
}

/** Single editable number cell — local string state, commits on blur/Enter */
function NumCell({
  value,
  onChange,
  step = 0.001,
  readOnly = false,
}: {
  value: number
  onChange?: (v: number) => void
  step?: number
  readOnly?: boolean
}) {
  const [raw, setRaw] = useState(String(Math.round(value * 1000) / 1000))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setRaw(String(Math.round(value * 1000) / 1000))
    }
  }, [value])

  function commit() {
    const n = parseFloat(raw)
    if (!Number.isNaN(n)) {
      onChange?.(n)
      setRaw(String(Math.round(n * 1000) / 1000))
    } else {
      setRaw(String(Math.round(value * 1000) / 1000))
    }
  }

  if (readOnly) {
    return (
      <span className="text-gray-500 text-xs font-mono">
        {Math.round(value * 1000) / 1000}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      type="number"
      step={step}
      value={raw}
      onChange={e => setRaw(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { commit(); inputRef.current?.blur() }
        if (e.key === 'Escape') { setRaw(String(Math.round(value * 1000) / 1000)); inputRef.current?.blur() }
      }}
      className="w-full bg-transparent text-gray-100 text-xs font-mono text-right focus:outline-none focus:bg-gray-700 rounded px-1 py-0.5"
    />
  )
}

/**
 * Color editor — two table rows:
 *   Row 1: label | swatch (native picker) · #rrggbbaa text input · copy button
 *   Row 2: gradient alpha bar (full width, clearly tied to the color)
 */
function ColorEditor({
  color,
  alpha,
  onChange,
}: {
  color: string
  alpha: number
  onChange: (color: string, alpha: number) => void
}) {
  const fullHex = `${color}${alphaToHex(alpha)}`
  const [hexInput, setHexInput] = useState(fullHex)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync when the value changes externally
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setHexInput(`${color}${alphaToHex(alpha)}`)
    }
  }, [color, alpha])

  function parseAndCommit(raw: string) {
    const hex = raw.startsWith('#') ? raw : `#${raw}`
    if (/^#[0-9a-fA-F]{8}$/.test(hex)) {
      // 8-digit: last two chars are alpha
      const rgb = hex.slice(0, 7).toLowerCase()
      const a = parseInt(hex.slice(7), 16) / 255
      onChange(rgb, a)
      setHexInput(`${rgb}${alphaToHex(a)}`)
    } else if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      // 6-digit: keep current alpha
      const rgb = hex.toLowerCase()
      onChange(rgb, alpha)
      setHexInput(`${rgb}${alphaToHex(alpha)}`)
    } else {
      // Invalid — reset
      setHexInput(`${color}${alphaToHex(alpha)}`)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(fullHex).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }

  // Checkerboard + gradient alpha track background
  const alphaTrackStyle: React.CSSProperties = {
    backgroundImage: [
      `linear-gradient(to right, transparent, ${color})`,
      `linear-gradient(45deg, #444 25%, transparent 25%)`,
      `linear-gradient(-45deg, #444 25%, transparent 25%)`,
      `linear-gradient(45deg, transparent 75%, #444 75%)`,
      `linear-gradient(-45deg, transparent 75%, #444 75%)`,
    ].join(', '),
    backgroundSize: `100% 100%, 8px 8px, 8px 8px, 8px 8px, 8px 8px`,
    backgroundPosition: `0 0, 0 0, 0 4px, 4px -4px, -4px 0`,
  }

  return (
    <>
      {/* Row 1: label + controls */}
      <tr className="group hover:bg-gray-750">
        <td className="px-2 py-1 text-xs text-gray-400 whitespace-nowrap w-24 select-none align-middle">
          Color
        </td>
        <td className="px-1 py-1 align-middle">
          <div className="flex items-center gap-1.5 justify-end">

            {/* Swatch — native color picker for RGB */}
            <div
              className="relative w-6 h-5 rounded border border-gray-600 overflow-hidden flex-shrink-0 cursor-pointer"
              title="Pick color"
            >
              {/* Checkerboard behind swatch so alpha is visible */}
              <div className="absolute inset-0" style={{
                backgroundImage: [
                  `linear-gradient(45deg, #555 25%, transparent 25%)`,
                  `linear-gradient(-45deg, #555 25%, transparent 25%)`,
                  `linear-gradient(45deg, transparent 75%, #555 75%)`,
                  `linear-gradient(-45deg, transparent 75%, #555 75%)`,
                ].join(', '),
                backgroundSize: '6px 6px',
                backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0',
              }} />
              <div className="absolute inset-0" style={{ backgroundColor: color, opacity: alpha }} />
              <input
                type="color"
                value={color}
                onChange={e => onChange(e.target.value, alpha)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>

            {/* Hex input — accepts #rrggbb or #rrggbbaa */}
            <input
              ref={inputRef}
              type="text"
              value={hexInput}
              maxLength={9}
              spellCheck={false}
              onChange={e => setHexInput(e.target.value)}
              onBlur={() => parseAndCommit(hexInput)}
              onKeyDown={e => {
                if (e.key === 'Enter') { parseAndCommit(hexInput); inputRef.current?.blur() }
                if (e.key === 'Escape') { setHexInput(`${color}${alphaToHex(alpha)}`); inputRef.current?.blur() }
              }}
              className="w-24 bg-gray-700 text-gray-100 text-xs font-mono px-1.5 py-0.5 rounded border border-gray-600 focus:border-violet-500 focus:outline-none text-center"
              title="Hex color (6 or 8 digits). Paste or type to change."
            />

            {/* Copy button */}
            <button
              onClick={handleCopy}
              title="Copy hex code"
              className="flex-shrink-0 text-gray-500 hover:text-gray-200 transition-colors"
            >
              {copied ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        </td>
      </tr>

      {/* Row 2: alpha bar (full width, visually grouped with color) */}
      <tr>
        <td colSpan={2} className="px-2 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-600 select-none w-3">α</span>
            {/* Track */}
            <div className="relative flex-1 h-3 rounded overflow-hidden" style={alphaTrackStyle}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={alpha}
                onChange={e => onChange(color, Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                title={`Alpha: ${Math.round(alpha * 100)}%`}
              />
              {/* Thumb indicator overlay */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none rounded"
                style={{ left: `calc(${alpha * 100}% - 1px)` }}
              />
            </div>
            <span className="text-[10px] text-gray-500 w-7 text-right select-none">
              {Math.round(alpha * 100)}%
            </span>
          </div>
        </td>
      </tr>
    </>
  )
}

function SectionRow({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={2} className="pt-2 pb-0.5 px-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </span>
      </td>
    </tr>
  )
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="group hover:bg-gray-750">
      <td className="px-2 py-0.5 text-xs text-gray-400 whitespace-nowrap w-24 select-none align-middle">
        {label}
      </td>
      <td className="px-1 py-0.5 text-right align-middle">{children}</td>
    </tr>
  )
}

export function BonePropertiesPanel() {
  const selectedBoneId = useEditorStore(s => s.selectedBoneId)
  const skeleton = useEditorStore(s => s.skeleton)
  const renameBone = useEditorStore(s => s.renameBone)
  const setBoneLength = useEditorStore(s => s.setBoneLength)
  const setBoneColor = useEditorStore(s => s.setBoneColor)
  const setBoneVisibility = useEditorStore(s => s.setBoneVisibility)
  const setBoneTransform = useEditorStore(s => s.setBoneTransform)

  const bone = selectedBoneId ? skeleton.bones[selectedBoneId] : null
  const parentBone = bone?.parentId ? skeleton.bones[bone.parentId] : null

  const [nameValue, setNameValue] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (bone && document.activeElement !== nameRef.current) {
      setNameValue(bone.name)
    }
  }, [bone])

  if (!bone) {
    return (
      <div className="p-3 border-b border-gray-700">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          Properties
        </h2>
        <p className="text-xs text-gray-600 italic">No bone selected.</p>
      </div>
    )
  }

  const lt = bone.localTransform
  const bt = bone.bindTransform
  const boneColor = bone.color ?? '#7c3aed'
  const boneColorAlpha = bone.colorAlpha ?? 0.85

  function commitName() {
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== bone!.name) {
      renameBone(bone!.id, trimmed)
    } else {
      setNameValue(bone!.name)
    }
  }

  return (
    <div className="border-b border-gray-700">
      <div className="px-2 pt-2 pb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Properties
        </h2>
        <span className="text-[10px] text-gray-600 font-mono" title={bone.id}>
          {bone.id.slice(0, 8)}…
        </span>
      </div>

      <table className="w-full border-collapse">
        <tbody>

          {/* ── Identity ── */}
          <SectionRow label="Identity" />

          <PropRow label="Name">
            <input
              ref={nameRef}
              type="text"
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={e => {
                if (e.key === 'Enter') { commitName(); nameRef.current?.blur() }
                if (e.key === 'Escape') { setNameValue(bone.name); nameRef.current?.blur() }
              }}
              className="w-full bg-transparent text-gray-100 text-xs text-right focus:outline-none focus:bg-gray-700 rounded px-1 py-0.5"
            />
          </PropRow>

          <PropRow label="Parent">
            <span className="text-xs text-gray-500 font-mono">
              {parentBone ? parentBone.name : '—'}
            </span>
          </PropRow>

          <PropRow label="Visible">
            <input
              type="checkbox"
              checked={bone.visible}
              onChange={e => setBoneVisibility(bone.id, e.target.checked)}
              className="accent-violet-500 cursor-pointer"
            />
          </PropRow>

          <PropRow label="Length">
            <NumCell value={bone.length} step={1} onChange={v => setBoneLength(bone.id, v)} />
          </PropRow>

          {/* ── Appearance ── */}
          <SectionRow label="Appearance" />

          <ColorEditor
            color={boneColor}
            alpha={boneColorAlpha}
            onChange={(c, a) => setBoneColor(bone.id, c, a)}
          />

          {/* ── Local Transform ── */}
          <SectionRow label="Local Transform" />

          <PropRow label="X">
            <NumCell value={lt.x} onChange={v => setBoneTransform(bone.id, { x: v })} />
          </PropRow>
          <PropRow label="Y">
            <NumCell value={lt.y} onChange={v => setBoneTransform(bone.id, { y: v })} />
          </PropRow>
          <PropRow label="Rotation °">
            <NumCell value={toDeg(lt.rotation)} step={0.1} onChange={v => setBoneTransform(bone.id, { rotation: toRad(v) })} />
          </PropRow>
          <PropRow label="Scale X">
            <NumCell value={lt.scaleX} step={0.01} onChange={v => setBoneTransform(bone.id, { scaleX: v })} />
          </PropRow>
          <PropRow label="Scale Y">
            <NumCell value={lt.scaleY} step={0.01} onChange={v => setBoneTransform(bone.id, { scaleY: v })} />
          </PropRow>

          {/* ── Bind Transform ── */}
          <SectionRow label="Bind Transform" />

          <PropRow label="X"><NumCell value={bt.x} readOnly /></PropRow>
          <PropRow label="Y"><NumCell value={bt.y} readOnly /></PropRow>
          <PropRow label="Rotation °"><NumCell value={toDeg(bt.rotation)} readOnly /></PropRow>
          <PropRow label="Scale X"><NumCell value={bt.scaleX} readOnly /></PropRow>
          <PropRow label="Scale Y"><NumCell value={bt.scaleY} readOnly /></PropRow>

        </tbody>
      </table>

      <div className="h-2" />
    </div>
  )
}
