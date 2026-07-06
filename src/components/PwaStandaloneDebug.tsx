'use client'

import { useEffect, useState } from 'react'

/**
 * 🔬 一時デバッグ: standalone 判定の内訳を画面に表示する。
 * iOS PWA で「カード内Clerk-LINE → 自前フロー入れ替え(PwaLineSwap)」が
 * 発動しない疑いがあり、実機での判定値を確定させるための可視化。
 * （切り分け後に削除予定。入れ替えロジック本体は変更していない）
 */
export default function PwaStandaloneDebug() {
  const [navA, setNavA] = useState<string>('...')
  const [mm, setMm] = useState<string>('...')
  const [final, setFinal] = useState<string>('...')

  useEffect(() => {
    const navStandalone = (window.navigator as any).standalone
    const mmMatches =
      window.matchMedia?.('(display-mode: standalone)')?.matches === true
    const isFinal = navStandalone === true || mmMatches === true

    setNavA(String(navStandalone)) // true / false / undefined
    setMm(String(mmMatches))
    setFinal(String(isFinal))
  }, [])

  return (
    <div
      style={{
        margin: '0 auto 12px',
        maxWidth: 320,
        padding: '8px 12px',
        fontSize: 12,
        fontFamily: 'monospace',
        textAlign: 'left',
        background: '#F3F3F0',
        border: '1px solid #E8E4DC',
        borderRadius: 8,
        color: '#1A1A2E',
      }}
    >
      <div>navA (navigator.standalone): {navA}</div>
      <div>mm (display-mode: standalone): {mm}</div>
      <div>final: {final}</div>
    </div>
  )
}
