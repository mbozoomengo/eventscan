import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

  const { data: teamEntry } = await supabase
    .from('event_team')
    .select('event_id')
    .eq('user_id', user.id)
    .eq('role', 'scanner')
    .single()

  if (!teamEntry) return NextResponse.json({ error: 'Aucun événement assigné' }, { status: 403 })

  const { data: guests } = await supabase
    .from('guests')
    .select('id, full_name, category, table_name, checked_in, qr_token, event_id')
    .eq('event_id', teamEntry.event_id)

  return NextResponse.json(guests ?? [])
}
