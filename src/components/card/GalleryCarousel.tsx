'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  images: string[]
}

/**
 * §15-3: サービス・案内タブ・MENUブロックの上に表示する写真カルーセル。
 * 1枚のみならスワイプUIなしで単に表示。2枚以上は横スワイプ(scroll-snap)+ドットインジケータ。
 * 矢印ボタンは無し(シンプル維持)。useEffect依存はプリミティブのみ(images.length)。
 */
export function GalleryCarousel({ images }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const el = trackRef.current
    if (!el || images.length <= 1) return

    const handleScroll = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth)
      setActiveIndex(idx)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [images.length])

  if (images.length === 0) return null

  if (images.length === 1) {
    return (
      <div style={{ marginBottom: 12 }}>
        <img
          src={images[0]}
          alt=""
          loading="lazy"
          style={{
            width: '100%',
            aspectRatio: '4 / 3',
            borderRadius: 12,
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        ref={trackRef}
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          borderRadius: 12,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {images.map((url, i) => (
          <img
            key={`${url}-${i}`}
            src={url}
            alt=""
            loading="lazy"
            style={{
              flex: '0 0 100%',
              width: '100%',
              aspectRatio: '4 / 3',
              objectFit: 'cover',
              scrollSnapAlign: 'start',
              borderRadius: 12,
              display: 'block',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8 }}>
        {images.map((_, i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: i === activeIndex ? '#C4A35A' : '#E5E7EB',
            }}
          />
        ))}
      </div>
    </div>
  )
}
