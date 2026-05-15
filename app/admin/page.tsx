'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({ users: 0, organizers: 0, scanners: 0, events: 0, guests: 0, scans: 0 })
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.replace('/dashboard'); return }

      const [
        { data: profiles },
        { count: eventCount },
        { count: guestCount },
        { count: scanCount },
        { data: recentEvents },
      ] = await Promise.all([
        supabase.from('profiles').select('role'),
        supabase.from('events').select('*', { count: 'exact', head: true }),
        supabase.from('guests').select('*', { count: 'exact', head: true }),
        supabase.from('scan_logs').select('*', { count: 'exact', head: true }).eq('status', 'success').neq('deleted', true),
        supabase.from('events').select('id, name, date, location').order('created_at', { ascending: false }).limit(8),
      ])

      const ps = profiles ?? []
      setStats({
        users: ps.length,
        organizers: ps.filter((p: any) => p.role === 'organizer').length,
        scanners: ps.filter((p: any) => p.role === 'scanner').length,
        events: eventCount ?? 0,
        guests: guestCount ?? 0,
        scans: scanCount ?? 0,
      })
      setEvents(recentEvents ?? [])
      setLoading(false)
    }
    init()
  }, [])

  if (loading) return <Spin />

  return (
    <>
      <h1 className="text-xl font-bold mb-6">Tableau de bord</h1>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Événements',   value: stats.events },
          { label: 'Invités total', value: stats.guests },
          { label: 'Scans réussis', value: stats.scans },
          { label: 'Utilisateurs',  value: stats.users },
          { label: 'Organisateurs', value: stats.organizers },
          { label: 'Scanners',      value: stats.scanners },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Événements récents</h2>
        <Link href="/admin/events/new"
          className="bg-orange-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-1">
          <Plus className="w-4 h-4" /> Créer
        </Link>
      </div>
      <div className="space-y-2">
        {events.map(ev => (
          <Link key={ev.id} href={`/admin/events/${ev.id}`}
            className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:border-orange-200 transition-colors block">
            <div>
              <p className="font-medium text-gray-900">{ev.name}</p>
              <p className="text-sm text-gray-500">
                {new Date(ev.date).toLocaleDateString('fr-FR')}
                {ev.location ? ` · ${ev.location}` : ''}
              </p>
            </div>
            <span className="text-orange-500 text-sm font-medium">Gérer →</span>
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
