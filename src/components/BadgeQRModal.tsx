'use client'
import { QRCodeSVG } from 'qrcode.react'

type Props = {
  badgeName: string
  claimToken: string
  onClose: () => void
}

export default function BadgeQRModal({ badgeName, claimToken, onClose }: Props) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://realproof.jp'}/badge/claim/${claimToken}`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-[#1A1A2E] mb-2">{badgeName}</h3>
        <p className="text-sm text-gray-500 mb-6">スキャンしてバッジを取得</p>
        <div className="flex justify-center mb-4">
          <QRCodeSVG value={url} size={200} />
        </div>
        <p className="text-xs text-gray-400 break-all mb-6">{url}</p>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-[#1A1A2E] text-white text-sm font-bold"
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
