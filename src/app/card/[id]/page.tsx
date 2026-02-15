// ========================================
// card/[id]/page.tsx に追加するバッジ表示コード
// ========================================
// 
// 前提: professionals テーブルから取得する際に badges カラムも含めること
// 例: .select('*, badges') もしくは .select('*') で全カラム取得していればOK
//
// 追加場所: プロの名前・肩書き表示の下、チャートの上あたり
// ========================================

{/* バッジ表示 */}
{pro.badges && pro.badges.length > 0 && (
  <div className="flex flex-wrap justify-center gap-3 mb-6">
    {pro.badges.map((badge: { id: string; label: string; image_url: string }) => (
      <div key={badge.id} className="flex flex-col items-center">
        <img
          src={badge.image_url}
          alt={badge.label}
          className="w-14 h-14 rounded-full"
        />
        <span className="text-xs text-gray-500 mt-1">{badge.label}</span>
      </div>
    ))}
  </div>
)}
