import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users, QrCode, Upload, CheckCircle, Clock } from 'lucide-react'

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!event) notFound()

  const { data: guests } = await supabase
    .from('guests')
    .select('*')
    .eq('event_id', params.id)
    .order('category', { ascending: true })
    .order('full_name', { ascending: true })

  const total = guests?.length || 0
  const checkedIn = guests?.filter(g => g.checked_in).length || 0
  const pending = total - checkedIn

  // Grouper par catégorie
  const grouped = (guests || []).reduce((acc, g) => {
    const cat = g.category || 'Sans catégorie'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(g)
    return acc
  }, {} as Record<string, typeof guests>)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-semibold text-gray-900 truncate">{event.name}</h1>
          </div>
          <p className="text-sm text-gray-500 ml-8">
            {new Date(event.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {event.location && ` · ${event.location}`}
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{total}</p>
            <p className="text-xs text-gray-500 flex items-center justify-center gap-1 mt-1">
              <Users className="w-3 h-3" /> Total
            </p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{checkedIn}</p>
            <p className="text-xs text-gray-500 flex items-center justify-center gap-1 mt-1">
              <CheckCircle className="w-3 h-3" /> Présents
            </p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-orange-500">{pending}</p>
            <p className="text-xs text-gray-500 flex items-center justify-center gap-1 mt-1">
              <Clock className="w-3 h-3" /> En attente
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-6">
          <Link href={`/dashboard/events/${event.id}/guests`} className="btn-secondary flex items-center gap-2 text-sm">
            <Upload className="w-4 h-4" />
            Importer invités
          </Link>
          <Link href={`/dashboard/events/${event.id}/scan`} className="btn-primary flex items-center gap-2 text-sm">
            <QrCode className="w-4 h-4" />
            Scanner QR
          </Link>
        </div>

        {/* Guest list by category */}
        {total === 0 ? (
          <div className="card p-10 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Aucun invité. Importez votre liste CSV/Excel.</p>
            <Link href={`/dashboard/events/${event.id}/guests`} className="btn-primary inline-flex items-center gap-2 mt-4 text-sm">
              <Upload className="w-4 h-4" />
              Importer invités
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([category, guestList]) => (
              <div key={category} className="card overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="font-medium text-gray-700 text-sm">{category}</h3>
                  <span className="text-xs text-gray-500">{guestList?.length} personne(s)</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {guestList?.map(guest => (
                    <div key={guest.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{guest.full_name}</p>
                        {guest.table_name && (
                          <p className="text-xs text-gray-500">{guest.table_name}</p>
                        )}
                      </div>
                      <span className={guest.checked_in ? 'badge-success' : 'badge-warning'}>
                        {guest.checked_in ? '✓ Présent' : 'En attente'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
