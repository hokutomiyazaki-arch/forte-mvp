# 指示書: 投票ページ 初期ロードクエリ並列化
対象: `src/app/(main)/vote/[id]/page.tsx`
⚠️ mainに直接コミット・push。ブランチを作らない。

---

## 現状の問題

初期ロードで7クエリが直列実行されている：
```
QRチェック → プロ情報 → proof_items → rewards → personality_items → 重複チェック
（合計: 各100-200ms × 7 = 最大1.4秒のDB待ち）
```

## 改善後

```
Promise.all([QRチェック, プロ情報, personality_items])
  → Promise.all([proof_items, rewards])
  → 重複チェック
（合計: 3ウェーブ = 最大600ms程度）
```

---

## 変更内容

`load()` 関数内（174〜295行付近）を以下に置き換える。

### 変更前のコード（該当ブロック全体）

```tsx
      // QRトークン期限チェック
      if (qrToken) {
        const { data: tokenData } = await (supabase as any)
          .from('qr_tokens')
          .select('expires_at')
          .eq('token', qrToken)
          .maybeSingle()

        if (!tokenData) {
          setTokenExpired(true)
          setLoading(false)
          return
        }

        const expiresAt = new Date(tokenData.expires_at)
        if (expiresAt < new Date()) {
          setTokenExpired(true)
          setLoading(false)
          return
        }
      }

      // プロ情報取得
      const { data: proData } = await (supabase as any)
        .from('professionals')
        .select('*')
        .eq('id', proId)
        .maybeSingle()
      if (proData?.deactivated_at) {
        setError('このプロは現在プルーフを受け付けていません')
        setLoading(false)
        return
      }
      if (proData) setPro(proData)

      // 強み未設定チェック → 準備中ページにリダイレクト
      if (proData) {
        const proofsList: string[] = proData.selected_proofs || []
        if (proofsList.length === 0) {
          // プロに通知メールを送信（バックグラウンド）
          fetch('/api/nfc-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ professional_id: proId }),
          }).catch(() => {})
          // 準備中ページへリダイレクト
          window.location.href = `/vote/preparing/${proId}`
          return
        }
      }

      if (proData) {
        // 強みプルーフ: プロが選んだ proof_items を取得
        const selectedProofs: string[] = proData.selected_proofs || []
        const regularProofIds = selectedProofs.filter(id => !id.startsWith('custom_'))
        if (regularProofIds.length > 0) {
          const { data: piData } = await (supabase as any)
            .from('proof_items')
            .select('id, label, strength_label, sort_order')
            .in('id', regularProofIds)
            .order('sort_order')
          if (piData) setProofItems(piData)
        }

        // カスタムプルーフ
        if (proData.custom_proofs && proData.custom_proofs.length > 0) {
          setCustomProofs(proData.custom_proofs)
        }

        // リワード取得
        const { data: rewardData } = await (supabase as any)
          .from('rewards')
          .select('id, reward_type, title')
          .eq('professional_id', proId)
          .order('sort_order')
        if (rewardData && rewardData.length > 0) {
          setProRewards(rewardData)
          // 最初のリワードをデフォルト選択
          setSelectedRewardId(rewardData[0].id)
        }
      }

      // 人柄プルーフ: 全10項目取得
      const { data: persItems } = await (supabase as any)
        .from('personality_items')
        .select('id, label, personality_label, sort_order')
        .order('sort_order')
      if (persItems) setPersonalityItems(persItems)

      // セッション確認（Clerkから取得）
      const sessionUserEmail = clerkUser?.primaryEmailAddress?.emailAddress
      if (sessionUserEmail) {
        setSessionEmail(sessionUserEmail)
        setIsLoggedIn(true)

        // セルフ投票チェック（user_idベース）
        if (clerkUser?.id && proData?.user_id) {
          if (clerkUser.id === proData.user_id) {
            setIsSelfVote(true)
            setLoading(false)
            return
          }
        }

        // ログイン済みならセッションメールで重複投票チェック
        const { data: existing, error: voteCheckError } = await (supabase as any)
          .from('votes')
          .select('id')
          .eq('professional_id', proId)
          .eq('voter_email', sessionUserEmail)
          .maybeSingle()
        if (existing) setAlreadyVoted(true)
      } else {
        // 未ログイン: ローカルストレージからメアド復元
        const savedEmail = localStorage.getItem('proof_voter_email')
        if (savedEmail) {
          setVoterEmail(savedEmail)
          // 既に投票済みかチェック
          const { data: existing, error: voteCheckError } = await (supabase as any)
            .from('votes')
            .select('id')
            .eq('professional_id', proId)
            .eq('voter_email', savedEmail)
            .maybeSingle()
          if (existing) setAlreadyVoted(true)
        }
      }
```

### 変更後のコード

```tsx
      // ── ウェーブ1: QRチェック・プロ情報・人柄を並列取得 ──
      const [tokenResult, proResult, persResult] = await Promise.all([
        // QRトークン期限チェック
        qrToken
          ? (supabase as any).from('qr_tokens').select('expires_at').eq('token', qrToken).maybeSingle()
          : Promise.resolve({ data: { expires_at: new Date(Date.now() + 86400000).toISOString() } }),
        // プロ情報
        (supabase as any).from('professionals').select('*').eq('id', proId).maybeSingle(),
        // 人柄プルーフ（プロ情報に依存しない）
        (supabase as any).from('personality_items').select('id, label, personality_label, sort_order').order('sort_order'),
      ])

      // QRチェック結果
      if (qrToken) {
        if (!tokenResult.data) { setTokenExpired(true); setLoading(false); return }
        if (new Date(tokenResult.data.expires_at) < new Date()) { setTokenExpired(true); setLoading(false); return }
      }

      // プロ情報チェック
      const proData = proResult.data
      if (proData?.deactivated_at) {
        setError('このプロは現在プルーフを受け付けていません')
        setLoading(false)
        return
      }
      if (proData) setPro(proData)

      // 人柄プルーフセット
      if (persResult.data) setPersonalityItems(persResult.data)

      // 強み未設定チェック → 準備中ページにリダイレクト
      if (proData) {
        const proofsList: string[] = proData.selected_proofs || []
        if (proofsList.length === 0) {
          fetch('/api/nfc-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ professional_id: proId }),
          }).catch(() => {})
          window.location.href = `/vote/preparing/${proId}`
          return
        }
      }

      // ── ウェーブ2: 強みプルーフ・リワードを並列取得 ──
      if (proData) {
        const selectedProofs: string[] = proData.selected_proofs || []
        const regularProofIds = selectedProofs.filter(id => !id.startsWith('custom_'))

        const [piResult, rewardResult] = await Promise.all([
          regularProofIds.length > 0
            ? (supabase as any).from('proof_items').select('id, label, strength_label, sort_order').in('id', regularProofIds).order('sort_order')
            : Promise.resolve({ data: [] }),
          (supabase as any).from('rewards').select('id, reward_type, title').eq('professional_id', proId).order('sort_order'),
        ])

        if (piResult.data && piResult.data.length > 0) setProofItems(piResult.data)
        if (proData.custom_proofs && proData.custom_proofs.length > 0) setCustomProofs(proData.custom_proofs)
        if (rewardResult.data && rewardResult.data.length > 0) {
          setProRewards(rewardResult.data)
          setSelectedRewardId(rewardResult.data[0].id)
        }
      }

      // ── ウェーブ3: セッション確認・重複チェック ──
      const sessionUserEmail = clerkUser?.primaryEmailAddress?.emailAddress
      if (sessionUserEmail) {
        setSessionEmail(sessionUserEmail)
        setIsLoggedIn(true)

        if (clerkUser?.id && proData?.user_id) {
          if (clerkUser.id === proData.user_id) {
            setIsSelfVote(true)
            setLoading(false)
            return
          }
        }

        const { data: existing } = await (supabase as any)
          .from('votes')
          .select('id')
          .eq('professional_id', proId)
          .eq('voter_email', sessionUserEmail)
          .maybeSingle()
        if (existing) setAlreadyVoted(true)
      } else {
        const savedEmail = localStorage.getItem('proof_voter_email')
        if (savedEmail) {
          setVoterEmail(savedEmail)
          const { data: existing } = await (supabase as any)
            .from('votes')
            .select('id')
            .eq('professional_id', proId)
            .eq('voter_email', savedEmail)
            .maybeSingle()
          if (existing) setAlreadyVoted(true)
        }
      }
```

---

## ビルド確認・コミット

```bash
npm run build
git add src/app/\(main\)/vote/\[id\]/page.tsx
git commit -m "perf: 投票ページ初期ロードクエリを並列化（7直列→3ウェーブ）"
git push origin main
```

## 🛑 STOP
完了 + ビルド通過したら報告してください。
