'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
  onCancel: () => void;
  cropShape?: 'round' | 'rect';
  aspectRatio?: number;
}

export default function ImageCropper({
  imageSrc,
  onCropComplete,
  onCancel,
}: ImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // 画像を読み込み
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // キャンバスに描画
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const img = imageRef.current;
    if (!canvas || !container || !img) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const cw = rect.width;
    const ch = rect.height;

    // 背景を黒に
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);

    // 円形クロップ領域のサイズ（画面幅の80%、最大300px）
    const cropSize = Math.min(cw * 0.8, ch * 0.6, 300);
    const cropCenterX = cw / 2;
    const cropCenterY = ch / 2;

    // 画像をクロップ領域にフィットさせる
    const imgAspect = img.width / img.height;
    let drawW: number, drawH: number;
    if (imgAspect > 1) {
      // 横長画像
      drawH = cropSize * zoom;
      drawW = drawH * imgAspect;
    } else {
      // 縦長画像
      drawW = cropSize * zoom;
      drawH = drawW / imgAspect;
    }

    const drawX = cropCenterX - drawW / 2 + offset.x;
    const drawY = cropCenterY - drawH / 2 + offset.y;

    // 画像を描画
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    // 半透明オーバーレイ（円の外側を暗くする）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, cw, ch);

    // 円形の穴を開ける（クリア）
    ctx.save();
    ctx.beginPath();
    ctx.arc(cropCenterX, cropCenterY, cropSize / 2, 0, Math.PI * 2);
    ctx.clip();

    // 円内に画像を再描画
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();

    // 円形ガイド線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cropCenterX, cropCenterY, cropSize / 2, 0, Math.PI * 2);
    ctx.stroke();
  }, [zoom, offset, imageLoaded]);

  // 描画の更新
  useEffect(() => {
    if (imageLoaded) {
      requestAnimationFrame(draw);
    }
  }, [draw, imageLoaded]);

  // リサイズ対応
  useEffect(() => {
    const handleResize = () => {
      if (imageLoaded) draw();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw, imageLoaded]);

  // マウスドラッグ
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // タッチドラッグ
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - offset.x,
        y: e.touches[0].clientY - offset.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    e.preventDefault();
    setOffset({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => setIsDragging(false);

  // 確定：クロップ領域をcanvasで切り出してBlobを返す
  const handleConfirm = async () => {
    const img = imageRef.current;
    const container = containerRef.current;
    if (!img || !container) return;
    setIsProcessing(true);

    try {
      const rect = container.getBoundingClientRect();
      const cw = rect.width;
      const ch = rect.height;
      const cropSize = Math.min(cw * 0.8, ch * 0.6, 300);
      const cropCenterX = cw / 2;
      const cropCenterY = ch / 2;

      const imgAspect = img.width / img.height;
      let drawW: number, drawH: number;
      if (imgAspect > 1) {
        drawH = cropSize * zoom;
        drawW = drawH * imgAspect;
      } else {
        drawW = cropSize * zoom;
        drawH = drawW / imgAspect;
      }

      const drawX = cropCenterX - drawW / 2 + offset.x;
      const drawY = cropCenterY - drawH / 2 + offset.y;

      // 円の左上座標（画面座標）
      const cropLeft = cropCenterX - cropSize / 2;
      const cropTop = cropCenterY - cropSize / 2;

      // 画像のソース座標に変換
      const scaleX = img.width / drawW;
      const scaleY = img.height / drawH;
      const srcX = (cropLeft - drawX) * scaleX;
      const srcY = (cropTop - drawY) * scaleY;
      const srcW = cropSize * scaleX;
      const srcH = cropSize * scaleY;

      // 出力用canvas（400x400）
      const outputSize = 400;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = outputSize;
      outCanvas.height = outputSize;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) throw new Error('Canvas context not available');

      outCtx.drawImage(
        img,
        srcX, srcY, srcW, srcH,
        0, 0, outputSize, outputSize,
      );

      const blob = await new Promise<Blob>((resolve, reject) => {
        outCanvas.toBlob(
          (b) => b ? resolve(b) : reject(new Error('toBlob failed')),
          'image/jpeg',
          0.9,
        );
      });

      onCropComplete(blob);
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
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* クロッパーエリア */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          flex: 1,
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
          overflow: 'hidden',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
        {!imageLoaded && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#888',
            fontSize: 14,
          }}>
            画像を読み込み中...
          </div>
        )}
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
            disabled={isProcessing || !imageLoaded}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: 12,
              border: 'none',
              background: '#C4A35A',
              color: '#1A1A2E',
              fontSize: 14,
              fontWeight: 700,
              cursor: (isProcessing || !imageLoaded) ? 'not-allowed' : 'pointer',
              opacity: (isProcessing || !imageLoaded) ? 0.6 : 1,
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
