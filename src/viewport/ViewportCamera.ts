import { Container, FederatedPointerEvent, Application, Graphics } from 'pixi.js'
import { useEditorStore } from '../store'
import { evaluateWorldTransform } from '../model/transforms'
import { boneDragSource } from './boneCreationState'
import type { Skeleton } from '../model/types'

export interface CameraState { x: number; y: number; scale: number }

export class ViewportCamera {
  container: Container
  private app: Application
  private isPanning = false
  private lastPanPos = { x: 0, y: 0 }

  // Bone creation state
  private isCreatingBone = false
  private boneCreationStart: { x: number; y: number } | null = null
  private boneCreationParentId: string | null = null
  private bonePreviewGraphics: Graphics | null = null

  // How many screen pixels the pointer must move before a bone-body press becomes a drag.
  private readonly DRAG_THRESHOLD_PX = 5

  constructor(app: Application) {
    this.app = app
    this.container = new Container()
    app.stage.addChild(this.container)
    this.setupEvents()
  }

  private setupEvents(): void {
    const stage = this.app.stage
    stage.eventMode = 'static'
    stage.hitArea = this.app.screen

    // ── pointerdown (bubble) ─────────────────────────────────────────────────
    // Only reaches here when no bone or gizmo handle called stopPropagation,
    // i.e. the user clicked on empty canvas.  For drag-from-bone-body, see the
    // globalpointermove handler which checks boneDragSource.
    stage.on('pointerdown', (e: FederatedPointerEvent) => {
      // Middle / right → pan
      if (e.button === 1 || e.button === 2) {
        this.isPanning = true
        this.lastPanPos = { x: e.global.x, y: e.global.y }
        e.stopPropagation()
        return
      }

      // Left click on empty canvas → start bone creation immediately.
      // boneDragSource is guaranteed null here because any bone press stops
      // propagation before this handler runs.
      if (e.button === 0) {
        const state = useEditorStore.getState()
        if (state.activeTool === 'select' && state.editorMode === 'pose') {
          boneDragSource.boneId = null // ensure clean state for empty-space click

          const worldPos = this.screenToWorld(e.global.x, e.global.y)
          const nearbyBoneId = this.findNearestBoneOrigin(worldPos, state.skeleton)
          this.boneCreationParentId = nearbyBoneId ?? state.selectedBoneId

          this.isCreatingBone = true
          this.boneCreationStart = worldPos
          this.ensurePreviewGraphics()
        }
      }
    })

    // ── globalpointermove ────────────────────────────────────────────────────
    stage.on('globalpointermove', (e: FederatedPointerEvent) => {
      // Drag-from-bone activation: BoneRenderer set boneDragSource on pointerdown
      // but stopPropagation prevented the stage bubble handler above from running.
      // Once the pointer moves past the threshold we commit to bone creation.
      if (boneDragSource.boneId !== null && !this.isCreatingBone) {
        const dx = e.global.x - boneDragSource.screenX
        const dy = e.global.y - boneDragSource.screenY
        if (Math.hypot(dx, dy) > this.DRAG_THRESHOLD_PX) {
          this.boneCreationParentId = boneDragSource.boneId
          this.boneCreationStart = this.screenToWorld(boneDragSource.screenX, boneDragSource.screenY)
          this.isCreatingBone = true
          boneDragSource.boneId = null // consumed
          this.ensurePreviewGraphics()
        }
      }

      // Update preview line
      if (this.isCreatingBone && this.boneCreationStart && this.bonePreviewGraphics) {
        const currentWorld = this.screenToWorld(e.global.x, e.global.y)
        this.updateBonePreview(this.boneCreationStart, currentWorld)
        return
      }

      // Pan
      if (!this.isPanning) return
      const dx = e.global.x - this.lastPanPos.x
      const dy = e.global.y - this.lastPanPos.y
      this.container.x += dx
      this.container.y += dy
      this.lastPanPos = { x: e.global.x, y: e.global.y }
      this.onCameraChange?.()
    })

    // ── pointerup ───────────────────────────────────────────────────────────
    stage.on('pointerup', (e: FederatedPointerEvent) => {
      boneDragSource.boneId = null // clear regardless

      if (this.isCreatingBone && this.boneCreationStart) {
        const endWorld = this.screenToWorld(e.global.x, e.global.y)
        this.finalizeBoneCreation(endWorld)
        return
      }
      this.isPanning = false
    })

    // ── pointerupoutside ─────────────────────────────────────────────────────
    stage.on('pointerupoutside', () => {
      boneDragSource.boneId = null
      if (this.isCreatingBone) {
        this.bonePreviewGraphics?.clear()
        this.isCreatingBone = false
        this.boneCreationStart = null
        this.boneCreationParentId = null
        return
      }
      this.isPanning = false
    })
  }

  private ensurePreviewGraphics(): void {
    if (!this.bonePreviewGraphics) {
      this.bonePreviewGraphics = new Graphics()
      this.bonePreviewGraphics.zIndex = 1000
      this.container.addChild(this.bonePreviewGraphics)
    }
  }

  private updateBonePreview(start: { x: number; y: number }, end: { x: number; y: number }): void {
    if (!this.bonePreviewGraphics) return
    const g = this.bonePreviewGraphics
    g.clear()

    g.setStrokeStyle({ width: 2, color: 0x00ffff, alpha: 0.8 })
    g.moveTo(start.x, start.y)
    g.lineTo(end.x, end.y)
    g.stroke()

    g.setFillStyle({ color: 0x00ffff, alpha: 0.8 })
    g.circle(end.x, end.y, 5)
    g.fill()

    g.setFillStyle({ color: 0xffffff, alpha: 1 })
    g.circle(start.x, start.y, 4)
    g.fill()
  }

  private finalizeBoneCreation(endWorld: { x: number; y: number }): void {
    if (!this.boneCreationStart || !this.bonePreviewGraphics) return

    const state = useEditorStore.getState()
    const parentId = this.boneCreationParentId // captured at drag-start

    const newBoneId = state.createBone(parentId)

    if (parentId) {
      const parentWorld = evaluateWorldTransform(parentId, state.skeleton)
      const cos = Math.cos(-parentWorld.rotation)
      const sin = Math.sin(-parentWorld.rotation)
      const dx = endWorld.x - parentWorld.x
      const dy = endWorld.y - parentWorld.y
      const localX = cos * dx - sin * dy
      const localY = sin * dx + cos * dy
      useEditorStore.getState().setBoneTransform(newBoneId, { x: localX, y: localY })
    } else {
      useEditorStore.getState().setBoneTransform(newBoneId, { x: endWorld.x, y: endWorld.y })
    }

    useEditorStore.getState().setSelectedBone(newBoneId)

    this.bonePreviewGraphics.clear()
    this.isCreatingBone = false
    this.boneCreationStart = null
    this.boneCreationParentId = null
  }

  /** Find the bone whose world origin is closest to worldPos, within a screen-scaled threshold. */
  private findNearestBoneOrigin(worldPos: { x: number; y: number }, skeleton: Skeleton): string | null {
    // Use a threshold in screen pixels converted to world units so it stays
    // consistent regardless of zoom level.
    const screenThreshold = 20 // px
    const worldThreshold = screenThreshold / this.container.scale.x
    let closestId: string | null = null
    let closestDist = worldThreshold
    for (const bone of Object.values(skeleton.bones)) {
      try {
        const world = evaluateWorldTransform(bone.id, skeleton)
        const dist = Math.hypot(world.x - worldPos.x, world.y - worldPos.y)
        if (dist < closestDist) {
          closestDist = dist
          closestId = bone.id
        }
      } catch {
        // skip bones with broken transforms
      }
    }
    return closestId
  }

  setupWheelZoom(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault()
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.909
      const newScale = Math.max(0.05, Math.min(20, this.container.scale.x * zoomFactor))
      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      this.container.x = px - (px - this.container.x) * (newScale / this.container.scale.x)
      this.container.y = py - (py - this.container.y) * (newScale / this.container.scale.y)
      this.container.scale.set(newScale)
      this.onCameraChange?.()
    }, { passive: false })
  }

  onCameraChange?: () => void

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const p = this.container.toLocal({ x: screenX, y: screenY })
    return { x: p.x, y: p.y }
  }

  setFromState(state: CameraState): void {
    this.container.position.set(state.x, state.y)
    this.container.scale.set(state.scale)
  }

  getState(): CameraState {
    return { x: this.container.x, y: this.container.y, scale: this.container.scale.x }
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
