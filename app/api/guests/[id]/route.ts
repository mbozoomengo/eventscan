import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
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

  const { id } = params

  // Vérifier que le guest existe
  const { data: guest } = await supabase
    .from('guests')
    .select('id, event_id')
    .eq('id', id)
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

  // Les scan_logs sont supprimés en cascade (ON DELETE CASCADE dans le schema)
  const { error: deleteError } = await supabase
    .from('guests')
    .delete()
    .eq('id', id)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
