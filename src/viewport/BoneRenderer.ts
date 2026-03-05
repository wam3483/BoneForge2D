import { useEffect, useRef } from 'react'
import { useApplication, useTick } from '@pixi/react'
import { Container, Graphics, Text, TextStyle, FederatedPointerEvent, Sprite, Texture } from 'pixi.js'
import { useEditorStore } from '../store'
import { evaluateWorldTransform } from '../model/transforms'
import { setAttachmentsContainer } from './AttachmentsRef'
import { useGridSettings } from '../hooks/useGridSettings'
import type { Bone, Skeleton } from '../model/types'

// --- Bone shape drawing ---
function hexToNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

function drawBoneShape(
  g: Graphics,
  length: number,
  selected: boolean,
  hovered: boolean,
  visible: boolean,
  isDescendant: boolean,
  boneColor = '#7c3aed',
  boneColorAlpha = 0.85,
): void {
  g.clear()
  if (!visible) return

  const width = Math.min(20, Math.max(8, 8 + length * 0.05))
  const hw = width / 2
  const dw = Math.max(3, width * 0.25)

  // Trace the bone polygon (reused for both draw passes)
  function traceBody() {
    g.moveTo(0, 0)
    g.lineTo(dw, -dw)
    g.lineTo(length * 0.15, -hw)
    g.lineTo(length, 0)
    g.lineTo(length * 0.15, hw)
    g.lineTo(dw, dw)
    g.closePath()
  }

  // Pass 1 — bone's own color, always
  g.setFillStyle({ color: hexToNum(boneColor), alpha: boneColorAlpha })
  g.setStrokeStyle({ width: 1, color: 0x888888 })
  traceBody()
  g.fill()
  g.stroke()

  // Pass 2 — white highlight overlay for selected / descendants / hovered
  if (selected) {
    g.setFillStyle({ color: 0xffffff, alpha: 0.55 })
    g.setStrokeStyle({ width: 3, color: 0xffffff, alpha: 0.9 })
    traceBody()
    g.fill()
    g.stroke()
  } else if (isDescendant) {
    g.setFillStyle({ color: 0xffffff, alpha: 0.22 })
    g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.4 })
    traceBody()
    g.fill()
    g.stroke()
  } else if (hovered) {
    g.setFillStyle({ color: 0xffffff, alpha: 0.35 })
    g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.6 })
    traceBody()
    g.fill()
    g.stroke()
  }
}

/** Returns the IDs of all recursive descendants of boneId (not including boneId itself). */
function getDescendantIds(boneId: string, skeleton: Skeleton): Set<string> {
  const result = new Set<string>()
  const queue = [...skeleton.bones[boneId]?.childIds ?? []]
  while (queue.length > 0) {
    const id = queue.pop()!
    result.add(id)
    const bone = skeleton.bones[id]
    if (bone) queue.push(...bone.childIds)
  }
  return result
}

function getBoneLength(bone: Bone): number {
  return bone.length ?? 60
}

type BoneGraphicsEntry = {
  g: Graphics
  label: Text
  thumbnails: Sprite[]
}

// --- Grid drawing ---
function drawGrid(
  g: Graphics,
  gridSettings: { gridSize: number; minorLines: number; color: string; colorAlpha: number; majorColor: string; majorColorAlpha: number },
  viewWidth: number,
  viewHeight: number,
  cameraX: number,
  cameraY: number,
  cameraScale: number
): void {
  g.clear()
  if (!gridSettings) return

  const { gridSize, minorLines, color, colorAlpha, majorColor, majorColorAlpha } = gridSettings

  // Parse hex colors to numeric
  const parseColor = (hex: string) => parseInt(hex.replace('#', ''), 16)
  const minorColorValue = parseColor(color)
  const majorColorValue = parseColor(majorColor)

  // Draw minor lines (if enabled)
  if (minorLines > 0) {
    const minorSpacing = gridSize / minorLines
    g.setStrokeStyle({ width: 1 / cameraScale, color: minorColorValue, alpha: colorAlpha })
    const startX = Math.floor(-cameraX / cameraScale / minorSpacing) * minorSpacing
    const startY = Math.floor(-cameraY / cameraScale / minorSpacing) * minorSpacing
    const endX = startX + viewWidth / cameraScale + minorSpacing
    const endY = startY + viewHeight / cameraScale + minorSpacing

    for (let x = startX; x < endX; x += minorSpacing) {
      g.moveTo(x, startY)
      g.lineTo(x, endY)
    }
    for (let y = startY; y < endY; y += minorSpacing) {
      g.moveTo(startX, y)
      g.lineTo(endX, y)
    }
    g.stroke()
  }

  // Draw major lines
  g.setStrokeStyle({ width: 1.5 / cameraScale, color: majorColorValue, alpha: majorColorAlpha })
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

// --- Constraint indicator drawing ---
function drawConstraintIndicator(
  g: Graphics,
  lockedAxis: 'x' | 'y' | null,
  visible: boolean
): void {
  g.clear()
  if (!visible || !lockedAxis) return

  const length = 50

  // Draw X axis (red)
  const xAlpha = lockedAxis === 'x' ? 0.9 : 0.2
  g.setStrokeStyle({ width: 2, color: 0xff4444, alpha: xAlpha })
  g.moveTo(0, 0)
  g.lineTo(length, 0)
  g.stroke()
  // X axis square endpoint
  g.setStrokeStyle({ width: 1, color: 0xff4444, alpha: xAlpha })
  g.rect(length, -5, 10, 10)
  g.fill({ color: 0xff4444, alpha: xAlpha * 0.5 })
  g.stroke()

  // Draw Y axis (green)
  const yAlpha = lockedAxis === 'y' ? 0.9 : 0.2
  g.setStrokeStyle({ width: 2, color: 0x44ff44, alpha: yAlpha })
  g.moveTo(0, 0)
  g.lineTo(0, -length)
  g.stroke()
  // Y axis square endpoint
  g.setStrokeStyle({ width: 1, color: 0x44ff44, alpha: yAlpha })
  g.rect(-5, -length - 10, 10, 10)
  g.fill({ color: 0x44ff44, alpha: yAlpha * 0.5 })
  g.stroke()
}

const BONE_SNAP_PX = 15

type DragSnapTarget = {
  worldPos: { x: number; y: number }
  type: 'start' | 'tip'
  boneId: string
}

type BoneDragState = {
  boneId: string
  startLocalX: number
  startLocalY: number
  startScreenX: number
  startScreenY: number
  preDragSkeleton: Skeleton
  constraintAxis: 'x' | 'y' | null
  snapTarget: DragSnapTarget | null
  attachedToParent: boolean
  coselectedStarts: Map<string, { x: number; y: number }>
}

// --- BoneRendererLayer React component ---
export function BoneRendererLayer() {
  const { app } = useApplication()
  const { settings: gridSettings } = useGridSettings()
  const cameraRef = useRef<{ container: Container; camera: import('./ViewportCamera').ViewportCamera } | null>(null)
  const boneGraphicsRef = useRef<Map<string, BoneGraphicsEntry>>(new Map())
  const gridGraphicsRef = useRef<Graphics | null>(null)
  const constraintIndicatorRef = useRef<Graphics | null>(null)
  const gizmoLayerRef = useRef<import('./GizmoLayer').GizmoLayer | null>(null)
  const boneDragRef = useRef<BoneDragState | null>(null)
  const dragSnapRef = useRef<DragSnapTarget | null>(null)
  const snapHighlightRef = useRef<Graphics | null>(null)
  const rectSelectRef = useRef<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null)
  const rectSelectGraphicsRef = useRef<Graphics | null>(null)
  const thumbnailCache = useRef<Map<string, Texture>>(new Map())

  const store = useEditorStore

  useEffect(() => {
    if (!app?.canvas) return   // app not yet initialized — re-runs when [app] dep changes

    // Import ViewportCamera dynamically to avoid circular deps.
    // GizmoLayer is chained inside so it is always created after the camera containers exist.
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

      // Constraint indicator for Ctrl+drag axis lock
      const constraintG = new Graphics()
      bonesContainer.addChild(constraintG)
      constraintIndicatorRef.current = constraintG

      // Snap highlight for bone-to-bone snapping during drag
      const snapHighlightG = new Graphics()
      bonesContainer.addChild(snapHighlightG)
      snapHighlightRef.current = snapHighlightG

      // Rect selection overlay (drawn in world space each frame from screen coords)
      const rectSelectG = new Graphics()
      bonesContainer.addChild(rectSelectG)
      rectSelectGraphicsRef.current = rectSelectG

      // Sync camera state back to store
      cam.onCameraChange = () => {
        const s = cam.getState()
        store.getState().setViewport(s)
      }

      cameraRef.current = { container: bonesContainer, camera: cam }

      // Restore camera from store (e.g. on IndexedDB restore)
      const stored = store.getState().viewport
      cam.setFromState(stored)

      // GizmoLayer must come after the camera containers are built — chain the import here
      import('./GizmoLayer').then(({ GizmoLayer }) => {
        gizmoLayerRef.current = new GizmoLayer(app, bonesContainer, cam)
      })
    })

    // --- Bone drag handlers (select tool: drag bone directly to reposition) ---
    const onBoneDragMove = (e: FederatedPointerEvent) => {
      if (rectSelectRef.current) {
        rectSelectRef.current.currentX = e.global.x
        rectSelectRef.current.currentY = e.global.y
        return
      }
      if (!boneDragRef.current || !cameraRef.current) return
      const drag = boneDragRef.current
      const { skeleton, snapEnabled, snapGridSize } = store.getState()
      const bone = skeleton.bones[drag.boneId]
      if (!bone) return

      const camScale = cameraRef.current.camera.container.scale.x
      let worldDx = (e.global.x - drag.startScreenX) / camScale
      let worldDy = (e.global.y - drag.startScreenY) / camScale

      if (e.ctrlKey) {
        if (!drag.constraintAxis) {
          const threshold = 2 / camScale
          if (Math.abs(worldDx) > threshold || Math.abs(worldDy) > threshold) {
            drag.constraintAxis = Math.abs(worldDx) > Math.abs(worldDy) ? 'x' : 'y'
          }
        }
        if (drag.constraintAxis === 'x') worldDy = 0
        else if (drag.constraintAxis === 'y') worldDx = 0
      }

      const parentWorld = bone.parentId ? evaluateWorldTransform(bone.parentId, skeleton) : null
      const parentRot = parentWorld?.rotation ?? 0
      const parentScaleX = parentWorld?.scaleX ?? 1
      const parentScaleY = parentWorld?.scaleY ?? 1
      const cos = Math.cos(-parentRot)
      const sin = Math.sin(-parentRot)
      let localDx = (cos * worldDx - sin * worldDy) / parentScaleX
      let localDy = (sin * worldDx + cos * worldDy) / parentScaleY

      if (snapEnabled) {
        localDx = Math.round(localDx / snapGridSize) * snapGridSize
        localDy = Math.round(localDy / snapGridSize) * snapGridSize
      }

      let finalLocalX = drag.startLocalX + localDx
      let finalLocalY = drag.startLocalY + localDy

      // Compute where the dragged bone's origin would be in world space
      const pcos = Math.cos(parentRot)
      const psin = Math.sin(parentRot)
      const draggedWorldX = parentWorld
        ? parentWorld.x + pcos * finalLocalX * parentScaleX - psin * finalLocalY * parentScaleY
        : finalLocalX
      const draggedWorldY = parentWorld
        ? parentWorld.y + psin * finalLocalX * parentScaleX + pcos * finalLocalY * parentScaleY
        : finalLocalY

      // Find nearest snap candidate (excluding self and descendants)
      const camera = cameraRef.current.camera
      const draggedScreen = camera.worldToScreen(draggedWorldX, draggedWorldY)
      const selfDescendants = getDescendantIds(drag.boneId, skeleton)
      let bestSnap: DragSnapTarget | null = null
      let bestDist = BONE_SNAP_PX + 1

      for (const candidate of Object.values(skeleton.bones)) {
        if (candidate.id === drag.boneId || selfDescendants.has(candidate.id)) continue
        let cWorld: ReturnType<typeof evaluateWorldTransform>
        try { cWorld = evaluateWorldTransform(candidate.id, skeleton) } catch { continue }

        const startScreen = camera.worldToScreen(cWorld.x, cWorld.y)
        const startDist = Math.hypot(draggedScreen.x - startScreen.x, draggedScreen.y - startScreen.y)
        if (startDist < bestDist) {
          bestDist = startDist
          bestSnap = { worldPos: { x: cWorld.x, y: cWorld.y }, type: 'start', boneId: candidate.id }
        }

        const tipX = cWorld.x + Math.cos(cWorld.rotation) * candidate.length * cWorld.scaleX
        const tipY = cWorld.y + Math.sin(cWorld.rotation) * candidate.length * cWorld.scaleX
        const tipScreen = camera.worldToScreen(tipX, tipY)
        const tipDist = Math.hypot(draggedScreen.x - tipScreen.x, draggedScreen.y - tipScreen.y)
        if (tipDist < bestDist) {
          bestDist = tipDist
          bestSnap = { worldPos: { x: tipX, y: tipY }, type: 'tip', boneId: candidate.id }
        }
      }

      // Override position with snap point
      if (bestSnap) {
        if (parentWorld) {
          const lx = bestSnap.worldPos.x - parentWorld.x
          const ly = bestSnap.worldPos.y - parentWorld.y
          finalLocalX = (cos * lx - sin * ly) / parentScaleX
          finalLocalY = (sin * lx + cos * ly) / parentScaleY
        } else {
          finalLocalX = bestSnap.worldPos.x
          finalLocalY = bestSnap.worldPos.y
        }
      }

      drag.snapTarget = bestSnap
      dragSnapRef.current = bestSnap
      store.getState().setBoneTransformSilent(drag.boneId, { x: finalLocalX, y: finalLocalY })

      // Multi-bone: apply the same world-space delta to co-selected bones
      if (drag.coselectedStarts.size > 0) {
        // Compute world delta from the dragged bone's local delta
        const prot = parentWorld?.rotation ?? 0
        const pscaleX = parentWorld?.scaleX ?? 1
        const pscaleY = parentWorld?.scaleY ?? 1
        const pcos = Math.cos(prot)
        const psin = Math.sin(prot)
        const localDeltaX = finalLocalX - drag.startLocalX
        const localDeltaY = finalLocalY - drag.startLocalY
        const actualWorldDx = pcos * localDeltaX * pscaleX - psin * localDeltaY * pscaleY
        const actualWorldDy = psin * localDeltaX * pscaleX + pcos * localDeltaY * pscaleY

        for (const [coId, coStart] of drag.coselectedStarts) {
          const coBone = skeleton.bones[coId]
          if (!coBone) continue
          const coParent = coBone.parentId ? evaluateWorldTransform(coBone.parentId, skeleton) : null
          const coRot = coParent?.rotation ?? 0
          const coSx = coParent?.scaleX ?? 1
          const coSy = coParent?.scaleY ?? 1
          const ccos = Math.cos(-coRot)
          const csin = Math.sin(-coRot)
          const coLocalDx = (ccos * actualWorldDx - csin * actualWorldDy) / coSx
          const coLocalDy = (csin * actualWorldDx + ccos * actualWorldDy) / coSy
          store.getState().setBoneTransformSilent(coId, {
            x: coStart.x + coLocalDx,
            y: coStart.y + coLocalDy,
          })
        }
      }
    }

    const onBoneDragEnd = () => {
      if (rectSelectRef.current && cameraRef.current) {
        const { startX, startY, currentX, currentY } = rectSelectRef.current
        const cam = cameraRef.current.camera
        const sw = cam.screenToWorld(startX, startY)
        const ew = cam.screenToWorld(currentX, currentY)
        const minX = Math.min(sw.x, ew.x)
        const maxX = Math.max(sw.x, ew.x)
        const minY = Math.min(sw.y, ew.y)
        const maxY = Math.max(sw.y, ew.y)
        const state = store.getState()
        const inRect = Object.values(state.skeleton.bones)
          .filter(bone => {
            try {
              const w = evaluateWorldTransform(bone.id, state.skeleton)
              return w.x >= minX && w.x <= maxX && w.y >= minY && w.y <= maxY
            } catch { return false }
          })
          .map(b => b.id)
        if (inRect.length > 0) store.getState().addBonesToSelection(inRect)
        rectSelectRef.current = null
        return
      }
      if (boneDragRef.current) {
        const drag = boneDragRef.current
        const snap = drag.snapTarget

        if (drag.coselectedStarts.size > 0) {
          // Multi-bone drag: commit all moved bones as one undo entry, skip reparent
          const allBoneIds = [drag.boneId, ...drag.coselectedStarts.keys()]
          store.getState().commitMultiTransformDrag(allBoneIds, drag.preDragSkeleton)
        } else if (snap) {
          const state = store.getState()
          const newParentId: string | null = snap.boneId
          const currentBone = state.skeleton.bones[drag.boneId]
          if (currentBone && newParentId !== currentBone.parentId) {
            // Reparent: compute new local position+rotation relative to the new parent
            const preDragBone = drag.preDragSkeleton.bones[drag.boneId]
            const oldParentWorld = preDragBone?.parentId
              ? evaluateWorldTransform(preDragBone.parentId, drag.preDragSkeleton)
              : null
            const boneWorldRotation = (oldParentWorld?.rotation ?? 0) + (preDragBone?.localTransform.rotation ?? 0)
            let newLocalX: number, newLocalY: number, newLocalRotation: number
            if (newParentId) {
              const newParentWorld = evaluateWorldTransform(newParentId, drag.preDragSkeleton)
              const pcos = Math.cos(-newParentWorld.rotation)
              const psin = Math.sin(-newParentWorld.rotation)
              const lx = snap.worldPos.x - newParentWorld.x
              const ly = snap.worldPos.y - newParentWorld.y
              newLocalX = (pcos * lx - psin * ly) / newParentWorld.scaleX
              newLocalY = (psin * lx + pcos * ly) / newParentWorld.scaleY
              newLocalRotation = boneWorldRotation - newParentWorld.rotation
            } else {
              newLocalX = snap.worldPos.x
              newLocalY = snap.worldPos.y
              newLocalRotation = boneWorldRotation
            }
            store.getState().commitBoneDrop(drag.boneId, newParentId, { x: newLocalX, y: newLocalY, rotation: newLocalRotation }, drag.preDragSkeleton)
          } else {
            store.getState().commitTransformDrag(drag.boneId, drag.preDragSkeleton)
          }
        } else if (drag.attachedToParent) {
          // Was snapped to parent's start/tip — dragged away without snapping elsewhere → detach
          const state = store.getState()
          const currentBone = state.skeleton.bones[drag.boneId]
          if (currentBone?.parentId) {
            const boneWorld = evaluateWorldTransform(drag.boneId, state.skeleton)
            store.getState().commitBoneDrop(drag.boneId, null, {
              x: boneWorld.x,
              y: boneWorld.y,
              rotation: boneWorld.rotation,
            }, drag.preDragSkeleton)
          } else {
            store.getState().commitTransformDrag(drag.boneId, drag.preDragSkeleton)
          }
        } else {
          store.getState().commitTransformDrag(drag.boneId, drag.preDragSkeleton)
        }
      }
      boneDragRef.current = null
      dragSnapRef.current = null
    }

    const onStagePointerDown = (e: FederatedPointerEvent) => {
      const state = store.getState()
      if (e.shiftKey && state.activeTool === 'select') {
        rectSelectRef.current = { startX: e.global.x, startY: e.global.y, currentX: e.global.x, currentY: e.global.y }
      }
    }

    app.stage?.on('pointerdown', onStagePointerDown)
    app.stage?.on('globalpointermove', onBoneDragMove)
    app.stage?.on('pointerup', onBoneDragEnd)

    return () => {
      app.stage?.off('pointerdown', onStagePointerDown)
      app.stage?.off('globalpointermove', onBoneDragMove)
      app.stage?.off('pointerup', onBoneDragEnd)
      gizmoLayerRef.current?.destroy()
      gizmoLayerRef.current = null
      constraintIndicatorRef.current?.destroy()
      constraintIndicatorRef.current = null
      snapHighlightRef.current?.destroy()
      snapHighlightRef.current = null
      rectSelectGraphicsRef.current?.destroy()
      rectSelectGraphicsRef.current = null
      cameraRef.current?.camera.destroy()
      cameraRef.current = null

      // Cleanup thumbnail cache
      thumbnailCache.current.forEach(texture => texture.destroy())
      thumbnailCache.current.clear()
      boneGraphicsRef.current.clear()
      setAttachmentsContainer(null)
    }
  }, [app])

  // --- Helper to create or get thumbnail texture ---
  async function getThumbnailTexture(dataUrl: string, cache: Map<string, Texture>): Promise<Texture | null> {
    if (cache.has(dataUrl)) {
      return cache.get(dataUrl)!
    }
    try {
      const texture = await Texture.from(dataUrl)
      cache.set(dataUrl, texture)
      return texture
    } catch {
      console.warn('Failed to create thumbnail texture:', dataUrl)
      return null
    }
  }

  // --- Helper to update thumbnails for a bone ---
  async function updateBoneThumbnails(
    boneId: string,
    container: Container,
    currentThumbnails: Sprite[],
    storeState: ReturnType<typeof useEditorStore.getState>,
    cache: Map<string, Texture>,
    position: { x: number; y: number }
  ): Promise<void> {
    const boneAttachments = Object.values(storeState.attachments).filter(a => a.boneId === boneId)
    const existingThumbnails = [...currentThumbnails]
    const neededThumbnails: string[] = []

    for (const attachment of boneAttachments) {
      if (!existingThumbnails.some(s => s.texture === cache.get(attachment.imageId))) {
        neededThumbnails.push(attachment.imageId)
      }
    }

    // Remove excess thumbnails
    for (const sprite of existingThumbnails) {
      if (!boneAttachments.some(a => cache.get(a.imageId) === sprite.texture)) {
        sprite.destroy()
      }
    }

    currentThumbnails.length = 0

    // Add needed thumbnails
    for (const imageId of neededThumbnails) {
      const asset = storeState.imageAssets[imageId]
      if (!asset) continue

      const texture = await getThumbnailTexture(asset.dataUrl, cache)
      if (!texture) continue

      const sprite = new Sprite(texture)
      sprite.anchor.set(0.5, 0.5)
      sprite.eventMode = 'none'
      sprite.visible = true
      sprite.position.set(position.x, position.y)

      // Scale thumbnail based on bone length (12px minimum, max 24px)
      const bone = storeState.skeleton.bones[boneId]
      const boneLength = bone ? bone.length : 60
      const scale = Math.max(0.2, Math.min(1.0, boneLength / 24))
      sprite.scale.set(scale)

      // Stagger multiple thumbnails
      const offset = (currentThumbnails.length * 8) * scale
      sprite.position.set(position.x + offset, position.y - 2 * scale)

      container.addChild(sprite)
      currentThumbnails.push(sprite)
    }
  }

  useTick(() => {
    if (!app?.screen || !cameraRef.current) return
    const { container: bonesContainer, camera } = cameraRef.current
    const state = store.getState()
    const { skeleton, selectedBoneId, selectedBoneIds, hoveredBoneId, gridVisible, activeTool, attachments } = state
    const camState = camera.getState()

    // --- Grid ---
    if (gridGraphicsRef.current) {
      if (gridVisible) {
        drawGrid(gridGraphicsRef.current, gridSettings, app.screen.width, app.screen.height, camState.x, camState.y, camState.scale)
      } else {
        gridGraphicsRef.current.clear()
      }
    }

    // --- Descendant highlight set ---
    const descendantIds = selectedBoneId ? getDescendantIds(selectedBoneId, skeleton) : new Set<string>()

    // --- Bones ---
    const boneIds = new Set(Object.keys(skeleton.bones))
    const existing = boneGraphicsRef.current

    // Remove Graphics for deleted bones
    for (const [id, entry] of existing) {
      if (!boneIds.has(id)) {
        // Destroy thumbnails
        for (const sprite of entry.thumbnails) {
          sprite.destroy()
        }
        bonesContainer.removeChild(entry.g)
        bonesContainer.removeChild(entry.label)
        entry.g.destroy()
        entry.label.destroy()
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

        // Bone selection + drag-to-move (select tool)
        g.on('pointerdown', (e: FederatedPointerEvent) => {
          if (e.button === 0) {
            if (e.ctrlKey || e.metaKey) {
              store.getState().toggleBoneSelection(bone.id)
            } else if (store.getState().selectedBoneIds.includes(bone.id)) {
              // Already in selection: update primary without clearing multi-selection
              store.getState().setPrimarySelectedBone(bone.id)
            } else {
              store.getState().setSelectedBone(bone.id)
            }
            if (store.getState().activeTool === 'select') {
              const snap = store.getState()
              const t = snap.skeleton.bones[bone.id].localTransform

              // Detect if bone's start is coincident with parent's start or tip
              let attachedToParent = false
              const currentBone = snap.skeleton.bones[bone.id]
              if (currentBone?.parentId && cameraRef.current) {
                try {
                  const camera = cameraRef.current.camera
                  const boneWorld = evaluateWorldTransform(bone.id, snap.skeleton)
                  const boneScreen = camera.worldToScreen(boneWorld.x, boneWorld.y)
                  const parentBone = snap.skeleton.bones[currentBone.parentId]
                  const parentWorld = evaluateWorldTransform(currentBone.parentId, snap.skeleton)

                  const startScreen = camera.worldToScreen(parentWorld.x, parentWorld.y)
                  const distToStart = Math.hypot(boneScreen.x - startScreen.x, boneScreen.y - startScreen.y)

                  const tipX = parentWorld.x + Math.cos(parentWorld.rotation) * parentBone.length * parentWorld.scaleX
                  const tipY = parentWorld.y + Math.sin(parentWorld.rotation) * parentBone.length * parentWorld.scaleX
                  const tipScreen = camera.worldToScreen(tipX, tipY)
                  const distToTip = Math.hypot(boneScreen.x - tipScreen.x, boneScreen.y - tipScreen.y)

                  attachedToParent = distToStart < BONE_SNAP_PX || distToTip < BONE_SNAP_PX
                } catch { /* ignore */ }
              }

              // Compute coselectedStarts: other selected root-most bones (excluding dragged, its ancestors, and its descendants)
              const { selectedBoneIds } = snap
              const selSet = new Set(selectedBoneIds)
              const draggedDescendants = getDescendantIds(bone.id, snap.skeleton)
              // ancestors of the dragged bone
              const draggedAncestors = new Set<string>()
              let aid: string | null = snap.skeleton.bones[bone.id]?.parentId ?? null
              while (aid) {
                draggedAncestors.add(aid)
                aid = snap.skeleton.bones[aid]?.parentId ?? null
              }

              const coselectedStarts = new Map<string, { x: number; y: number }>()
              for (const selId of selectedBoneIds) {
                if (selId === bone.id) continue
                if (draggedDescendants.has(selId)) continue
                if (draggedAncestors.has(selId)) continue
                const selBone = snap.skeleton.bones[selId]
                if (!selBone) continue
                // Topological filter: skip if any ancestor is also in the selection
                let pid: string | null = selBone.parentId
                let hasSelectedAncestor = false
                while (pid) {
                  if (selSet.has(pid)) { hasSelectedAncestor = true; break }
                  pid = snap.skeleton.bones[pid]?.parentId ?? null
                }
                if (!hasSelectedAncestor) {
                  coselectedStarts.set(selId, { x: selBone.localTransform.x, y: selBone.localTransform.y })
                }
              }

              boneDragRef.current = {
                boneId: bone.id,
                startLocalX: t.x,
                startLocalY: t.y,
                startScreenX: e.global.x,
                startScreenY: e.global.y,
                preDragSkeleton: snap.skeleton,
                constraintAxis: null,
                snapTarget: null,
                attachedToParent,
                coselectedStarts,
              }
            }
            e.stopPropagation()
          }
        })
        g.on('pointerover', () => store.getState().setHoveredBone(bone.id))
        g.on('pointerout', () => store.getState().setHoveredBone(null))

        bonesContainer.addChild(g)
        bonesContainer.addChild(label)
        entry = { g, label, thumbnails: [] }
        existing.set(bone.id, entry)
      }

      // Compute world transform and apply to Graphics
      try {
        const world = evaluateWorldTransform(bone.id, skeleton)
        const isSelected = selectedBoneIds.includes(bone.id)
        const isHovered = hoveredBoneId === bone.id
        const isDescendant = descendantIds.has(bone.id)
        const boneLen = getBoneLength(bone) * world.scaleX

        entry.g.position.set(world.x, world.y)
        entry.g.rotation = world.rotation
        entry.g.visible = bone.visible
        entry.label.visible = bone.visible
        entry.label.position.set(world.x + 4, world.y - 14)
        entry.label.text = bone.name

        drawBoneShape(entry.g, boneLen, isSelected, isHovered, bone.visible, isDescendant, bone.color ?? '#7c3aed', bone.colorAlpha ?? 0.85)

        // Update thumbnails for this bone
        const boneAttachments = Object.values(attachments).filter(a => a.boneId === bone.id)
        if (boneAttachments.length > 0 && entry.thumbnails.length === 0) {
          // Initialize thumbnails when we first have attachments
          updateBoneThumbnails(bone.id, bonesContainer, entry.thumbnails, state, thumbnailCache.current, { x: world.x, y: world.y })
        } else if (boneAttachments.length === 0 && entry.thumbnails.length > 0) {
          // Remove all thumbnails when no attachments
          for (const sprite of entry.thumbnails) {
            sprite.destroy()
          }
          entry.thumbnails.length = 0
        } else if (boneAttachments.length > 0) {
          // Check if we need to update thumbnails (asset list changed)
          const neededAssetIds = new Set(boneAttachments.map(a => a.imageId))
          const currentAssetIds = new Set(
            entry.thumbnails
              .map(s => {
                // Find asset ID by looking up texture in cache
                for (const [dataUrl, texture] of thumbnailCache.current) {
                  if (texture === s.texture) {
                    // Find the image asset with this dataUrl
                    for (const [imageId, asset] of Object.entries(state.imageAssets)) {
                      if (asset.dataUrl === dataUrl) {
                        return imageId
                      }
                    }
                  }
                }
                return null
              })
              .filter(id => id !== null)
          )

          // If attachments changed, update thumbnails
          if (!Array.from(neededAssetIds).every(id => currentAssetIds.has(id))) {
            updateBoneThumbnails(bone.id, bonesContainer, entry.thumbnails, state, thumbnailCache.current, { x: world.x, y: world.y })
          }
        }
      } catch {
        // Bone might temporarily not have a parent during creation
      }
    }

    // --- Constraint indicator ---
    if (constraintIndicatorRef.current) {
      const drag = boneDragRef.current
      if (drag && drag.constraintAxis && selectedBoneId) {
        const world = evaluateWorldTransform(selectedBoneId, skeleton)
        constraintIndicatorRef.current.position.set(world.x, world.y)
        // No rotation - constraint is in screen/world space, not bone local space
        constraintIndicatorRef.current.rotation = 0
        // Move to end of container to render on top of bones
        bonesContainer.addChild(constraintIndicatorRef.current)
        drawConstraintIndicator(constraintIndicatorRef.current, drag.constraintAxis, true)
      } else {
        constraintIndicatorRef.current.clear()
      }
    }

    // --- Drag snap highlight ---
    if (snapHighlightRef.current) {
      const g = snapHighlightRef.current
      g.clear()
      const snap = dragSnapRef.current
      g.clear()
      if (snap) {
        const color = snap.type === 'tip' ? 0x00ffff : 0xffaa00
        g.setStrokeStyle({ width: 2, color, alpha: 0.9 })
        g.circle(snap.worldPos.x, snap.worldPos.y, 8)
        g.stroke()
        g.setFillStyle({ color, alpha: 0.6 })
        g.circle(snap.worldPos.x, snap.worldPos.y, 3)
        g.fill()
        bonesContainer.addChild(g) // ensure renders on top
      }
    }

    // --- Rect selection overlay ---
    if (rectSelectGraphicsRef.current) {
      const g = rectSelectGraphicsRef.current
      g.clear()
      if (rectSelectRef.current) {
        const { startX, startY, currentX, currentY } = rectSelectRef.current
        const sw = camera.screenToWorld(startX, startY)
        const ew = camera.screenToWorld(currentX, currentY)
        const rx = Math.min(sw.x, ew.x)
        const ry = Math.min(sw.y, ew.y)
        const rw = Math.abs(sw.x - ew.x)
        const rh = Math.abs(sw.y - ew.y)
        g.setFillStyle({ color: 0x4499ff, alpha: 0.08 })
        g.rect(rx, ry, rw, rh)
        g.fill()
        g.setStrokeStyle({ width: 1 / camState.scale, color: 0x4499ff, alpha: 0.8 })
        g.rect(rx, ry, rw, rh)
        g.stroke()
        bonesContainer.addChild(g)
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
