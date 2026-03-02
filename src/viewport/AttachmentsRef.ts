import { Container } from 'pixi.js'

// Module-level reference to the attachments container
// This is set by BoneRendererLayer and consumed by AttachmentRendererLayer
let attachmentsContainerRef: Container | null = null

export function setAttachmentsContainer(container: Container | null) {
  attachmentsContainerRef = container
}

export function getAttachmentsContainer(): Container | null {
  return attachmentsContainerRef
}
