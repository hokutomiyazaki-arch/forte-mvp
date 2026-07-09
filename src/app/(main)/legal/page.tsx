import { COMPANY_INFO } from '@/lib/company-info'

function InfoTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <table className="w-full">
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <th className="text-left text-sm font-medium text-[#1A1A2E] px-5 py-4 w-1/3 border-b border-gray-100 align-top">
                {label}
              </th>
              <td className="text-sm text-gray-700 px-5 py-4 border-b border-gray-100 whitespace-pre-line">
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function LegalPage() {
  // 事業者情報（共通）— 会社表記は company-info.ts を単一ソースとする
  const business: [string, string][] = [
    ['販売事業者', COMPANY_INFO.name],
    ['運営統括責任者', COMPANY_INFO.representative],
    ['所在地', `〒${COMPANY_INFO.postalCode} ${COMPANY_INFO.address}`],
    ['電話番号', 'ご請求があれば遅滞なく開示いたします。'],
    ['メールアドレス', COMPANY_INFO.email],
  ]

  // 取引条件（商品別）
  const digital: [string, string][] = [
    ['利用料金', '無料'],
    ['提供時期', 'ご登録後、即時ご利用いただけます。'],
    ['返品・キャンセル', 'サービスの性質上、返品はできません。'],
  ]

  const nfcCard: [string, string][] = [
    ['販売価格', '¥3,000（送料込み）'],
    ['商品代金以外の必要料金', 'なし'],
    ['支払方法', 'クレジットカード決済（Stripe）'],
    ['支払時期', 'ご注文確定時'],
    ['引渡し時期', 'ご注文確認後、5営業日以内に発送いたします。'],
    [
      '返品・交換',
      'お客様都合による返品・交換はお受けできません。カードの初期不良（NFC不動作・破損等）の場合は、商品到着後8日以内にメールにてご連絡ください。良品と交換いたします。',
    ],
    [
      '動作環境',
      'NFC読み取りに対応したスマートフォン（近年のiPhone / Android）。非対応端末でもカード裏面のQRコードからご利用いただけます。',
    ],
  ]

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-8">特定商取引法に基づく表記</h1>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">事業者情報</h2>
        <InfoTable rows={business} />
      </section>

      <section className="mb-2">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">取引条件</h2>

        <h3 className="text-sm font-bold text-[#9A7B3A] mb-3">
          ■ REALPROOF（デジタルサービス）
        </h3>
        <div className="mb-8">
          <InfoTable rows={digital} />
        </div>

        <h3 className="text-sm font-bold text-[#9A7B3A] mb-3">
          ■ REALPROOF NFCカード（物販）
        </h3>
        <InfoTable rows={nfcCard} />
      </section>

      <p className="text-xs text-gray-400 mt-6 text-center">最終更新日：2026年7月9日</p>
    </div>
  )
}
