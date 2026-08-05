'use client'

import { useState } from 'react'
import { extractYouTubeVideoId } from '@/lib/validation'

interface Props {
  url: string
}

/**
 * §15-3: サービス・案内タブの紹介動画。サムネイル+再生ボタン表示 → タップ時のみ
 * youtube-nocookie.com の iframe に差し替える(初期ロードでiframeを読まない軽量パターン)。
 */
export function YouTubeEmbed({ url }: Props) {
  const [playing, setPlaying] = useState(false)
  const videoId = extractYouTubeVideoId(url)
  if (!videoId) return null

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          paddingTop: '56.25%', // 16:9
          borderRadius: 12,
          overflow: 'hidden',
          background: '#000',
        }}
      >
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
            title="紹介動画"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              border: 'none',
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label="動画を再生"
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              border: 'none', padding: 0, cursor: 'pointer',
              backgroundImage: `url(https://i.ytimg.com/vi/${videoId}/hqdefault.jpg)`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 0, height: 0, marginLeft: 4,
                  borderTop: '10px solid transparent',
                  borderBottom: '10px solid transparent',
                  borderLeft: '16px solid #fff',
                }}
              />
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
