'use client'
import { useState } from 'react'
import { PROVEN_GOLD, getCertifiableTier, TIER_DISPLAY } from '@/lib/constants'
import { PREFECTURES } from '@/lib/prefectures'

interface CertificationModalProps {
  professionalId: string
  categorySlug: string
  categoryName: string
  proofCount: number
  topPersonality: string | null
  /** このプロのこれまでの申請件数 === 0 か。SPECIALIST 初回判定に使う */
  isFirstApplication: boolean
  onClose: () => void
  onComplete: (certNumber: string) => void
}

type ModalStep = 'form' | 'confirm' | 'submitting' | 'complete'

export default function CertificationModal({
  professionalId,
  categorySlug,
  categoryName,
  proofCount,
  topPersonality,
  isFirstApplication,
  onClose,
  onComplete,
}: CertificationModalProps) {
  const [step, setStep] = useState<ModalStep>('form')
  const [certNumber, setCertNumber] = useState('')
  const [error, setError] = useState('')
  // 申請後にレスポンスから受け取る決済情報
  const [paymentStatus, setPaymentStatus] = useState<'free' | 'pending'>('free')
  const [stripePaymentUrl, setStripePaymentUrl] = useState<string | null>(null)

  // フロント側のティア / 無料判定 (確認画面のボタン文言などで使用)
  const applyTier = getCertifiableTier(proofCount) || 'SPECIALIST'
  const isFreeApplication = isFirstApplication && applyTier === 'SPECIALIST'

  // フォームフィールド
  const [fullNameKanji, setFullNameKanji] = useState('')
  const [fullNameRomaji, setFullNameRomaji] = useState('')
  const [organization, setOrganization] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [prefecture, setPrefecture] = useState('')
  const [cityAddress, setCityAddress] = useState('')
  const [building, setBuilding] = useState('')
  const [phone, setPhone] = useState('')

  // 郵便番号→住所自動入力
  const fetchAddress = async (code: string) => {
    const cleaned = code.replace(/[^0-9]/g, '')
    if (cleaned.length !== 7) return
    try {
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleaned}`)
      const data = await res.json()
      if (data.results?.[0]) {
        const r = data.results[0]
        setPrefecture(r.address1)
        setCityAddress(r.address2 + r.address3)
      }
    } catch (err) {
      console.error('Zipcloud API error:', err)
    }
  }

  const handlePostalCodeChange = (value: string) => {
    setPostalCode(value)
    const cleaned = value.replace(/[^0-9]/g, '')
    if (cleaned.length === 7) {
      fetchAddress(cleaned)
    }
  }

  const validate = (): boolean => {
    if (!fullNameKanji.trim()) { setError('氏名（漢字）を入力してください'); return false }
    if (!fullNameRomaji.trim()) { setError('氏名（ローマ字）を入力してください'); return false }
    const cleanedPostal = postalCode.replace(/[^0-9]/g, '')
    if (cleanedPostal.length !== 7) { setError('郵便番号（7桁）を入力してください'); return false }
    if (!prefecture) { setError('都道府県を選択してください'); return false }
    if (!cityAddress.trim()) { setError('市区町村・番地を入力してください'); return false }
    if (!phone.trim()) { setError('電話番号を入力してください'); return false }
    setError('')
    return true
  }

  const handleConfirm = () => {
    if (!validate()) return
    setStep('confirm')
  }

  const handleSubmit = async () => {
    setStep('submitting')
    setError('')
    try {
      const res = await fetch('/api/certification/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professionalId,
          categorySlug,
          proofCount,
          topPersonality,
          fullNameKanji: fullNameKanji.trim(),
          fullNameRomaji: fullNameRomaji.trim(),
          organization: organization.trim() || null,
          postalCode: postalCode.replace(/[^0-9]/g, ''),
          prefecture,
          cityAddress: cityAddress.trim(),
          building: building.trim() || null,
          phone: phone.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          setError('この項目はすでに申請済みです')
        } else {
          setError(data.error || '申請に失敗しました')
        }
        setStep('form')
        return
      }
      setCertNumber(data.certificationNumber || '')
      // サーバ側の決済判定をクライアントへ反映 (フロントのフォールバック判定より優先)
      if (data.paymentStatus === 'free' || data.paymentStatus === 'pending') {
        setPaymentStatus(data.paymentStatus)
      }
      setStripePaymentUrl(typeof data.stripePaymentUrl === 'string' ? data.stripePaymentUrl : null)
      setStep('complete')
      onComplete(data.certificationNumber || '')
    } catch (err) {
      console.error('Certification apply error:', err)
      setError('ネットワークエラーが発生しました')
      setStep('form')
    }
  }

  const inputClass = 'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A843] focus:border-transparent'
  const labelClass = 'block text-xs font-bold text-gray-700 mb-1'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget && step !== 'submitting') onClose() }}>
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">

        {/* ====== フォーム画面 ====== */}
        {(step === 'form') && (
          <div className="p-6">
            {/* ヘッダー */}
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold" style={{ color: PROVEN_GOLD }}>
                🏆 REALPROOF認定申請
              </h2>
              <p className="text-sm text-gray-600 mt-2">
                「<strong>{categoryName}</strong>」 {proofCount} proofs 達成
              </p>
              {topPersonality && (
                <p className="text-xs text-gray-500 mt-1">
                  最も評価された人柄: 「{topPersonality}」
                </p>
              )}
            </div>

            {/* ====== 制度説明セクション ====== */}
            <div style={{
              background: 'rgba(196,163,90,0.06)',
              border: '1px solid #C4A35A',
              borderRadius: 12,
              padding: 20,
              marginBottom: 24,
            }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#C4A35A', marginBottom: 12 }}>
                REALPROOF認定について
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#374151', margin: 0 }}>
                1つの強みで30プルーフを達成したプロに贈られる認定です。
              </p>

              {/* 届くもの */}
              <div style={{ fontSize: 14, fontWeight: 600, color: '#C4A35A', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 }}>
                【届くもの（セットで郵送）】
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: '#374151' }}>
                <p style={{ margin: '0 0 8px 0' }}>
                  <span style={{ marginRight: 6 }}>🏆</span><strong>認定証（賞状）</strong><br />
                  <span style={{ marginLeft: 24, display: 'inline-block' }}>
                    「{categoryName}スペシャリスト」の称号<br />
                    カテゴリごとに1枚発行<br />
                    壁に飾れる達成の記録
                  </span>
                </p>
                <p style={{ margin: 0 }}>
                  <span style={{ marginRight: 6 }}>💳</span><strong>認定カード（NFC付き）</strong><br />
                  <span style={{ marginLeft: 24, display: 'inline-block' }}>
                    あなたの全認定を1枚に集約<br />
                    新しいカテゴリが30票に達するたびに最新版に更新できます
                  </span>
                </p>
              </div>

              {/* 申請タイミング */}
              <div style={{ fontSize: 14, fontWeight: 600, color: '#C4A35A', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 }}>
                【申請タイミング】
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                  border: '0.5px solid rgba(196,163,90,0.3)',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: '#374151',
                }}>
                  <strong>A：今すぐ申請する</strong><br />
                  → 現時点の認定カテゴリのみ記載<br />
                  → 後で別カテゴリが30票に達したら追加申請可能
                </div>
                <div style={{
                  border: '0.5px solid rgba(196,163,90,0.3)',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: '#374151',
                }}>
                  <strong>B：もう少し待ってから申請する</strong><br />
                  → 他のカテゴリも30票に近いなら、まとめて申請する事で<br />
                  　 複数の認定が入ったカードが届きます
                </div>
              </div>

              {/* 料金 */}
              <div style={{ fontSize: 14, fontWeight: 600, color: '#C4A35A', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 }}>
                【料金】
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#374151', margin: 0 }}>
                初回：無料<br />
                2回目以降：有料（カード更新 + 新しい賞状のセット）
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* 氏名（漢字） */}
              <div>
                <label className={labelClass}>氏名（漢字）<span className="text-red-500 ml-1">*</span></label>
                <input type="text" className={inputClass} value={fullNameKanji}
                  onChange={(e) => setFullNameKanji(e.target.value)}
                  placeholder="山田 太郎" />
                <p className="text-[10px] text-gray-400 mt-0.5">賞状印字用</p>
              </div>

              {/* 氏名（ローマ字） */}
              <div>
                <label className={labelClass}>氏名（ローマ字）<span className="text-red-500 ml-1">*</span></label>
                <input type="text" className={inputClass} value={fullNameRomaji}
                  onChange={(e) => setFullNameRomaji(e.target.value)}
                  placeholder="Taro Yamada" />
                <p className="text-[10px] text-gray-400 mt-0.5">カード印字用</p>
              </div>

              {/* 所属／肩書（任意） */}
              <div>
                <label className={labelClass}>所属 / 肩書（カードに印字されます）</label>
                <input type="text" className={inputClass} value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="例：一般社団法人 〇〇 代表" />
                <p className="text-[10px] text-gray-400 mt-0.5">任意。カード表面に併記されます</p>
              </div>

              {/* 郵便番号 */}
              <div>
                <label className={labelClass}>郵便番号<span className="text-red-500 ml-1">*</span></label>
                <input type="text" className={inputClass} value={postalCode}
                  onChange={(e) => handlePostalCodeChange(e.target.value)}
                  placeholder="1234567" maxLength={8} />
                <p className="text-[10px] text-gray-400 mt-0.5">ハイフンなし7桁で住所が自動入力されます</p>
              </div>

              {/* 都道府県 */}
              <div>
                <label className={labelClass}>都道府県<span className="text-red-500 ml-1">*</span></label>
                <select className={inputClass} value={prefecture}
                  onChange={(e) => setPrefecture(e.target.value)}>
                  <option value="">選択してください</option>
                  {PREFECTURES.map((pref) => (
                    <option key={pref} value={pref}>{pref}</option>
                  ))}
                </select>
              </div>

              {/* 市区町村・番地 */}
              <div>
                <label className={labelClass}>市区町村・番地<span className="text-red-500 ml-1">*</span></label>
                <input type="text" className={inputClass} value={cityAddress}
                  onChange={(e) => setCityAddress(e.target.value)}
                  placeholder="千代田区丸の内1-1-1" />
              </div>

              {/* 建物名 */}
              <div>
                <label className={labelClass}>建物名・部屋番号</label>
                <input type="text" className={inputClass} value={building}
                  onChange={(e) => setBuilding(e.target.value)}
                  placeholder="マンション名 101号室" />
              </div>

              {/* 電話番号 */}
              <div>
                <label className={labelClass}>電話番号<span className="text-red-500 ml-1">*</span></label>
                <input type="tel" className={inputClass} value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09012345678" />
                <p className="text-[10px] text-gray-400 mt-0.5">配送トラブル時の連絡用</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={onClose}
                className="flex-1 px-4 py-3 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">
                キャンセル
              </button>
              <button onClick={handleConfirm}
                className="flex-1 px-4 py-3 text-sm font-bold rounded-lg"
                style={{ backgroundColor: PROVEN_GOLD, color: '#1A1A2E' }}>
                確認する
              </button>
            </div>
          </div>
        )}

        {/* ====== 確認画面 ====== */}
        {step === 'confirm' && (
          <div className="p-6">
            <h2 className="text-lg font-bold text-center mb-4">以下の内容で申請します</h2>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">認定カテゴリ</span>
                <span className="font-bold">{categoryName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">プルーフ数</span>
                <span className="font-bold">{proofCount}</span>
              </div>
              {topPersonality && (
                <div className="flex justify-between">
                  <span className="text-gray-500">最多人柄</span>
                  <span className="font-bold">{topPersonality}</span>
                </div>
              )}
              <hr className="my-2" />
              <div className="flex justify-between">
                <span className="text-gray-500">氏名（漢字）</span>
                <span>{fullNameKanji}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">氏名（ローマ字）</span>
                <span>{fullNameRomaji}</span>
              </div>
              {organization.trim() && (
                <div className="flex justify-between">
                  <span className="text-gray-500">所属 / 肩書</span>
                  <span>{organization}</span>
                </div>
              )}
              <hr className="my-2" />
              <div>
                <span className="text-gray-500">送付先</span>
                <p className="mt-1">〒 {postalCode}</p>
                <p>{prefecture} {cityAddress}</p>
                {building && <p>{building}</p>}
                <p>TEL: {phone}</p>
              </div>
            </div>

            {/* 決済区分の案内 (確認画面) */}
            <div className="mt-4 p-3 rounded-lg" style={{ background: 'rgba(196,163,90,0.06)', border: '1px solid rgba(196,163,90,0.3)' }}>
              <div className="text-xs text-gray-700">
                {isFreeApplication
                  ? '初回 SPECIALIST 認定は無料です。申請後すぐに制作を開始します。'
                  : (
                    <>
                      <strong>{TIER_DISPLAY[applyTier].icon} {TIER_DISPLAY[applyTier].label}</strong> 認定は有料です。
                      <br />
                      申請後に表示される決済リンクからお支払いください。
                      <br />
                      お支払い完了後に制作を開始します。
                    </>
                  )
                }
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep('form')}
                className="flex-1 px-4 py-3 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">
                戻る
              </button>
              <button onClick={handleSubmit}
                className="flex-1 px-4 py-3 text-sm font-bold rounded-lg"
                style={{ backgroundColor: PROVEN_GOLD, color: '#1A1A2E' }}>
                {isFreeApplication ? '申請する(無料)' : '申請する'}
              </button>
            </div>
          </div>
        )}

        {/* ====== 送信中 ====== */}
        {step === 'submitting' && (
          <div className="p-6 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-[#D4A843] rounded-full mx-auto mb-4" />
            <p className="text-sm text-gray-600">申請を送信中...</p>
          </div>
        )}

        {/* ====== 完了画面 ====== */}
        {step === 'complete' && (
          <div className="p-6 text-center">
            <div className="text-4xl mb-4">{paymentStatus === 'pending' ? '✅' : '🎉'}</div>
            <h2 className="text-xl font-bold mb-2">
              {paymentStatus === 'pending' ? '申請を受け付けました!' : '申請完了!'}
            </h2>
            <p className="text-sm text-gray-600 mb-1">
              REALPROOF認定「<strong>{categoryName}{TIER_DISPLAY[applyTier].label}</strong>」の
            </p>
            <p className="text-sm text-gray-600 mb-4">
              賞状と名前入りプルーフカードをお届けします。
            </p>

            {/* 有料申請: 決済リンクを優先表示 */}
            {paymentStatus === 'pending' && stripePaymentUrl && (
              <div className="rounded-lg p-4 mb-4 text-left" style={{ background: 'rgba(196,163,90,0.08)', border: '1px solid #C4A35A' }}>
                <p className="text-sm font-bold mb-2" style={{ color: '#C4A35A' }}>
                  お支払いをお願いします
                </p>
                <p className="text-xs text-gray-700 mb-3 leading-relaxed">
                  お支払い完了後に制作を開始します。
                  下記のボタンから Stripe の決済ページにお進みください。
                </p>
                <a
                  href={stripePaymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full px-4 py-3 text-sm font-bold rounded-lg text-center"
                  style={{ backgroundColor: PROVEN_GOLD, color: '#1A1A2E', textDecoration: 'none' }}
                >
                  お支払いページへ →
                </a>
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-4 mb-4 text-left">
              <p className="text-xs font-bold text-gray-500 mb-2">■ 送付先</p>
              <p className="text-sm text-gray-700">
                〒 {postalCode}<br />
                {prefecture} {cityAddress}
                {building && <><br />{building}</>}
              </p>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              {paymentStatus === 'pending'
                ? 'お支払いが確認でき次第、上記の住所に発送いたします。'
                : '準備が整い次第、上記の住所に発送いたします。'}
            </p>
            {certNumber && (
              <p className="text-xs text-gray-400 mb-4">
                認定番号: {certNumber}
              </p>
            )}
            <button onClick={onClose}
              className="w-full px-4 py-3 text-sm font-bold rounded-lg"
              style={{
                backgroundColor: paymentStatus === 'pending' ? 'transparent' : PROVEN_GOLD,
                color: paymentStatus === 'pending' ? '#888' : '#1A1A2E',
                border: paymentStatus === 'pending' ? '1px solid #D0CCC4' : 'none',
              }}>
              ダッシュボードに戻る
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
