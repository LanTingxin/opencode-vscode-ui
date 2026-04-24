import React from "react"

export type PreviewImage = {
  src: string
  name: string
}

type ImagePreviewOverlayProps = {
  image: PreviewImage
  onClose: () => void
}

export function ImagePreviewOverlay({
  image,
  onClose,
}: ImagePreviewOverlayProps) {
  return (
    <div className="oc-imagePreviewOverlay" onClick={onClose}>
      <div className="oc-imagePreviewContent" onClick={(event) => event.stopPropagation()}>
        <img
          src={image.src}
          alt={image.name}
          className="oc-imagePreviewImg"
          data-vscode-context={JSON.stringify({ webviewSection: "imagePreview", preventDefaultContextMenuItems: true })}
        />
        <button
          type="button"
          className="oc-imagePreviewClose"
          aria-label="Close preview"
          onClick={onClose}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4L12 12M12 4L4 12" /></svg>
        </button>
      </div>
    </div>
  )
}

export function saveImageFromPreview(src: string, name: string) {
  const link = document.createElement("a")
  link.href = src
  link.download = name
  link.rel = "noopener"
  link.click()
}

export async function copyImageToClipboard(src: string) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard is not available")
  }

  const response = await fetch(src)
  const blob = await response.blob()
  const type = blob.type || mimeFromImageSource(src)
  await navigator.clipboard.write([new ClipboardItem({ [type]: blob })])
}

function mimeFromImageSource(src: string) {
  const match = /^data:([^;,]+)/.exec(src)
  return match?.[1] || "image/png"
}
