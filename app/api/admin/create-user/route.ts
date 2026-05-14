import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createBrowserClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  // Lire le token depuis le header Authorization
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Vérifier le token et le rôle via Supabase
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: userError } = await supabase.auth.getUser(token)

  if (userError || !user) {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }

  // Vérifier le rôle admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { email, password, full_name, role, event_id } = await request.json()

  if (!email || !password || !full_name) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }
  if (role === 'scanner' && !event_id) {
    return NextResponse.json({ error: 'Événement requis pour le rôle scanner' }, { status: 400 })
  }

  // Créer l'utilisateur avec service role
  const adminSupabase = await createAdminClient()
  const { data, error } = await adminSupabase.auth.admin.createUser({
    email, password,
    email_confirm: true,
    user_metadata: { full_name, role: role || 'organizer' },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Si scanner, créer l'accès à l'événement
  if (role === 'scanner' && event_id && data.user) {
    await adminSupabase.from('event_access').insert({
      user_id: data.user.id,
      event_id,
    })
  }

  return NextResponse.json({ user: data.user }, { status: 201 })
}
