import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Calendar, Users, QrCode, Plus, TrendingUp } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Stats
  const { data: events } = await supabase
    .from('events')
    .select('id, name, date, location')
    .eq('owner_id', user.id)
    .order('date', { ascending: false })
    .limit(5)

  const { count: totalEvents } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', user.id)

  const eventIds = events?.map(e => e.id) || []
  
  const { count: totalGuests } = await supabase
    .from('guests')
    .select('*', { count: 'exact', head: true })
    .in('event_id', eventIds.length > 0 ? eventIds : ['none'])

  const { count: checkedIn } = await supabase
    .from('guests')
    .select('*', { count: 'exact', head: true })
    .in('event_id', eventIds.length > 0 ? eventIds : ['none'])
    .eq('checked_in', true)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <QrCode className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">EventScan</span>
          </div>
          <div className="flex items-center gap-3">
            {profile?.role === 'admin' && (
              <Link href="/admin" className="text-sm text-orange-600 hover:text-orange-700 font-medium">
                Admin
              </Link>
            )}
            <span className="text-sm text-gray-500">{profile?.full_name || user.email}</span>
            <Link href="/api/auth/logout" className="btn-secondary text-sm py-1.5">
              Déconnexion
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="card p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <Calendar className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalEvents || 0}</p>
              <p className="text-sm text-gray-500">Événements</p>
            </div>
          </div>
          <div className="card p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalGuests || 0}</p>
              <p className="text-sm text-gray-500">Invités total</p>
            </div>
          </div>
          <div className="card p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{checkedIn || 0}</p>
              <p className="text-sm text-gray-500">Présents</p>
            </div>
          </div>
        </div>

        {/* Events */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Mes événements</h2>
          <Link href="/dashboard/events/new" className="btn-primary flex items-center gap-2 text-sm py-2">
            <Plus className="w-4 h-4" />
            Nouvel événement
          </Link>
        </div>

        {events && events.length > 0 ? (
          <div className="space-y-3">
            {events.map(event => (
              <Link key={event.id} href={`/dashboard/events/${event.id}`}>
                <div className="card p-4 hover:shadow-md transition-shadow flex items-center justify-between cursor-pointer">
                  <div>
                    <h3 className="font-medium text-gray-900">{event.name}</h3>
                    <p className="text-sm text-gray-500">
                      {new Date(event.date).toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                      {event.location && ` · ${event.location}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/events/${event.id}/scan`}
                      className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1"
                      onClick={e => e.stopPropagation()}
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Scanner
                    </Link>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Aucun événement pour l&apos;instant</p>
            <Link href="/dashboard/events/new" className="btn-primary inline-flex items-center gap-2 mt-4 text-sm">
              <Plus className="w-4 h-4" />
              Créer un événement
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
