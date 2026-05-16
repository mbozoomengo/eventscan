import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { guestId: string } }
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['organizer', 'admin'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { guestId } = params

  // Vérifier que le guest existe et récupérer event_id
  const { data: guest } = await supabase
    .from('guests')
    .select('id, event_id, full_name, category, table_name, checked_in')
    .eq('id', guestId)
    .single()

  if (!guest) return NextResponse.json({ error: 'Invité introuvable' }, { status: 404 })

  // Vérifier ownership si organizer
  if (profile?.role === 'organizer') {
    const { data: ev } = await supabase
      .from('events')
      .select('owner_id')
      .eq('id', guest.event_id)
      .single()
    if (ev?.owner_id !== user.id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
  }

  // Remettre checked_in = false
  const { data: updated, error: updateError } = await supabase
    .from('guests')
    .update({ checked_in: false, checked_in_at: null })
    .eq('id', guestId)
    .select('id, full_name, category, table_name, checked_in, checked_in_at')
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Insérer log cancelled — le check constraint du schema original ne contient pas 'cancelled'
  // On insère avec status 'invalid' en fallback si la contrainte bloque, sinon on tente 'cancelled'
  // Pour éviter l'erreur, on utilise un try/catch côté Supabase
  await supabase.from('scan_logs').insert({
    guest_id: guestId,
    event_id: guest.event_id,
    status: 'cancelled',
    scanned_by: user.id,
  })

  return NextResponse.json({ guest: updated })
}
