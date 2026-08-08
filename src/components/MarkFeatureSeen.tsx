'use client'

import { useEffect } from 'react'
import { markFeatureSeen } from '@/lib/new-feature-seen'

/**
 * 置いたページを開いた時点で New マークを既読にする（CEO恒久ルール 2026-08-08）。
 * Server Component のページにも1行で置けるよう、描画なしの client component にしている。
 */
export default function MarkFeatureSeen({ id }: { id: string }) {
  useEffect(() => {
    markFeatureSeen(id)
  }, [id])
  return null
}
