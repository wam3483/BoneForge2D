import { Container, FederatedPointerEvent, Application } from 'pixi.js'
import { useEditorStore } from '../store'
import { evaluateWorldTransform } from '../model/transforms'

export interface CameraState { x: number; y: number; scale: number }

export class ViewportCamera {
  container: Container
  private app: Application
  private isPanning = false
  private lastPanPos = { x: 0, y: 0 }

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
        console.log('ViewportCamera: bone creation trigger', { global: { x: e.global.x, y: e.global.y } })
        const worldPos = this.screenToWorld(e.global.x, e.global.y)
        const parentId = state.selectedBoneId // null = root bone

        const newBoneId = state.createBone(parentId)
        console.log('ViewportCamera: created bone', { newBoneId, parentId })

        // Place new bone at click position in local space
        if (parentId) {
          // Child bone: convert world click position to parent's local space
          const parentWorld = evaluateWorldTransform(parentId, state.skeleton)
          const cos = Math.cos(-parentWorld.rotation)
          const sin = Math.sin(-parentWorld.rotation)
          const dx = worldPos.x - parentWorld.x
          const dy = worldPos.y - parentWorld.y
          const localX = (cos * dx - sin * dy) / parentWorld.scaleX
          const localY = (sin * dx + cos * dy) / parentWorld.scaleY
          useEditorStore.getState().setBoneTransform(newBoneId, { x: localX, y: localY })
        } else {
          // Root bone: local IS world
          useEditorStore.getState().setBoneTransform(newBoneId, { x: worldPos.x, y: worldPos.y })
        }

        // Select new bone (stay in Select mode so user can keep creating bones)
        useEditorStore.getState().setSelectedBone(newBoneId)
      }
    })
    stage.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (!this.isPanning) return
      const dx = e.global.x - this.lastPanPos.x
      const dy = e.global.y - this.lastPanPos.y
      this.container.x += dx
      this.container.y += dy
      this.lastPanPos = { x: e.global.x, y: e.global.y }
      this.onCameraChange?.()
    })
    stage.on('pointerup', () => { this.isPanning = false })
    stage.on('pointerupoutside', () => { this.isPanning = false })
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
