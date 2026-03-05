import { Application, Container, Graphics, FederatedPointerEvent, Rectangle } from 'pixi.js'
import { useEditorStore } from '../store'
import { evaluateWorldTransform } from '../model/transforms'
import type { BoneTransform, Skeleton } from '../model/types'
import { ViewportCamera } from './ViewportCamera'

type GizmoMode = 'rotate' | 'scale' | null

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

// Custom annular hit area — only the ring between innerRadius and outerRadius responds to pointer events
class RingHitArea {
  constructor(private innerRadius: number, private outerRadius: number) {}
  contains(x: number, y: number): boolean {
    const d = Math.hypot(x, y)
    return d >= this.innerRadius && d <= this.outerRadius
  }
}

// --- RotateGizmo: Full circle ring handle ---
class RotateGizmo {
  private container: Container
  private ringHandle: Graphics

  constructor(parent: Container) {
    this.container = new Container()
    this.container.visible = false
    parent.addChild(this.container)

    this.ringHandle = new Graphics()
    this.ringHandle.eventMode = 'static'
    this.ringHandle.cursor = 'grab'
    this.ringHandle.name = 'rotate'
    this.container.addChild(this.ringHandle)
  }

  draw(): void {
    const radius = 52
    this.ringHandle.clear()

    // Dashed-style ring: draw the full circle outline
    this.ringHandle.setStrokeStyle({ width: 2.5, color: 0xffaa00, alpha: 0.9 })
    this.ringHandle.circle(0, 0, radius)
    this.ringHandle.stroke()

    // Small arrow at 0° (rightmost point) indicating rotation direction
    const ax = radius + 1
    this.ringHandle.setStrokeStyle({ width: 2, color: 0xffaa00, alpha: 0.9 })
    this.ringHandle.moveTo(ax - 7, -6)
    this.ringHandle.lineTo(ax + 1, 0)
    this.ringHandle.lineTo(ax - 7, 6)
    this.ringHandle.stroke()

    // Ring hit area — only respond to pointer events near the ring, not inside it
    this.ringHandle.hitArea = new RingHitArea(radius - 10, radius + 10)
  }

  setPosition(x: number, y: number, _rotation: number): void {
    this.container.position.set(x, y)
    // No container rotation — circle looks the same at any angle
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible
  }

  hide(): void {
    this.container.visible = false
  }

  getGizmoGraphics(): Graphics[] {
    return [this.ringHandle]
  }
}

// --- ScaleGizmo: Axis handles with square endpoints ---
class ScaleGizmo {
  private container: Container
  private xHandle: Graphics
  private yHandle: Graphics

  constructor(parent: Container) {
    this.container = new Container()
    this.container.visible = false
    parent.addChild(this.container)

    this.xHandle = this.createScaleHandle('x-scale')
    this.yHandle = this.createScaleHandle('y-scale')
  }

  private createScaleHandle(name: string): Graphics {
    const g = new Graphics()
    g.eventMode = 'static'
    g.cursor = 'ew-resize'
    g.name = name
    this.container.addChild(g)
    return g
  }

  draw(): void {
    // X scale handle (red, horizontal line with square endpoint)
    this.xHandle.clear()
    this.xHandle.setStrokeStyle({ width: 2, color: 0xff4444 })
    this.xHandle.moveTo(0, 0)
    this.xHandle.lineTo(50, 0)
    this.xHandle.stroke()
    this.xHandle.setStrokeStyle({ width: 1, color: 0xff4444 })
    this.xHandle.rect(50, -5, 10, 10)
    this.xHandle.fill({ color: 0xff4444, alpha: 0.5 })
    this.xHandle.stroke()
    this.xHandle.hitArea = new Rectangle(-5, -10, 70, 20)

    // Y scale handle (green, vertical line with square endpoint)
    this.yHandle.clear()
    this.yHandle.setStrokeStyle({ width: 2, color: 0x44ff44 })
    this.yHandle.moveTo(0, 0)
    this.yHandle.lineTo(0, -50)
    this.yHandle.stroke()
    this.yHandle.setStrokeStyle({ width: 1, color: 0x44ff44 })
    this.yHandle.rect(-5, -60, 10, 10)
    this.yHandle.fill({ color: 0x44ff44, alpha: 0.5 })
    this.yHandle.stroke()
    this.yHandle.hitArea = new Rectangle(-10, -65, 20, 70)
  }

  setPosition(x: number, y: number, rotation: number): void {
    this.container.position.set(x, y)
    this.container.rotation = rotation
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible
  }

  hide(): void {
    this.container.visible = false
  }

  getGizmoGraphics(): Graphics[] {
    return [this.xHandle, this.yHandle]
  }
}

// --- GizmoLayer: Main gizmo manager ---
export class GizmoLayer {
  private app: Application
  private cameraContainer: Container
  private camera: ViewportCamera
  private gizmoContainer: Container
  private rotateGizmo: RotateGizmo
  private scaleGizmo: ScaleGizmo
  private activeGizmo: GizmoMode = null
  private isDragging = false
  private dragStart = { screenX: 0, screenY: 0, localX: 0, localY: 0 }
  private boneStartTransform: BoneTransform | null = null
  private draggedHandleName: string | null = null
  private preDragSkeleton: Skeleton | null = null
  private dragBoneId: string | null = null
  // Rotation: bone center in screen space, last mouse pos, and accumulated angle delta
  private boneCenterScreen = { x: 0, y: 0 }
  private rotateLastMouse = { x: 0, y: 0 }
  private rotateAccumulated = 0
  private dragMoved = false
  private static readonly DRAG_THRESHOLD = 4 // pixels
  // Scale cascade: Shift+drag scales the bone and all its descendants
  private scaleCascadeBoneIds: Set<string> | null = null
  private scaleCascadeStarts: Map<string, BoneTransform> | null = null

  constructor(app: Application, cameraContainer: Container, camera: ViewportCamera) {
    this.app = app
    this.cameraContainer = cameraContainer
    this.camera = camera
    this.gizmoContainer = new Container()
    this.gizmoContainer.sortableChildren = true
    this.gizmoContainer.zIndex = 1000
    cameraContainer.addChild(this.gizmoContainer)

    this.rotateGizmo = new RotateGizmo(this.gizmoContainer)
    this.scaleGizmo = new ScaleGizmo(this.gizmoContainer)

    // Draw gizmo graphics once (shapes are static)
    this.rotateGizmo.draw()
    this.scaleGizmo.draw()

    this.setupDragHandlers()
  }

  private setupDragHandlers(): void {
    const stage = this.app.stage

    stage.on('pointerdown', (e: FederatedPointerEvent) => {
      if (e.button !== 0) return
      const state = useEditorStore.getState()
      if (state.activeTool === 'rotate' && state.selectedBoneId && !this.isDragging) {
        this.startDrag('rotate', e, state.selectedBoneId)
      }
    })
    stage.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (!this.isDragging || !this.activeGizmo) return
      this.applyDrag(e)
    })
    stage.on('pointerup', () => this.endDrag())
    stage.on('pointerupoutside', () => this.endDrag())
  }

  // Called from useTick each frame
  update(): void {
    const state = useEditorStore.getState()
    const { selectedBoneId, skeleton, activeTool } = state
    const tool = activeTool === 'select' ? null : activeTool as GizmoMode

    if (!selectedBoneId || !skeleton.bones[selectedBoneId] || !tool) {
      this.rotateGizmo.hide()
      this.scaleGizmo.hide()
      return
    }

    const world = evaluateWorldTransform(selectedBoneId, skeleton)
    this.rotateGizmo.setVisible(tool === 'rotate')
    this.scaleGizmo.setVisible(tool === 'scale')

    this.rotateGizmo.setPosition(world.x, world.y, world.rotation)
    this.scaleGizmo.setPosition(world.x, world.y, world.rotation)
  }

  setupHandleListeners(gizmoMode: GizmoMode, boneId: string): void {
    const state = useEditorStore.getState()
    if (!state.selectedBoneId || state.selectedBoneId !== boneId) return

    const handlers = this.getGizmoHandlers(gizmoMode)
    if (!handlers) return

    const graphicsList = handlers.getGizmoGraphics()
    graphicsList.forEach(g => {
      g.removeAllListeners('pointerdown')
      g.on('pointerdown', (e: FederatedPointerEvent) => {
        this.draggedHandleName = g.name || null
        this.startDrag(gizmoMode, e, boneId)
        e.stopPropagation()
      })
    })
  }

  private getGizmoHandlers(mode: GizmoMode): RotateGizmo | ScaleGizmo | null {
    switch (mode) {
      case 'rotate': return this.rotateGizmo
      case 'scale': return this.scaleGizmo
      default: return null
    }
  }

  startDrag(gizmoMode: GizmoMode, e: FederatedPointerEvent, boneId: string): void {
    const state = useEditorStore.getState()
    this.isDragging = true
    this.activeGizmo = gizmoMode
    this.dragBoneId = boneId
    this.preDragSkeleton = state.skeleton
    this.boneStartTransform = { ...state.skeleton.bones[boneId].localTransform }
    this.dragStart = { screenX: e.global.x, screenY: e.global.y, localX: 0, localY: 0 }
    this.dragMoved = false

    if (gizmoMode === 'rotate') {
      const world = evaluateWorldTransform(boneId, state.skeleton)
      // Use camera's worldToScreen for proper coordinate transformation
      this.boneCenterScreen = this.camera.worldToScreen(world.x, world.y)
      this.rotateLastMouse = { x: e.global.x, y: e.global.y }
      this.rotateAccumulated = 0
    }

    if (gizmoMode === 'scale') {
      // Shift+drag: scale the bone and all its descendants (cascade)
      if (e.shiftKey) {
        const descendants = getDescendantIds(boneId, state.skeleton)
        this.scaleCascadeBoneIds = descendants
        this.scaleCascadeStarts = new Map()
        descendants.forEach(descId => {
          const descBone = state.skeleton.bones[descId]
          if (descBone) {
            this.scaleCascadeStarts!.set(descId, { ...descBone.localTransform })
          }
        })
      } else {
        this.scaleCascadeBoneIds = null
        this.scaleCascadeStarts = null
      }
    }
  }

  private endDrag(): void {
    if (this.isDragging && this.dragBoneId && this.preDragSkeleton) {
      if (!this.dragMoved && (this.activeGizmo === 'rotate' || this.activeGizmo === 'scale')) {
        useEditorStore.getState().setSelectedBone(null)
      } else if (this.dragMoved) {
        // For cascade scale, use commitMultiTransformDrag to include all descendants
        if (this.activeGizmo === 'scale' && this.scaleCascadeBoneIds) {
          const allBoneIds = [this.dragBoneId, ...this.scaleCascadeBoneIds]
          useEditorStore.getState().commitMultiTransformDrag(allBoneIds, this.preDragSkeleton)
        } else {
          useEditorStore.getState().commitTransformDrag(this.dragBoneId, this.preDragSkeleton)
        }
      }
    }
    this.isDragging = false
    this.activeGizmo = null
    this.boneStartTransform = null
    this.draggedHandleName = null
    this.preDragSkeleton = null
    this.dragBoneId = null
    this.dragMoved = false
    this.scaleCascadeBoneIds = null
    this.scaleCascadeStarts = null
  }

  private applyDrag(e: FederatedPointerEvent): void {
    const state = useEditorStore.getState()
    const { selectedBoneId, skeleton, snapEnabled } = state
    if (!selectedBoneId || !this.boneStartTransform) return

    if (!this.dragMoved) {
      const dist = Math.hypot(e.global.x - this.dragStart.screenX, e.global.y - this.dragStart.screenY)
      if (dist > GizmoLayer.DRAG_THRESHOLD) this.dragMoved = true
    }

    if (this.activeGizmo === 'rotate') {
      // True arc rotation: measure the angle swept at the bone center between the
      // previous and current mouse position each frame, then accumulate.
      const cx = this.boneCenterScreen.x
      const cy = this.boneCenterScreen.y
      const prevDx = this.rotateLastMouse.x - cx
      const prevDy = this.rotateLastMouse.y - cy
      const currDx = e.global.x - cx
      const currDy = e.global.y - cy
      // atan2(cross, dot) gives the signed angle from prev→curr (positive = CW in screen space)
      const cross = prevDx * currDy - prevDy * currDx
      const dot = prevDx * currDx + prevDy * currDy
      this.rotateAccumulated += Math.atan2(cross, dot)
      this.rotateLastMouse = { x: e.global.x, y: e.global.y }

      const snappedDelta = snapEnabled
        ? Math.round(this.rotateAccumulated / (Math.PI / 12)) * (Math.PI / 12)
        : this.rotateAccumulated

      useEditorStore.getState().setBoneTransformSilent(selectedBoneId, {
        rotation: this.boneStartTransform.rotation + snappedDelta,
      })
    }

    if (this.activeGizmo === 'scale') {
      const world = evaluateWorldTransform(selectedBoneId, skeleton)
      const camScale = this.cameraContainer.scale.x
      const boneScreenX = world.x * camScale + this.cameraContainer.x
      const boneScreenY = world.y * camScale + this.cameraContainer.y
      const startDist = Math.hypot(this.dragStart.screenX - boneScreenX, this.dragStart.screenY - boneScreenY)
      const currentDist = Math.hypot(e.global.x - boneScreenX, e.global.y - boneScreenY)
      if (startDist < 1) return

      const scaleFactor = Math.max(0.01, currentDist / startDist)
      const snappedScale = snapEnabled ? Math.round(scaleFactor * 10) / 10 : scaleFactor

      // Apply scale to the selected bone
      if (this.draggedHandleName === 'x-scale') {
        useEditorStore.getState().setBoneTransformSilent(selectedBoneId, {
          scaleX: this.boneStartTransform.scaleX * scaleFactor,
        })
      } else if (this.draggedHandleName === 'y-scale') {
        useEditorStore.getState().setBoneTransformSilent(selectedBoneId, {
          scaleY: this.boneStartTransform.scaleY * scaleFactor,
        })
      } else {
        useEditorStore.getState().setBoneTransformSilent(selectedBoneId, {
          scaleX: this.boneStartTransform.scaleX * snappedScale,
          scaleY: this.boneStartTransform.scaleY * snappedScale,
        })
      }

      // Cascade scale to descendants if Shift is held
      if (this.scaleCascadeBoneIds && this.scaleCascadeStarts) {
        for (const [descId, startTransform] of this.scaleCascadeStarts) {
          if (this.draggedHandleName === 'x-scale') {
            useEditorStore.getState().setBoneTransformSilent(descId, {
              scaleX: startTransform.scaleX * scaleFactor,
            })
          } else if (this.draggedHandleName === 'y-scale') {
            useEditorStore.getState().setBoneTransformSilent(descId, {
              scaleY: startTransform.scaleY * scaleFactor,
            })
          } else {
            useEditorStore.getState().setBoneTransformSilent(descId, {
              scaleX: startTransform.scaleX * snappedScale,
              scaleY: startTransform.scaleY * snappedScale,
            })
          }
        }
      }
    }
  }

  destroy(): void {
    this.gizmoContainer.destroy({ children: true })
  }
}
