import { getSupabaseAdmin } from '@/lib/supabase'

/**
 * サーバー専用: 外部画像URL → fetch → Supabase Storage → 永続publicURL を返す。
 *
 * Clerk / Google / LINE などの「揮発する外部画像URL」を、Supabase Storage に
 * コピーした永続URLに置き換えるための共通ヘルパー。
 *
 * 設計:
 * - service-role の supabase サーバークライアント（`/api/storage` と同じ実体）を使う。
 *   **クライアントコンポーネントからは絶対にimportしない。**
 * - 例外・失敗（404 / upload失敗 / サイズ超過）は握りつぶして必ず `null` を返す。
 *   呼び出し側はこの `null` を「写真なし」へのフォールバックとして扱う。
 *   写真は付帯処理であり、投票/登録フローを止めてはいけない。
 * - grep しやすいよう、ログ接頭辞は `[IMG_PERSIST]` に統一する。
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB（upload-client-photo と同基準）

export async function persistExternalImage(opts: {
  sourceUrl: string | null | undefined
  bucket: string // 'avatars' | 'client-photos'
  path: string // 例 `${userId}/avatar.jpg` / `photos/migrated-${crypto.randomUUID()}.jpg`
}): Promise<string | null> {
  const { sourceUrl, bucket, path } = opts

  // 1. falsy → null
  if (!sourceUrl) return null

  try {
    // 2. fetch（外部URL）。res.ok でなければ null。
    const res = await fetch(sourceUrl, { cache: 'no-store' })
    if (!res.ok) {
      console.warn('[IMG_PERSIST] fetch failed', { status: res.status, bucket, path })
      return null
    }

    // 3. content-type / arrayBuffer / サイズチェック
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const arrayBuffer = await res.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
      console.warn('[IMG_PERSIST] file too large', { size: arrayBuffer.byteLength, bucket, path })
      return null
    }
    const buffer = Buffer.from(arrayBuffer)

    // 4. `/api/storage` と同じ service-role クライアントで upload
    const supabase = getSupabaseAdmin()
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType,
        cacheControl: '3600',
        upsert: true,
      })

    // 5. 失敗 → null / 成功 → publicUrl（キャッシュバスト付き）
    if (uploadError) {
      console.warn('[IMG_PERSIST] upload failed', { message: uploadError.message, bucket, path })
      return null
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
    if (!urlData?.publicUrl) {
      console.warn('[IMG_PERSIST] no publicUrl', { bucket, path })
      return null
    }

    return `${urlData.publicUrl}?t=${Date.now()}`
  } catch (e) {
    console.warn('[IMG_PERSIST] unexpected error', { error: e instanceof Error ? e.message : String(e), bucket, path })
    return null
  }
}
