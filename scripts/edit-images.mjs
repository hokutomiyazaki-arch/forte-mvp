#!/usr/bin/env node
/**
 * 汎用画像編集ツール（OpenAI images.edit・gpt-image系）
 * 既存画像を保ったままプロンプトで変換する（lineart.py のJS版・追加パッケージ不要）。
 *
 * 使い方: node scripts/edit-images.mjs <inputDir> <outputDir> "<prompt>" [quality]
 * 出力先に同名ファイルがあればスキップ（再実行安全）。キーは環境変数 OPENAI_API_KEY。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { join, resolve, extname, basename } from 'path'

const MODEL = 'gpt-image-2'
const [, , inputDir, outputDir, prompt, quality = 'medium', background = ''] = process.argv
if (!inputDir || !outputDir || !prompt) {
  console.error('usage: node scripts/edit-images.mjs <inputDir> <outputDir> "<prompt>" [quality]')
  process.exit(1)
}
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) { console.error('OPENAI_API_KEY 未設定'); process.exit(1) }

const outDir = resolve(outputDir)
mkdirSync(outDir, { recursive: true })
const files = readdirSync(resolve(inputDir)).filter((f) => ['.png', '.jpg', '.jpeg', '.webp'].includes(extname(f).toLowerCase()))
if (files.length === 0) { console.error('入力画像なし'); process.exit(1) }

let ok = 0, skipped = 0, failed = 0
for (const [i, file] of files.entries()) {
  const outPath = join(outDir, `${basename(file, extname(file))}.png`)
  if (existsSync(outPath)) { console.log(`[${i + 1}/${files.length}] ${file} ... スキップ(既存)`); skipped++; continue }
  process.stdout.write(`[${i + 1}/${files.length}] ${file} ... `)
  try {
    const form = new FormData()
    form.append('model', MODEL)
    form.append('prompt', prompt)
    form.append('quality', quality)
    if (background) form.append('background', background)
    const buf = readFileSync(join(resolve(inputDir), file))
    form.append('image', new Blob([buf], { type: 'image/png' }), file)
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: form,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = await res.json()
    const b64 = json.data?.[0]?.b64_json
    if (!b64) throw new Error('b64_json なし')
    writeFileSync(outPath, Buffer.from(b64, 'base64'))
    console.log('OK')
    ok++
  } catch (err) {
    console.log(`失敗: ${err.message}`)
    failed++
  }
}
console.log(`\n完了: 成功 ${ok} / スキップ ${skipped} / 失敗 ${failed}`)
