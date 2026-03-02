import { useRef } from 'react'
import { Application, extend } from '@pixi/react'
import { Container, Graphics, Sprite, Text } from 'pixi.js'
import { BoneRendererLayer } from './BoneRenderer'
import { useEditorStore } from '../store'

// Register all PixiJS classes used in JSX — MUST happen before any JSX render
extend({ Container, Graphics, Sprite, Text })

export function PixiViewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorMode = useEditorStore(s => s.editorMode)
  const borderColor = editorMode === 'pose' ? 'border-[--color-mode-pose]' : 'border-[--color-mode-animate]'

  return (
    <div
      ref={containerRef}
      className={`relative flex-1 border-4 ${borderColor} transition-colors`}
      onContextMenu={e => e.preventDefault()}
    >
      <Application resizeTo={containerRef} antialias background={0x1a1a2e}>
        <BoneRendererLayer />
      </Application>
    </div>
  )
}
