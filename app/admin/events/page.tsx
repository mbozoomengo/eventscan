'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Calendar, Users } from 'lucide-react'
import toast from 'react-hot-toast'

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

type EventWithCount = { id: string; name: string; date: string; location: string | null; guestCount: number }

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.replace('/dashboard'); return }

      const { data: evs, error } = await supabase
        .from('events').select('id, name, date, location').order('date', { ascending: false }).limit(50)
      if (error) { toast.error('Erreur lors du chargement des événements'); setLoading(false); return }
      if (!evs) { setLoading(false); return }

      const eventsWithCount = await Promise.all(
        evs.map(async ev => {
          const { count } = await supabase.from('guests').select('*', { count: 'exact', head: true }).eq('event_id', ev.id)
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
        <Link href="/admin/events/new" className="btn-primary text-sm flex items-center gap-1">
          <Plus className="w-4 h-4" /> Créer
        </Link>
      </div>
      <div className="space-y-3">
        {events.map(ev => (
          <Link key={ev.id} href={`/admin/events/${ev.id}`}
            className="card p-4 flex items-center justify-between hover:border-blue-200 transition-colors block">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{ev.name}</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {new Date(ev.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {ev.location ? ` · ${ev.location}` : ''}
                </p>
                <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  <Users className="w-3 h-3" /> {ev.guestCount} invités
                </p>
              </div>
            </div>
            <span className="text-blue-600 text-sm font-medium flex-shrink-0">Gérer →</span>
          </Link>
        ))}
        {events.length === 0 && (
          <div className="card p-12 text-center" style={{ color: 'var(--text-muted)' }}>Aucun événement</div>
        )}
      </div>
    </>
  )
}
