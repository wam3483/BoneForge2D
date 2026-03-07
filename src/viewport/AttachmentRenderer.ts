import { useRef } from 'react'
import { useTick } from '@pixi/react'
import { Sprite, Texture } from 'pixi.js'
import { useEditorStore } from '../store'
import { evaluateWorldTransform } from '../model/transforms'
import { getEffectiveSkeleton } from './animationState'
import { getAttachmentsContainer } from './AttachmentsRef'
import type { ImageAsset } from '../model/types'

// Cache for Texture objects — avoid recreating from dataUrl every tick
const textureCache = new Map<string, Texture>()

function getTexture(asset: ImageAsset): Texture {
  if (textureCache.has(asset.id)) return textureCache.get(asset.id)!
  const tex = Texture.from(asset.dataUrl)
  textureCache.set(asset.id, tex)
  return tex
}

export function AttachmentRendererLayer() {
  const spriteMap = useRef<Map<string, Sprite>>(new Map()) // keyed by attachment.id

  useTick(() => {
    const attachmentsContainer = getAttachmentsContainer()
    if (!attachmentsContainer) return

    const state = useEditorStore.getState()
    const { skeleton, attachments, imageAssets } = state

    const currentIds = new Set(Object.keys(attachments))

    // Remove Sprites for deleted attachments
    for (const [id, sprite] of spriteMap.current) {
      if (!currentIds.has(id)) {
        attachmentsContainer.removeChild(sprite)
        sprite.destroy()
        spriteMap.current.delete(id)
      }
    }

    // Collect attachments sorted by zOrder for correct render order
    const sortedAttachments = Object.values(attachments).sort((a, b) => a.zOrder - b.zOrder)

    for (const attachment of sortedAttachments) {
      const asset = imageAssets[attachment.imageId]
      const bone = skeleton.bones[attachment.boneId]
      if (!asset || !bone || !bone.visible) {
        // Hide sprite if bone or asset missing/invisible
        const s = spriteMap.current.get(attachment.id)
        if (s) s.visible = false
        continue
      }

      let sprite = spriteMap.current.get(attachment.id)
      if (!sprite) {
        sprite = new Sprite(getTexture(asset))
        attachmentsContainer.addChild(sprite)
        spriteMap.current.set(attachment.id, sprite)
      }

      // Update texture in case image was replaced (re-import scenario)
      if (sprite.texture !== getTexture(asset)) {
        sprite.texture = getTexture(asset)
      }

      // Position sprite at bone world transform
      const world = evaluateWorldTransform(attachment.boneId, getEffectiveSkeleton(skeleton))
      sprite.visible = bone.visible

      // Pivot: normalized (0.5, 0.5) = center of image
      sprite.anchor.set(attachment.pivotX, attachment.pivotY)

      // Place sprite at bone world position + offset (offset in world space after bone rotation)
      const cos = Math.cos(world.rotation)
      const sin = Math.sin(world.rotation)
      sprite.x = world.x + cos * attachment.offsetX - sin * attachment.offsetY
      sprite.y = world.y + sin * attachment.offsetX + cos * attachment.offsetY
      sprite.rotation = world.rotation
      sprite.scale.set(world.scaleX, world.scaleY)

      // zIndex for PixiJS sort
      sprite.zIndex = attachment.zOrder
    }

    // Apply sort if container has sortableChildren
    if (!attachmentsContainer.sortableChildren) {
      attachmentsContainer.sortableChildren = true
    }
    attachmentsContainer.sortChildren()
  })

  return null
}
