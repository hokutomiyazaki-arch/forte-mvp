/**
 * 認定カード生成 — レンダリング層
 *
 * 表(front) / 裏(back) の @vercel/og 用「要素 + オプション」を組み立てる純粋関数。
 * ImageResponse には依存しない（ルートは next/og、ローカルテストは @vercel/og で
 * それぞれ new ImageResponse(element, options) する）。
 *
 * 出力仕様（§3・確定）: 2035×1300px / RGB / PNG / 透過なし（背景は必ず塗る）。
 *
 * ハイブリッド対応: assets.backgroundDataUri を渡すと固定背景画像を全面に敷き、
 * 可変パーツだけ上に描く（§4）。未指定なら背景もコードで描画（CEO承認: コード先行）。
 */
import type { CertificationTier, CertifiableTier } from '@/lib/constants'

// ===== 出力サイズ =====
export const CARD_W = 2035
export const CARD_H = 1300

// ===== カラートークン（既存カードOG準拠） =====
const COL = {
  bgDark: '#14142B',
  bgDark2: '#1A1A2E',
  gold: '#C4A35A',
  goldSoft: 'rgba(196,163,90,0.35)',
  cream: '#FAFAF7',
  creamDim: 'rgba(250,250,247,0.72)',
  grey: 'rgba(250,250,247,0.55)',
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
  /** 固定背景画像（ハイブリッド用・任意） */
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
// backgroundDataUri があればそれを敷く。無ければコードで塗る（グラデ + 弧の代替）。

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
        backgroundImage: `radial-gradient(circle at 78% 18%, rgba(196,163,90,0.16) 0%, rgba(196,163,90,0) 42%), linear-gradient(135deg, ${COL.bgDark} 0%, ${COL.bgDark2} 55%, #241B33 100%)`,
      }}
    />
  )
}

// ===== ゴールド二重枠 =====

function GoldFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        top: 46,
        left: 46,
        width: CARD_W - 92,
        height: CARD_H - 92,
        border: `4px solid ${COL.gold}`,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          border: `1px solid ${COL.goldSoft}`,
          margin: 10,
          boxSizing: 'border-box',
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ============================================================
// 表（FRONT）
// ============================================================

export function buildFrontElement(input: CardRenderInput, assets: CardAssets) {
  const { nameKanji, nameRomaji, organization } = input
  const nameLen = Array.from(nameKanji).length
  const nameSize = nameLen <= 6 ? 168 : nameLen <= 9 ? 132 : 104

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
      <GoldFrame>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 80,
            boxSizing: 'border-box',
          }}
        >
          {/* REAL PROOF ワードマーク */}
          <div style={{ display: 'flex', marginBottom: 40 }}>
            <span style={{ fontSize: 40, color: COL.gold, letterSpacing: 16, fontWeight: 700 }}>
              REAL PROOF
            </span>
          </div>

          {/* 認定ラベル */}
          <div style={{ display: 'flex', marginBottom: 44 }}>
            <span style={{ fontSize: 26, color: COL.creamDim, letterSpacing: 8 }}>
              CERTIFIED PROFESSIONAL
            </span>
          </div>

          {/* 氏名（漢字・主役） */}
          <div style={{ display: 'flex', marginBottom: 18 }}>
            <span style={{ fontSize: nameSize, color: COL.cream, fontWeight: 700, lineHeight: 1.05 }}>
              {nameKanji}
            </span>
          </div>

          {/* ローマ字 */}
          {nameRomaji ? (
            <div style={{ display: 'flex', marginBottom: 40 }}>
              <span style={{ fontSize: 52, color: COL.creamDim, letterSpacing: 6 }}>
                {nameRomaji}
              </span>
            </div>
          ) : null}

          {/* 区切り線 */}
          <div style={{ display: 'flex', width: 340, height: 2, backgroundColor: COL.goldSoft, marginBottom: 36 }} />

          {/* 肩書・所属 */}
          {organization ? (
            <div style={{ display: 'flex', maxWidth: 1500, justifyContent: 'center', textAlign: 'center' }}>
              <span style={{ fontSize: 40, color: COL.creamDim, lineHeight: 1.35, textAlign: 'center' }}>
                {organization}
              </span>
            </div>
          ) : null}
        </div>
      </GoldFrame>
    </div>
  )

  return { element, options: baseOptions(assets.fontData) }
}

// ============================================================
// 裏（BACK）
// ============================================================

export function buildBackElement(input: CardRenderInput, assets: CardAssets) {
  const { highestTier, personalityJa, personalityEn, cardUid } = input
  const items = input.items.slice(0, 6)
  const n = items.length

  // 項目数に応じた段階サイズ（§4.3）。N=6 でもフッターと衝突しないよう段階縮小。
  const sizing =
    n <= 2
      ? { jaSize: 68, enSize: 34, medalSize: 140, rowGap: 40, rowPadY: 22 }
      : n <= 4
        ? { jaSize: 58, enSize: 30, medalSize: 118, rowGap: 24, rowPadY: 16 }
        : n === 5
          ? { jaSize: 48, enSize: 25, medalSize: 100, rowGap: 16, rowPadY: 12 }
          : { jaSize: 42, enSize: 22, medalSize: 88, rowGap: 12, rowPadY: 8 }
  const { jaSize, enSize, medalSize, rowGap, rowPadY } = sizing

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
      <GoldFrame>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            padding: 64,
            boxSizing: 'border-box',
          }}
        >
          {/* ヘッダー行: 左=タイトル群 / 右=QR */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            {/* 左: VERIFIED BY CLIENTS + 最高ティア + SPECIALTY */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex' }}>
                <span style={{ fontSize: 24, color: COL.creamDim, letterSpacing: 8 }}>
                  VERIFIED BY CLIENTS
                </span>
              </div>
              {highestTier ? (
                <div style={{ display: 'flex', marginTop: 10 }}>
                  <span style={{ fontSize: 96, color: COL.gold, fontWeight: 700, letterSpacing: 4, lineHeight: 1 }}>
                    {highestTier}
                  </span>
                </div>
              ) : null}
              <div style={{ display: 'flex', marginTop: 14 }}>
                <span style={{ fontSize: 30, color: COL.gold, letterSpacing: 10 }}>SPECIALTY</span>
              </div>
            </div>

            {/* 右: QR + card_uid */}
            {assets.qrDataUri ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <img
                  src={assets.qrDataUri}
                  width={230}
                  height={230}
                  style={{ borderRadius: 12 }}
                />
                <div style={{ display: 'flex', marginTop: 8 }}>
                  <span style={{ fontSize: 26, color: COL.creamDim, letterSpacing: 2 }}>{cardUid}</span>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex' }}>
                <span style={{ fontSize: 26, color: COL.creamDim }}>{cardUid}</span>
              </div>
            )}
          </div>

          {/* 項目リスト（縦中央寄せ） */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              justifyContent: 'center',
              gap: rowGap,
              paddingTop: 20,
              paddingBottom: 20,
            }}
          >
            {items.map((it, idx) => {
              const medal = medalFor(it.tier, assets.medalDataUris)
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: rowPadY,
                    paddingBottom: rowPadY,
                    paddingLeft: 20,
                    paddingRight: 20,
                    borderBottom: `1px solid ${COL.goldSoft}`,
                  }}
                >
                  {/* 左: 日本語 + 英語（2段） */}
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 24 }}>
                    <div style={{ display: 'flex' }}>
                      <span style={{ fontSize: jaSize, color: COL.cream, fontWeight: 700, lineHeight: 1.1 }}>
                        {it.strengthJa}
                      </span>
                    </div>
                    <div style={{ display: 'flex', marginTop: 4 }}>
                      <span style={{ fontSize: enSize, color: COL.grey, letterSpacing: 2 }}>
                        {it.strengthEn}
                      </span>
                    </div>
                  </div>
                  {/* 右: メダル */}
                  {medal ? (
                    <img src={medal} width={medalSize} height={medalSize} style={{ objectFit: 'contain' }} />
                  ) : (
                    <div style={{ display: 'flex', width: medalSize, height: medalSize }} />
                  )}
                </div>
              )
            })}
          </div>

          {/* フッター: 人柄 + ブランド */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            {personalityJa ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex' }}>
                  <span style={{ fontSize: 22, color: COL.gold, letterSpacing: 6 }}>PERSONALITY</span>
                </div>
                <div style={{ display: 'flex', marginTop: 6, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 44, color: COL.cream, fontWeight: 700 }}>{personalityJa}</span>
                  {personalityEn ? (
                    <span style={{ fontSize: 30, color: COL.creamDim, marginLeft: 16 }}>
                      {personalityEn}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex' }} />
            )}
            <div style={{ display: 'flex' }}>
              <span style={{ fontSize: 28, color: COL.gold, letterSpacing: 8, fontWeight: 700 }}>
                REAL PROOF
              </span>
            </div>
          </div>
        </div>
      </GoldFrame>
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
  // 動的 import（edge/node 双方で使えるように）
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
