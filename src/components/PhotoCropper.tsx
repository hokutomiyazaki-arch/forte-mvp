'use client'
import { useState, useCallback, useEffect } from 'react'
import Cropper from 'react-easy-crop'
import { getCroppedImage } from '@/lib/image-utils'

interface Props {
  currentPhotoUrl?: string | null
  onCropComplete: (blob: Blob) => void
  /** クロップのアスペクト比（幅/高さ）。既定 1（正方形・プロフィール写真用） */
  aspect?: number
  /** 出力画像の幅/高さ(px)。既定 400x400（プロフィール写真用） */
  outputWidth?: number
  outputHeight?: number
  /**
   * 外部制御モード: 親がファイル選択（トリガーUI）を自前で持つ場合に、選択済み画像の
   * dataURLを直接渡す。指定時（undefined以外）は内部のサムネイル表示・ファイル入力を出さず
   * クロップモーダルのみ表示する（例: MediaSectionのサービス写真ギャラリー）。
   */
  imageSrc?: string | null
  onCancel?: () => void
}

export default function PhotoCropper({
  currentPhotoUrl,
  onCropComplete,
  aspect = 1,
  outputWidth = 400,
  outputHeight = 400,
  imageSrc: controlledImageSrc,
  onCancel,
}: Props) {
  const isControlled = controlledImageSrc !== undefined
  const [internalImageSrc, setInternalImageSrc] = useState<string | null>(null)
  const imageSrc = isControlled ? controlledImageSrc : internalImageSrc
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState('')

  // 画像が変わるたびに前回のクロップ座標/ズーム/確定エラーを初期化する(保険)。
  // 通常はcropSrcのnull化で親側が本コンポーネントを丸ごとアンマウントするため
  // 毎回フレッシュな状態になるが、依存配列はimageSrc(文字列|null)のプリミティブのみとし、
  // 将来アンマウントされない構成に変わっても残留状態で「決定」が無反応にならないようにする。
  useEffect(() => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setConfirmError('')
    setConfirming(false)
  }, [imageSrc])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0]
      if (file.size > 5 * 1024 * 1024) {
        alert('画像サイズは5MB以下にしてください')
        return
      }
      const reader = new FileReader()
      reader.onload = () => setInternalImageSrc(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const onCropDone = useCallback((_: any, croppedPixels: any) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const handleCancel = () => {
    if (isControlled) {
      onCancel?.()
    } else {
      setInternalImageSrc(null)
    }
  }

  const handleConfirm = async () => {
    // 画像デコード完了前(croppedAreaPixels未設定)に押された場合はボタンをdisabledにしているため
    // 通常到達しないが、念のためのガード。以前はここが無言でreturnし「決定を押しても反応しない」
    // という無反応バグの原因だったため、ユーザーに見えるメッセージを出す。
    if (!imageSrc || confirming) return
    if (!croppedAreaPixels) {
      setConfirmError('画像を読み込み中です。少し待ってから再度お試しください')
      return
    }
    setConfirmError('')
    setConfirming(true)
    try {
      const blob = await getCroppedImage(imageSrc, croppedAreaPixels, outputWidth, outputHeight)
      onCropComplete(blob)
      if (!isControlled) setInternalImageSrc(null)
    } catch {
      setConfirmError('画像の処理に失敗しました。もう一度お試しください')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div>
      {/* 現在の写真 or プレースホルダー（外部制御モードでは非表示。親が自前のトリガーUIを持つため） */}
      {!isControlled && (
        <>
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
        </>
      )}

      {/* クロッパーモーダル
       * Tailwindクラス(fixed/relative/flex-1等)のみに頼らず、ImageCropper.tsx実績パターンに合わせ
       * position/overflow/背景を全てインラインstyleで確定させる。加えてreact-easy-cropの
       * Cropper自体にも style.containerStyle/mediaStyle/cropAreaStyle でクロップ領域の
       * position/overflow/中央寄せ/暗転オーバーレイをインライン指定し、ライブラリ側の
       * クラスベースCSS適用に何らかの理由で失敗しても(画像非表示・グリッド線が画面全体に
       * 漏れる不透明化不能バグ)、必ずコンテナに閉じ込められ・画像が中央に見える状態を保証する。 */}
      {imageSrc && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              position: 'relative',
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              background: '#1A1A2E',
            }}
          >
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropDone}
              style={{
                containerStyle: {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  overflow: 'hidden',
                },
                mediaStyle: {
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  margin: 'auto',
                  maxWidth: '100%',
                  maxHeight: '100%',
                },
                cropAreaStyle: {
                  border: '1px solid rgba(255,255,255,0.5)',
                  boxShadow: '0 0 0 9999em rgba(0,0,0,0.6)',
                },
              }}
            />
          </div>
          <div
            style={{
              background: '#fff',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {confirmError && (
              <p style={{ fontSize: 12, textAlign: 'center', color: '#E24B4A' }}>{confirmError}</p>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={handleCancel}
                style={{
                  padding: '8px 24px',
                  border: '1px solid #ccc',
                  borderRadius: 6,
                  fontSize: 14,
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirming || !croppedAreaPixels}
                style={{
                  padding: '8px 24px',
                  background: '#C4A35A',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  opacity: (confirming || !croppedAreaPixels) ? 0.5 : 1,
                  cursor: (confirming || !croppedAreaPixels) ? 'not-allowed' : 'pointer',
                }}
              >
                {confirming ? '処理中…' : (!croppedAreaPixels ? '読み込み中…' : '決定')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
