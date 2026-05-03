# Phase 5 Step 3 補強指示書

**対象**: `phase5-instructions.md` の §6 補強
**作成日**: 2026-05-02
**前提**: §6 を読み終えてから本書を読むこと
**位置づけ**: §6 の規定を上書き・追加するもの。**§6 と矛盾する場合は本書が優先**。

---

## A. §6 の規定を上書きする項目

### A-1. コメントなし票では「コメント削除」メニューを非表示

§6.3 の「常に表示」を上書き。空コメントの票で削除メニュー出す意味がないため。

```typescript
// メニュー項目の表示条件
const showPhotoDelete = voice.client_photo_url !== null;
const showCommentDelete = voice.comment !== null && voice.comment.trim() !== '';
```

両方とも非表示の場合、`[⋯]` ボタン自体を非表示にする(空メニューを開く意味なし)。

```typescript
const showMenu = showPhotoDelete || showCommentDelete;
{showMenu && (
  <button onClick={() => setMenuOpen(true)} aria-label="編集メニュー">⋯</button>
)}
```

### A-2. 確認モーダルの初期フォーカスは「キャンセル」

§6.5 の確認ダイアログ仕様に追加。
誤タップで削除を防ぐため、モーダル開いた直後のフォーカスはキャンセルボタン。

---

## B. §6 で未指定の項目を追加

### B-1. z-index 階層(既存 UI との整合)

既存層: `VoiceShareModal = 9999` / `VoiceSuggestionPopup = 5000`

| 要素 | z-index | 理由 |
|---|---|---|
| トグルメニュー(`[⋯]` 展開後) | 100 | カード内のため低層で OK |
| 確認モーダル | 9000 | VoiceShareModal(9999) より下、Popup(5000) より上 |

### B-2. 確認モーダルの a11y(既存 VoiceSuggestionPopup と統一)

```tsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="confirm-dialog-title"
  className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50"
  onClick={(e) => {
    // 背景クリックで閉じる(削除中は無効)
    if (e.target === e.currentTarget && !actionLoading) {
      setConfirmAction(null);
    }
  }}
>
  <div className="bg-white rounded-lg p-6 max-w-md mx-4">
    <h2 id="confirm-dialog-title">写真を削除しますか?</h2>
    <p>...</p>
    <div className="flex gap-3">
      <button
        ref={cancelButtonRef}
        onClick={() => setConfirmAction(null)}
        disabled={actionLoading}
        style={{ minHeight: '44px' }}
      >
        キャンセル
      </button>
      <button
        onClick={handleConfirmAction}
        disabled={actionLoading}
        style={{ minHeight: '44px' }}
      >
        {actionLoading ? '削除中...' : '削除する'}
      </button>
    </div>
  </div>
</div>
```

必須実装:
- ESC キーで閉じる(`useEffect` で `keydown` リスナー、依存配列は `[confirmAction, actionLoading]`)
- Tab/Shift+Tab の focus trap(2ボタン間で循環)
- 初期フォーカス: キャンセルボタン(`useEffect` で `cancelButtonRef.current?.focus()`)
- タップ領域: 各ボタン `min-height: 44px`(WCAG AAA)
- モーダル外クリック(背景クリック): 閉じる(`actionLoading === true` の間は無効)

### B-3. 楽観的更新の責任分担(Step 4 との境界明示)

**親(`page.tsx`)が voices state の更新を担当**(Step 4 で本実装):

```typescript
// page.tsx 側(Step 4 で実装、Step 3 では暫定空関数)
const handlePhotoDelete = async (voiceId: string) => {
  const res = await fetch(`/api/dashboard/voices/${voiceId}/remove-photo`, {
    method: 'POST',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error('削除に失敗しました');
  }
  // 楽観的更新: 該当 voice の photo_url を null に
  setVoices(prev => prev.map(v =>
    v.id === voiceId
      ? { ...v, client_photo_url: null, display_mode: 'hidden' }
      : v
  ));
};

const handleCommentDelete = async (voiceId: string) => {
  const res = await fetch(`/api/dashboard/voices/${voiceId}/remove-comment`, {
    method: 'POST',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error('削除に失敗しました');
  }
  // コメント削除後はカード自体を一覧から除外
  // (API 側で `.neq('comment', '[deleted]')` してるので再fetchでも消える)
  setVoices(prev => prev.filter(v => v.id !== voiceId));
};
```

**子(`DashboardVoiceCard.tsx`)は callback を await するだけ**:

```typescript
const handleConfirmAction = async () => {
  setActionLoading(true);
  try {
    if (confirmAction === 'photo') {
      await onPhotoDelete(voice.id);
    } else if (confirmAction === 'comment') {
      await onCommentDelete(voice.id);
    }
    setConfirmAction(null);
    setMenuOpen(false);
  } catch (err) {
    alert((err as Error).message); // Step 3 では alert で OK、Step 4 でトースト化検討
  } finally {
    setActionLoading(false);
  }
};
```

エラー時のトースト表示は Step 4 で検討(Step 3 では `alert()` で簡易対応)。

### B-4. 確認モーダルは別ファイル化しない

§6 では言及なし。本書で確定:
- **インライン実装**(`DashboardVoiceCard.tsx` 内に同居)
- 理由: Step 3 内で完結、再利用予定なし、可読性優先
- 将来別所で必要になったら抽出

### B-5. メニュー外クリック検知の実装パターン

```typescript
const menuRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!menuOpen) return;

  const handleClickOutside = (e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setMenuOpen(false);
    }
  };

  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, [menuOpen]); // ⚠️ プリミティブのみ、オブジェクト禁止(CLAUDE.md ルール)
```

### B-6. 二重クリック防止 + ESC ハンドラ

`actionLoading === true` の間:
- モーダル外クリックで閉じない
- 「削除する」「キャンセル」ボタン disabled
- ESC 無効

```typescript
useEffect(() => {
  if (!confirmAction) return;
  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !actionLoading) {
      setConfirmAction(null);
    }
  };
  document.addEventListener('keydown', handleEsc);
  return () => document.removeEventListener('keydown', handleEsc);
}, [confirmAction, actionLoading]); // プリミティブのみ
```

---

## C. Step 3-Step 4 境界の注意(重要)

### C-1. Props 変更による TypeScript エラーへの対処

Step 3 で `DashboardVoiceCard` の props を変更すると、`page.tsx` 側で type error が発生する。

**対策**: Step 3 のコミット内で、`page.tsx` 側の `<DashboardVoiceCard>` 呼び出し箇所に **暫定 props** を渡す:

```typescript
// page.tsx (Step 3 暫定、Step 4 で本実装)
<DashboardVoiceCard
  voice={voice}
  professionalName={proName}
  onReplyClick={(v) => handleReplyClick(v)}        // 既存ロジック流用
  onFeaturedToggle={async (id) => {
    // TODO Step 4: 既存の検索カード切替ロジックをここに移植
  }}
  onPhotoDelete={async (id) => {
    // TODO Step 4: handlePhotoDelete 本実装
  }}
  onCommentDelete={async (id) => {
    // TODO Step 4: handleCommentDelete 本実装
  }}
  isFeatured={voice.id === featuredVoteId}  // 既存ロジック流用
  isFeaturedSaving={false}                  // TODO Step 4
/>
```

これにより:
- ✅ Step 3 のコミット時点で TypeScript エラーゼロ、本番デプロイ可能
- ⚠️ メニューから削除を実行しても何も起きない(callback が空関数のため)
- ✅ Step 4 で本実装が入って初めて削除が動く

### C-2. 外側ボタン群の削除タイミング

§6.3 の「カード内に統合」レイアウトに対応するため、`page.tsx` の外側ボタン群(`[返信を編集]` `[✓ 検索カード]`)を削除する必要があるが、これは **Step 4 の役割**。

Step 3 では:
- `DashboardVoiceCard` 内部に新ボタン追加 ✅
- 外側ボタンの削除は Step 4 で実施(**一時的に二重表示になるが許容**)

---

## D. テスト観点拡張(§6.8 補強)

Step 3 完了基準:

- [ ] カード内のレイアウトが新仕様通り
- [ ] `[⋯]` クリックでメニューが開く
- [ ] メニュー外クリックで閉じる
- [ ] 写真なし票(`client_photo_url IS NULL`)では「写真削除」メニュー項目が表示されない
- [ ] コメントなし票(`comment IS NULL or 空文字`)では「コメント削除」メニュー項目が表示されない
- [ ] 両方なし票では `[⋯]` 自体が表示されない
- [ ] 確認モーダルの初期フォーカスがキャンセルボタンに当たる
- [ ] ESC でモーダルが閉じる(削除中は無効)
- [ ] Tab/Shift+Tab で focus が2ボタン間で循環する
- [ ] モーダル背景クリックで閉じる(削除中は無効)
- [ ] 「削除する」クリック中は両ボタン disabled
- [ ] `page.tsx` の TypeScript エラーなし(暫定 props で凌ぐ)
- [ ] 削除実行は Step 4 まで動かなくて OK(callback が空)

---

## E. 絶対遵守ルール(CLAUDE.md 準拠)

- ❌ branch / worktree 作成禁止 → **main 直接コミット**
- ❌ git push 禁止(CEO が GitHub Desktop で手動)
- ❌ npm run build 禁止(CEO 手動)
- ❌ useEffect 依存配列にオブジェクト禁止 → **プリミティブのみ**
- ✅ 既存の API パスを変更しない(Step 1/2 で確定済み)
- ✅ §6 と矛盾する場合は本書が優先

---

## F. 禁止語チェック(クライアント禁止語、プロ向けでも一貫性のため)

- ❌ 投票 / 評価 / 口コミ / レビュー
- ✅ 返信を編集 / 検索カードに表示中 / 検索カードに設定 / 写真を削除 / コメントを削除

---

🛑 **STOP — 本補強書を含めた Step 3 完了後、CEO 確認を経て Step 4 へ進む**
