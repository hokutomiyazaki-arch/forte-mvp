import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'invalid' })

  const supabase = getSupabaseAdmin()
  const { data: level } = await supabase
    .from('credential_levels')
    .select('id, name, description, image_url, organization_id, organizations(name)')
    .eq('id', id)
    .maybeSingle()

  if (!level) return NextResponse.json({ error: 'invalid' })

  return NextResponse.json({
    badge: {
      name: level.name,
      description: level.description,
      image_url: level.image_url,
      org_name: (level.organizations as any)?.name || '',
      org_id: level.organization_id,
    }
  })
}
