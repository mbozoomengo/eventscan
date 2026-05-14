import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // Utiliser le service role pour tout (bypass RLS)
  const adminSupabase = await createAdminClient()

  // Vérifier le token
  const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token)
  if (userError || !user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

  // Vérifier le rôle via service role (bypass RLS)
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: `Accès refusé (role=${profile?.role})` }, { status: 403 })
  }

  const { email, password, full_name, role, event_id } = await request.json()
  if (!email || !password || !full_name) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  if (role === 'scanner' && !event_id) return NextResponse.json({ error: 'Événement requis pour scanner' }, { status: 400 })

  // Créer l'utilisateur
  const { data, error } = await adminSupabase.auth.admin.createUser({
    email, password,
    email_confirm: true,
    user_metadata: { full_name, role: role || 'organizer' },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Assigner l'événement si scanner
  if (role === 'scanner' && event_id && data.user) {
    await adminSupabase.from('event_access').insert({
      user_id: data.user.id,
      event_id,
    })
  }

  return NextResponse.json({ user: data.user }, { status: 201 })
}
