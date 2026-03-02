import { Container, FederatedPointerEvent, Application } from 'pixi.js'

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

    // Pan: right-click drag or middle-click drag
    stage.on('pointerdown', (e: FederatedPointerEvent) => {
      if (e.button === 1 || e.button === 2) {
        this.isPanning = true
        this.lastPanPos = { x: e.global.x, y: e.global.y }
        e.stopPropagation()
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
