import { useEffect, useRef } from 'react'
import { useApplication, useTick } from '@pixi/react'
import { Container, Graphics, Text, TextStyle, FederatedPointerEvent } from 'pixi.js'
import { useEditorStore } from '../store'
import { evaluateWorldTransform } from '../model/transforms'
import { setAttachmentsContainer } from './AttachmentsRef'
import type { Bone, Skeleton } from '../model/types'

// --- Bone shape drawing ---
function drawBoneShape(
  g: Graphics,
  length: number,
  selected: boolean,
  hovered: boolean,
  visible: boolean
): void {
  g.clear()
  if (!visible) return

  const color = selected ? 0xf59e0b : hovered ? 0xfcd34d : 0x7c3aed
  const strokeColor = selected ? 0xfbbf24 : 0x888888
  const width = Math.max(8, length * 0.15)
  const hw = width / 2
  const dw = width * 0.15

  g.setFillStyle({ color, alpha: 0.85 })
  g.setStrokeStyle({ width: 1, color: strokeColor })
  g.moveTo(0, 0)
  g.lineTo(dw, -dw)
  g.lineTo(length * 0.25, -hw)
  g.lineTo(length, 0)
  g.lineTo(length * 0.25, hw)
  g.lineTo(dw, dw)
  g.closePath()
  g.fill()
  g.stroke()

  // Origin dot
  g.setFillStyle({ color: 0xffffff, alpha: 1 })
  g.circle(0, 0, dw * 1.5)
  g.fill()
}

function getBoneLength(bone: Bone, skeleton: Skeleton): number {
  if (bone.childIds.length === 0) return 60 // default leaf length
  // Use distance to first child as the bone length
  const child = skeleton.bones[bone.childIds[0]]
  return Math.hypot(child.localTransform.x, child.localTransform.y)
}

// --- Grid drawing ---
function drawGrid(g: Graphics, gridSize: number, viewWidth: number, viewHeight: number, cameraX: number, cameraY: number, cameraScale: number): void {
  g.clear()
  g.setStrokeStyle({ width: 1 / cameraScale, color: 0x333355, alpha: 0.6 })

  const startX = Math.floor(-cameraX / cameraScale / gridSize) * gridSize
  const startY = Math.floor(-cameraY / cameraScale / gridSize) * gridSize
  const endX = startX + viewWidth / cameraScale + gridSize
  const endY = startY + viewHeight / cameraScale + gridSize

  for (let x = startX; x < endX; x += gridSize) {
    g.moveTo(x, startY)
    g.lineTo(x, endY)
  }
  for (let y = startY; y < endY; y += gridSize) {
    g.moveTo(startX, y)
    g.lineTo(endX, y)
  }
  g.stroke()
}

// --- BoneRendererLayer React component ---
export function BoneRendererLayer() {
  const { app } = useApplication()
  const cameraRef = useRef<{ container: Container; camera: import('./ViewportCamera').ViewportCamera } | null>(null)
  const boneGraphicsRef = useRef<Map<string, { g: Graphics; label: Text }>>(new Map())
  const gridGraphicsRef = useRef<Graphics | null>(null)
  const gizmoLayerRef = useRef<import('./GizmoLayer').GizmoLayer | null>(null)

  const store = useEditorStore

  useEffect(() => {
    // Import ViewportCamera dynamically to avoid circular deps
    import('./ViewportCamera').then(({ ViewportCamera }) => {
      const cam = new ViewportCamera(app)
      const canvas = app.canvas as HTMLCanvasElement
      cam.setupWheelZoom(canvas)

      // Grid graphics in camera container (below attachments)
      const gridG = new Graphics()
      cam.container.addChild(gridG)
      gridGraphicsRef.current = gridG

      // Attachments container (for attached image Sprites) - below bones
      const attachmentsContainer = new Container()
      attachmentsContainer.sortableChildren = true
      cam.container.addChild(attachmentsContainer)
      setAttachmentsContainer(attachmentsContainer)

      // Bones container above attachments
      const bonesContainer = new Container()
      cam.container.addChild(bonesContainer)

      // Sync camera state back to store
      cam.onCameraChange = () => {
        const s = cam.getState()
        store.getState().setViewport(s)
      }

      cameraRef.current = { container: bonesContainer, camera: cam }

      // Restore camera from store (e.g., on IndexedDB restore)
      const stored = store.getState().viewport
      cam.setFromState(stored)
    })

    return () => {
      gizmoLayerRef.current?.destroy()
      gizmoLayerRef.current = null
      cameraRef.current?.camera.destroy()
      cameraRef.current = null
      boneGraphicsRef.current.clear()
      setAttachmentsContainer(null)
    }
  }, [app])

  // Initialize GizmoLayer after camera is ready
  useEffect(() => {
    if (!cameraRef.current) return
    import('./GizmoLayer').then(({ GizmoLayer }) => {
      const gizmo = new GizmoLayer(app, cameraRef.current!.camera.container)
      gizmoLayerRef.current = gizmo
    })
  }, [app])

  // Initialize bone creation after camera is ready
  useEffect(() => {
    if (!cameraRef.current) return
    import('./BoneCreation').then(({ setupBoneCreation }) => {
      const cleanup = setupBoneCreation(app, cameraRef.current!.camera)
      return cleanup
    })
  }, [app])

  useTick(() => {
    if (!cameraRef.current) return
    const { container: bonesContainer, camera } = cameraRef.current
    const state = store.getState()
    const { skeleton, selectedBoneId, hoveredBoneId, gridVisible, snapGridSize, activeTool } = state
    const camState = camera.getState()

    // --- Grid ---
    if (gridGraphicsRef.current) {
      if (gridVisible) {
        drawGrid(gridGraphicsRef.current, snapGridSize, app.screen.width, app.screen.height, camState.x, camState.y, camState.scale)
      } else {
        gridGraphicsRef.current.clear()
      }
    }

    // --- Bones ---
    const boneIds = new Set(Object.keys(skeleton.bones))
    const existing = boneGraphicsRef.current

    // Remove Graphics for deleted bones
    for (const [id, { g, label }] of existing) {
      if (!boneIds.has(id)) {
        bonesContainer.removeChild(g)
        bonesContainer.removeChild(label)
        g.destroy()
        label.destroy()
        existing.delete(id)
      }
    }

    // Create/update Graphics for each bone
    for (const bone of Object.values(skeleton.bones)) {
      let entry = existing.get(bone.id)
      if (!entry) {
        const g = new Graphics()
        g.eventMode = 'static'
        g.cursor = 'pointer'

        const label = new Text({
          text: bone.name,
          style: new TextStyle({ fontSize: 11, fill: 0xcccccc, fontFamily: 'monospace' })
        })
        label.eventMode = 'none'

        // Bone selection on click
        g.on('pointerdown', (e: FederatedPointerEvent) => {
          if (e.button === 0) {
            store.getState().setSelectedBone(bone.id)
            e.stopPropagation()
          }
        })
        g.on('pointerover', () => store.getState().setHoveredBone(bone.id))
        g.on('pointerout', () => store.getState().setHoveredBone(null))

        bonesContainer.addChild(g)
        bonesContainer.addChild(label)
        entry = { g, label }
        existing.set(bone.id, entry)
      }

      // Compute world transform and apply to Graphics
      try {
        const world = evaluateWorldTransform(bone.id, skeleton)
        const isSelected = selectedBoneId === bone.id
        const isHovered = hoveredBoneId === bone.id
        const boneLen = getBoneLength(bone, skeleton)

        entry.g.position.set(world.x, world.y)
        entry.g.rotation = world.rotation
        entry.g.visible = bone.visible
        entry.label.visible = bone.visible
        entry.label.position.set(world.x + 4, world.y - 14)
        entry.label.text = bone.name

        drawBoneShape(entry.g, boneLen, isSelected, isHovered, bone.visible)
      } catch {
        // Bone might temporarily not have a parent during creation
      }
    }

    // --- Gizmos ---
    if (gizmoLayerRef.current) {
      gizmoLayerRef.current.update()

      // Setup handle listeners for selected bone when tool changes
      const gizmoMode = activeTool === 'select' ? null : activeTool
      if (selectedBoneId && gizmoMode) {
        gizmoLayerRef.current.setupHandleListeners(gizmoMode, selectedBoneId)
      }
    }
  })

  return null // Renders nothing into React tree — all output is imperative PixiJS
}
