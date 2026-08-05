/**
 * クロップ後の画像をCanvasで切り出してBlobに変換
 * 最大400x400pxにリサイズ
 */
export async function getCroppedImage(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const MAX_SIZE = 400
  canvas.width = MAX_SIZE
  canvas.height = MAX_SIZE
  const ctx = canvas.getContext('2d')!

  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, MAX_SIZE, MAX_SIZE
  )

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.85)
  })
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    image.crossOrigin = 'anonymous'
    image.src = url
  })
}

/**
 * §15-3: サービス・案内タブの「写真（最大6枚）」用。
 * クロップせず、アスペクト比を保ったまま長辺を maxSize (デフォルト1600px) に縮小してJPEG化する。
 * getCroppedImage (400x400固定・クロップ用) とは別の用途のため新規関数として分離。
 */
export async function resizeImageLongSide(
  file: File | Blob,
  maxSize = 1600,
  quality = 0.85
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await createImage(objectUrl)
    const { width, height } = image
    const scale = Math.min(1, maxSize / Math.max(width, height))
    const targetWidth = Math.round(width * scale)
    const targetHeight = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight)

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', quality)
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
