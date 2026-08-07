'use client'

import { Fragment } from 'react'
import { splitLinkedText } from '@/lib/linkify'

interface Props {
  text: string
  /** 吹き出しの地色に合わせてリンク色を変える（濃い背景では金色が読めない）。 */
  variant?: 'onLight' | 'onDark'
}

/**
 * §17-14(CEO指示 2026-08-06): チャット本文の URL をリンクにして表示する。
 *
 * dangerouslySetInnerHTML は使わない。文字列と <a> の配列を並べるだけなので、
 * 本文がHTMLとして解釈される経路が存在しない（Reactが自動エスケープする）。
 * href は http/https のみ（切り出しの正規表現でスキームを固定している）。
 *
 * rel に noopener/noreferrer を必ず付ける（開いた先から window.opener 経由で
 * こちらのタブを差し替えられるのを防ぐ）。相手が書いた外部URLなので nofollow ugc も付ける。
 */
export default function LinkedText({ text, variant = 'onLight' }: Props) {
  const parts = splitLinkedText(text)
  const linkColor = variant === 'onDark' ? '#E6C77A' : '#C4A35A'

  return (
    <>
      {parts.map((part, i) =>
        part.type === 'link' ? (
          <a
            key={i}
            href={part.value}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            style={{ color: linkColor, textDecoration: 'underline', wordBreak: 'break-all' }}
          >
            {part.value}
          </a>
        ) : (
          <Fragment key={i}>{part.value}</Fragment>
        ),
      )}
    </>
  )
}
