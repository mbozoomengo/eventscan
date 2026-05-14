'use client'

import { use, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Upload, QrCode, CheckCircle, Clock, Users } from 'lucide-react'

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [event, setEvent] = useState<any>(null)
  const [guests, setGuests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const [{ data: ev }, { data: gs }] = await Promise.all([
        supabase.from('events').select('*').eq('id', id).single(),
        supabase.from('guests').select('*').eq('event_id', id).order('category').order('full_name')
      ])
      if (!ev) { router.replace('/dashboard'); return }
      setEvent(ev)
      setGuests(gs ?? [])
      setLoading(false)
    }
    init()
  }, [id])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>

  const total = guests.length
  const checked = guests.filter(g => g.checked_in).length
  const grouped = guests.reduce((acc, g) => {
    const cat = g.category ?? 'Sans catégorie'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(g)
    return acc
  }, {} as Record<string, any[]>)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="font-bold text-lg text-gray-900">{event.name}</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6 ml-8">
        {new Date(event.date).toLocaleString('fr-FR')}{event.location ? ` · ${event.location}` : ''}
      </p>
      <div className="flex gap-4 mb-6 text-sm">
        <span className="flex items-center gap-1 text-gray-600"><Users className="w-4 h-4" /> {total} invités</span>
        <span className="flex items-center gap-1 text-green-600"><CheckCircle className="w-4 h-4" /> {checked} présents</span>
        <span className="flex items-center gap-1 text-orange-500"><Clock className="w-4 h-4" /> {total - checked} en attente</span>
      </div>
      <div className="flex gap-3 mb-6">
        <Link href={`/dashboard/events/${id}/guests`} className="btn-secondary text-sm flex items-center gap-1">
          <Upload className="w-4 h-4" /> Importer
        </Link>
        <Link href={`/dashboard/events/${id}/scan`} className="btn-primary text-sm flex items-center gap-1">
          <QrCode className="w-4 h-4" /> Scanner
        </Link>
      </div>
      {total === 0 ? (
        <p className="text-gray-400 text-sm text-center py-12">Aucun invité — importez votre liste.</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat} className="card overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex justify-between">
                <span className="text-sm font-medium text-gray-700">{cat}</span>
                <span className="text-xs text-gray-400">{list.length} pers.</span>
              </div>
              {list.map((g: any) => (
                <div key={g.id} className="px-4 py-3 flex items-center justify-between border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{g.full_name}</p>
                    {g.table_name && <p className="text-xs text-gray-400">{g.table_name}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={g.checked_in ? 'badge-success' : 'badge-warning'}>{g.checked_in ? '✓' : '…'}</span>
                    <a href={`/api/guests/${g.id}/qr`} target="_blank" rel="noreferrer"
                      className="text-xs text-orange-500 hover:text-orange-700 flex items-center gap-1">
                      <QrCode className="w-3.5 h-3.5" /> QR
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
