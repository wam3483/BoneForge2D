import { Application, FederatedPointerEvent } from 'pixi.js'
import { useEditorStore } from '../store'
import { evaluateWorldTransform } from '../model/transforms'
import type { ViewportCamera } from './ViewportCamera'

export function setupBoneCreation(app: Application, camera: ViewportCamera): () => void {
  const stage = app.stage
  // Enable pointer events on the stage so it receives background clicks
  stage.eventMode = 'static'

  function onStagePointerDown(e: FederatedPointerEvent): void {
    // Only left-click, only 'select' tool (so gizmo drags don't accidentally create bones)
    if (e.button !== 0) return
    const state = useEditorStore.getState()
    if (state.activeTool !== 'select') return
    if (state.editorMode !== 'pose') return // no bone creation in animate mode (Phase 1)

    // Prevent creating a bone if click was on a bone Graphics (those stop propagation)
    // This handler only fires when click reaches the stage (background click)
    const worldPos = camera.screenToWorld(e.global.x, e.global.y)
    const parentId = state.selectedBoneId // null = root bone

    const newBoneId = state.createBone(parentId)

    // Place the new bone at click position in local space
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

    // Select the new bone and switch to Move tool so user can drag to reposition
    useEditorStore.getState().setSelectedBone(newBoneId)
    useEditorStore.getState().setActiveTool('move')
  }

  stage.on('pointerdown', onStagePointerDown)
  return () => stage.off('pointerdown', onStagePointerDown)
}
