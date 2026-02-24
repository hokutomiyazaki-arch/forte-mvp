# B3: リワード設定をダッシュボードの独立セクションに移動

## 概要
リワード設定を「プロフィール編集フォーム」から切り出し、プルーフ設定と同じパターンで「ダッシュボードの独立セクション」にする。さらに、プルーフ9個＋リワード1個以上を設定しないとQRコードを発行できないゲート条件を追加。

**ファイル**: `src/app/dashboard/page.tsx`（このファイルのみ）

---

## やること（5ステップ）

### Step 1: プロフィール編集フォームからリワードを削除

**L628〜L745**（`{/* リワード設定（最大3つ） */}` の `<div className="border-t pt-4">` から閉じの `</div>` まで）を **丸ごと削除**。

**L310〜L333**（handleSave内の `// リワード保存` セクション）も **丸ごと削除**。

⚠️ `rewards` state（L85）、`showRewardPicker` state（L86）、リワード取得ロジック（L145-157）は**削除しない**。ダッシュボードビューで使う。

---

### Step 2: 新しい state を追加

L86付近に以下を追加：

```tsx
const [rewardSaving, setRewardSaving] = useState(false)
const [rewardSaved, setRewardSaved] = useState(false)
const [rewardError, setRewardError] = useState('')
```

---

### Step 3: handleSaveRewards 関数を追加

`handleSaveProofs` の下（L430付近）に追加：

```tsx
async function handleSaveRewards() {
  if (!pro) return
  setRewardSaving(true)
  setRewardError('')

  // 既存リワードを削除
  const { error: delError } = await (supabase as any).from('rewards').delete().eq('professional_id', pro.id)
  if (delError) {
    console.error('[handleSaveRewards] delete error:', delError.message)
    setRewardError('保存に失敗しました。もう一度お試しください。')
    setRewardSaving(false)
    return
  }

  // 有効なリワードのみ保存
  const validRewards = rewards.filter(r => r.reward_type && r.content.trim())
  if (validRewards.length > 0) {
    const { error: insertError } = await (supabase as any).from('rewards').insert(
      validRewards.map((r, idx) => ({
        professional_id: pro.id,
        reward_type: r.reward_type,
        title: r.title.trim() || '',
        content: r.content.trim(),
        sort_order: idx,
      }))
    )
    if (insertError) {
      console.error('[handleSaveRewards] insert error:', insertError.message)
      setRewardError('保存に失敗しました。もう一度お試しください。')
      setRewardSaving(false)
      return
    }
  }

  setRewardSaved(true)
  setTimeout(() => setRewardSaved(false), 2500)
  setRewardSaving(false)
}
```

---

### Step 4: ダッシュボードビューにリワード設定セクションを追加

**プルーフ設定の `</div>` （L1062付近）の直後、QRコードセクション（`{/* QR Code */}`）の直前** に以下を追加：

```tsx
      {/* リワード設定 */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-2">リワード設定</h2>
        <p className="text-sm text-[#9CA3AF] mb-4">
          投票してくれたクライアントへのお礼を設定。プロの秘密やおすすめを共有して、信頼を深めましょう。
        </p>

        {/* プログレスバー */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-[#1A1A2E]">{rewards.length} / 3 設定中</span>
            {rewards.length === 3 && <span className="text-xs text-[#C4A35A] font-medium">✓ 設定完了</span>}
            {rewards.length < 3 && <span className="text-xs text-[#9CA3AF] font-medium">あと{3 - rewards.length}枠</span>}
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                rewards.length >= 3
                  ? 'bg-gradient-to-r from-[#C4A35A] to-[#d4b86a]'
                  : 'bg-gradient-to-r from-[#1A1A2E] to-[#2a2a4e]'
              }`}
              style={{ width: `${(rewards.length / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* 設定済みリワード一覧 */}
        {rewards.length > 0 && (
          <div className="space-y-3 mb-4">
            {rewards.map((reward, idx) => {
              const rt = getRewardType(reward.reward_type)
              const displayLabel = rt?.label || reward.reward_type
              const needsTitle = rt?.hasTitle || false
              return (
                <div key={idx} className="p-4 bg-[#FAFAF7] rounded-lg border border-[#E5E7EB]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-[#1A1A2E]">
                      {idx + 1}. {displayLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRewards(rewards.filter((_, i) => i !== idx))}
                      className="text-sm text-[#9CA3AF] hover:text-red-500 transition-colors"
                    >
                      削除
                    </button>
                  </div>
                  {needsTitle && (
                    <input
                      value={reward.title}
                      onChange={e => {
                        const updated = [...rewards]
                        updated[idx] = { ...updated[idx], title: e.target.value }
                        setRewards(updated)
                      }}
                      className="w-full px-3 py-2 mb-2 bg-white border border-[#E5E7EB] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#C4A35A] focus:border-[#C4A35A]"
                      placeholder={reward.reward_type === 'selfcare' ? 'タイトル（例：自宅でできる肩こり解消法）' : 'タイトル（例：FNTアプリドリル）'}
                    />
                  )}
                  <textarea
                    value={reward.content}
                    onChange={e => {
                      const updated = [...rewards]
                      updated[idx] = { ...updated[idx], content: e.target.value }
                      setRewards(updated)
                    }}
                    rows={2}
                    className="w-full px-3 py-2 bg-white border border-[#E5E7EB] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#C4A35A] focus:border-[#C4A35A] resize-none"
                    placeholder="リワードの内容を入力..."
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* リワード追加UI */}
        {rewards.length < 3 && (
          <div className="border border-dashed border-[#E5E7EB] rounded-lg p-4 mb-4">
            {!showRewardPicker ? (
              <button
                type="button"
                onClick={() => setShowRewardPicker(true)}
                className="w-full py-2 text-sm text-[#C4A35A] font-medium hover:text-[#b3923f] transition-colors"
              >
                + リワードを追加（残り{3 - rewards.length}枠）
              </button>
            ) : (
              <>
                <p className="text-sm font-medium text-[#1A1A2E] mb-3">カテゴリを選択</p>
                <div className="space-y-2 mb-3">
                  {REWARD_TYPES
                    .filter(rt => !rewards.some(r => r.reward_type === rt.id))
                    .map(rt => (
                      <button
                        key={rt.id}
                        type="button"
                        onClick={() => {
                          setRewards([...rewards, { reward_type: rt.id, title: '', content: '' }])
                          setShowRewardPicker(false)
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[#FAFAF7] transition-colors"
                      >
                        <span className="text-sm font-medium text-[#1A1A2E]">{rt.label}</span>
                        <span className="text-xs text-[#9CA3AF] ml-2">{rt.description}</span>
                      </button>
                    ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowRewardPicker(false)}
                  className="text-xs text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                >
                  キャンセル
                </button>
              </>
            )}
          </div>
        )}

        {/* 保存ボタン */}
        {rewardError && <p className="text-red-500 text-sm mb-2">{rewardError}</p>}
        <button
          onClick={handleSaveRewards}
          disabled={rewardSaving}
          className={`w-full py-3 rounded-xl text-sm font-medium tracking-wider transition-colors ${
            rewardSaved
              ? 'bg-green-500 text-white'
              : 'bg-[#1A1A2E] text-[#C4A35A] hover:bg-[#2a2a4e]'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {rewardSaving ? '保存中...' : rewardSaved ? '保存しました' : 'リワード設定を保存'}
        </button>

        {/* 設定済み一覧 */}
        {rewards.filter(r => r.content.trim()).length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#E5E7EB]">
            <p className="text-xs text-[#9CA3AF] mb-2">設定中のリワード</p>
            <div className="flex flex-wrap gap-2">
              {rewards.filter(r => r.content.trim()).map((r, idx) => {
                const rt = getRewardType(r.reward_type)
                return (
                  <span key={idx} className="px-3 py-1 bg-[#C4A35A]/10 text-[#1A1A2E] text-xs rounded-full">
                    {rt?.label || r.reward_type}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>
```

---

### Step 5: QRコードセクションにゲート条件を追加

**L1064付近**の `{/* QR Code */}` セクションを以下に置き換え：

```tsx
      {/* QR Code */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8 text-center">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">24時間限定 投票用QRコード</h2>
        {(() => {
          const proofsReady = selectedProofIds.size === 9
          const rewardsReady = rewards.filter(r => r.reward_type && r.content.trim()).length >= 1
          const isReady = proofsReady && rewardsReady

          if (!isReady) {
            const missing: string[] = []
            if (!proofsReady) missing.push('プルーフ設定（9個選択）')
            if (!rewardsReady) missing.push('リワード設定（最低1個）')
            return (
              <div className="py-4">
                <p className="text-sm text-[#9CA3AF] mb-3">
                  QRコードを発行するには、以下の設定を完了してください：
                </p>
                <div className="space-y-2">
                  {!proofsReady && (
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <span className="text-red-400">✗</span>
                      <span className="text-[#1A1A2E]">プルーフ設定（{selectedProofIds.size} / 9 選択中）</span>
                    </div>
                  )}
                  {proofsReady && (
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span className="text-[#9CA3AF]">プルーフ設定 完了</span>
                    </div>
                  )}
                  {!rewardsReady && (
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <span className="text-red-400">✗</span>
                      <span className="text-[#1A1A2E]">リワード設定（{rewards.filter(r => r.content.trim()).length} / 1 以上）</span>
                    </div>
                  )}
                  {rewardsReady && (
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span className="text-[#9CA3AF]">リワード設定 完了</span>
                    </div>
                  )}
                </div>
              </div>
            )
          }

          return (
            <>
              <p className="text-sm text-gray-500 mb-4">クライアントに見せてプルーフを贈ってもらいましょう</p>
              {qrUrl ? (
                <img src={qrUrl} alt="QR Code" className="mx-auto mb-4" />
              ) : (
                <button onClick={generateQR} className="px-6 py-3 bg-[#C4A35A] text-white rounded-lg hover:bg-[#b3944f] transition">
                  24時間限定QRコードを発行する
                </button>
              )}
            </>
          )
        })()}
      </div>
```

**ゲート条件:**
- `proofsReady`: `selectedProofIds.size === 9`（プルーフ9個選択済み）
- `rewardsReady`: `rewards.filter(r => r.reward_type && r.content.trim()).length >= 1`（リワード最低1個、内容入力済み）
- 両方 true の時だけ QR ボタンを表示
- 未完了の場合、何が足りないかチェックリストで表示（✓/✗付き）

---

## ⚠️ 注意事項

1. **新規プロ登録時**: リワードはダッシュボードビューでしか設定できないようになる。新規プロはまずプロフィールを作成→ダッシュボードに戻って→リワード設定の流れ。これはプルーフ設定と同じ流れなのでOK。

2. **handleSave（プロフィール保存）からリワード保存ロジックを削除しても、既存データには影響なし**。既存のrewardsはDBに残っており、ダッシュボードビューのuseEffectで読み込まれる。

3. **`form` の submit からリワードが外れる**のでプロフ保存時にリワードが消えることはない。

4. **REWARD_TYPES のインポートはそのまま残す**。ダッシュボードビューで使う。

---

## 確認手順

1. `npm run build` — ビルド通ること
2. プロフィール編集画面 — リワードセクションが消えていること
3. ダッシュボードビュー — プルーフ設定の下にリワード設定が表示されること
4. リワード追加→保存→リロード — データが永続化されること
5. リワード削除→保存→リロード — 削除が永続化されること
6. QRゲート（プルーフ未設定）— プルーフ9個未満の時、QRボタンが出ず✗チェックリストが表示されること
7. QRゲート（リワード未設定）— リワード0個の時、QRボタンが出ず✗チェックリストが表示されること
8. QRゲート（両方設定済み）— プルーフ9個＋リワード1個以上の時、QRボタンが表示されること
9. 投票画面 — リワード選択が正常に動作すること（変更なし）

---

## コミット

```
feat: move reward settings to dashboard section + QR gate (B3)
```
