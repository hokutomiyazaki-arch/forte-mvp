'use client';

import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';

interface ImageCropperProps {
  imageSrc: string;           // アップロードされた画像のdata URL
  onCropComplete: (croppedBlob: Blob) => void;  // トリミング後のBlobを親に渡す
  onCancel: () => void;       // キャンセル
  cropShape?: 'round' | 'rect';  // 円形 or 四角形（デフォルト: round）
  aspectRatio?: number;       // アスペクト比（デフォルト: 1 = 正方形）
}

export default function ImageCropper({
  imageSrc,
  onCropComplete,
  onCancel,
  cropShape = 'round',
  aspectRatio = 1,
}: ImageCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropChange = useCallback((crop: Point) => setCrop(crop), []);
  const onZoomChange = useCallback((zoom: number) => setZoom(zoom), []);

  const onCropCompleteHandler = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);

    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      onCropComplete(croppedBlob);
    } catch (e) {
      console.error('Crop error:', e);
      alert('画像の処理に失敗しました。もう一度お試しください。');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* クロッパーエリア */}
      <div style={{ position: 'relative', flex: 1 }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspectRatio}
          cropShape={cropShape}
          showGrid={false}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={onCropCompleteHandler}
        />
      </div>

      {/* コントロールエリア */}
      <div style={{
        padding: '20px 24px 32px',
        background: '#1A1A2E',
      }}>
        {/* ズームスライダー */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
        }}>
          <span style={{ color: '#888', fontSize: 12 }}>−</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{
              flex: 1,
              accentColor: '#C4A35A',
              height: 4,
            }}
          />
          <span style={{ color: '#888', fontSize: 12 }}>+</span>
        </div>

        {/* ボタン */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: 12,
              border: '1px solid #555',
              background: 'transparent',
              color: '#999',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'Noto Sans JP', sans-serif",
            }}
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: 12,
              border: 'none',
              background: '#C4A35A',
              color: '#1A1A2E',
              fontSize: 14,
              fontWeight: 700,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              opacity: isProcessing ? 0.6 : 1,
              fontFamily: "'Noto Sans JP', sans-serif",
            }}
          >
            {isProcessing ? '処理中...' : '確定'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Canvas APIでトリミング処理
// ============================================
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  outputSize: number = 400  // 出力サイズ（正方形、px）
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Canvas context not available');

  canvas.width = outputSize;
  canvas.height = outputSize;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      'image/jpeg',
      0.9  // JPEG品質90%（ファイルサイズ削減）
    );
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });
}
