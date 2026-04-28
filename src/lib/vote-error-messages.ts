/**
 * vote-error-messages — 投票エラーの日本語メッセージを統一生成する。
 *
 * 背景（2026-04-22 の本番検証で発覚）:
 *   - 7 日リピート時に「認証期限が切れました」と表示される（原因不明、混乱）
 *   - 30 分クールダウン時に英語メッセージが出る
 *   - 自己投票や 1 分重複のメッセージが散在し、ハンドラ毎にバラバラ
 *
 * 解決:
 *   全エラー経路でこの `getVoteErrorMessage()` を使い、reason に応じて
 *   統一されたユーザー向けメッセージを返す。30 分クールダウンは残り分数、
 *   7 日リピートは次回投票可能日を動的に埋める。
 */

import type { VoteDuplicateReason } from './vote-duplicate-check'

/** vote-duplicate-check 以外で発生しうる認証系エラー */
export type VoteAuthErrorReason =
  | 'auth_expired'     // 認証コード自体の有効期限切れ
  | 'auth_invalid'     // 認証コード不正
  | 'auth_retry'       // 認証コードが使用済みで 2 回目 callback が届いた等、原因不明。もう一度認証させる
  | 'self_vote'        // 自己投票ブロック
  | 'line_cancelled'   // LINE 認証キャンセル
  | 'google_cancelled' // Google 認証キャンセル
  | 'line_no_email'    // LINE メール権限未承認（フォールバック不可）
  | 'google_no_email'  // Google メール取得失敗
  | 'invalid_vote_data'
  | 'vote_failed'
  | 'invalid_token'    // QRトークン無効（使用済み or 期限切れ）
  | 'unknown'

export type VoteErrorReason = VoteDuplicateReason | VoteAuthErrorReason

export interface VoteErrorContext {
  /** 7 日リピート時: 最後の投票の created_at（ISO）。次回可能日計算に使う。 */
  recentVoteCreatedAt?: string
  /** 30 分クールダウン時: 残り分数（1 以上）。 */
  cooldownRemainingMinutes?: number
}

export function getVoteErrorMessage(
  reason: VoteErrorReason | undefined,
  context?: VoteErrorContext
): string {
  switch (reason) {
    case 'already_voted': {
      // ポジティブなトーン: エラーではなく「すでに応援いただいた」という仕様説明
      if (!context?.recentVoteCreatedAt) {
        return 'このプロには既にご投票いただいております。より多くの方の声を届けるため、同じプロへのプルーフは1週間に1回までとさせていただいております。他のプロフェッショナルへのご投票もぜひお試しください。'
      }
      const nextDate = new Date(
        new Date(context.recentVoteCreatedAt).getTime() + 7 * 24 * 60 * 60 * 1000
      )
      const formatted = nextDate.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      return `このプロには既にご投票いただいております。次回は${formatted}以降にご投票いただけます。他のプロフェッショナルへのご投票もぜひお試しください。`
    }

    case 'cooldown': {
      const remaining = context?.cooldownRemainingMinutes ?? 30
      return `連続投票を防ぐため、30分以内は1件のみ投票可能です。あと${remaining}分後にもう一度お試しください。他のプロへの投票は時間をおいてからお願いします。`
    }

    case 'duplicate_submit':
      return '送信処理中です。少々お待ちください。'

    case 'self_vote':
      return 'ご自身への回答はできません。'

    case 'auth_expired':
      return '認証コードの有効期限が切れました。もう一度認証してください。'

    case 'auth_invalid':
      return '認証に失敗しました。もう一度お試しください。'

    case 'auth_retry':
      return '認証処理が完了できませんでした。もう一度「LINEで認証」ボタンを押してお試しください。（既にご投票が完了している場合は、通知メールまたは履歴をご確認ください）'

    case 'line_cancelled':
      return 'LINE認証がキャンセルされました。'

    case 'google_cancelled':
      return 'Google認証がキャンセルされました。'

    case 'line_no_email':
      return 'LINEからメールアドレスを取得できませんでした。メールアドレスを入力して回答してください。'

    case 'google_no_email':
      return 'Googleアカウントからメールアドレスを取得できませんでした。メールアドレスで回答してください。'

    case 'invalid_vote_data':
      return 'データが無効です。もう一度お試しください。'

    case 'vote_failed':
      return '送信に失敗しました。もう一度お試しください。'

    case 'invalid_token':
      return 'このQRコードは無効です。すでに使用されたか、期限が切れています。プロに新しいQRコードを表示してもらってください。'

    default:
      return '回答処理中にエラーが発生しました。時間を置いて再度お試しください。'
  }
}

/**
 * URL の ?error=xxx 文字列から VoteErrorReason にマッピングする。
 * 既存のリダイレクトパラメータ名と一致させる。
 */
export function mapAuthErrorParamToReason(param: string | null | undefined): VoteErrorReason | undefined {
  if (!param) return undefined
  switch (param) {
    case 'already_voted': return 'already_voted'
    case 'cooldown': return 'cooldown'
    case 'self_vote': return 'self_vote'
    case 'line_cancelled': return 'line_cancelled'
    case 'google_cancelled': return 'google_cancelled'
    case 'line_expired': return 'auth_expired'
    case 'line_retry': return 'auth_retry'
    case 'line_no_email': return 'line_no_email'
    case 'google_failed': return 'auth_invalid'
    case 'google_no_email': return 'google_no_email'
    case 'invalid_vote_data': return 'invalid_vote_data'
    case 'vote_failed': return 'vote_failed'
    case 'invalid_token': return 'invalid_token'
    default: return 'unknown'
  }
}
