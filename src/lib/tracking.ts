// ============================================================
// REALPROOF トラッキング関数
// ============================================================
//
// 使い方:
//   import { trackVoteEvent, trackPageView } from '@/lib/tracking'
//
// 投票フロー:
//   trackVoteEvent('qr_scan', proId)
//   trackVoteEvent('vote_start', proId)
//   trackVoteEvent('email_entered', proId)
//   trackVoteEvent('vote_submitted', proId)
//   trackVoteEvent('reward_viewed', proId)
//
// ページ閲覧:
//   trackPageView('pro_profile', proId)
//   trackPageView('pro_dashboard', currentUserId)
//   trackPageView('admin_dashboard')
//   trackPageView('vote_flow', proId)
//
// シェア:
//   trackPageView('share_profile_self', myProId)
//   trackPageView('share_profile_other', proId)
//   trackPageView('share_voice', proId, voteId)
//
// ============================================================

import { createClientComponentClient } from '@/lib/supabase-client'

const getSessionId = () => {
  if (typeof window === 'undefined') return 'server'
  let sid = sessionStorage.getItem('rp_session')
  if (!sid) {
    sid = crypto.randomUUID()
    sessionStorage.setItem('rp_session', sid)
  }
  return sid
}

const getSource = () => {
  if (typeof window === 'undefined') return 'direct'
  const params = new URLSearchParams(window.location.search)
  return params.get('src') || 'direct'
}

/**
 * 投票フローイベントを記録
 * vote_events テーブルに挿入
 */
export async function trackVoteEvent(
  eventType: string,
  professionalId: string,
  metadata?: Record<string, any>
) {
  try {
    const supabase = createClientComponentClient()
    await supabase.from('vote_events').insert({
      session_id: getSessionId(),
      professional_id: professionalId,
      event_type: eventType,
      metadata: {
        source: getSource(),
        device: /Mobile|Android|iPhone/.test(navigator.userAgent) ? 'mobile' : 'desktop',
        ...metadata,
      },
    })
  } catch (e) {
    // トラッキング失敗はサイレントに（UXに影響させない）
    console.error('Track vote event failed:', e)
  }
}

/**
 * ページ閲覧・シェアイベントを記録
 * page_views テーブルに挿入
 */
export async function trackPageView(
  pageType: string,
  targetId?: string,
  relatedId?: string
) {
  try {
    const supabase = createClientComponentClient()
    await supabase.from('page_views').insert({
      page_type: pageType,
      target_id: targetId || null,
      related_id: relatedId || null,
      session_id: getSessionId(),
      source: getSource(),
      user_agent: navigator.userAgent,
      referrer: document.referrer || null,
    })
  } catch (e) {
    console.error('Track page view failed:', e)
  }
}
