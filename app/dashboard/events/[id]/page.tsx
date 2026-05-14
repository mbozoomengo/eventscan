'use client'

import { use, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Upload, QrCode, CheckCircle, Clock, Users } from 'lucide-react'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

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

  const shareOnWhatsApp = (guestId: string, guestName: string) => {
    const qrUrl = `${SITE_URL}/api/guests/${guestId}/qr`
    const msg = encodeURIComponent(`Voici votre invitation QR code pour ${event.name} :\n${qrUrl}`)
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

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
                    <button
                      onClick={() => shareOnWhatsApp(g.id, g.full_name)}
                      className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
                      title="Partager sur WhatsApp">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      WA
                    </button>
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
