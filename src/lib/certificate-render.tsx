/**
 * 認定賞状 — レンダリング層（背景ハイブリッド）
 *
 * 1カテゴリ=1枚。cert-bg-{tier}.png を全面背景に敷き、可変要素だけコード描画。
 * 出力 2000×1414px（背景 4000×2828 の半分・軽量・印刷十分）。nodejs runtime 前提。
 *
 * 背景に焼き込み済み（コードで描かない）:
 *   REAL PROOF ロゴ / CERTIFICATE OF {TIER} RECOGNITION / 金帯・装飾 / フッター /
 *   CERTIFICATION NO. と DATE のラベル(＋下線)
 *   ※ 達成文も現状の背景には焼き込まれている（drawAchievement 既定 false）。
 *     背景から達成文を除いた版に差し替えた場合のみ drawAchievement=true でコード描画する。
 *
 * コードで描く可変要素:
 *   氏名(ローマ字) / カテゴリ(日英) / 認定番号 / 日付 /（任意）達成文
 *
 * ⚠️ 賞状ティア(30/50/100/500)は getCertificateTier。カードのメダル(15/30/50/100)とは別。
 */
import type { CertificateTier } from '@/lib/certification-card'

export const CERT_W = 2000
export const CERT_H = 1414

// 白基調の背景なので文字は濃色
const COL = {
  ink: '#1A1A2E', // 濃紺（氏名・本文）
  gold: '#A9822F', // 白地で読める金
  sub: '#5A5A5A', // 英語サブ
  label: '#8A6E1F', // 番号・日付（ラベル色に寄せる）
}

// 2000×1414 基準の座標（背景を目盛りで実測して調整）
// 実測: subtitle≈y300 / 達成文(焼込)≈y640-685 / カテゴリ枠≈y900 /
//       CERTIFICATION NO.ラベル≈y1120-1140・下線≈y1150 / DATE同 / フッター≈y1290
const CERT_LAYOUT = {
  nameY: 380, // 氏名ブロック（subtitle と 達成文の間・中央）
  nameH: 200,
  achievementY: 628, // 達成文（コード描画。背景の焼込位置に合わせる＝差替後もこの位置）
  categoryY: 812, // カテゴリ（達成文の下・番号ラベルの上）
  categoryH: 190,
  // 番号・日付：各ラベルの下線の上（下線 y≈1150 に載せる。ラベル中心x に合わせる）
  certNo: { cx: 838, y: 1156 }, // CERTIFICATION NO. ラベル中央（少し右へ補正）
  date: { cx: 1250, y: 1156 },
}

export type CertificateRenderInput = {
  nameRomaji: string
  tier: CertificateTier
  milestone: number // 30/50/100/500
  categoryJa: string
  categoryEn: string
  certNumber: string
  dateText: string // "YYYY.MM.DD"
}

export type CertificateAssets = {
  /** 本文用（カテゴリ日本語・番号・日付）＝ NotoSansJP */
  fontData: ArrayBuffer
  /** 氏名(ローマ字)用＝ Playfair Display（無ければ NotoSansJP にフォールバック） */
  nameFontData?: ArrayBuffer | null
  backgroundDataUri?: string | null
}

function baseOptions(assets: CertificateAssets) {
  const fonts: { name: string; data: ArrayBuffer; style: 'normal'; weight: 700 }[] = [
    { name: 'NotoSansJP', data: assets.fontData, style: 'normal', weight: 700 },
  ]
  if (assets.nameFontData) {
    fonts.push({ name: 'Playfair', data: assets.nameFontData, style: 'normal', weight: 700 })
  }
  return { width: CERT_W, height: CERT_H, fonts }
}

function Background({ bg }: { bg?: string | null }) {
  if (bg) {
    return (
      <img
        src={bg}
        width={CERT_W}
        height={CERT_H}
        style={{ position: 'absolute', top: 0, left: 0, width: CERT_W, height: CERT_H, objectFit: 'cover' }}
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
        width: CERT_W,
        height: CERT_H,
        backgroundColor: '#FBFAF6',
      }}
    />
  )
}

export function buildCertificateElement(input: CertificateRenderInput, assets: CertificateAssets) {
  const { nameRomaji, categoryJa, categoryEn, certNumber, dateText, tier } = input
  const nameFamily = assets.nameFontData ? 'Playfair' : 'NotoSansJP'

  // ティア別アクセント色（カテゴリ名・認定番号・日付）。
  // SPECIALIST/MASTER=ゴールド / LEGEND=シルバー / IMMORTAL=ブラックゴールド。背景の装飾色に合わせる。
  const accent =
    tier === 'LEGEND'
      ? { main: '#6E7377', label: '#5E6367' } // シルバー（白地で読める濃さ）
      : tier === 'IMMORTAL'
        ? { main: '#4A3E1C', label: '#4A3E1C' } // ブラックゴールド（黒寄りの深い金）
        : { main: COL.gold, label: COL.label } // ゴールド（SPECIALIST/MASTER）

  const nameLen = nameRomaji.length
  const nameSize = nameLen <= 16 ? 112 : nameLen <= 22 ? 92 : 76

  const catLen = Array.from(categoryJa).length
  const catSize = catLen <= 8 ? 88 : catLen <= 12 ? 72 : 60

  const element = (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: CERT_W,
        height: CERT_H,
        backgroundColor: '#FBFAF6',
        fontFamily: 'NotoSansJP',
        color: COL.ink,
      }}
    >
      <Background bg={assets.backgroundDataUri} />

      {/* 氏名（ローマ字・中央上部） */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 0,
          top: CERT_LAYOUT.nameY,
          width: CERT_W,
          height: CERT_LAYOUT.nameH,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: nameSize, fontFamily: nameFamily, color: COL.ink, fontWeight: 700, letterSpacing: 6 }}>
          {nameRomaji.toUpperCase()}
        </span>
      </div>

      {/* 達成文はコード描画しない（背景に焼き込み済みを使用・CEO確定 2026-07-01） */}

      {/* カテゴリ（日英・中央・金系） */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: 0,
          top: CERT_LAYOUT.categoryY,
          width: CERT_W,
          height: CERT_LAYOUT.categoryH,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ display: 'flex' }}>
          <span style={{ fontSize: catSize, color: accent.main, fontWeight: 700 }}>{categoryJa}</span>
        </div>
        <div style={{ display: 'flex', marginTop: 10 }}>
          <span style={{ fontSize: 36, color: COL.sub, letterSpacing: 2 }}>{categoryEn}</span>
        </div>
      </div>

      {/* 認定番号（CERTIFICATION NO. の下線上） */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CERT_LAYOUT.certNo.cx - 250,
          top: CERT_LAYOUT.certNo.y,
          width: 500,
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 34, color: accent.label, letterSpacing: 2 }}>{certNumber}</span>
      </div>

      {/* 日付（DATE の下線上） */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CERT_LAYOUT.date.cx - 200,
          top: CERT_LAYOUT.date.y,
          width: 400,
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 34, color: accent.label, letterSpacing: 2 }}>{dateText}</span>
      </div>
    </div>
  )

  return { element, options: baseOptions(assets) }
}

// 背景ファイル名（ティア別）
export function certBgPath(tier: CertificateTier): string {
  return `/card-assets/cert-bg-${tier.toLowerCase()}.png`
}

export function certificateFileName(nameRomaji: string, categoryEn: string, certNumber: string): string {
  const safeName = nameRomaji.replace(/\s+/g, '')
  const safeCat = categoryEn.replace(/[^A-Za-z0-9]+/g, '')
  return `RP-cert_${certNumber}_${safeName}_${safeCat}.png`
}
