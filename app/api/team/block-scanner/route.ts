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

  const { event_team_id, is_blocked } = await request.json()
  if (event_team_id === undefined || is_blocked === undefined) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  // Organisateur: vérifier qu'il est bien responsable de cet event
  if (profile?.role === 'organizer') {
    const { data: entry } = await supabase.from('event_team').select('event_id').eq('id', event_team_id).single()
    if (!entry) return NextResponse.json({ error: 'Entrée introuvable' }, { status: 404 })
    const { data: orgEntry } = await supabase
      .from('event_team')
      .select('id')
      .eq('event_id', entry.event_id)
      .eq('user_id', user.id)
      .eq('role', 'organizer')
      .single()
    if (!orgEntry) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const { error } = await supabase.from('event_team').update({ is_blocked }).eq('id', event_team_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
