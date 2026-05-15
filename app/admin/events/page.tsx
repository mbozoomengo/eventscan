'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Calendar, Users } from 'lucide-react'

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

type EventWithCount = {
  id: string
  name: string
  date: string
  location: string | null
  guestCount: number
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.replace('/dashboard'); return }

      // Remplace guests(count) — requête embedded non supportée sans foreign key explicite
      const { data: evs } = await supabase
        .from('events')
        .select('id, name, date, location')
        .order('date', { ascending: false })

      if (!evs) { setLoading(false); return }

      // Récupère les counts d'invités séparément
      const eventsWithCount = await Promise.all(
        evs.map(async (ev) => {
          const { count } = await supabase
            .from('guests')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', ev.id)
          return { ...ev, guestCount: count ?? 0 }
        })
      )

      setEvents(eventsWithCount)
      setLoading(false)
    }
    init()
  }, [])

  if (loading) return <Spin />

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Événements ({events.length})</h1>
        <Link href="/admin/events/new"
          className="bg-orange-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-1">
          <Plus className="w-4 h-4" /> Créer
        </Link>
      </div>
      <div className="space-y-3">
        {events.map(ev => (
          <Link key={ev.id} href={`/admin/events/${ev.id}`}
            className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:border-orange-200 transition-colors block shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Calendar className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{ev.name}</p>
                <p className="text-sm text-gray-500">
                  {new Date(ev.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {ev.location ? ` · ${ev.location}` : ''}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {ev.guestCount} invités
                </p>
              </div>
            </div>
            <span className="text-orange-500 text-sm font-medium flex-shrink-0">Gérer →</span>
          </Link>
        ))}
        {events.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
            Aucun événement
          </div>
        )}
      </div>
    </>
  )
}
