'use client'

import { useEffect } from 'react'

/**
 * iOS PWA(standalone) のときだけ、Clerk 標準の LINE ソーシャルボタンを
 * 自前の LINE OAuth フロー(/api/auth/line/start)へ「クリック乗っ取り」する。
 *
 * 背景: PWA standalone では ClerkJS の OAuth(state cookie 分離)が
 *       authorization_invalid で失敗する。位置はカード内のまま、
 *       クリック時だけ同一origin の自前フローへ差し替える。
 * 通常ブラウザ(standalone=false)では何もしない（Clerk 標準 LINE がそのまま動く）。
 */
const LINE_BUTTON_SELECTOR = '.cl-socialButtonsBlockButton__line'
const LINE_LABEL_SELECTOR = '.cl-socialButtonsBlockButtonText__line'

export default function PwaLineSwap() {
  useEffect(() => {
    const isStandalone =
      (window.navigator as any).standalone === true ||
      window.matchMedia?.('(display-mode: standalone)')?.matches === true
    if (!isStandalone) return

    const handleClick = (e: Event) => {
      e.preventDefault()
      e.stopImmediatePropagation()
      window.location.href = '/api/auth/line/start'
    }

    // Clerk-LINE ボタンに緑着色＋クリック乗っ取りを適用（冪等）
    const apply = () => {
      const btn = document.querySelector<HTMLElement>(LINE_BUTTON_SELECTOR)
      if (!btn) return
      // 緑 #06C755 着色（standalone 時のみ）
      btn.style.backgroundColor = '#06C755'
      btn.style.borderColor = '#06C755'
      btn.style.color = '#FFFFFF'
      const label = btn.querySelector<HTMLElement>(LINE_LABEL_SELECTOR)
      if (label) label.style.color = '#FFFFFF'
      // 同一要素への二重付与を防止（Clerk 再描画時は別要素になるので再付与される）
      if (btn.dataset.pwaLineWired !== '1') {
        btn.addEventListener('click', handleClick, true) // capture 段階で Clerk の onClick より先に発火
        btn.dataset.pwaLineWired = '1'
      }
    }

    apply()

    // Clerk が再描画してリスナ/着色が外れても付け直す
    const observer = new MutationObserver(() => apply())
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      const btn = document.querySelector<HTMLElement>(LINE_BUTTON_SELECTOR)
      if (btn) {
        btn.removeEventListener('click', handleClick, true)
        delete btn.dataset.pwaLineWired
      }
    }
  }, [])

  return null
}
