import { Application, Container, Graphics, FederatedPointerEvent, Circle, Rectangle } from 'pixi.js'
import { useEditorStore } from '../store'
import { evaluateWorldTransform } from '../model/transforms'
import type { BoneTransform } from '../model/types'

type GizmoMode = 'move' | 'rotate' | 'scale' | null

// --- MoveGizmo: X/Y axis arrows + center square ---
class MoveGizmo {
  private container: Container
  private xArrow: Graphics
  private yArrow: Graphics
  private centerSquare: Graphics

  constructor(parent: Container) {
    this.container = new Container()
    this.container.visible = false
    parent.addChild(this.container)

    this.xArrow = this.createAxisArrow(0xff4444, 1, 0) // Red, horizontal
    this.yArrow = this.createAxisArrow(0x44ff44, 0, 1) // Green, vertical
    this.centerSquare = this.createCenterSquare()
  }

  private createAxisArrow(_color: number, dirX: number, _dirY: number): Graphics {
    const g = new Graphics()
    g.eventMode = 'static'
    g.cursor = 'grab'
    g.name = dirX !== 0 ? 'x-axis' : 'y-axis'
    this.container.addChild(g)
    return g
  }

  private createCenterSquare(): Graphics {
    const g = new Graphics()
    g.eventMode = 'static'
    g.cursor = 'grab'
    g.name = 'center'
    this.container.addChild(g)
    return g
  }

  draw(): void {
    // X axis arrow (red, horizontal to the right)
    this.xArrow.clear()
    this.xArrow.setStrokeStyle({ width: 2, color: 0xff4444 })
    this.xArrow.moveTo(0, 0)
    this.xArrow.lineTo(40, 0)
    // Arrowhead
    this.xArrow.moveTo(35, -5)
    this.xArrow.lineTo(40, 0)
    this.xArrow.lineTo(35, 5)
    this.xArrow.stroke()
    this.xArrow.hitArea = new Rectangle(-5, -8, 50, 16)

    // Y axis arrow (green, vertical up)
    this.yArrow.clear()
    this.yArrow.setStrokeStyle({ width: 2, color: 0x44ff44 })
    this.yArrow.moveTo(0, 0)
    this.yArrow.lineTo(0, -40)
    // Arrowhead
    this.yArrow.moveTo(-5, -35)
    this.yArrow.lineTo(0, -40)
    this.yArrow.lineTo(5, -35)
    this.yArrow.stroke()
    this.yArrow.hitArea = new Rectangle(-8, -50, 16, 50)

    // Center square (white, free-move)
    this.centerSquare.clear()
    this.centerSquare.setStrokeStyle({ width: 1, color: 0xffffff })
    this.centerSquare.rect(-4, -4, 8, 8)
    this.centerSquare.fill({ color: 0xffffff, alpha: 0.3 })
    this.centerSquare.stroke()
    this.centerSquare.hitArea = new Rectangle(-8, -8, 16, 16)
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
    return [this.xArrow, this.yArrow, this.centerSquare]
  }
}

// --- RotateGizmo: Circular arc handle ---
class RotateGizmo {
  private container: Container
  private arcHandle: Graphics

  constructor(parent: Container) {
    this.container = new Container()
    this.container.visible = false
    parent.addChild(this.container)

    this.arcHandle = new Graphics()
    this.arcHandle.eventMode = 'static'
    this.arcHandle.cursor = 'grab'
    this.arcHandle.name = 'rotate'
    this.container.addChild(this.arcHandle)
  }

  draw(): void {
    this.arcHandle.clear()
    const radius = 50
    // Draw arc from -45deg to 180deg (3/4 circle)
    this.arcHandle.setStrokeStyle({ width: 3, color: 0xffaa00 })
    this.arcHandle.arc(0, 0, radius, -Math.PI / 4, Math.PI)
    this.arcHandle.stroke()

    // Angle indicator arrow at the arc endpoint
    const endX = radius * Math.cos(-Math.PI / 4)
    const endY = radius * Math.sin(-Math.PI / 4)
    this.arcHandle.moveTo(endX, endY)
    this.arcHandle.lineTo(endX + 8, endY - 8)
    this.arcHandle.stroke()

    // Hit area is a full circle at radius 50 with line width 12
    this.arcHandle.hitArea = new Circle(0, 0, radius)
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
    return [this.arcHandle]
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
  private gizmoContainer: Container
  private moveGizmo: MoveGizmo
  private rotateGizmo: RotateGizmo
  private scaleGizmo: ScaleGizmo
  private activeGizmo: GizmoMode = null
  private isDragging = false
  private dragStart = { screenX: 0, screenY: 0, localX: 0, localY: 0 }
  private boneStartTransform: BoneTransform | null = null
  private draggedHandleName: string | null = null

  constructor(app: Application, cameraContainer: Container) {
    this.app = app
    this.cameraContainer = cameraContainer
    this.gizmoContainer = new Container()
    // Gizmos render above bones
    this.gizmoContainer.sortableChildren = true
    this.gizmoContainer.zIndex = 1000
    cameraContainer.addChild(this.gizmoContainer)
    this.moveGizmo = new MoveGizmo(this.gizmoContainer)
    this.rotateGizmo = new RotateGizmo(this.gizmoContainer)
    this.scaleGizmo = new ScaleGizmo(this.gizmoContainer)
    this.setupDragHandlers()
  }

  private setupDragHandlers(): void {
    const stage = this.app.stage

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

    // Hide all gizmos if nothing selected or wrong tool
    if (!selectedBoneId || !skeleton.bones[selectedBoneId] || !tool) {
      this.moveGizmo.hide()
      this.rotateGizmo.hide()
      this.scaleGizmo.hide()
      return
    }

    const world = evaluateWorldTransform(selectedBoneId, skeleton)
    this.moveGizmo.setVisible(tool === 'move')
    this.rotateGizmo.setVisible(tool === 'rotate')
    this.scaleGizmo.setVisible(tool === 'scale')

    this.moveGizmo.setPosition(world.x, world.y, world.rotation)
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

  private getGizmoHandlers(mode: GizmoMode): MoveGizmo | RotateGizmo | ScaleGizmo | null {
    switch (mode) {
      case 'move': return this.moveGizmo
      case 'rotate': return this.rotateGizmo
      case 'scale': return this.scaleGizmo
      default: return null
    }
  }

  startDrag(gizmoMode: GizmoMode, e: FederatedPointerEvent, boneId: string): void {
    const state = useEditorStore.getState()
    this.isDragging = true
    this.activeGizmo = gizmoMode
    this.boneStartTransform = { ...state.skeleton.bones[boneId].localTransform }
    this.dragStart = { screenX: e.global.x, screenY: e.global.y, localX: 0, localY: 0 }
  }

  private endDrag(): void {
    this.isDragging = false
    this.activeGizmo = null
    this.boneStartTransform = null
    this.draggedHandleName = null
  }

  private applyDrag(e: FederatedPointerEvent): void {
    const state = useEditorStore.getState()
    const { selectedBoneId, skeleton, snapEnabled, snapGridSize } = state
    if (!selectedBoneId || !this.boneStartTransform) return

    const bone = skeleton.bones[selectedBoneId]
    const snap = (v: number) => snapEnabled ? Math.round(v / snapGridSize) * snapGridSize : v

    if (this.activeGizmo === 'move') {
      // Convert screen delta to world delta (divided by camera scale)
      const camScale = this.cameraContainer.scale.x
      let dx = (e.global.x - this.dragStart.screenX) / camScale
      let dy = (e.global.y - this.dragStart.screenY) / camScale

      // Handle axis-constrained dragging
      if (this.draggedHandleName === 'x-axis') {
        dy = 0
      } else if (this.draggedHandleName === 'y-axis') {
        dx = 0
      }

      // Convert world delta to local delta by rotating by negative parent rotation
      const parentWorldRot = bone.parentId
        ? evaluateWorldTransform(bone.parentId, skeleton).rotation
        : 0
      const cos = Math.cos(-parentWorldRot)
      const sin = Math.sin(-parentWorldRot)
      const localDx = snap(cos * dx - sin * dy)
      const localDy = snap(sin * dx + cos * dy)

      useEditorStore.getState().setBoneTransform(selectedBoneId, {
        x: this.boneStartTransform.x + localDx,
        y: this.boneStartTransform.y + localDy,
      })
    }

    if (this.activeGizmo === 'rotate') {
      const world = evaluateWorldTransform(selectedBoneId, skeleton)
      const camScale = this.cameraContainer.scale.x
      // World position of bone origin in screen space
      const boneScreenX = world.x * camScale + this.cameraContainer.x
      const boneScreenY = world.y * camScale + this.cameraContainer.y
      const startAngle = Math.atan2(this.dragStart.screenY - boneScreenY, this.dragStart.screenX - boneScreenX)
      const currentAngle = Math.atan2(e.global.y - boneScreenY, e.global.x - boneScreenX)
      const deltaAngle = currentAngle - startAngle

      // Snap rotation to 15-degree increments if enabled
      const snappedDelta = snapEnabled ? Math.round(deltaAngle / (Math.PI / 12)) * (Math.PI / 12) : deltaAngle

      useEditorStore.getState().setBoneTransform(selectedBoneId, {
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

      let scaleFactor = currentDist / startDist

      // Handle axis-constrained scaling
      if (this.draggedHandleName === 'x-scale') {
        scaleFactor = Math.max(0.01, scaleFactor)
        useEditorStore.getState().setBoneTransform(selectedBoneId, {
          scaleX: this.boneStartTransform.scaleX * scaleFactor,
        })
      } else if (this.draggedHandleName === 'y-scale') {
        scaleFactor = Math.max(0.01, scaleFactor)
        useEditorStore.getState().setBoneTransform(selectedBoneId, {
          scaleY: this.boneStartTransform.scaleY * scaleFactor,
        })
      } else {
        // Both axes (center drag)
        scaleFactor = Math.max(0.01, scaleFactor)
        const snappedScale = snapEnabled ? Math.round(scaleFactor * 10) / 10 : scaleFactor
        useEditorStore.getState().setBoneTransform(selectedBoneId, {
          scaleX: this.boneStartTransform.scaleX * snappedScale,
          scaleY: this.boneStartTransform.scaleY * snappedScale,
        })
      }
    }
  }

  destroy(): void {
    this.gizmoContainer.destroy({ children: true })
  }
}
