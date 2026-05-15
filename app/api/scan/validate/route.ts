import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'organizer', 'scanner'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { qr_token, event_id } = await request.json()
  if (!qr_token || !event_id) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

  // Scanner: vérifier qu'il n'est pas bloqué
  if (profile?.role === 'scanner') {
    const { data: teamEntry } = await supabase
      .from('event_team')
      .select('is_blocked')
      .eq('user_id', user.id)
      .eq('event_id', event_id)
      .single()
    if (!teamEntry) return NextResponse.json({ error: 'Non assigné à cet événement' }, { status: 403 })
    if (teamEntry.is_blocked) return NextResponse.json({ error: 'Scanner bloqué', blocked: true }, { status: 403 })
  }

  // Chercher l'invité
  const { data: guest } = await supabase
    .from('guests')
    .select('id, full_name, category, table_name, checked_in, checked_in_at, event_id')
    .eq('qr_token', qr_token)
    .single()

  if (!guest || guest.event_id !== event_id) {
    return NextResponse.json({ status: 'invalid', message: 'QR invalide ou mauvais événement' })
  }

  if (guest.checked_in) {
    await supabase.from('scan_logs').insert({
      guest_id: guest.id,
      event_id,
      status: 'already_scanned',
      scanned_by: user.id,
    })
    return NextResponse.json({
      status: 'already_scanned',
      guest,
      first_scan_at: guest.checked_in_at,
    })
  }

  // Succès : marquer présent
  await supabase.from('guests').update({
    checked_in: true,
    checked_in_at: new Date().toISOString(),
  }).eq('id', guest.id)

  await supabase.from('scan_logs').insert({
    guest_id: guest.id,
    event_id,
    status: 'success',
    scanned_by: user.id,
  })

  return NextResponse.json({ status: 'success', guest })
}
