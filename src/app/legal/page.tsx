export default function LegalPage() {
  const rows = [
    ['販売業者', '株式会社Legrand chariot'],
    ['代表者', '宮崎ほくと'],
    ['所在地', '茨城県つくば市研究学園5-11-2'],
    ['電話番号', '請求があった場合に遅滞なく開示いたします'],
    ['メールアドレス', 'bodydiscoverystudio@gmail.com'],
    ['サービス名', 'REAL PROOF'],
    ['販売価格', 'サイト内に表示（現在は無料）'],
    ['支払方法', 'クレジットカード（将来実装予定）'],
    ['サービス提供時期', '登録後即時'],
    ['返品・キャンセル', 'デジタルサービスの性質上、提供後の返品は不可'],
    ['動作環境', '最新版のChrome, Safari, Edge等のブラウザ'],
  ]

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-8">特定商取引法に基づく表記</h1>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full">
          <tbody>
            {rows.map(([label, value], i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <th className="text-left text-sm font-medium text-[#1A1A2E] px-5 py-4 w-1/3 border-b border-gray-100 align-top">
                  {label}
                </th>
                <td className="text-sm text-gray-700 px-5 py-4 border-b border-gray-100">
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-6 text-center">
        最終更新日：2026年2月17日
      </p>
    </div>
  )
}
