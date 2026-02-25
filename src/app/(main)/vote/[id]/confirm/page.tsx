// src/app/vote/[id]/confirm/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Suspense } from 'react';

function VoteConfirmForm() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const submitVote = async () => {
      try {
        // sessionStorage から投票データを取得
        const pendingVoteStr = sessionStorage.getItem('pending_vote');
        if (!pendingVoteStr) {
          setErrorMessage('投票データが見つかりません。もう一度お試しください。');
          setStatus('error');
          return;
        }

        const pendingVote = JSON.parse(pendingVoteStr);
        const auth_method = searchParams.get('auth_method') || 'email';
        const auth_provider_id = searchParams.get('auth_provider_id') || null;
        const auth_display_name = searchParams.get('auth_display_name') || null;
        const client_email = searchParams.get('client_email') || null;
        const professional_id = searchParams.get('professional_id') || pendingVote.professional_id || params.id;
        const qr_token = searchParams.get('qr_token') || pendingVote.qr_token || null;

        // voter_email の決定: LINE/Google からのメール or 仮メール
        const voter_email = client_email || `line_${auth_provider_id}@line.realproof.jp`;

        // Supabase に投票を保存
        const supabase = createClient();

        const { data: voteData, error: voteError } = await (supabase as any).from('votes').insert({
          professional_id: professional_id,
          voter_email: voter_email,
          client_user_id: null,
          session_count: pendingVote.session_count || 'first',
          vote_type: pendingVote.vote_type || 'proof',
          selected_proof_ids: pendingVote.selected_proof_ids || null,
          selected_personality_ids: pendingVote.selected_personality_ids || null,
          selected_reward_id: pendingVote.selected_reward_id || null,
          comment: pendingVote.comment || null,
          qr_token: qr_token,
          status: 'confirmed', // LINE/Google認証済みなのでメール確認不要
          auth_method: auth_method,
          auth_provider_id: auth_provider_id,
          auth_display_name: auth_display_name,
        }).select().maybeSingle();

        if (voteError) {
          console.error('Vote insert error:', voteError);
          if (voteError.code === '23505') {
            setErrorMessage('既に投票済みです。');
          } else {
            setErrorMessage('投票の保存に失敗しました。');
          }
          setStatus('error');
          return;
        }

        // リワード選択がある場合、client_rewardsに保存
        if (pendingVote.selected_reward_id && voteData) {
          await (supabase as any).from('client_rewards').insert({
            vote_id: voteData.id,
            reward_id: pendingVote.selected_reward_id,
            professional_id: professional_id,
            client_email: voter_email,
            status: 'pending',
          });
        }

        // vote_emails にメアドを保存（分析用）
        if (client_email) {
          await (supabase as any).from('vote_emails').insert({
            email: client_email,
            professional_id: professional_id,
            source: 'vote',
          });
        }

        // sessionStorage をクリア
        sessionStorage.removeItem('pending_vote');

        // リワード画面にリダイレクト
        setStatus('success');
        window.location.href = `/vote-confirmed?proId=${professional_id}&reward=1`;

      } catch (err) {
        console.error('Vote confirm error:', err);
        setErrorMessage('エラーが発生しました。');
        setStatus('error');
      }
    };

    submitVote();
  }, []);

  if (status === 'processing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF7]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#C4A35A] mx-auto mb-4"></div>
          <p className="text-[#1A1A2E] text-lg">投票を送信しています...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF7]">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-4">{errorMessage}</p>
          <button
            onClick={() => window.history.back()}
            className="px-6 py-3 bg-[#C4A35A] text-white rounded-lg"
          >
            戻る
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default function VoteConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF7]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#C4A35A] mx-auto mb-4"></div>
          <p className="text-[#1A1A2E] text-lg">読み込み中...</p>
        </div>
      </div>
    }>
      <VoteConfirmForm />
    </Suspense>
  );
}
