/**
 * 認定カード生成 — レンダリング層（背景ハイブリッド方式）
 *
 * 表(front) / 裏(back) の @vercel/og 用「要素 + オプション」を組み立てる純粋関数。
 * ImageResponse には依存しない（ルートは next/og、ローカルテストは @vercel/og で
 * それぞれ new ImageResponse(element, options) する）。
 *
 * 出力仕様（§3・確定）: 2035×1300px / RGB / PNG / 透過なし。
 *
 * ハイブリッド（CEO提供の Canva 背景に合わせる・2026-07-01）:
 * - assets.backgroundDataUri に public/card-assets/{front,back}-bg.png を全面に敷く。
 * - 背景に焼き込み済みの要素はコードで描かない（二重防止）:
 *     front: REAL PROOF ロゴ / 金帯 / 弧
 *     back : VERIFIED BY CLIENTS / SPECIALTY / 上下の金帯 / フッター(REALPROOF—Issued by...)
 * - コードは可変要素だけを背景の空きゾーンに座標配置:
 *     front: 氏名(漢字) / ローマ字 / 肩書・所属（金帯より下の氏名ゾーン中央）
 *     back : 項目リスト（SPECIALTY下・左）＋各項目テキスト直後のメダル、右側に大QR＋card_uid
 * - tier語・人柄は Canva デザインに枠が無いため描かない（ティアは項目メダルで表現）。
 */
import type { CertificationTier, CertifiableTier } from '@/lib/constants'

// ===== 出力サイズ =====
export const CARD_W = 2035
export const CARD_H = 1300

// ===== カラートークン =====
const COL = {
  bgDark: '#0A0A0A',
  gold: '#C4A35A',
  cream: '#FAFAF7',
  creamDim: 'rgba(250,250,247,0.78)',
  grey: 'rgba(250,250,247,0.6)',
}

// ===== Canva背景に合わせた座標（2035×1300基準・目視調整） =====
const FRONT_LAYOUT = {
  // front-bg: REAL PROOF ロゴ下端 ≈ y656、金帯上端 ≈ y855。
  // その約200pxの帯に、上下へ余白を残して氏名ブロックを中央配置（金帯より下には置かない）。
  contentTop: 668,
  contentHeight: 172,
}
const BACK_LAYOUT = {
  // back-bg（実測・2035×1300空間）: 上部金帯 ≈ y200 / SPECIALTY下端 ≈ y265 / 下側の金バー ≈ y1155。
  // 項目ゾーン = SPECIALTY下〜下側金バー上。この範囲で space-evenly により上下余白＋項目間を均等配置。
  zoneTop: 300,
  zoneBottom: 1140,
  itemsLeft: 90,
  qrSize: 580, // カード高さの約45%
  qrRight: 130,
  // QR はゾーン中央に合わせる（中心 ≈ (300+1140)/2 = 720）
  qrTop: 430, // 720 - qrSize/2
}

// ===== 入力型 =====

export type CardRenderItem = {
  strengthJa: string
  strengthEn: string
  tier: CertificationTier | null
}

export type CardRenderInput = {
  nameKanji: string
  nameRomaji: string
  organization: string
  cardUid: string
  highestTier: CertificationTier | null
  personalityJa: string | null
  personalityEn: string | null
  /** 表示対象の項目（UIで並び替え・ON/OFF・最大6件に絞った最終形） */
  items: CardRenderItem[]
}

export type CardAssets = {
  fontData: ArrayBuffer
  photoDataUri?: string | null
  qrDataUri?: string | null
  /** ティア別メダル data URI（SPECIALIST/MASTER/LEGEND のみ） */
  medalDataUris?: Partial<Record<CertifiableTier, string | null>>
  /** 固定背景画像（Canva front-bg/back-bg） */
  backgroundDataUri?: string | null
}

type OgOptions = {
  width: number
  height: number
  fonts: { name: string; data: ArrayBuffer; style: 'normal'; weight: 700 }[]
}

function baseOptions(fontData: ArrayBuffer): OgOptions {
  return {
    width: CARD_W,
    height: CARD_H,
    fonts: [{ name: 'NotoSansJP', data: fontData, style: 'normal', weight: 700 }],
  }
}

function medalFor(
  tier: CertificationTier | null,
  medals?: Partial<Record<CertifiableTier, string | null>>
): string | null {
  if (!tier || tier === 'PROVEN' || !medals) return null
  return medals[tier as CertifiableTier] ?? null
}

// ===== 背景（全面）=====
// backgroundDataUri（Canva PNG）があればそれを敷く。無ければ黒＋グラデでフォールバック。

function Background({ bg }: { bg?: string | null }) {
  if (bg) {
    return (
      <img
        src={bg}
        width={CARD_W}
        height={CARD_H}
        style={{ position: 'absolute', top: 0, left: 0, width: CARD_W, height: CARD_H, objectFit: 'cover' }}
      />
    )
  }
  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        top: 0,
        left: 0,
        width: CARD_W,
        height: CARD_H,
        backgroundColor: COL.bgDark,
        backgroundImage: `radial-gradient(circle at 78% 18%, rgba(196,163,90,0.16) 0%, rgba(196,163,90,0) 42%), linear-gradient(135deg, #14142B 0%, #1A1A2E 55%, #241B33 100%)`,
      }}
    />
  )
}

// ============================================================
// 表（FRONT）— 金帯より下に氏名/ローマ字/肩書を中央配置
// ============================================================

export function buildFrontElement(input: CardRenderInput, assets: CardAssets) {
  const { nameKanji, nameRomaji, organization } = input
  // 姓名＋ローマ字を横1行に収めるため、氏名(漢字)長でサイズ段階調整
  // （ロゴ下〜金帯上の帯に収める前提でやや控えめ）
  const nameLen = Array.from(nameKanji).length
  const nameSize = nameLen <= 6 ? 76 : nameLen <= 9 ? 64 : 54
  // ローマ字は日本語氏名の約55%を目安に一回り大きく
  const romajiSize = nameLen <= 6 ? 44 : nameLen <= 9 ? 38 : 32

  const element = (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: CARD_W,
        height: CARD_H,
        backgroundColor: COL.bgDark,
        fontFamily: 'NotoSansJP',
        color: COL.cream,
      }}
    >
      <Background bg={assets.backgroundDataUri} />

      {/* 氏名ゾーン（金帯より下・中央） */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: 0,
          top: FRONT_LAYOUT.contentTop,
          width: CARD_W,
          height: FRONT_LAYOUT.contentHeight,
          alignItems: 'center',
          justifyContent: 'center',
          paddingLeft: 100,
          paddingRight: 100,
          boxSizing: 'border-box',
        }}
      >
        {/* 1行目: 姓　名　ローマ字（スペース区切り・横1行） */}
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontSize: nameSize, color: COL.cream, fontWeight: 700, lineHeight: 1.05 }}>
            {nameKanji}
          </span>
          {nameRomaji ? (
            <span style={{ fontSize: romajiSize, color: COL.creamDim, letterSpacing: 4, marginLeft: 32 }}>
              {nameRomaji}
            </span>
          ) : null}
        </div>

        {/* 2行目: 肩書（代表1つ・編集プレビューで確定した値）*/}
        {organization ? (
          <div style={{ display: 'flex', marginTop: 18, maxWidth: 1700, justifyContent: 'center' }}>
            <span style={{ fontSize: 42, color: COL.creamDim, lineHeight: 1.25, textAlign: 'center' }}>
              {organization}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )

  return { element, options: baseOptions(assets.fontData) }
}

// ============================================================
// 裏（BACK）— SPECIALTY下に項目リスト（テキスト直後にメダル）、右に大QR＋card_uid
// ============================================================

export function buildBackElement(input: CardRenderInput, assets: CardAssets) {
  const { cardUid } = input
  const items = input.items.slice(0, 6)
  const n = items.length

  // 項目数に応じた段階サイズ。
  // 英語(サブ)ラベルは印刷で潰れないよう一回り大きく＆日本語との行間(lineGap)・
  // 項目間隔(rowGap)を広めに。6項目でも金帯/フッターに重ならない範囲で再バランス。
  // 縦位置は space-evenly で均等配置するため rowGap は使わない（サイズのみ段階調整）。
  const sizing =
    n <= 2
      ? { jaSize: 80, enSize: 40, medalSize: 150, gap: 30, lineGap: 10 }
      : n <= 4
        ? { jaSize: 68, enSize: 34, medalSize: 128, gap: 26, lineGap: 10 }
        : n === 5
          ? { jaSize: 58, enSize: 30, medalSize: 108, gap: 22, lineGap: 8 }
          : { jaSize: 52, enSize: 28, medalSize: 92, gap: 18, lineGap: 8 }
  const { jaSize, enSize, medalSize, gap, lineGap } = sizing

  const qrX = CARD_W - BACK_LAYOUT.qrSize - BACK_LAYOUT.qrRight
  const itemsWidth = qrX - BACK_LAYOUT.itemsLeft - 48
  const zoneHeight = BACK_LAYOUT.zoneBottom - BACK_LAYOUT.zoneTop

  const element = (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: CARD_W,
        height: CARD_H,
        backgroundColor: COL.bgDark,
        fontFamily: 'NotoSansJP',
        color: COL.cream,
      }}
    >
      <Background bg={assets.backgroundDataUri} />

      {/* 右側: 大QR ＋ card_uid（QRのすぐ下） */}
      {assets.qrDataUri ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            left: qrX,
            top: BACK_LAYOUT.qrTop,
            width: BACK_LAYOUT.qrSize,
            alignItems: 'center',
          }}
        >
          <img
            src={assets.qrDataUri}
            width={BACK_LAYOUT.qrSize}
            height={BACK_LAYOUT.qrSize}
            style={{ borderRadius: 10 }}
          />
          <div style={{ display: 'flex', marginTop: 16 }}>
            <span style={{ fontSize: 34, color: COL.creamDim, letterSpacing: 3 }}>{cardUid}</span>
          </div>
        </div>
      ) : null}

      {/* 左側: 項目リスト（SPECIALTY下〜下側金バーの間に space-evenly で均等配置）。各行はテキスト直後にメダル */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: BACK_LAYOUT.itemsLeft,
          top: BACK_LAYOUT.zoneTop,
          width: itemsWidth,
          height: zoneHeight,
          justifyContent: 'space-around',
        }}
      >
        {items.map((it, idx) => {
          const medal = medalFor(it.tier, assets.medalDataUris)
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap }}>
              {/* 日本語 + 英語（2段） */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex' }}>
                  <span style={{ fontSize: jaSize, color: COL.cream, fontWeight: 700, lineHeight: 1.08 }}>
                    {it.strengthJa}
                  </span>
                </div>
                <div style={{ display: 'flex', marginTop: lineGap }}>
                  <span style={{ fontSize: enSize, color: COL.creamDim, letterSpacing: 2 }}>
                    {it.strengthEn}
                  </span>
                </div>
              </div>
              {/* テキストのすぐ右にメダル（PROVEN/未達は無し） */}
              {medal ? (
                <img src={medal} width={medalSize} height={medalSize} style={{ objectFit: 'contain' }} />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )

  return { element, options: baseOptions(assets.fontData) }
}

// ============================================================
// QR data URI 生成（qrcode パッケージ）
// ============================================================

/**
 * card_uid から https://realproof.jp/nfc/{card_uid} の QR を PNG data URI 化。
 * 誤り訂正 H / 濃色 #1A1A2E / 背景白（§6.4）。
 */
export async function buildQrDataUri(cardUid: string): Promise<string> {
  const QRCode = (await import('qrcode')).default
  const url = `https://realproof.jp/nfc/${cardUid}`
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 1,
    scale: 8,
    color: { dark: '#1A1A2E', light: '#FFFFFF' },
  })
}

// ===== ファイル名（§3） =====

export function cardFileName(cardUid: string, nameKanji: string, side: 'front' | 'back'): string {
  const safeName = (nameKanji || '').replace(/\s+/g, '')
  return `RP-${cardUid}_${safeName}_${side}.png`
}
