import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'
import { notifyClientProReplied } from '@/lib/consultation-notify'

export const dynamic = 'force-dynamic'

const BODY_MAX = 2000
const MESSAGE_LIMIT = 100
// CEO指示(2026-08-06): アーカイブ＝ダッシュボードの一覧から隠す状態。
// 新カラムを作らず status の値として持つ（migration 050 のメモ参照）。
const ALLOWED_STATUS = ['new', 'open', 'closed', 'archived']

/**
 * POST /api/pro/consultations/[id] — プロが返信する（§16-19）
 * body: { body }            返信を書き込む。クライアントへメールが飛ぶ
 * body: { status }          スレッドの状態だけ変える（対応済みにする等）
 * body: { menu_id }         メニューを提案する（§16-27-3）。カードとしてスレッドに入る
 * body: { report_reason }   通報する（§16-27-4）。プロ側からも通報できる（お互い様の建て付け）
 * body: { list_id }         紹介リストを送る（§16-35）。ワンクリックで紹介の実体を残す
 * body: { undo_message_id } 送信を取り消す（§16-36）。自分(sender='pro')の発言のみ
 * body: { delete_thread }    やりとりごと削除する（§17-8）。メールが届かないスレッドの後始末
 *
 * 「プロはダッシュボードで書くだけ、クライアントにはメールが届く」がこの機能の肝。
 * 送信結果は consultation_messages.delivered_at に残す（送れなかったことを後から追える）。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const payload = await request.json().catch(() => null)
    if (!payload) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

    const supabase = getSupabaseAdmin()

    // 自分宛のスレッドかを必ず確認（他人の相談を触れない）
    const { data: consultation } = await supabase
      .from('consultations')
      .select('id, pro_id, client_name, client_email, access_token, status')
      .eq('id', id)
      .maybeSingle()

    if (!consultation || consultation.pro_id !== ownPro.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    // ── やりとりごと削除（§17-8・CEO指示 2026-08-06）──
    // 「クライアントが返信手段がないとなにも無いので、ワンクリックでチャットを消去できるように」
    // 相談はメールしか預かっていない。バウンスしたスレッドはクライアントが戻る手段を失っており、
    // 返信を書いても永久に届かない。アーカイブ（見えなくするだけ）ではなく消せるようにする。
    // §16-36（メッセージの取り消し）と違い、こちらは**行ごと消す**。
    //   理由: 取り消しは「相手に届いたものを引っ込める」＝相手が存在するが、
    //   ここは相手に何も届いていないスレッドの後始末で、残しても誰の役にも立たない。
    if (payload.delete_thread === true) {
      // 明示的に消す（consultation_messages は ON DELETE CASCADE だが、順序を書いて意図を残す）
      const { error: msgError } = await supabase
        .from('consultation_messages')
        .delete()
        .eq('consultation_id', consultation.id)
      if (msgError) {
        console.error('[api/pro/consultations POST] delete messages error:', msgError.message)
        return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
      }
      const { error: threadError } = await supabase
        .from('consultations')
        .delete()
        .eq('id', consultation.id)
      if (threadError) {
        console.error('[api/pro/consultations POST] delete thread error:', threadError.message)
        return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, deleted: true })
    }

    // ── 状態変更のみ ──
    if (typeof payload.status === 'string' && payload.body === undefined) {
      if (!ALLOWED_STATUS.includes(payload.status)) {
        return NextResponse.json({ error: 'status_invalid' }, { status: 400 })
      }
      const { error } = await supabase
        .from('consultations')
        .update({ status: payload.status, updated_at: new Date().toISOString() })
        .eq('id', consultation.id)
      if (error) {
        // status に CHECK 制約が残っていて 'archived' を弾かれた場合もここに来る
        // （migration 050 の確認手順を参照）。何が起きたか分かるようにコードを返す。
        console.error('[api/pro/consultations POST] status error:', error.message)
        return NextResponse.json({ error: 'update_failed', status_value: payload.status }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    // ── 通報（§16-27-4）──
    // CEO指摘(2026-08-06)「通報はプロもお互いに必要だよね？」。
    // 理由は必須（10文字以上）。ワンタップで送れると軽い通報が増え、運営が読む価値がなくなる。
    if (typeof payload.report_reason === 'string') {
      const reason = payload.report_reason.trim().slice(0, 500)
      if (reason.length < 10) {
        return NextResponse.json({ error: 'reason_required' }, { status: 400 })
      }
      const { error } = await supabase.from('consultation_reports').insert({
        consultation_id: consultation.id,
        reporter: 'pro',
        reason,
      })
      if (error) {
        // migration 052 未実行だとここに来る。届いていないのに成功と出さない。
        console.error('[api/pro/consultations POST] report error:', error.message)
        return NextResponse.json({ error: 'report_failed' }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    // ── 送信の取り消し（§16-36・CEO決定 2026-08-06 改訂）──
    // 「ワンタップでリストが送られてしまうのでミスが多くなりそう」への対応。
    // CEO決定:「相手の画面からも消えるけど、システムには残る」。
    //   取り消しの目的は相手に送ったものを引っ込めることで、誰かを捕まえることではない。
    //   自分でヤバいと思って取り消してくれるなら運営が間に入る手間が減る。
    //   ただし、いざというとき（通報）に確認できるよう行は残す＝論理削除（withdrawn_at）。
    // ⚠️ メールは既に出ているので**送信自体は取り消せない**。取り消せるのは
    //    やりとり画面からの表示だけ。UI側でその旨を明示すること。
    if (typeof payload.undo_message_id === 'string' && payload.undo_message_id) {
      const { data: msg } = await supabase
        .from('consultation_messages')
        .select('id, consultation_id, sender')
        .eq('id', payload.undo_message_id)
        .maybeSingle()

      // 自分のスレッドの、自分(pro)の発言だけ
      if (!msg || msg.consultation_id !== consultation.id || msg.sender !== 'pro') {
        return NextResponse.json({ error: 'message_not_found' }, { status: 404 })
      }

      const { error } = await supabase
        .from('consultation_messages')
        .update({ withdrawn_at: new Date().toISOString() })
        .eq('id', msg.id)
      if (error) {
        // fail-soft: migration 055 未実行の環境では withdrawn_at が無い。
        // 「取り消せません」で終わらせると誤送信が残り続けるほうが害が大きいので、
        // その場合だけ従来どおり物理削除する（CEO「物理削除でok」）。
        console.error('[api/pro/consultations POST] undo error:', error.message)
        const fallback = await supabase.from('consultation_messages').delete().eq('id', msg.id)
        if (fallback.error) {
          console.error('[api/pro/consultations POST] undo delete error:', fallback.error.message)
          return NextResponse.json({ error: 'undo_failed' }, { status: 500 })
        }
      }
      return NextResponse.json({ ok: true })
    }

    // ── 紹介リストを送る（§16-35・CEO決定 2026-08-06）──
    // 公開カードに一覧を出すのをやめた代わりの導線。
    // 「◯◯さんが紹介した」という実体が残るのがこちらの価値（フロント掲載には無かったもの）。
    if (typeof payload.list_id === 'string' && payload.list_id) {
      const { data: list } = await supabase
        .from('referral_lists')
        .select('id, title, slug, visibility, owner_id')
        .eq('id', payload.list_id)
        .maybeSingle()

      // 自分のリストで、かつ共有可能(privateでない=slugでURLが配れる)ものだけ
      if (!list || list.owner_id !== ownPro.id || list.visibility === 'private' || !list.slug) {
        return NextResponse.json({ error: 'list_not_found' }, { status: 404 })
      }

      // CEO指示(2026-08-06):「リストを送るときは余計なメッセージはつけずにリンクだけ」。
      // body はカード描画に使わないが、list_id カラムが無い環境や
      // リストが後から消された場合の**最低限の代替表示**として題名だけ入れる。
      const text = list.title
      const row: Record<string, unknown> = {
        consultation_id: consultation.id,
        sender: 'pro',
        body: text,
        list_id: list.id,
      }

      let insertedId: string | null = null
      {
        const res = await supabase.from('consultation_messages').insert(row).select('id').maybeSingle()
        if (res.error) {
          // fail-soft: list_id 未作成の環境ではキーを外して普通のメッセージとして入れる
          const { list_id: _omit, ...withoutList } = row
          const retry = await supabase.from('consultation_messages').insert(withoutList).select('id').maybeSingle()
          if (retry.error || !retry.data) {
            console.error('[api/pro/consultations POST] list insert error:', retry.error?.message)
            return NextResponse.json({ error: 'send_failed' }, { status: 500 })
          }
          insertedId = retry.data.id
        } else {
          insertedId = res.data?.id ?? null
        }
      }

      await supabase
        .from('consultations')
        .update({ status: 'open', updated_at: new Date().toISOString() })
        .eq('id', consultation.id)

      let delivered = false
      try {
        delivered = await notifyClientProReplied({
          clientEmail: consultation.client_email,
          clientName: consultation.client_name || '',
          proName: ownPro.name || '',
          body: text,
          token: consultation.access_token,
        })
      } catch (err) {
        console.error('[api/pro/consultations POST] list notify error:', err)
      }
      if (delivered && insertedId) {
        await supabase
          .from('consultation_messages')
          .update({ delivered_at: new Date().toISOString() })
          .eq('id', insertedId)
      }

      return NextResponse.json({ ok: true, delivered })
    }

    // ── メニューの提案（§16-27-3 相談→予約の接続）──
    // 相談で温まった人を、その場で予約に接続する。本文も必ず入れる
    // （menu_id カラムが無い環境や、後からメニューが消えた場合でも会話が成立するように）。
    if (typeof payload.menu_id === 'string' && payload.menu_id) {
      const { data: menu } = await supabase
        .from('pro_menus')
        .select('id, name, price_text, professional_id, is_active')
        .eq('id', payload.menu_id)
        .maybeSingle()

      // 他人のメニューを提案できないようにする
      if (!menu || menu.professional_id !== ownPro.id || menu.is_active === false) {
        return NextResponse.json({ error: 'menu_not_found' }, { status: 404 })
      }

      const text = `「${menu.name}」をご提案します（${menu.price_text}）`
      const row: Record<string, unknown> = {
        consultation_id: consultation.id,
        sender: 'pro',
        body: text,
        menu_id: menu.id,
      }

      let insertedId: string | null = null
      {
        const res = await supabase.from('consultation_messages').insert(row).select('id').maybeSingle()
        if (res.error) {
          // fail-soft: menu_id 未作成の環境ではキーを外して普通のメッセージとして入れる
          const { menu_id: _omit, ...withoutMenu } = row
          const retry = await supabase.from('consultation_messages').insert(withoutMenu).select('id').maybeSingle()
          if (retry.error || !retry.data) {
            console.error('[api/pro/consultations POST] menu insert error:', retry.error?.message)
            return NextResponse.json({ error: 'send_failed' }, { status: 500 })
          }
          insertedId = retry.data.id
        } else {
          insertedId = res.data?.id ?? null
        }
      }

      await supabase
        .from('consultations')
        .update({ status: 'open', updated_at: new Date().toISOString() })
        .eq('id', consultation.id)

      let delivered = false
      try {
        delivered = await notifyClientProReplied({
          clientEmail: consultation.client_email,
          clientName: consultation.client_name || '',
          proName: ownPro.name || '',
          body: text,
          token: consultation.access_token,
        })
      } catch (err) {
        console.error('[api/pro/consultations POST] menu notify error:', err)
      }
      if (delivered && insertedId) {
        await supabase
          .from('consultation_messages')
          .update({ delivered_at: new Date().toISOString() })
          .eq('id', insertedId)
      }

      return NextResponse.json({ ok: true, delivered })
    }

    // ── 返信 ──
    const body = typeof payload.body === 'string' ? payload.body.trim() : ''
    if (!body || body.length > BODY_MAX) {
      return NextResponse.json({ error: 'body_invalid' }, { status: 400 })
    }

    const { count } = await supabase
      .from('consultation_messages')
      .select('id', { count: 'exact', head: true })
      .eq('consultation_id', consultation.id)
    if ((count || 0) >= MESSAGE_LIMIT) {
      return NextResponse.json({ error: 'limit_reached' }, { status: 409 })
    }

    const { data: inserted, error: msgError } = await supabase
      .from('consultation_messages')
      .insert({ consultation_id: consultation.id, sender: 'pro', body })
      .select('id')
      .maybeSingle()

    if (msgError || !inserted) {
      console.error('[api/pro/consultations POST] insert error:', msgError?.message)
      return NextResponse.json({ error: 'send_failed' }, { status: 500 })
    }

    // 返信したら「対応中」へ。クライアントが追記すると 'new' に戻る。
    await supabase
      .from('consultations')
      .update({ status: 'open', updated_at: new Date().toISOString() })
      .eq('id', consultation.id)

    // メール送信。失敗しても本文は残す（delivered_at が null のままで判別できる）。
    let delivered = false
    try {
      delivered = await notifyClientProReplied({
        clientEmail: consultation.client_email,
        clientName: consultation.client_name || '',
        proName: ownPro.name || '',
        body,
        token: consultation.access_token,
      })
    } catch (err) {
      console.error('[api/pro/consultations POST] notify error:', err)
    }

    if (delivered) {
      await supabase
        .from('consultation_messages')
        .update({ delivered_at: new Date().toISOString() })
        .eq('id', inserted.id)
    } else {
      // §17-28(CEO質問 2026-08-07「他に相談に適用してない同じ問題修正はない？」):
      //   §17-27 でクライアント発の相談には「送れなかったら印を立てる」を入れたが、
      //   **プロの返信が送れなかった場合**は握りつぶしていた。
      //   delivered_at が null なだけでは画面に何も出ないので、プロは
      //   「返信した」と思ったまま、相手に一生届かない。ここでも印を立てる。
      //   email_failed_at は migration 058 依存のため fail-soft。
      try {
        const { error: markError } = await supabase
          .from('consultations')
          .update({ email_failed_at: new Date().toISOString() })
          .eq('id', consultation.id)
        if (markError) {
          console.error('[api/pro/consultations POST] email_failed mark error (fail-soft):', markError.message)
        }
      } catch (markErr) {
        console.error('[api/pro/consultations POST] email_failed mark error (fail-soft):', markErr)
      }
    }

    return NextResponse.json({ ok: true, delivered })
  } catch (err) {
    console.error('[api/pro/consultations POST] error:', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
