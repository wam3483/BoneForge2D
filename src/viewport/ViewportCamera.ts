import { Container, FederatedPointerEvent, Application, Graphics } from 'pixi.js'
import { useEditorStore } from '../store'
import { evaluateWorldTransform } from '../model/transforms'

export interface CameraState { x: number; y: number; scale: number }

export class ViewportCamera {
  container: Container
  private app: Application
  private isPanning = false
  private lastPanPos = { x: 0, y: 0 }

  // Bone creation drag state
  private isCreatingBone = false
  private boneCreationStart: { x: number; y: number } | null = null
  private bonePreviewGraphics: Graphics | null = null

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

    // Combined pointerdown handler for both panning and bone creation
    stage.on('pointerdown', (e: FederatedPointerEvent) => {
      const state = useEditorStore.getState()
      console.log('ViewportCamera: pointerdown', { button: e.button, target: e.target.name, activeTool: state.activeTool, editorMode: state.editorMode })

      // Middle-click or right-click: pan
      if (e.button === 1 || e.button === 2) {
        this.isPanning = true
        this.lastPanPos = { x: e.global.x, y: e.global.y }
        e.stopPropagation()
        return
      }

      // Left-click: bone creation (only in select tool, pose mode)
      if (e.button === 0 && state.activeTool === 'select' && state.editorMode === 'pose') {
        const worldPos = this.screenToWorld(e.global.x, e.global.y)
        const parentId = state.selectedBoneId // null = root bone

        this.isCreatingBone = true
        this.boneCreationStart = worldPos

        // Create preview graphics for drag visualization
        if (!this.bonePreviewGraphics) {
          this.bonePreviewGraphics = new Graphics()
          this.bonePreviewGraphics.zIndex = 1000 // render above other bones
          this.container.addChild(this.bonePreviewGraphics)
        }

        console.log('ViewportCamera: starting bone creation drag', { worldPos, parentId })
      }
    })
    stage.on('globalpointermove', (e: FederatedPointerEvent) => {
      // Handle bone creation preview
      if (this.isCreatingBone && this.boneCreationStart && this.bonePreviewGraphics) {
        const currentWorld = this.screenToWorld(e.global.x, e.global.y)
        this.updateBonePreview(this.boneCreationStart, currentWorld)
        return
      }

      // Handle panning
      if (!this.isPanning) return
      const dx = e.global.x - this.lastPanPos.x
      const dy = e.global.y - this.lastPanPos.y
      this.container.x += dx
      this.container.y += dy
      this.lastPanPos = { x: e.global.x, y: e.global.y }
      this.onCameraChange?.()
    })
    stage.on('pointerup', (e: FederatedPointerEvent) => {
      // Finalize bone creation
      if (this.isCreatingBone && this.boneCreationStart) {
        const endWorld = this.screenToWorld(e.global.x, e.global.y)
        this.finalizeBoneCreation(endWorld)
        return
      }
      this.isPanning = false
    })
    stage.on('pointerupoutside', () => {
      // Finalize bone creation if dragged outside (cancels the bone)
      if (this.isCreatingBone) {
        if (this.bonePreviewGraphics) {
          this.bonePreviewGraphics.clear()
        }
        this.isCreatingBone = false
        this.boneCreationStart = null
        return
      }
      this.isPanning = false
    })
  }

  private updateBonePreview(start: { x: number; y: number }, end: { x: number; y: number }): void {
    if (!this.bonePreviewGraphics) return

    const g = this.bonePreviewGraphics
    g.clear()

    // Draw preview bone (cyan line, different from normal bones)
    g.setStrokeStyle({ width: 2, color: 0x00ffff, alpha: 0.8 })
    g.moveTo(start.x, start.y)
    g.lineTo(end.x, end.y)
    g.stroke()

    // Draw endpoint circle
    g.setFillStyle({ color: 0x00ffff, alpha: 0.8 })
    g.circle(end.x, end.y, 5)
    g.fill()

    // Draw start point (white, brighter than normal bone)
    g.setFillStyle({ color: 0xffffff, alpha: 1 })
    g.circle(start.x, start.y, 4)
    g.fill()
  }

  private finalizeBoneCreation(endWorld: { x: number; y: number }): void {
    if (!this.boneCreationStart || !this.bonePreviewGraphics) return

    const state = useEditorStore.getState()
    const parentId = state.selectedBoneId // null = root bone

    // Create the actual bone
    const newBoneId = state.createBone(parentId)

    // Place new bone at end position in local space
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

    // Select new bone
    useEditorStore.getState().setSelectedBone(newBoneId)

    console.log('ViewportCamera: finalized bone creation', { newBoneId, parentId, endWorld })

    // Clear preview
    this.bonePreviewGraphics.clear()
    this.isCreatingBone = false
    this.boneCreationStart = null
  }

  setupWheelZoom(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault()
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.909
      const newScale = Math.max(0.05, Math.min(20, this.container.scale.x * zoomFactor))
      // Zoom around pointer position
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

  /** Convert screen coordinates to world (viewport-local) coordinates */
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
