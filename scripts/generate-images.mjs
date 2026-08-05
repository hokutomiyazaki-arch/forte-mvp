#!/usr/bin/env node
/**
 * 汎用画像生成ツール（OpenAI 画像API・gpt-image系）
 *
 * 使い方:
 *   OPENAI_API_KEY を環境変数に設定した上で
 *   node scripts/generate-images.mjs <manifest.json> [出力ディレクトリ]
 *
 * manifest.json の形式（配列）:
 *   [{ "name": "guide-flow", "prompt": "...", "size": "1536x1024", "quality": "medium" }, ...]
 *   - name: 出力ファイル名（.png が付く）。既に出力先に存在する場合はスキップ（再実行安全）
 *   - size: "1024x1024" | "1536x1024" | "1024x1536"（省略時 1024x1024）
 *   - quality: "low" | "medium" | "high"（省略時 low。コスト注意）
 *
 * 由来: ~/Desktop/lineart/lineart.py（靭帯ワークのスライド用一括変換）と同じ
 * OpenAI 画像APIを、REALPROOF用に fetch 直叩き（追加パッケージ不要）で汎用化したもの。
 * APIキーはこのスクリプトに書かない・ログに出さない。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, resolve } from 'path'

const MODEL = 'gpt-image-2'

const [, , manifestPath, outDirArg] = process.argv
if (!manifestPath) {
  console.error('usage: node scripts/generate-images.mjs <manifest.json> [outDir]')
  process.exit(1)
}
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  console.error('OPENAI_API_KEY が環境変数に設定されていません。')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const outDir = resolve(outDirArg || 'generated-images')
mkdirSync(outDir, { recursive: true })

let ok = 0
let skipped = 0
let failed = 0
for (const [i, item] of manifest.entries()) {
  const outPath = join(outDir, `${item.name}.png`)
  if (existsSync(outPath)) {
    console.log(`[${i + 1}/${manifest.length}] ${item.name} ... 既存のためスキップ`)
    skipped++
    continue
  }
  process.stdout.write(`[${i + 1}/${manifest.length}] ${item.name} ... `)
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt: item.prompt,
        size: item.size || '1024x1024',
        quality: item.quality || 'low',
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`)
    }
    const json = await res.json()
    const b64 = json.data?.[0]?.b64_json
    if (!b64) throw new Error('b64_json がレスポンスにありません')
    writeFileSync(outPath, Buffer.from(b64, 'base64'))
    console.log(`OK -> ${outPath}`)
    ok++
  } catch (err) {
    console.log(`失敗（スキップ）: ${err.message}`)
    failed++
  }
}
console.log(`\n完了: 成功 ${ok} / スキップ ${skipped} / 失敗 ${failed}`)
