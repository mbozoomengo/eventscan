'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function ScannerGuestsPage() {
  const [guests, setGuests] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [eventId, setEventId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const loadGuests = useCallback(async (evId: string) => {
    const { data } = await supabase
      .from('guests')
      .select('id, full_name, category, table_name, checked_in')
      .eq('event_id', evId)
      .eq('checked_in', true)
      .order('full_name')
    setGuests(data ?? [])
    setFiltered(data ?? [])
  }, [supabase])

  useEffect(() => {
    let channel: any = null
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'scanner') { router.replace('/login'); return }

      const { data: teamEntry } = await supabase
        .from('event_team').select('event_id').eq('user_id', user.id).eq('role', 'scanner').single()
      if (!teamEntry) { router.replace('/scanner'); return }

      setEventId(teamEntry.event_id)
      await loadGuests(teamEntry.event_id)
      setLoading(false)

      // Realtime : mise à jour auto quand un invité est scanné
      channel = supabase
        .channel(`guests_checkin:${teamEntry.event_id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'guests',
          filter: `event_id=eq.${teamEntry.event_id}`,
        }, () => { loadGuests(teamEntry.event_id) })
        .subscribe()
    }
    init()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (!search) { setFiltered(guests); return }
    const q = search.toLowerCase()
    setFiltered(guests.filter(g =>
      g.full_name.toLowerCase().includes(q) ||
      g.category?.toLowerCase().includes(q)
    ))
  }, [search, guests])

  if (loading) return <Spin />

  return (
    <>
      <div className="mb-4">
        <h1 className="text-lg font-bold">Invités présents ({guests.length})</h1>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="Rechercher..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="space-y-2">
        {filtered.map(g => (
          <div key={g.id} className="bg-gray-800 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{g.full_name}</p>
              {g.category && (
                <p className="text-xs text-gray-400">
                  {g.category}{g.table_name ? ` · ${g.table_name}` : ''}
                </p>
              )}
            </div>
            <span className="text-xs bg-green-800 text-green-300 font-medium px-2 py-0.5 rounded-full">✓</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-10">
            {search ? 'Aucun résultat' : 'Aucun invité scanné'}
          </p>
        )}
      </div>
    </>
  )
}
