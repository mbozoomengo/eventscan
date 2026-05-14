'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Calendar, Users, QrCode, Plus, TrendingUp, LogOut } from 'lucide-react'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [stats, setStats] = useState({ events: 0, guests: 0, checked: 0 })
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUser(user)

      const [{ data: profile }, { data: events }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('events').select('*').eq('owner_id', user.id).order('date', { ascending: false }).limit(10)
      ])

      setProfile(profile)
      setEvents(events ?? [])

      const eventIds = (events ?? []).map((e: any) => e.id)
      if (eventIds.length > 0) {
        const [{ count: guests }, { count: checked }] = await Promise.all([
          supabase.from('guests').select('*', { count: 'exact', head: true }).in('event_id', eventIds),
          supabase.from('guests').select('*', { count: 'exact', head: true }).in('event_id', eventIds).eq('checked_in', true)
        ])
        setStats({ events: events?.length ?? 0, guests: guests ?? 0, checked: checked ?? 0 })
      } else {
        setStats({ events: 0, guests: 0, checked: 0 })
      }
      setLoading(false)
    }
    init()
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-500">Chargement...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <QrCode className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">EventScan</span>
          </div>
          <div className="flex items-center gap-3">
            {profile?.role === 'admin' && (
              <Link href="/admin" className="text-sm text-orange-600 font-medium">Admin</Link>
            )}
            <span className="text-sm text-gray-500 hidden sm:block">{profile?.full_name || user?.email}</span>
            <button onClick={logout} className="btn-secondary text-sm py-1.5 flex items-center gap-1">
              <LogOut className="w-3.5 h-3.5" /> Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="card p-5 flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-orange-600" />
            </div>
            <div><p className="text-xl font-bold">{stats.events}</p><p className="text-xs text-gray-500">Événements</p></div>
          </div>
          <div className="card p-5 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div><p className="text-xl font-bold">{stats.guests}</p><p className="text-xs text-gray-500">Invités</p></div>
          </div>
          <div className="card p-5 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div><p className="text-xl font-bold">{stats.checked}</p><p className="text-xs text-gray-500">Présents</p></div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Mes événements</h2>
          <Link href="/dashboard/events/new" className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Nouvel événement
          </Link>
        </div>

        {events.length === 0 ? (
          <div className="card p-12 text-center">
            <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Aucun événement</p>
            <Link href="/dashboard/events/new" className="btn-primary inline-flex items-center gap-2 mt-4 text-sm">
              <Plus className="w-4 h-4" /> Créer un événement
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map(event => (
              <div key={event.id} className="card p-4 flex items-center justify-between">
                <Link href={`/dashboard/events/${event.id}`} className="flex-1">
                  <p className="font-medium text-gray-900">{event.name}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(event.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {event.location ? ` · ${event.location}` : ''}
                  </p>
                </Link>
                <Link href={`/dashboard/events/${event.id}/scan`} className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1">
                  <QrCode className="w-3.5 h-3.5" /> Scanner
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
