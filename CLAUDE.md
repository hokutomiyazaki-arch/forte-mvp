# REALPROOF 開発ルール

## 鉄則
- getUser()は使わない。常にgetSession()
- .single()は使わない。常に.maybeSingle()
- 1修正=1コミット。修正後 npm run build 確認
- 「まずコードを見せて、変更はまだしないで」が安全

## 認証の注意
- signUpとsignInは別コードパス
- login/page.tsx は地雷原。変更時は全フロー確認
- router.push()ではなくwindow.location.hrefを使う
