/**
 * SEO Step 5 Phase A:
 *   /card/[id] を Server Component 化。Google クロール時に
 *   <article style="display:none"> へ プロ名・強み・バッジ・所属団体・コメント+返信
 *   を初期 HTML として出力し、インデックス未登録 134 件問題を解消する。
 *
 *   インタラクティブな UI (タブ切替・ブックマーク・順位メダル等) は
 *   ./components/CardClient.tsx (Client Component) に分離。
 *
 *   元ロジックは git 履歴 (旧 'use client' page.tsx) を参照。
 */

import { auth } from '@clerk/nextjs/server'
import { getCardData } from '@/lib/card-data'
import CardClient from './components/CardClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function CardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Clerk 認証 (オプション。未ログインでもページ自体は閲覧可)
  let currentUserId: string | null = null
  try {
    const { userId } = await auth()
    currentUserId = userId
  } catch {
    // 未ログインでもOK
  }

  const cardData = await getCardData(id, currentUserId)
  const { pro, comments, voteSummary, proofItems, badgeMembers, orgMembers, menus } = cardData

  // SEO 用 HTML を出力する条件:
  //   - プロが存在し
  //   - deactivated_at が NULL (非公開プロは検索に載せない)
  // pro が null / deactivated の場合は CardClient 側で専用画面を出す。
  const showSeoArticle = !!pro && !pro.deactivated_at

  // 強み上位 5 件 (sort 前にコピーして破壊的操作を回避: CLAUDE.md ルール)
  const topProofs = showSeoArticle
    ? voteSummary
        .slice()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => (b.vote_count || 0) - (a.vote_count || 0))
        .slice(0, 5)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((vs: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const item = proofItems.find((p: any) => p.id === vs.proof_id)
          if (!item) return null
          const label = item.strength_label || item.label
          if (!label) return null
          return { label, count: vs.vote_count || 0 }
        })
        .filter((x): x is { label: string; count: number } => !!x)
    : []

  return (
    <>
      {showSeoArticle && (
        <article style={{ display: 'none' }} aria-hidden="false">
          <h1>{pro.name}</h1>
          {pro.title && <p>{pro.title}</p>}
          {pro.prefecture && (
            <p>
              拠点: {pro.prefecture}
              {pro.area_description ? ` · ${pro.area_description}` : ''}
            </p>
          )}
          {pro.bio && <p>{pro.bio}</p>}

          {topProofs.length > 0 && (
            <section>
              <h2>強み</h2>
              <ul>
                {topProofs.map((p, i) => (
                  <li key={i}>
                    {p.label} (証明 {p.count} 件)
                  </li>
                ))}
              </ul>
            </section>
          )}

          {badgeMembers.length > 0 && (
            <section>
              <h2>取得バッジ</h2>
              <ul>
                {badgeMembers.map((m, i: number) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const cl = (m as any).credential_levels
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const org = (m as any).organizations
                  if (!cl?.name) return null
                  return (
                    <li key={i}>
                      {cl.name}
                      {org?.name ? ` / ${org.name}` : ''}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {orgMembers.length > 0 && (
            <section>
              <h2>所属団体</h2>
              <ul>
                {orgMembers.map((m, i: number) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const org = (m as any).organizations
                  if (!org?.name) return null
                  return <li key={i}>{org.name}</li>
                })}
              </ul>
            </section>
          )}

          {comments.length > 0 && (
            <section>
              <h2>クライアントの声</h2>
              {comments.slice(0, 10).map((c) => (
                <div key={c.id}>
                  <p>{c.comment}</p>
                  {c.reply && (
                    <p>
                      {pro.name} からの返信: {c.reply.reply_text}
                    </p>
                  )}
                </div>
              ))}
            </section>
          )}

          {menus.length > 0 && (
            <section>
              <h2>サービスメニュー</h2>
              <ul>
                {menus.map((m) => (
                  <li key={m.id}>
                    <h3>{m.name}</h3>
                    <p>料金: {m.price_text}</p>
                    {m.description && <p>{m.description}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      )}

      <CardClient cardData={cardData} />
    </>
  )
}
