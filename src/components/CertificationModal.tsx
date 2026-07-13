'use client'
import { useState } from 'react'
import { PROVEN_GOLD, TIER_DISPLAY, CERTIFICATION_PRODUCT_PRICING, type CertifiableTier } from '@/lib/constants'
import { PREFECTURES } from '@/lib/prefectures'

export type EligibleCategory = {
  slug: string
  name: string
  count: number
  tier: CertifiableTier
}

interface CertificationModalProps {
  professionalId: string
  /** 認定可能カテゴリ（30票以上・未申請）。複数選択できる。 */
  categories: EligibleCategory[]
  topPersonality: string | null
  /** このプロに過去の申請グループが無い（＝初回グループ・無料）か。 */
  isFirstApplication: boolean
  onClose: () => void
  onComplete: (certNumbers: string[], appliedSlugs: string[]) => void
}

type ModalStep = 'form' | 'confirm' | 'submitting' | 'complete'

const METAL_TIERS: CertifiableTier[] = ['MASTER', 'LEGEND']

export default function CertificationModal({
  professionalId,
  categories,
  topPersonality,
  isFirstApplication,
  onClose,
  onComplete,
}: CertificationModalProps) {
  const [step, setStep] = useState<ModalStep>('form')
  const [certNumbers, setCertNumbers] = useState<string[]>([])
  const [error, setError] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<'free' | 'pending'>('free')
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [applicationGroupId, setApplicationGroupId] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  // 申請＝そのプロの30票以上の全カテゴリが自動対象（顧客はカテゴリを選ばない）。
  // カード掲載は最大6件。達成が7件以上のときだけ顧客が「どれをカードに載せるか」を選ぶ。
  const needsCardSelection = categories.length > 6
  const [cardSlugs, setCardSlugs] = useState<string[]>(() =>
    needsCardSelection
      ? [...categories].sort((a, b) => b.count - a.count).slice(0, 6).map((c) => c.slug)
      : categories.map((c) => c.slug)
  )
  // 物理アップグレード（独立オプション）
  const [wantMetal, setWantMetal] = useState(false)
  const [wantShield, setWantShield] = useState(false)
  // プロフィール写真をカードに使うか（初期ON）。金属選択時は強制OFF＋ロック。
  const [usePhotoOnCard, setUsePhotoOnCard] = useState(true)

  // 金属カードのON/OFFに連動して顔写真チェックを制御
  const onToggleMetal = (checked: boolean) => {
    setWantMetal(checked)
    if (checked) setUsePhotoOnCard(false) // 金属＝顔写真非対応 → 強制OFF
    else setUsePhotoOnCard(true) // PVCに戻したら初期値ONへ
  }

  // フォームフィールド
  const [fullNameKanji, setFullNameKanji] = useState('')
  const [fullNameRomaji, setFullNameRomaji] = useState('')
  const [organization, setOrganization] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [prefecture, setPrefecture] = useState('')
  const [cityAddress, setCityAddress] = useState('')
  const [building, setBuilding] = useState('')
  const [phone, setPhone] = useState('')

  // ===== 選択・料金計算（物理プロダクト一律価格・カテゴリ数非依存）=====
  const allCats = categories // 申請＝全≥30（＝賞状の対象）
  const cardCats = categories.filter((c) => cardSlugs.includes(c.slug)) // カード掲載（≤6）
  const metalEligible = allCats.some((c) => c.tier === 'MASTER' || c.tier === 'LEGEND') // Master以上
  const shieldEligible = allCats.some((c) => c.tier === 'LEGEND') // Legend以上
  const wantMetalEff = wantMetal && metalEligible
  const wantShieldEff = wantShield && shieldEligible
  const pvcCost = isFirstApplication ? 0 : CERTIFICATION_PRODUCT_PRICING.pvc
  const metalCost = wantMetalEff ? CERTIFICATION_PRODUCT_PRICING.metal : 0
  const shieldCost = wantShieldEff ? CERTIFICATION_PRODUCT_PRICING.shield : 0
  const totalAmount = pvcCost + metalCost + shieldCost
  const isFreeApplication = totalAmount === 0

  // カード掲載トグル（最大6件まで。6件選択済みで未選択を押しても追加しない）
  const toggleCard = (slug: string) =>
    setCardSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : prev.length >= 6 ? prev : [...prev, slug]
    )

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
    if (value.replace(/[^0-9]/g, '').length === 7) fetchAddress(value)
  }

  const validate = (): boolean => {
    if (allCats.length === 0) { setError('認定可能な強み（30票以上）がありません'); return false }
    if (needsCardSelection && (cardCats.length === 0 || cardCats.length > 6)) { setError('カードに載せる強みを1〜6件選んでください'); return false }
    if (!fullNameKanji.trim()) { setError('氏名（漢字）を入力してください'); return false }
    if (!fullNameRomaji.trim()) { setError('氏名（ローマ字）を入力してください'); return false }
    if (postalCode.replace(/[^0-9]/g, '').length !== 7) { setError('郵便番号（7桁）を入力してください'); return false }
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
          // 申請＝全≥30を自動対象（顧客はカテゴリ選択しない）
          categories: allCats.map((c) => ({ categorySlug: c.slug, proofCount: c.count })),
          // カードに載せる項目（≤6）。professionals.card_proof_ids に保存される
          cardProofIds: cardCats.map((c) => c.slug),
          wantMetal: wantMetalEff,
          wantShield: wantShieldEff,
          // 金属選択時は顔写真非対応のため強制 false
          usePhotoOnCard: wantMetal ? false : usePhotoOnCard,
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
        if (res.status === 409) setError('選択カテゴリにすでに申請済みのものが含まれています')
        else setError(data.error || '申請に失敗しました')
        setStep('form')
        return
      }
      setCertNumbers(Array.isArray(data.certificationNumbers) ? data.certificationNumbers : [])
      if (data.paymentStatus === 'free' || data.paymentStatus === 'pending') setPaymentStatus(data.paymentStatus)
      setPaymentAmount(typeof data.paymentAmount === 'number' ? data.paymentAmount : 0)
      setApplicationGroupId(typeof data.applicationGroupId === 'string' ? data.applicationGroupId : null)
      setStep('complete')
      onComplete(data.certificationNumbers || [], allCats.map((c) => c.slug))
    } catch (err) {
      console.error('Certification apply error:', err)
      setError('ネットワークエラーが発生しました')
      setStep('form')
    }
  }

  // 決済ページ（Stripe Checkout・動的生成）へ遷移
  const goToCheckout = async () => {
    if (!applicationGroupId) return
    setCheckoutLoading(true)
    try {
      const res = await fetch('/api/certification/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ applicationGroupId }),
      })
      const data = await res.json()
      if (res.ok && typeof data.url === 'string') {
        window.location.href = data.url
        return
      }
      setError(data.error || '決済ページの作成に失敗しました')
      setCheckoutLoading(false)
    } catch {
      setError('決済ページへの接続に失敗しました')
      setCheckoutLoading(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A843] focus:border-transparent'
  const labelClass = 'block text-xs font-bold text-gray-700 mb-1'

  const yen = (n: number) => `¥${n.toLocaleString()}`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget && step !== 'submitting') onClose() }}>
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">

        {/* ====== フォーム画面 ====== */}
        {step === 'form' && (
          <div className="p-6">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold" style={{ color: PROVEN_GOLD }}>🏆 REALPROOF認定申請</h2>
              <p className="text-sm text-gray-600 mt-2">認定可能な強みをまとめて申請できます</p>
            </div>

            {/* 上部・小さめの注記（申請可能プロダクトの目安） */}
            <div style={{ fontSize: 11, color: '#888', lineHeight: 1.7, marginBottom: 16, background: '#F7F5F0', borderRadius: 8, padding: '10px 12px' }}>
              ※ Specialist以上で申請可能 ＝ 名入りカード<br />
              ※ Master以上で申請可能 ＝ 金属カード<br />
              ※ Legend以上で申請可能 ＝ 盾<br />
              ※ 賞状は申請した認定項目の枚数分、無料で付属します
            </div>

            {/* カテゴリ選択 */}
            <div style={{ background: 'rgba(196,163,90,0.06)', border: '1px solid #C4A35A', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#C4A35A', marginBottom: 6 }}>
                認定される強み（30票以上・{allCats.length}件）
              </div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 10, lineHeight: 1.6 }}>
                {needsCardSelection
                  ? `賞状は${allCats.length}枚すべて発行されます。カードは6枠までのため、載せる6つを選んでください（${cardCats.length}/6）。`
                  : `${allCats.length}件すべてがカードに載り、賞状も${allCats.length}枚発行されます（カテゴリ選択は不要）。`}
              </div>
              {allCats.length === 0 ? (
                <p style={{ fontSize: 13, color: '#888', margin: 0 }}>認定可能な強み（30票以上）がありません。</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {allCats.map((c) => {
                    const onCard = cardSlugs.includes(c.slug)
                    const meta = TIER_DISPLAY[c.tier]
                    const atLimit = needsCardSelection && !onCard && cardCats.length >= 6
                    return (
                      <label key={c.slug} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8,
                        border: `1px solid ${onCard ? '#C4A35A' : 'rgba(196,163,90,0.25)'}`,
                        background: onCard ? 'rgba(196,163,90,0.10)' : 'white',
                        cursor: needsCardSelection ? (atLimit ? 'not-allowed' : 'pointer') : 'default',
                        opacity: atLimit ? 0.5 : 1,
                      }}>
                        {needsCardSelection && (
                          <input type="checkbox" checked={onCard} disabled={atLimit} onChange={() => toggleCard(c.slug)} />
                        )}
                        <span style={{ flex: 1, fontSize: 14, color: '#1A1A2E' }}>{c.name}</span>
                        <span style={{ fontSize: 12, color: '#C4A35A', fontWeight: 700 }}>{meta.icon} {meta.label}</span>
                        <span style={{ fontSize: 12, color: '#888' }}>{c.count}票</span>
                        {needsCardSelection && onCard && <span style={{ fontSize: 10, color: '#C4A35A', fontWeight: 700 }}>カード</span>}
                      </label>
                    )
                  })}
                </div>
              )}

              {/* 金属カード / 盾（独立オプション・該当ティアのみ表示・一律価格） */}
              {(metalEligible || shieldEligible) && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {metalEligible && (
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 8, border: '1px dashed #C4A35A', background: 'white', cursor: 'pointer' }}>
                      <input type="checkbox" checked={wantMetal} onChange={(e) => onToggleMetal(e.target.checked)} style={{ marginTop: 3 }} />
                      <span style={{ fontSize: 13, lineHeight: 1.6, color: '#374151' }}>
                        <strong>金属カード</strong>にアップグレード <span style={{ color: '#C4A35A', fontWeight: 700 }}>（＋{yen(CERTIFICATION_PRODUCT_PRICING.metal)}）</span><br />
                        <span style={{ fontSize: 11, color: '#888' }}>Master以上で選択可。カテゴリ数に関わらず一律。</span>
                      </span>
                    </label>
                  )}
                  {shieldEligible && (
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 8, border: '1px dashed #C4A35A', background: 'white', cursor: 'pointer' }}>
                      <input type="checkbox" checked={wantShield} onChange={(e) => setWantShield(e.target.checked)} style={{ marginTop: 3 }} />
                      <span style={{ fontSize: 13, lineHeight: 1.6, color: '#374151' }}>
                        <strong>盾</strong>を追加 <span style={{ color: '#C4A35A', fontWeight: 700 }}>（＋{yen(CERTIFICATION_PRODUCT_PRICING.shield)}）</span><br />
                        <span style={{ fontSize: 11, color: '#888' }}>Legend以上で選択可。カテゴリ数に関わらず一律。</span>
                      </span>
                    </label>
                  )}
                </div>
              )}

              {/* 顔写真をカードに使うか（初期ON。金属選択中は強制OFF＋ロック） */}
              <div style={{ marginTop: 12 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 8, border: '1px solid #E5E5E0', background: wantMetal ? '#F3F3F1' : 'white', cursor: wantMetal ? 'not-allowed' : 'pointer', opacity: wantMetal ? 0.6 : 1 }}>
                  <input
                    type="checkbox"
                    checked={wantMetal ? false : usePhotoOnCard}
                    disabled={wantMetal}
                    onChange={(e) => setUsePhotoOnCard(e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span style={{ fontSize: 13, lineHeight: 1.6, color: '#374151' }}>
                    <strong>プロフィール写真をカードに使用する</strong><br />
                    {wantMetal ? (
                      <span style={{ fontSize: 11, color: '#C4A35A' }}>金属カードは顔写真非対応のため、顔写真は使用されません。</span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#888' }}>別の写真を使いたい場合は、先にプロフィール写真を変更してから申請してください。</span>
                    )}
                  </span>
                </label>
              </div>

              {/* 料金プレビュー */}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(196,163,90,0.3)', fontSize: 14, color: '#1A1A2E' }}>
                <div>カードに載る項目: <strong>{cardCats.length}件</strong>／賞状: <strong>{allCats.length}枚</strong>（無料付属）</div>
                <div style={{ marginTop: 6, fontSize: 13, color: '#374151' }}>
                  名入りPVCカード: <strong>{pvcCost === 0 ? '無料（初回）' : yen(pvcCost)}</strong>
                  {wantMetalEff && <><br />金属カード: <strong>{yen(metalCost)}</strong></>}
                  {wantShieldEff && <><br />盾: <strong>{yen(shieldCost)}</strong></>}
                </div>
                <div style={{ marginTop: 6, fontSize: 15 }}>
                  💰 合計: <strong>{isFreeApplication ? '無料' : yen(totalAmount)}</strong>
                </div>
              </div>
            </div>

            {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

            <div className="space-y-4">
              <div>
                <label className={labelClass}>氏名（漢字）<span className="text-red-500 ml-1">*</span></label>
                <input type="text" className={inputClass} value={fullNameKanji} onChange={(e) => setFullNameKanji(e.target.value)} placeholder="山田 太郎" />
                <p className="text-[10px] text-gray-400 mt-0.5">賞状印字用</p>
              </div>
              <div>
                <label className={labelClass}>氏名（ローマ字）<span className="text-red-500 ml-1">*</span></label>
                <input type="text" className={inputClass} value={fullNameRomaji} onChange={(e) => setFullNameRomaji(e.target.value)} placeholder="Taro Yamada" />
                <p className="text-[10px] text-gray-400 mt-0.5">カード印字用（名 姓）</p>
              </div>
              <div>
                <label className={labelClass}>所属 / 肩書（カードに印字されます）</label>
                <input type="text" className={inputClass} value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="例：一般社団法人 〇〇 代表" />
                <p className="text-[10px] text-gray-400 mt-0.5">任意。カード表面に併記されます</p>
              </div>
              <div>
                <label className={labelClass}>郵便番号<span className="text-red-500 ml-1">*</span></label>
                <input type="text" className={inputClass} value={postalCode} onChange={(e) => handlePostalCodeChange(e.target.value)} placeholder="1234567" maxLength={8} />
                <p className="text-[10px] text-gray-400 mt-0.5">ハイフンなし7桁で住所が自動入力されます</p>
              </div>
              <div>
                <label className={labelClass}>都道府県<span className="text-red-500 ml-1">*</span></label>
                <select className={inputClass} value={prefecture} onChange={(e) => setPrefecture(e.target.value)}>
                  <option value="">選択してください</option>
                  {PREFECTURES.map((pref) => <option key={pref} value={pref}>{pref}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>市区町村・番地<span className="text-red-500 ml-1">*</span></label>
                <input type="text" className={inputClass} value={cityAddress} onChange={(e) => setCityAddress(e.target.value)} placeholder="千代田区丸の内1-1-1" />
              </div>
              <div>
                <label className={labelClass}>建物名・部屋番号</label>
                <input type="text" className={inputClass} value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="マンション名 101号室" />
              </div>
              <div>
                <label className={labelClass}>電話番号<span className="text-red-500 ml-1">*</span></label>
                <input type="tel" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09012345678" />
                <p className="text-[10px] text-gray-400 mt-0.5">配送トラブル時の連絡用</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="flex-1 px-4 py-3 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">キャンセル</button>
              <button onClick={handleConfirm} className="flex-1 px-4 py-3 text-sm font-bold rounded-lg" style={{ backgroundColor: PROVEN_GOLD, color: '#1A1A2E' }}>確認する</button>
            </div>
          </div>
        )}

        {/* ====== 確認画面 ====== */}
        {step === 'confirm' && (
          <div className="p-6">
            <h2 className="text-lg font-bold text-center mb-4">以下の内容で申請します</h2>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div>
                <span className="text-gray-500">認定される強み（{allCats.length}件・賞状{allCats.length}枚）</span>
                <ul className="mt-1 list-disc pl-5">
                  {allCats.map((c) => (
                    <li key={c.slug}>
                      {c.name} <span className="text-gray-400">/ {TIER_DISPLAY[c.tier].label} / {c.count}票</span>
                      {needsCardSelection && cardSlugs.includes(c.slug) && <span className="text-[#C4A35A] font-bold"> ・カード</span>}
                    </li>
                  ))}
                </ul>
                {needsCardSelection && (
                  <div className="text-xs text-gray-500 mt-1">カード掲載: {cardCats.length}件（上記「カード」印）</div>
                )}
              </div>
              <hr className="my-2" />
              <div className="flex justify-between"><span className="text-gray-500">氏名（漢字）</span><span>{fullNameKanji}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">氏名（ローマ字）</span><span>{fullNameRomaji}</span></div>
              {organization.trim() && <div className="flex justify-between"><span className="text-gray-500">所属 / 肩書</span><span>{organization}</span></div>}
              <hr className="my-2" />
              <div>
                <span className="text-gray-500">送付先</span>
                <p className="mt-1">〒 {postalCode}</p>
                <p>{prefecture} {cityAddress}</p>
                {building && <p>{building}</p>}
                <p>TEL: {phone}</p>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-lg" style={{ background: 'rgba(196,163,90,0.08)', border: '1px solid #C4A35A' }}>
              <div className="text-sm" style={{ color: '#374151' }}>
                名入りPVCカード: <strong>{pvcCost === 0 ? '無料（初回）' : yen(pvcCost)}</strong>
                {wantMetalEff && <> ／ 金属カード <strong>{yen(metalCost)}</strong></>}
                {wantShieldEff && <> ／ 盾 <strong>{yen(shieldCost)}</strong></>}
              </div>
              <div className="text-sm mt-1" style={{ color: '#1A1A2E' }}>💰 合計: <strong>{isFreeApplication ? '無料' : yen(totalAmount)}</strong></div>
              <div className="text-xs text-gray-600 mt-1">発行される賞状: {allCats.length}枚</div>
              {!isFreeApplication && <div className="text-xs text-gray-600 mt-1">※ お支払いリンクは運営から別途ご連絡します。</div>}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep('form')} className="flex-1 px-4 py-3 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">戻る</button>
              <button onClick={handleSubmit} className="flex-1 px-4 py-3 text-sm font-bold rounded-lg" style={{ backgroundColor: PROVEN_GOLD, color: '#1A1A2E' }}>
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
            <h2 className="text-xl font-bold mb-2">{paymentStatus === 'pending' ? '申請を受け付けました!' : '申請完了!'}</h2>
            <p className="text-sm text-gray-600 mb-4">
              {allCats.length}件の認定の賞状と、名前入りプルーフカードをお届けします。
            </p>

            {paymentStatus === 'pending' && (
              <div className="rounded-lg p-4 mb-4 text-left" style={{ background: 'rgba(196,163,90,0.08)', border: '1px solid #C4A35A' }}>
                <p className="text-sm font-bold mb-2" style={{ color: '#1A1A2E' }}>お支払い完了後に制作を開始します。</p>
                <p className="text-xs text-gray-700 mb-3 leading-relaxed">下のボタンから決済ページ（Stripe）へ進みます（合計 {yen(paymentAmount)}）。</p>
                <button onClick={goToCheckout} disabled={checkoutLoading}
                  style={{ background: '#C4A35A', color: 'white', padding: '16px 32px', borderRadius: '8px', fontWeight: 'bold', textAlign: 'center', display: 'block', width: '100%', border: 'none', cursor: checkoutLoading ? 'default' : 'pointer', opacity: checkoutLoading ? 0.7 : 1 }}>
                  {checkoutLoading ? '決済ページを準備中…' : `お支払いへ進む ${yen(paymentAmount)}`}
                </button>
                <p className="text-xs text-gray-500 mt-3 text-center">※ お支払い後、通常2週間以内にお届けします。</p>
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-4 mb-4 text-left">
              <p className="text-xs font-bold text-gray-500 mb-2">■ 送付先</p>
              <p className="text-sm text-gray-700">〒 {postalCode}<br />{prefecture} {cityAddress}{building && <><br />{building}</>}</p>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              {paymentStatus === 'pending' ? 'お支払いが確認でき次第、上記の住所に発送いたします。' : '準備が整い次第、上記の住所に発送いたします。'}
            </p>
            {certNumbers.length > 0 && <p className="text-xs text-gray-400 mb-4">認定番号: {certNumbers.join(', ')}</p>}
            <button onClick={onClose} className="w-full px-4 py-3 text-sm font-bold rounded-lg"
              style={{ backgroundColor: paymentStatus === 'pending' ? 'transparent' : PROVEN_GOLD, color: paymentStatus === 'pending' ? '#888' : '#1A1A2E', border: paymentStatus === 'pending' ? '1px solid #D0CCC4' : 'none' }}>
              ダッシュボードに戻る
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
