'use client'
import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { getCroppedImage } from '@/lib/image-utils'

interface Props {
  currentPhotoUrl?: string | null
  onCropComplete: (blob: Blob) => void
}

export default function PhotoCropper({ currentPhotoUrl, onCropComplete }: Props) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0]
      if (file.size > 5 * 1024 * 1024) {
        alert('画像サイズは5MB以下にしてください')
        return
      }
      const reader = new FileReader()
      reader.onload = () => setImageSrc(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const onCropDone = useCallback((_: any, croppedPixels: any) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const handleConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return
    const blob = await getCroppedImage(imageSrc, croppedAreaPixels)
    onCropComplete(blob)
    setImageSrc(null)
  }

  return (
    <div>
      {/* 現在の写真 or プレースホルダー */}
      <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 mb-2 mx-auto">
        {currentPhotoUrl ? (
          <img src={currentPhotoUrl} className="w-full h-full object-cover" alt="" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-3xl">
            👤
          </div>
        )}
      </div>
      <label className="block text-center text-sm text-[#C4A35A] cursor-pointer hover:underline">
        写真を変更
        <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
      </label>

      {/* クロッパーモーダル */}
      {imageSrc && (
        <div className="fixed inset-0 bg-black/70 z-50 flex flex-col">
          <div className="relative flex-1">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropDone}
            />
          </div>
          <div className="bg-white p-4 flex gap-3 justify-center">
            <button onClick={() => setImageSrc(null)}
              className="px-6 py-2 border rounded text-sm">
              キャンセル
            </button>
            <button onClick={handleConfirm}
              className="px-6 py-2 bg-[#C4A35A] text-white rounded text-sm">
              決定
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
