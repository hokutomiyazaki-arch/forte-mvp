/**
 * §4 クライアント向け処方箋ページ（最重要UI・Phase 1）
 *
 * 感情曲線: 不安(見放される?) → 警戒(怪しい?) → 安堵(先生が選んでくれた) → 納得(透明)
 *
 * - 閲覧に認証不要（auth()を呼ばない。Clerk未ログインでも全員が見られる）
 * - §0: クライアント向け共有URLはisReferralEnabledでゲートしない
 * - 見出しは「あなたの先生からのご紹介」（「検索結果」的表現は禁止）
 * - モバイル最優先（LINEで受け取りスマホで開く前提）
 */

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getReferralPageData, type ReferralCandidate } from '@/lib/referral-data'
import { isAiSanitizeEnabled } from '@/lib/feature-flags'
import { isAcceptingOpen } from '@/lib/referral-accepting'

export const dynamic = 'force-dynamic'

const T = {
  bg: '#FAF8F4',
  cardBg: '#FFFFFF',
  cardBorder: '#E8E4DC',
  dark: '#1A1A2E',
  gold: '#C4A35A',
  goldLight: '#C4A35A15',
  text: '#2D2D2D',
  textSub: '#555555',
  textMuted: '#888888',
}

function formatYearMonth(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

function acceptingLabel(status: 'open' | 'closed' | null): { text: string; color: string } {
  // 🔴1修正: NULL(未設定)はfail-openでopen扱い。isAcceptingOpen()に統一(直接の文字列比較禁止)
  if (isAcceptingOpen(status)) return { text: '受付中', color: '#2E7D32' }
  return { text: '現在受付停止中', color: '#9CA3AF' }
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const data = await getReferralPageData(slug)

  const title = data ? `${data.sender.name}さんからのご紹介 | REAL PROOF` : 'ご紹介 | REAL PROOF'
  const description = data
    ? `${data.sender.name}さんが、あなたに合うと考えた先生をご紹介します。`
    : 'REAL PROOF からのご紹介ページです。'

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      siteName: 'REALPROOF',
      locale: 'ja_JP',
      type: 'website',
    },
  }
}

function CandidateCard({
  candidate,
  aiSanitizeEnabled,
  slug,
}: {
  candidate: ReferralCandidate
  aiSanitizeEnabled: boolean
  slug: string
}) {
  const accepting = acceptingLabel(candidate.acceptingStatus)
  const recordedFrom = formatYearMonth(candidate.firstRecordedAt)

  return (
    <div
      style={{
        background: T.cardBg,
        border: `1px solid ${T.cardBorder}`,
        borderRadius: 16,
        padding: '18px 16px',
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        {candidate.pro.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={candidate.pro.photoUrl}
            alt=""
            style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#E8E4DC',
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.dark }}>{candidate.pro.name}</div>
          {candidate.pro.title && (
            <div style={{ fontSize: 12, color: T.textSub, marginTop: 2 }}>{candidate.pro.title}</div>
          )}
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
            {candidate.pro.prefecture || '拠点非公開'}
            {candidate.pro.isOnlineAvailable && (
              <span style={{ color: T.gold, marginLeft: 6 }}>● オンライン対応</span>
            )}
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: accepting.color,
            border: `1px solid ${accepting.color}`,
            borderRadius: 999,
            padding: '3px 10px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {accepting.text}
        </span>
      </div>

      {isAcceptingOpen(candidate.acceptingStatus) && candidate.acceptingNote && (
        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10, lineHeight: 1.6 }}>
          {candidate.acceptingNote}
        </div>
      )}

      {candidate.note && (
        <div
          style={{
            fontSize: 13,
            color: T.text,
            background: T.goldLight,
            borderRadius: 8,
            padding: '8px 10px',
            marginBottom: 10,
            lineHeight: 1.6,
          }}
        >
          {candidate.note}
        </div>
      )}

      {(candidate.strengths.length > 0 || recordedFrom) && (
        <div style={{ fontSize: 12, color: T.textSub, marginBottom: 10, lineHeight: 1.7 }}>
          {candidate.strengths.map((s, i) => (
            <span key={i}>
              {i > 0 && '・'}
              {s.label}を{s.count}人が証明
            </span>
          ))}
          {recordedFrom && (
            <div style={{ color: T.textMuted, marginTop: 2 }}>記録開始: {recordedFrom}</div>
          )}
        </div>
      )}

      {candidate.voiceExcerpts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {candidate.voiceExcerpts.map((text, i) => (
            <div
              key={i}
              style={{
                fontSize: 13,
                color: T.text,
                background: '#FAF8F4',
                border: `1px solid ${T.cardBorder}`,
                borderRadius: 8,
                padding: '10px 12px',
                lineHeight: 1.7,
              }}
            >
              “{text}”
            </div>
          ))}
          {aiSanitizeEnabled && (
            <div style={{ fontSize: 10, color: T.textMuted }}>
              一部の表現をガイドラインに沿って調整しています
            </div>
          )}
        </div>
      )}

      {candidate.isPaused && candidate.delegate && candidate.delegate.length > 0 && (
        <div style={{ marginTop: 4, marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 8 }}>
            現在受付停止中のため、代わりにご紹介できる先生です
          </div>
          {candidate.delegate.map((d) => (
            <CandidateCard key={d.pro.id} candidate={d} aiSanitizeEnabled={aiSanitizeEnabled} slug={slug} />
          ))}
        </div>
      )}

      {/* §2-2改訂(CEO決定): 受付中(open。NULL含む・fail-open)以外は予約ボタンを出さない。
          「選べたのに送信で409」という初回体験を作らない（🔴停止中は非表示・🟡は代理展開でカバー） */}
      {isAcceptingOpen(candidate.acceptingStatus) ? (
        <a
          href={`/r/${slug}/request?pro=${candidate.pro.id}`}
          style={{
            display: 'block',
            width: '100%',
            padding: '11px 0',
            borderRadius: 10,
            border: 'none',
            background: T.dark,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'center',
            textDecoration: 'none',
            boxSizing: 'border-box' as const,
          }}
        >
          この先生に相談する
        </a>
      ) : (
        <div
          style={{
            width: '100%',
            padding: '11px 0',
            borderRadius: 10,
            background: '#F0EDE6',
            color: T.textMuted,
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'center',
            boxSizing: 'border-box' as const,
          }}
        >
          {/* 軽微指摘: 代理候補カードの直後に描画されるため、主語を明示して誤読を防ぐ */}
          {candidate.pro.name}さんは現在受付停止中です
        </div>
      )}
    </div>
  )
}

export default async function ReferralPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await getReferralPageData(slug)

  if (!data) {
    notFound()
  }

  const aiSanitizeEnabled = isAiSanitizeEnabled()

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 40px', background: T.bg }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 12, letterSpacing: 2, color: T.gold, fontWeight: 700 }}>
          REAL PROOF
        </span>
      </div>

      <h1
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: T.dark,
          textAlign: 'center',
          marginBottom: 20,
        }}
      >
        あなたの先生からのご紹介
      </h1>

      {/* 送り手ブロック: 顔写真+コメント+継続関与の宣言 */}
      <div
        style={{
          background: T.cardBg,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: 16,
          padding: '20px 16px',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          {data.sender.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.sender.photoUrl}
              alt=""
              style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#E8E4DC', flexShrink: 0 }} />
          )}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.dark }}>{data.sender.name}</div>
            {data.sender.title && (
              <div style={{ fontSize: 12, color: T.textSub, marginTop: 2 }}>{data.sender.title}</div>
            )}
          </div>
        </div>

        {/* CEO指摘(先行テスト第3弾): 「先生からのメッセージ」は送り手が設定・変更できる
            list.comment(=クライアントへのメッセージ)を本体として表示する。未設定時のみ既定文。
            内部用リスト名(title)はクライアントには表示しない。 */}
        <p style={{ fontSize: 13, color: T.text, lineHeight: 1.8, marginBottom: 0, whiteSpace: 'pre-wrap' as const }}>
          {data.list.comment ||
            // 1名時は「選ぶ」対象が無いため推薦フレームに切替（CEO決定・案A）
            (data.candidates.length === 1
              ? 'ご紹介した後も、あなたの経過は私自身が伺っていきます。安心してご相談ください。'
              : 'ご紹介した後も、あなたの経過は私自身が伺っていきます。安心して選んでください。')}
        </p>
      </div>

      {/* 候補カード（2〜4名） */}
      <div style={{ marginBottom: 20 }}>
        {data.candidates.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '30px 16px',
              color: T.textMuted,
              fontSize: 13,
              background: T.cardBg,
              border: `1px solid ${T.cardBorder}`,
              borderRadius: 16,
            }}
          >
            現在、ご紹介できる先生の準備中です。
          </div>
        ) : (
          <>
            {data.candidates.length === 1 && (
              <div style={{ fontSize: 12, fontWeight: 600, color: T.gold, marginBottom: 8 }}>
                {data.sender.name}さんが特に推薦する先生です
              </div>
            )}
            {data.candidates.map((c) => (
              <CandidateCard key={c.pro.id} candidate={c} aiSanitizeEnabled={aiSanitizeEnabled} slug={slug} />
            ))}
          </>
        )}
      </div>

      {/* フィー開示 + 共有情報の範囲 */}
      <div
        style={{
          background: T.cardBg,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: 16,
          padding: '16px',
          fontSize: 12,
          color: T.textSub,
          lineHeight: 1.8,
        }}
      >
        <p style={{ marginBottom: 10 }}>
          紹介による手数料が発生する場合がありますが、<strong style={{ color: T.dark }}>あなたの料金は変わりません</strong>。
        </p>
        <p>
          ご相談・ご予約の際は、お名前・ご希望日時・ご相談のテーマが担当の先生に共有されます。
          共有する内容は予約手続きの中でご確認いただけます。
        </p>
      </div>
    </div>
  )
}
