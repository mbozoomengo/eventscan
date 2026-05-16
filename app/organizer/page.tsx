'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Users, Upload, QrCode, Clock } from 'lucide-react'

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function OrganizerDashboard() {
  const [event, setEvent] = useState<any>(null)
  const [stats, setStats] = useState({ total: 0, checked: 0 })
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!profile || !['organizer', 'admin'].includes(profile.role)) { router.replace('/login'); return }

      const { data: teamEntry } = await supabase
        .from('event_team')
        .select('event_id, events(id, name, date, location, description)')
        .eq('user_id', user.id)
        .eq('role', 'organizer')
        .single()

      if (!teamEntry) {
        toast.error('Aucun événement assigné')
        setLoading(false)
        return
      }
      const ev = (teamEntry as any).events
      setEvent(ev)

      const [{ count: total }, { count: checked }] = await Promise.all([
        supabase.from('guests').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
        supabase.from('guests').select('*', { count: 'exact', head: true }).eq('event_id', ev.id).eq('checked_in', true),
      ])
      setStats({ total: total ?? 0, checked: checked ?? 0 })
      setLoading(false)
    }
    init()
  }, [])

  if (loading) return <Spin />

  if (!event) return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
      Aucun événement assigné. Contactez un administrateur.
    </div>
  )

  const pct = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">{event?.name}</h1>
        <p className="text-sm text-gray-500">
          {event ? new Date(event.date).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
          {event?.location ? ` · ${event.location}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-gray-500">Invités</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-2xl font-bold text-green-600">{stats.checked}</p>
          <p className="text-xs text-gray-500">Présents</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-2xl font-bold text-orange-500">{pct}%</p>
          <p className="text-xs text-gray-500">Présence</p>
        </div>
      </div>

      {stats.total > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 shadow-sm">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600">Progression entrées</span>
            <span className="font-medium">{stats.checked}/{stats.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {[
          { href: '/organizer/guests/import', icon: Upload,    color: 'text-orange-500', label: 'Importer invités' },
          { href: '/organizer/guests',        icon: Users,     color: 'text-blue-500',   label: 'Gérer invités' },
          { href: '/organizer/scan',          icon: QrCode,    color: 'text-green-500',  label: 'Scanner QR' },
          { href: '/organizer/scan-history',  icon: Clock,     color: 'text-purple-500', label: 'Historique scans' },
        ].map(({ href, icon: Icon, color, label }) => (
          <Link key={href} href={href}
            className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 hover:border-orange-200 hover:shadow-sm transition-all">
            <Icon className={`w-5 h-5 ${color}`} />
            <span className="text-sm font-medium">{label}</span>
          </Link>
        ))}
      </div>
    </>
  )
}
