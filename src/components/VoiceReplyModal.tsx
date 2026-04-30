'use client'

import { useState, useEffect } from 'react'
import type { VoiceReply } from './card/types'

const REPLY_MAX = 200

export type VoteForReply = {
  id: string
  comment: string
  auth_display_name: string | null
  client_photo_url: string | null
  display_mode: string | null
  created_at: string
}

export type ExistingReply = {
  id: string
  reply_text: string
  delivered_at: string | null
}

type Props = {
  isOpen: boolean
  onClose: () => void
  vote: VoteForReply
  existingReply: ExistingReply | null
  /** 親に保存後の reply を返す。削除時は null。 */
  onSaved: (reply: VoiceReply | null) => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function getClientLabel(vote: VoteForReply): { name: string; isAnonymous: boolean } {
  // display_mode が hidden / null は匿名扱い、それ以外で auth_display_name があれば表示
  if (!vote.display_mode || vote.display_mode === 'hidden') {
    return { name: '匿名のクライアント', isAnonymous: true }
  }
  const name = vote.auth_display_name?.trim()
  if (!name) return { name: '匿名のクライアント', isAnonymous: true }
  return { name, isAnonymous: false }
}

export default function VoiceReplyModal({
  isOpen,
  onClose,
  vote,
  existingReply,
  onSaved,
}: Props) {
  const [replyText, setReplyText] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // モーダルが開いた時に state をリセット。依存はプリミティブのみ。
  useEffect(() => {
    if (isOpen) {
      setReplyText(existingReply?.reply_text ?? '')
      setError(null)
      setConfirmingDelete(false)
      setSaving(false)
      setDeleting(false)
    }
  }, [isOpen, existingReply?.id, existingReply?.reply_text])

  if (!isOpen) return null

  const trimmedLen = replyText.trim().length
  const overLimit = replyText.length > REPLY_MAX
  const empty = trimmedLen === 0
  const canSave = !empty && !overLimit && !saving && !deleting
  const isEdit = !!existingReply
  const busy = saving || deleting

  const client = getClientLabel(vote)
  const showPhoto =
    vote.display_mode === 'photo' && !!vote.client_photo_url

  const handleSave = async () => {
    if (!canSave) return
    setError(null)
    setSaving(true)
    try {
      const isPatch = !!existingReply
      const url = '/api/dashboard/reply'
      const method = isPatch ? 'PATCH' : 'POST'
      const body = isPatch
        ? { reply_id: existingReply!.id, reply_text: replyText }
        : { vote_id: vote.id, reply_text: replyText }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const code = data?.code as string | undefined
        const msg = mapErrorCode(code) || data?.error || '保存に失敗しました。'
        setError(msg)
        return
      }
      // POST/PATCH は VoiceReply 形式で返る
      onSaved(data as VoiceReply)
      onClose()
    } catch (e) {
      console.error('[VoiceReplyModal save] error:', e)
      setError('通信エラーが発生しました。')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!existingReply || busy) return
    setError(null)
    setDeleting(true)
    try {
      const res = await fetch('/api/dashboard/reply', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ reply_id: existingReply.id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const code = data?.code as string | undefined
        const msg = mapErrorCode(code) || data?.error || '削除に失敗しました。'
        setError(msg)
        return
      }
      onSaved(null)
      onClose()
    } catch (e) {
      console.error('[VoiceReplyModal delete] error:', e)
      setError('通信エラーが発生しました。')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 className="text-lg font-bold text-[#1A1A2E] mb-1">
            {isEdit ? '返信を編集' : '返信を書く'}
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            届けてくれたコメントへの返信メッセージ
          </p>

          {/* クライアントのコメント引用 */}
          <div className="rounded-xl bg-[#F7F4ED] p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              {showPhoto ? (
                <img
                  src={vote.client_photo_url || ''}
                  alt=""
                  loading="lazy"
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#E8E4DC] flex items-center justify-center text-xs font-bold text-gray-500">
                  {client.isAnonymous ? '〇' : client.name.charAt(0)}
                </div>
              )}
              <span className="text-xs font-semibold text-[#1A1A2E]">
                {client.name}
              </span>
              <span className="text-[10px] text-gray-400 ml-auto">
                {formatDate(vote.created_at)}
              </span>
            </div>
            <p className="text-sm text-[#1A1A2E] leading-relaxed whitespace-pre-wrap">
              {vote.comment}
            </p>
          </div>

          {/* 入力欄 */}
          <label className="block text-xs font-semibold text-[#1A1A2E] mb-2">
            あなたからの返信
          </label>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            disabled={busy}
            rows={5}
            placeholder="お礼や近況などをひとこと(200字まで)"
            className="w-full rounded-xl border border-gray-200 p-3 text-sm text-[#1A1A2E] resize-none focus:outline-none focus:border-[#C4A35A] disabled:bg-gray-50"
          />
          <div className="flex justify-between items-center mt-1 mb-3">
            <span className="text-[11px] text-gray-400">
              編集しても再通知はされません
            </span>
            <span
              className="text-[11px] font-mono"
              style={{ color: overLimit ? '#D14B4B' : '#A0A0A0' }}
            >
              {replyText.length} / {REPLY_MAX}
            </span>
          </div>

          {/* エラー表示 */}
          {error && (
            <p className="text-xs text-[#D14B4B] mb-3">{error}</p>
          )}

          {/* ボタン群 */}
          {confirmingDelete ? (
            <div className="rounded-xl bg-[#FDF2F2] p-3 mb-2">
              <p className="text-sm text-[#1A1A2E] mb-3 font-semibold">
                この返信を削除しますか?
              </p>
              <p className="text-xs text-gray-500 mb-3">
                クライアントが見る画面からも消えます。
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-[#1A1A2E] disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-xl bg-[#D14B4B] text-white text-sm font-semibold disabled:opacity-50"
                >
                  {deleting ? '削除中...' : '削除する'}
                </button>
              </div>
            </div>
          ) : isEdit ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-[#1A1A2E] disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave}
                  className="flex-1 py-2.5 rounded-xl bg-[#1A1A2E] text-white text-sm font-bold disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
                className="text-xs text-[#D14B4B] underline self-center mt-1 disabled:opacity-50"
              >
                返信を削除する
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-[#1A1A2E] disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="flex-1 py-2.5 rounded-xl bg-[#1A1A2E] text-white text-sm font-bold disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function mapErrorCode(code: string | undefined): string | null {
  switch (code) {
    case 'VOTE_NOT_FOUND':
      return 'コメントが見つかりませんでした。'
    case 'NOT_OWNER':
      return 'このコメントへの返信権限がありません。'
    case 'NO_COMMENT':
      return 'コメントが空のため返信できません。'
    case 'ALREADY_REPLIED':
      return 'すでに返信が存在します。画面を再読込してください。'
    case 'INVALID_LENGTH':
      return '1〜200字で入力してください。'
    case 'REPLY_NOT_FOUND':
      return '返信が見つかりませんでした。'
    case 'DELETED':
      return 'この返信は削除済みです。'
    default:
      return null
  }
}
