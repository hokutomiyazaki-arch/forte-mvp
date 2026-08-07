'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

const SHARE_ORIGIN = 'https://realproof.jp'

interface Props {
  proId: string
}

/**
 * §17-13(CEO指示 2026-08-06): プロを誘うQRコード。
 * 「ついでに気になるプロのトップにも同じQRを置いておいて。このQRはトップページのQRと
 *  デザインを揃えて。」
 *
 * デザインはダッシュボード最上部の「24時間限定 プルーフ用QRコード」カードに合わせている
 * （bg-white / rounded-xl / p-6 / shadow-sm / mb-6 / text-center、見出し text-lg font-bold、
 *  説明 text-sm text-gray-500、下の小操作は text-sm のリンク調）。
 * 揃えるのは**見た目だけ**で、中身は別物なので見出しで必ず区別する:
 *   - トップのQR    = クライアントに見せる（プルーフを贈ってもらう）
 *   - このQR        = 同業の先生に見せる（REAL PROOFに登録してもらう）
 *
 * 読み取り先(/invite/pro/[proId])はトークン無し。1枚を何人にでも見せられる
 * （更新も再発行も要らないので、その手の操作は置かない）。
 */
export default function ProInviteQrCard({ proId }: Props) {
  const [copied, setCopied] = useState(false)
  const [shown, setShown] = useState(false)
  const inviteUrl = `${SHARE_ORIGIN}/invite/pro/${proId}`
  // §17-17: 送る相手は「REAL PROOFをまだ知らない先生」。何のサービスかを先に書く。
  const shareText = `REAL PROOFという、クライアントからの評価がそのまま実績として記録に残るサービスがあります。\n登録は無料です。よければプロフィールを作ってみませんか → ${inviteUrl}`

  function copyUrl() {
    navigator.clipboard?.writeText(shareText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function share() {
    // §17-12: ボタンは常に出す。ネイティブ共有が使えない端末ではコピーに倒す
    // （押しても何も起きない状態を作らない）。
    const canNativeShare = typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function'
    if (canNativeShare) {
      try {
        await (navigator as unknown as { share: (d: { text: string }) => Promise<void> }).share({ text: shareText })
      } catch {}
      return
    }
    copyUrl()
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm mb-6 text-center">
      {/* §17-17(CEO指摘 2026-08-06): 「新しい先生にも見せようと思う文言にして欲しい。むしろそれがメイン。
          現状だと登録済みのプロだけの機能に見える」
          → 主役は**REAL PROOFをまだ知らない先生を誘うこと**。「気になるプロに入る」は
          未登録の人には意味が通らない用語なので、先に出さない（下に小さく置く）。 */}
      <h2 className="text-lg font-bold text-[#1A1A2E] mb-1">先生をREAL PROOFに誘う</h2>
      <p className="text-xs text-[#C4A35A] font-semibold mb-3">まだ登録していない先生に見せるQRです</p>
      <p className="text-sm text-gray-500 mb-4">
        読み取ると、その場で登録できます（無料）。
        <br />
        クライアントからの評価が、その先生の実績として残ります。
      </p>
      <p className="text-xs text-gray-400 mb-4">
        登録した先生はあなたの「気になるプロ」に入ります。紹介リストに載せるかは、あとから選べます。
      </p>

      {shown ? (
        <>
          <div className="flex justify-center mb-4">
            <QRCodeSVG value={inviteUrl} size={200} />
          </div>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={share}
              className="text-sm text-[#C4A35A] hover:underline transition-colors"
            >
              シェアする
            </button>
            <span className="text-[#E5E7EB]">|</span>
            <button
              onClick={copyUrl}
              className="text-sm text-[#9CA3AF] hover:text-[#C4A35A] transition-colors"
            >
              {copied ? 'コピーしました ✓' : 'テキストをコピー'}
            </button>
            <span className="text-[#E5E7EB]">|</span>
            <button
              onClick={() => setShown(false)}
              className="text-sm text-[#9CA3AF] hover:text-[#C4A35A] transition-colors"
            >
              閉じる
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={() => setShown(true)}
            className="px-6 py-3 bg-[#C4A35A] text-white rounded-lg hover:bg-[#b3944f] transition"
          >
            QRコードを見せる
          </button>
          <button
            onClick={share}
            className="text-sm text-[#9CA3AF] hover:text-[#C4A35A] transition-colors"
          >
            シェアする
          </button>
        </div>
      )}
    </div>
  )
}
