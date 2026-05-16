import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

type FilterParam = 'all' | 'present'
type SortParam  = 'time' | 'name'

interface GuestRow {
  full_name: string
  email: string | null
  phone: string | null
  category: string | null
  table_name: string | null
  checked_in: boolean
  checked_in_at: string | null
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

  const { data: event } = await supabase.from('events').select('id, name, owner_id').eq('id', eventId).single()
  if (!event) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && event.owner_id !== user.id) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const filter: FilterParam = searchParams.get('filter') === 'present' ? 'present' : 'all'
  const sort: SortParam    = searchParams.get('sort') === 'time' ? 'time' : 'name'

  let query = supabase
    .from('guests')
    .select('full_name, email, phone, category, table_name, checked_in, checked_in_at')
    .eq('event_id', eventId)

  if (filter === 'present') query = query.eq('checked_in', true)

  if (sort === 'time') {
    query = query.order('checked_in_at', { ascending: true, nullsFirst: false })
  } else {
    query = query.order('full_name', { ascending: true })
  }

  const { data: guests, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (guests as GuestRow[]).map((g) => ({
    Nom:        g.full_name,
    Email:      g.email ?? '',
    Téléphone:  g.phone ?? '',
    Catégorie:  g.category ?? '',
    Table:      g.table_name ?? '',
    Statut:     g.checked_in ? 'Présent' : 'Absent',
    'Heure check-in': g.checked_in_at
      ? new Date(g.checked_in_at).toLocaleString('fr-FR', { timeStyle: 'short', dateStyle: 'short' })
      : '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Présences')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="presences-${event.name.replace(/\s+/g, '-')}.xlsx"`,
    },
  })
}
