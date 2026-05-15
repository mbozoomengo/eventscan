import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'organizer'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { scan_log_id } = await request.json()
  if (!scan_log_id) return NextResponse.json({ error: 'scan_log_id requis' }, { status: 400 })

  const { error } = await supabase.from('scan_logs').update({
    deleted: true,
    deleted_at: new Date().toISOString(),
    deleted_by: user.id,
  }).eq('id', scan_log_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
