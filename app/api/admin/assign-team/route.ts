import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { action, event_id, organizer_id, scanner_id, team_id } = await request.json()

  if (action === 'set_organizer') {
    if (!event_id || !organizer_id) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

    // Vérifier que l'organisateur n'est pas déjà assigné ailleurs
    const { data: existing } = await supabase
      .from('event_team')
      .select('event_id')
      .eq('user_id', organizer_id)
      .eq('role', 'organizer')
      .neq('event_id', event_id)
      .maybeSingle()
    if (existing) {
      return NextResponse.json(
        { error: 'Cet organisateur est déjà assigné à un autre événement' },
        { status: 409 }
      )
    }

    // Retirer l'ancien organisateur de cet event si nécessaire
    await supabase.from('event_team').delete().eq('event_id', event_id).eq('role', 'organizer')

    // Insérer le nouvel organisateur
    const { error } = await supabase.from('event_team').insert({ event_id, user_id: organizer_id, role: 'organizer' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  if (action === 'add_scanner') {
    if (!event_id || !scanner_id) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

    const { count } = await supabase
      .from('event_team')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', event_id)
      .eq('role', 'scanner')
    if ((count ?? 0) >= 10) {
      return NextResponse.json({ error: 'Maximum 10 scanners par événement' }, { status: 400 })
    }

    const { error } = await supabase.from('event_team').insert({ event_id, user_id: scanner_id, role: 'scanner' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  if (action === 'remove_member') {
    if (!team_id) return NextResponse.json({ error: 'team_id requis' }, { status: 400 })
    const { error } = await supabase.from('event_team').delete().eq('id', team_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
}
