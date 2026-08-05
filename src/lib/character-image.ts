/**
 * タイプ分析キャラクター画像の性別出し分け(2026-08-05・CEO承認)。
 *
 * personality_items.image_url は素の未設定パス（例: /images/personality-types/adventurer.png）。
 * プロが professionals.character_gender ('male'|'female'|null) を設定していれば、
 * 同じファイル名の性別サブフォルダ (/images/personality-types/{gender}/{basename}) に差し替える。
 *
 * fail-soft: character_gender が未設定(null/undefined)・想定外の値・imageUrl が
 * personality-types 配下以外のパスの場合は、渡された imageUrl をそのまま返す。
 * professionals.character_gender カラムが未作成の環境でも select('*') はサイレントに
 * undefined を返すだけなので、この関数は例外を投げない。
 */

const PERSONALITY_TYPES_DIR = '/images/personality-types/'

export function resolveCharacterImageUrl(
  imageUrl: string | null | undefined,
  characterGender: string | null | undefined
): string | null {
  if (!imageUrl) return null
  if (characterGender !== 'male' && characterGender !== 'female') return imageUrl
  if (!imageUrl.startsWith(PERSONALITY_TYPES_DIR)) return imageUrl

  const basename = imageUrl.slice(PERSONALITY_TYPES_DIR.length)
  // 既に性別サブフォルダ配下(想定外の二重変換)は素通し
  if (basename.startsWith('male/') || basename.startsWith('female/')) return imageUrl
  if (!basename) return imageUrl

  return `${PERSONALITY_TYPES_DIR}${characterGender}/${basename}`
}
