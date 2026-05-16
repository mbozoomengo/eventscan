'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Users, CalendarDays, ScanLine, UserCheck, ShieldCheck, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

function Spin() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Chargement…</p>
      </div>
    </div>
  )
}

type Stats = {
  users: number
  organizers: number
  scanners: number
  events: number
  guests: number
  scans: number
}

type Event = {
  id: string
  name: string
  date: string
  location: string | null
}

function getEventStatus(dateStr: string): { label: string; cls: string } {
  const now = Date.now()
  const d = new Date(dateStr).getTime()
  const diff = d - now
  if (diff > 2 * 60 * 60 * 1000)  return { label: 'À venir',  cls: 'bg-blue-100 text-blue-700' }
  if (diff > -4 * 60 * 60 * 1000) return { label: 'En cours', cls: 'bg-green-100 text-green-700' }
  return { label: 'Passé', cls: 'bg-gray-100 text-gray-500' }
}

export default function AdminDashboard() {
  const [stats,  setStats]  = useState<Stats>({ users: 0, organizers: 0, scanners: 0, events: 0, guests: 0, scans: 0 })
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.replace('/dashboard'); return }

      const [
        { data: profiles, error: errProfiles },
        { count: eventCount, error: errEvents },
        { count: guestCount, error: errGuests },
        { count: scanCount,  error: errScans },
        { data: recentEvents, error: errRecent },
      ] = await Promise.all([
        supabase.from('profiles').select('role'),
        supabase.from('events').select('*', { count: 'exact', head: true }),
        supabase.from('guests').select('*', { count: 'exact', head: true }),
        supabase.from('scan_logs').select('*', { count: 'exact', head: true }).eq('status', 'success'),
        supabase.from('events').select('id, name, date, location').order('created_at', { ascending: false }).limit(8),
      ])

      if (errProfiles || errEvents || errGuests || errScans || errRecent) {
        toast.error('Erreur lors du chargement des données')
      }

      const ps = profiles ?? []
      setStats({
        users:       ps.length,
        organizers:  ps.filter(p => p.role === 'organizer').length,
        scanners:    ps.filter(p => p.role === 'scanner').length,
        events:      eventCount ?? 0,
        guests:      guestCount ?? 0,
        scans:       scanCount  ?? 0,
      })
      setEvents(recentEvents ?? [])
      setLoading(false)
    }
    init()
  }, [])

  if (loading) return <Spin />

  const statCards = [
    { label: 'Événements',   value: stats.events,     icon: CalendarDays, color: 'bg-orange-100 text-orange-600' },
    { label: 'Invités',      value: stats.guests,     icon: Users,        color: 'bg-blue-100 text-blue-600' },
    { label: 'Scans réussis',value: stats.scans,      icon: ScanLine,     color: 'bg-green-100 text-green-600' },
    { label: 'Utilisateurs', value: stats.users,      icon: UserCheck,    color: 'bg-purple-100 text-purple-600' },
    { label: 'Organisateurs',value: stats.organizers, icon: ShieldCheck,  color: 'bg-indigo-100 text-indigo-600' },
    { label: 'Scanners',     value: stats.scanners,   icon: ScanLine,     color: 'bg-gray-100 text-gray-600' },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-10">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Tableau de bord</p>
          <h1 className="text-2xl font-black text-gray-900">Administration</h1>
        </div>
        <Link href="/admin/events/new"
          className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Créer un événement
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="w-4 h-4" />
              </span>
              <span className="text-xs text-gray-500 font-medium">{label}</span>
            </div>
            <p className="text-4xl font-black text-gray-900 leading-none">{value}</p>
          </div>
        ))}
      </div>

      {/* Events list */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Événements récents</h2>
        {events.length === 0 ? (
          <div className="card p-12 text-center">
            <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Aucun événement créé</p>
            <Link href="/admin/events/new" className="btn-primary mt-4 inline-flex items-center gap-1">
              <Plus className="w-4 h-4" /> Créer le premier
            </Link>
          </div>
        ) : (
          events.map(ev => {
            const s = getEventStatus(ev.date)
            return (
              <Link key={ev.id} href={`/admin/events/${ev.id}`}
                className="card p-4 flex items-center justify-between gap-3 hover:border-orange-200 hover:shadow-md transition-all group">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 truncate">{ev.name}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${s.cls}`}>{s.label}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {new Date(ev.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {ev.location ? ` · ${ev.location}` : ''}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400 transition-colors flex-shrink-0" />
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
