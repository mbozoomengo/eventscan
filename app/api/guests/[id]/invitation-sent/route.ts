import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: guestId } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

  const { data: guest } = await supabase
    .from('guests')
    .select('id, event_id')
    .eq('id', guestId)
    .single()

  if (!guest) return NextResponse.json({ error: 'Invité introuvable' }, { status: 404 })

  // Vérifier que l'user est propriétaire de l'event ou admin
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    const { data: ev } = await supabase
      .from('events')
      .select('owner_id')
      .eq('id', guest.event_id)
      .single()
    if (!ev || ev.owner_id !== user.id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
  }

  const { error } = await supabase
    .from('guests')
    .update({ invitation_sent_at: new Date().toISOString() })
    .eq('id', guestId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
