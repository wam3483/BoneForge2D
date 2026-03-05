import { Application, FederatedPointerEvent } from 'pixi.js'
import { useEditorStore } from '../store'
import { evaluateWorldTransform } from '../model/transforms'
import type { ViewportCamera } from './ViewportCamera'

export function setupBoneCreation(app: Application, camera: ViewportCamera): () => void {
  const stage = app.stage
  // Enable pointer events on the stage so it receives background clicks
  stage.eventMode = 'static'
  // Set hit area to cover entire screen
  stage.hitArea = app.screen

  // Track drag state for threshold-based bone creation
  let isDragging = false
  let startX = 0
  let startY = 0
  let hasCreatedBone = false

  function onStagePointerDown(e: FederatedPointerEvent): void {
    console.log('BoneCreation: pointerdown', { button: e.button, global: { x: e.global.x, y: e.global.y } })
    // Only left-click, only 'select' tool (so gizmo drags don't accidentally create bones)
    if (e.button !== 0) return
    // Shift is reserved for rect selection — let the event propagate unblocked
    if (e.shiftKey) return
    const state = useEditorStore.getState()
    console.log('BoneCreation: state', { activeTool: state.activeTool, editorMode: state.editorMode })
    if (state.activeTool !== 'select') return
    if (state.editorMode !== 'pose') return // no bone creation in animate mode (Phase 1)

    // Start tracking drag - don't create bone yet
    isDragging = true
    startX = e.global.x
    startY = e.global.y
    hasCreatedBone = false
    e.stopPropagation()
  }

  function onStagePointerMove(e: FederatedPointerEvent): void {
    if (!isDragging || hasCreatedBone) return

    const dx = e.global.x - startX
    const dy = e.global.y - startY
    const distance = Math.hypot(dx, dy)
    const threshold = 10  // Minimum drag distance before creating bone

    console.log('BoneCreation: move', { dx, dy, distance, threshold })

    if (distance >= threshold) {
      // Threshold reached - create the bone
      console.log('BoneCreation: threshold reached, creating bone')
      const state = useEditorStore.getState()
      const worldPos = camera.screenToWorld(e.global.x, e.global.y)
      const parentId = state.selectedBoneId // null = root bone

      const newBoneId = state.createBone(parentId)

      // Place the new bone at click position in local space
      if (parentId) {
        // Child bone: convert world click position to parent's local space
        const parentWorld = evaluateWorldTransform(parentId, state.skeleton)
        const cos = Math.cos(-parentWorld.rotation)
        const sin = Math.sin(-parentWorld.rotation)
        const wx = worldPos.x - parentWorld.x
        const wy = worldPos.y - parentWorld.y
        const localX = (cos * wx - sin * wy) / parentWorld.scaleX
        const localY = (sin * wx + cos * wy) / parentWorld.scaleY
        useEditorStore.getState().setBoneTransformSilent(newBoneId, { x: localX, y: localY })
      } else {
        // Root bone: local IS world
        useEditorStore.getState().setBoneTransformSilent(newBoneId, { x: worldPos.x, y: worldPos.y })
      }

      // Select the new bone so user can drag to reposition
      useEditorStore.getState().setSelectedBone(newBoneId)
      hasCreatedBone = true
      e.stopPropagation()
    }
  }

  function onStagePointerUp(): void {
    console.log('BoneCreation: pointerup', { isDragging, hasCreatedBone })
    // Deselect if no bone was created (just a click to unfocus)
    if (isDragging && !hasCreatedBone) {
      console.log('BoneCreation: deselecting bone (no drag)')
      useEditorStore.getState().setSelectedBone(null)
    }
    isDragging = false
    hasCreatedBone = false
  }

  stage.on('pointerdown', onStagePointerDown)
  stage.on('pointermove', onStagePointerMove)
  stage.on('pointerup', onStagePointerUp)
  stage.on('pointerupoutside', onStagePointerUp)
  console.log('BoneCreation: setup complete, stage eventMode:', stage.eventMode)
  return () => {
    stage.off('pointerdown', onStagePointerDown)
    stage.off('pointermove', onStagePointerMove)
    stage.off('pointerup', onStagePointerUp)
    stage.off('pointerupoutside', onStagePointerUp)
    console.log('BoneCreation: cleanup')
  }
}
