import { Container, FederatedPointerEvent, Application, Graphics } from 'pixi.js'
import { useEditorStore } from '../store'
import { evaluateWorldTransform } from '../model/transforms'
import { boneDragSource } from './boneCreationState'
import type { Skeleton } from '../model/types'

export interface CameraState { x: number; y: number; scale: number }

type SnapTarget = {
  worldPos: { x: number; y: number }
  type: 'start' | 'tip'
  boneId: string
}

type BoneDragMode = 'create' | 'reposition-start' | 'reposition-tip' | null

const SNAP_THRESHOLD_PX = 15
const DRAG_THRESHOLD_PX = 10

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
  // Bone creation/reposition drag state
  private boneDragMode: BoneDragMode = null
  private boneCreationStart: { x: number; y: number } | null = null
  private boneStartScreen: { x: number; y: number } | null = null
  private draggedBoneId: string | null = null
  private draggedBoneStartTransform: { x: number; y: number; rotation: number; length: number } | null = null
  private parentWorldStart: { x: number; y: number; rotation: number; scaleX: number; scaleY: number } | null = null
  private bonePreviewGraphics: Graphics

  // Snap state (updated every hover move)
  private snapTarget: SnapTarget | null = null

  // How many screen pixels the pointer must move before a bone-body press becomes a drag.
  private readonly DRAG_THRESHOLD_PX = 5

  constructor(app: Application) {
    this.app = app
    this.container = new Container()
    app.stage.addChild(this.container)

    this.bonePreviewGraphics = new Graphics()
    this.bonePreviewGraphics.zIndex = 1000
    this.container.addChild(this.bonePreviewGraphics)

    this.setupEvents()
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const p = this.container.toGlobal({ x: worldX, y: worldY })
    return { x: p.x, y: p.y }
  }

  /** Find the nearest bone start or tip within SNAP_THRESHOLD_PX of (screenX, screenY). */
  private findSnapTarget(screenX: number, screenY: number): SnapTarget | null {
    const { skeleton } = useEditorStore.getState()
    let best: SnapTarget | null = null
    let bestDist = SNAP_THRESHOLD_PX + 1

    for (const bone of Object.values(skeleton.bones)) {
      let world: ReturnType<typeof evaluateWorldTransform>
      try {
        world = evaluateWorldTransform(bone.id, skeleton)
      } catch {
        continue
      }

      // Start point
      const startScreen = this.worldToScreen(world.x, world.y)
      const startDist = Math.hypot(screenX - startScreen.x, screenY - startScreen.y)
      if (startDist < bestDist) {
        bestDist = startDist
        best = { worldPos: { x: world.x, y: world.y }, type: 'start', boneId: bone.id }
      }

      // Tip point (accounts for world scale)
      const tipX = world.x + Math.cos(world.rotation) * bone.length * world.scaleX
      const tipY = world.y + Math.sin(world.rotation) * bone.length * world.scaleX
      const tipScreen = this.worldToScreen(tipX, tipY)
      const tipDist = Math.hypot(screenX - tipScreen.x, screenY - tipScreen.y)
      if (tipDist < bestDist) {
        bestDist = tipDist
        best = { worldPos: { x: tipX, y: tipY }, type: 'tip', boneId: bone.id }
      }
    }

    return best
  }

  private drawSnapHighlight(): void {
    const g = this.bonePreviewGraphics
    g.clear()
    if (!this.snapTarget) return

    const { worldPos, type } = this.snapTarget
    // Cyan for tip (implies parenting), yellow-orange for start (position only)
    const color = type === 'tip' ? 0x00ffff : 0xffaa00

    g.setStrokeStyle({ width: 2, color, alpha: 0.9 })
    g.circle(worldPos.x, worldPos.y, 8)
    g.stroke()

    g.setFillStyle({ color, alpha: 0.6 })
    g.circle(worldPos.x, worldPos.y, 3)
    g.fill()
  }

  private drawBonePreview(start: { x: number; y: number }, end: { x: number; y: number }): void {
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

  private drawBoneRepositionPreview(boneId: string): void {
    const state = useEditorStore.getState()
    const bone = state.skeleton.bones[boneId]
    if (!bone || !this.parentWorldStart) return

    const g = this.bonePreviewGraphics
    g.clear()

    // Show the bone being repositioned
    const world = evaluateWorldTransform(boneId, state.skeleton)
    const tipX = world.x + Math.cos(world.rotation) * bone.length * world.scaleX
    const tipY = world.y + Math.sin(world.rotation) * bone.length * world.scaleX

    g.setStrokeStyle({ width: 2, color: 0x44aaff, alpha: 0.9 })
    g.moveTo(world.x, world.y)
    g.lineTo(tipX, tipY)
    g.stroke()

    g.setFillStyle({ color: 0x44aaff, alpha: 0.6 })
    g.circle(tipX, tipY, 5)
    g.fill()

    g.setFillStyle({ color: 0xffffff, alpha: 1 })
    g.circle(world.x, world.y, 4)
    g.fill()
  }

  private setupEvents(): void {
    const stage = this.app.stage
    stage.eventMode = 'static'
    stage.hitArea = this.app.renderer?.screen ?? null

    // ── pointerdown (bubble) ─────────────────────────────────────────────────
    // Only reaches here when no bone or gizmo handle called stopPropagation,
    // i.e. the user clicked on empty canvas.  For drag-from-bone-body, see the
    // globalpointermove handler which checks boneDragSource.
    stage.on('pointerdown', (e: FederatedPointerEvent) => {
      // Middle / right → pan
      if (e.button === 1 || e.button === 2) {
    stage.on('pointerdown', (e: FederatedPointerEvent) => {
      const state = useEditorStore.getState()

      // Middle-click: pan
      if (e.button === 1) {
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
      // Right-click: bone creation
      if (e.button === 2 && state.activeTool === 'select' && state.editorMode === 'pose') {
        const snap = this.findSnapTarget(e.global.x, e.global.y)
        let worldPos: { x: number; y: number }
        if (snap) {
          worldPos = snap.worldPos
          if (snap.type === 'tip') {
            useEditorStore.getState().setSelectedBone(snap.boneId)
          }
        } else {
          worldPos = this.screenToWorld(e.global.x, e.global.y)
        }
        this.boneDragMode = 'create'
        this.boneCreationStart = worldPos
        this.boneStartScreen = { x: e.global.x, y: e.global.y }
        this.snapTarget = null
        this.bonePreviewGraphics.clear()
        e.stopPropagation()
        return
      }

      // Left-click: check for bone point reposition, otherwise bone creation
      if (e.button === 0 && state.activeTool === 'select' && state.editorMode === 'pose' && !e.shiftKey) {
        const snap = this.findSnapTarget(e.global.x, e.global.y)

        // If clicked on the selected bone's tip, start tip repositioning
        if (snap && snap.type === 'tip' && snap.boneId === state.selectedBoneId) {
          this.boneDragMode = 'reposition-tip'
          this.draggedBoneId = snap.boneId
          const bone = state.skeleton.bones[snap.boneId]
          if (bone) {
            // Store the starting state for undo
            this.draggedBoneStartTransform = {
              x: bone.localTransform.x,
              y: bone.localTransform.y,
              rotation: bone.localTransform.rotation,
              length: bone.length,
            }
            // Store parent world transform at start
            this.parentWorldStart = bone.parentId
              ? evaluateWorldTransform(bone.parentId, state.skeleton)
              : { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }
          }
          this.boneStartScreen = { x: e.global.x, y: e.global.y }
          this.bonePreviewGraphics.clear()
          e.stopPropagation()
          return
        }

        // If snapped to a different bone's start, start repositioning (parenting that bone)
        if (snap && snap.type === 'start' && snap.boneId !== state.selectedBoneId) {
          this.boneDragMode = 'reposition-start'
          this.draggedBoneId = snap.boneId
          const bone = state.skeleton.bones[snap.boneId]
          if (bone) {
            // Store the starting state for undo
            this.draggedBoneStartTransform = {
              x: bone.localTransform.x,
              y: bone.localTransform.y,
              rotation: bone.localTransform.rotation,
              length: bone.length,
            }
            // Store parent world transform at start
            this.parentWorldStart = bone.parentId
              ? evaluateWorldTransform(bone.parentId, state.skeleton)
              : { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }
          }
          this.boneStartScreen = { x: e.global.x, y: e.global.y }
          this.bonePreviewGraphics.clear()
          e.stopPropagation()
          return
        }

        // Otherwise, start bone creation
        let worldPos: { x: number; y: number }
        if (snap && snap.type === 'tip') {
          worldPos = snap.worldPos
          useEditorStore.getState().setSelectedBone(snap.boneId)
        } else {
          worldPos = this.screenToWorld(e.global.x, e.global.y)
        }
        this.boneDragMode = 'create'
        this.boneCreationStart = worldPos
        this.boneStartScreen = { x: e.global.x, y: e.global.y }
        this.snapTarget = null
        this.bonePreviewGraphics.clear()
      }
    })

    stage.on('globalpointermove', (e: FederatedPointerEvent) => {
      // While dragging bone point
      if (this.boneDragMode && this.boneStartScreen) {
        const dx = e.global.x - this.boneStartScreen.x
        const dy = e.global.y - this.boneStartScreen.y
        if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
          if (this.boneDragMode === 'create') {
            const currentWorld = this.screenToWorld(e.global.x, e.global.y)
            this.drawBonePreview(this.boneCreationStart!, currentWorld)
          } else if (this.draggedBoneId) {
            // Apply live bone reposition during drag
            this.applyBoneReposition(e.global.x, e.global.y)
            this.drawBoneRepositionPreview(this.draggedBoneId)
          }
        }
        return
      }

      // While panning: move camera
      if (this.isPanning) {
        const dx = e.global.x - this.lastPanPos.x
        const dy = e.global.y - this.lastPanPos.y
        this.container.x += dx
        this.container.y += dy
        this.lastPanPos = { x: e.global.x, y: e.global.y }
        this.onCameraChange?.()
        return
      }

      // Idle hover in select+pose mode: show snap highlights
      const state = useEditorStore.getState()
      if (state.activeTool === 'select' && state.editorMode === 'pose') {
        this.snapTarget = this.findSnapTarget(e.global.x, e.global.y)
        this.drawSnapHighlight()
      }
    })

    stage.on('pointerup', (e: FederatedPointerEvent) => {
      // Handle bone point reposition
      if (this.boneDragMode && this.draggedBoneId && this.boneDragMode !== 'create' && this.boneStartScreen) {
        const dx = e.global.x - this.boneStartScreen.x
        const dy = e.global.y - this.boneStartScreen.y
        const dragDistance = Math.hypot(dx, dy)

        if (dragDistance >= DRAG_THRESHOLD_PX && this.draggedBoneStartTransform && this.parentWorldStart) {
          // Pass mouse coordinates to get correct tip position
          this.finalizeBoneReposition(e.global.x, e.global.y)
        }
        this.boneDragMode = null
        this.draggedBoneId = null
        this.draggedBoneStartTransform = null
        this.parentWorldStart = null
        this.boneStartScreen = null
        this.bonePreviewGraphics.clear()
        return
      }

      // Handle bone creation
      if (this.boneDragMode === 'create' && this.boneCreationStart && this.boneStartScreen) {
        const dx = e.global.x - this.boneStartScreen.x
        const dy = e.global.y - this.boneStartScreen.y
        const dragDistance = Math.hypot(dx, dy)

        if (dragDistance >= DRAG_THRESHOLD_PX) {
          const endWorld = this.screenToWorld(e.global.x, e.global.y)
          this.finalizeBoneCreation(endWorld)
        } else if (e.button === 0 && !e.shiftKey) {
          // Left-click without drag — deselect (skip if shift so rect selection result is preserved)
          useEditorStore.getState().setSelectedBone(null)
          this.bonePreviewGraphics.clear()
        }
        this.boneDragMode = null
        this.boneCreationStart = null
        this.boneStartScreen = null
        return
      }
      this.isPanning = false
    })

    stage.on('pointerupoutside', () => {
      this.boneDragMode = null
      this.boneCreationStart = null
      this.boneStartScreen = null
      this.draggedBoneId = null
      this.draggedBoneStartTransform = null
      this.parentWorldStart = null
      this.snapTarget = null
      this.bonePreviewGraphics.clear()
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
  private applyBoneReposition(screenX: number, screenY: number): void {
    const state = useEditorStore.getState()
    const boneId = this.draggedBoneId!
    const bone = state.skeleton.bones[boneId]
    if (!bone || !this.draggedBoneStartTransform || !this.parentWorldStart) return

    const dragMode = this.boneDragMode!
    const newWorldPos = this.screenToWorld(screenX, screenY)

    if (dragMode === 'reposition-start') {
      // Reposition bone start point (live update without undo entry)
      let newLocalX: number, newLocalY: number

      if (bone.parentId) {
        // Convert world position to local space relative to parent
        const parent = this.parentWorldStart!
        const lx = newWorldPos.x - parent.x
        const ly = newWorldPos.y - parent.y
        const cos = Math.cos(-parent.rotation)
        const sin = Math.sin(-parent.rotation)
        newLocalX = (cos * lx - sin * ly) / parent.scaleX
        newLocalY = (sin * lx + cos * ly) / parent.scaleY
      } else {
        newLocalX = newWorldPos.x
        newLocalY = newWorldPos.y
      }

      state.setBoneTransformSilent(boneId, { x: newLocalX, y: newLocalY })
    } else if (dragMode === 'reposition-tip') {
      // Reposition bone tip: adjust length and rotation (live update without undo entry)
      const boneWorld = evaluateWorldTransform(boneId, state.skeleton)
      const dx = newWorldPos.x - boneWorld.x
      const dy = newWorldPos.y - boneWorld.y
      const newLength = Math.max(10, Math.hypot(dx, dy))
      const newRotation = Math.atan2(dy, dx)

      // Convert new rotation to local space
      let newLocalRotation: number
      if (bone.parentId) {
        const parent = this.parentWorldStart!
        newLocalRotation = newRotation - parent.rotation
      } else {
        newLocalRotation = newRotation
      }

      state.setBoneTransformSilent(boneId, { rotation: newLocalRotation })
      state.setBoneLength(boneId, newLength)
    }
  }

  private finalizeBoneReposition(screenX: number, screenY: number): void {
    const state = useEditorStore.getState()
    const boneId = this.draggedBoneId!
    const bone = state.skeleton.bones[boneId]
    if (!bone || !this.draggedBoneStartTransform || !this.parentWorldStart) return

    const dragMode = this.boneDragMode!
    const newWorldPos = this.screenToWorld(screenX, screenY)

    if (dragMode === 'reposition-start') {
      // Finalize start reposition with undo entry
      const boneWorld = evaluateWorldTransform(boneId, state.skeleton)
      let newLocalX: number, newLocalY: number

      if (bone.parentId) {
        const parent = this.parentWorldStart!
        const lx = boneWorld.x - parent.x
        const ly = boneWorld.y - parent.y
        const cos = Math.cos(-parent.rotation)
        const sin = Math.sin(-parent.rotation)
        newLocalX = (cos * lx - sin * ly) / parent.scaleX
        newLocalY = (sin * lx + cos * ly) / parent.scaleY
      } else {
        newLocalX = boneWorld.x
        newLocalY = boneWorld.y
      }

      state.setBoneTransform(boneId, { x: newLocalX, y: newLocalY })
    } else if (dragMode === 'reposition-tip') {
      // Finalize tip reposition with undo entry
      // Use mouse position to calculate correct tip position
      let newLocalRotation: number
      let newLength: number

      if (bone.parentId) {
        // Get parent's current world transform (not stale start transform)
        const parentWorld = evaluateWorldTransform(bone.parentId, state.skeleton)
        // Calculate new tip direction and length from mouse position
        const dx = newWorldPos.x - parentWorld.x
        const dy = newWorldPos.y - parentWorld.y
        // Transform to parent-local space to get correct tip direction
        const cos = Math.cos(-parentWorld.rotation)
        const sin = Math.sin(-parentWorld.rotation)
        const localDx = (cos * dx - sin * dy) / parentWorld.scaleX
        const localDy = (sin * dx + cos * dy) / parentWorld.scaleY
        // Calculate new length and rotation from the local tip direction
        newLength = Math.max(10, Math.hypot(localDx, localDy))
        newLocalRotation = Math.atan2(localDy, localDx)
      } else {
        // Root bone: calculate directly from mouse position
        const dx = newWorldPos.x - bone.localTransform.x
        const dy = newWorldPos.y - bone.localTransform.y
        newLength = Math.max(10, Math.hypot(dx, dy))
        newLocalRotation = Math.atan2(dy, dx)
      }

      state.setBoneTransform(boneId, { rotation: newLocalRotation })
      state.setBoneLength(boneId, newLength)
    }
  }

  private finalizeBoneCreation(endWorld: { x: number; y: number }): void {
    const start = this.boneCreationStart!
    const dx = endWorld.x - start.x
    const dy = endWorld.y - start.y
    const boneLength = Math.max(10, Math.hypot(dx, dy))
    const dragAngle = Math.atan2(dy, dx)

    const state = useEditorStore.getState()
    const parentId = this.boneCreationParentId // captured at drag-start

    const newBoneId = state.createBone(parentId)

    // Guard against stale selectedBoneId (e.g. after undo removes the selected bone)
    const selectedId = state.selectedBoneId
    const parentId = selectedId && state.skeleton.bones[selectedId] ? selectedId : null

    // Compute local transform before creating the bone so it's baked into the undo entry
    let initialX = start.x
    let initialY = start.y
    let initialRotation = dragAngle
    if (parentId) {
      const parentWorld = evaluateWorldTransform(parentId, state.skeleton)
      const cos = Math.cos(-parentWorld.rotation)
      const sin = Math.sin(-parentWorld.rotation)
      const lx = start.x - parentWorld.x
      const ly = start.y - parentWorld.y
      initialX = cos * lx - sin * ly
      initialY = sin * lx + cos * ly
      initialRotation = dragAngle - parentWorld.rotation
    }

    useEditorStore.getState().setSelectedBone(newBoneId)

    // Create the bone with position/rotation baked in so redo restores the correct state
    const newBoneId = state.createBone(parentId, boneLength, { x: initialX, y: initialY, rotation: initialRotation })

    useEditorStore.getState().setSelectedBone(newBoneId)

    this.bonePreviewGraphics.clear()
    this.boneDragMode = null
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
    this.boneStartScreen = null
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
