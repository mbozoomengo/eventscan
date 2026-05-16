'use client'

import { use, useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Upload, QrCode, CheckCircle, Clock, Users } from 'lucide-react'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
const SLOT_MINUTES = 30

interface Guest {
  id: string
  full_name: string
  category: string | null
  table_name: string | null
  checked_in: boolean
  checked_in_at: string | null
}

interface Event {
  id: string
  name: string
  date: string
  location: string | null
}

interface Slot { label: string; count: number }

function buildSlots(guests: Guest[]): Slot[] {
  const arrivals = guests
    .filter(g => g.checked_in && g.checked_in_at)
    .map(g => new Date(g.checked_in_at!).getTime())

  if (arrivals.length === 0) return []

  const min = Math.min(...arrivals)
  const max = Math.max(...arrivals)
  const slotMs = SLOT_MINUTES * 60 * 1000
  const slots: Slot[] = []

  for (let t = Math.floor(min / slotMs) * slotMs; t <= max; t += slotMs) {
    const count = arrivals.filter(a => a >= t && a < t + slotMs).length
    const d = new Date(t)
    const label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    slots.push({ label, count })
  }
  return slots
}

function ArrivalsChart({ slots }: { slots: Slot[] }) {
  if (slots.length === 0) return (
    <p className="text-xs text-gray-400 text-center py-6">Aucune arrivée enregistrée</p>
  )

  const W = 480
  const H = 120
  const PAD = { top: 8, right: 12, bottom: 28, left: 28 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom
  const maxCount = Math.max(...slots.map(s => s.count), 1)
  const barW = Math.max(4, chartW / slots.length - 4)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Courbe arrivées">
      {/* Gridlines */}
      {[0, 0.5, 1].map((r) => {
        const y = PAD.top + chartH * (1 - r)
        return (
          <g key={r}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
              stroke="#E5E7EB" strokeWidth={1} />
            <text x={PAD.left - 4} y={y + 4} fontSize={8} fill="#9CA3AF" textAnchor="end">
              {Math.round(maxCount * r)}
            </text>
          </g>
        )
      })}
      {/* Bars */}
      {slots.map((s, i) => {
        const x = PAD.left + i * (chartW / slots.length) + (chartW / slots.length - barW) / 2
        const barH = (s.count / maxCount) * chartH
        const y = PAD.top + chartH - barH
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={2} fill="#F97316" />
            {i % Math.ceil(slots.length / 6) === 0 && (
              <text x={x + barW / 2} y={H - 6} fontSize={8} fill="#6B7280" textAnchor="middle">
                {s.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [event, setEvent] = useState<Event | null>(null)
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const applyChange = useCallback(
    (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
      if (payload.eventType === 'INSERT') {
        setGuests(prev => [...prev, payload.new as Guest])
      } else if (payload.eventType === 'UPDATE') {
        setGuests(prev => prev.map(g => g.id === (payload.new as Guest).id ? (payload.new as Guest) : g))
      } else if (payload.eventType === 'DELETE') {
        setGuests(prev => prev.filter(g => g.id !== (payload.old as { id: string }).id))
      }
    },
    []
  )

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const [{ data: ev }, { data: gs }] = await Promise.all([
        supabase.from('events').select('id, name, date, location').eq('id', id).single(),
        supabase.from('guests')
          .select('id, full_name, category, table_name, checked_in, checked_in_at')
          .eq('event_id', id)
          .order('category')
          .order('full_name'),
      ])

      if (!ev) { router.replace('/dashboard'); return }
      setEvent(ev as Event)
      setGuests((gs as Guest[]) ?? [])
      setLoading(false)

      // Realtime
      const channel = supabase
        .channel(`guests-${id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'guests', filter: `event_id=eq.${id}` },
          applyChange
        )
        .subscribe()
      channelRef.current = channel
    }

    init()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [id, applyChange])

  if (loading || !event) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const total   = guests.length
  const checked = guests.filter(g => g.checked_in).length
  const pct     = total > 0 ? Math.round((checked / total) * 100) : 0

  const grouped = guests.reduce<Record<string, Guest[]>>((acc, g) => {
    const cat = g.category ?? 'Sans catégorie'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(g)
    return acc
  }, {})

  const categoryStats = Object.entries(grouped).map(([cat, list]) => ({
    cat,
    total: list.length,
    checked: list.filter(g => g.checked_in).length,
  }))

  const slots = buildSlots(guests)

  const shareOnWhatsApp = (guestId: string, guestName: string) => {
    const qrUrl = `${SITE_URL}/api/guests/${guestId}/qr`
    const msg = encodeURIComponent(`Voici votre invitation QR code pour ${event.name} :\n${qrUrl}`)
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-bold text-lg text-gray-900">{event.name}</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6 ml-8">
        {new Date(event.date).toLocaleString('fr-FR')}
        {event.location ? ` · ${event.location}` : ''}
      </p>

      {/* Stats globales */}
      <div className="flex gap-4 mb-4 text-sm">
        <span className="flex items-center gap-1 text-gray-600">
          <Users className="w-4 h-4" /> {total} invités
        </span>
        <span className="flex items-center gap-1 text-green-600">
          <CheckCircle className="w-4 h-4" /> {checked} présents
        </span>
        <span className="flex items-center gap-1 text-orange-500">
          <Clock className="w-4 h-4" /> {total - checked} en attente
        </span>
      </div>

      {/* Barre de progression globale */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-500 font-medium">Progression globale</span>
          <span className="text-green-600 font-semibold">{pct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className="bg-green-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Breakdown par catégorie */}
        {categoryStats.length > 1 && (
          <div className="mt-3 space-y-1.5">
            {categoryStats.map(({ cat, total: t, checked: c }) => (
              <div key={cat} className="flex items-center gap-2 text-xs">
                <span className="w-28 truncate text-gray-500">{cat}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-orange-400 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: t > 0 ? `${Math.round((c / t) * 100)}%` : '0%' }}
                  />
                </div>
                <span className="text-gray-400 w-12 text-right">{c}/{t}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Courbe arrivées */}
      {checked > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500 mb-2">Arrivées par tranche de 30 min</p>
          <ArrivalsChart slots={slots} />
        </div>
      )}

      <div className="flex gap-3 mb-6">
        <Link
          href={`/dashboard/events/${id}/guests`}
          className="btn-secondary text-sm flex items-center gap-1">
          <Upload className="w-4 h-4" /> Importer
        </Link>
        <Link
          href={`/dashboard/events/${id}/scan`}
          className="btn-primary text-sm flex items-center gap-1">
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
              {list.map((g) => (
                <div key={g.id} className="px-4 py-3 flex items-center justify-between border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{g.full_name}</p>
                    {g.table_name && <p className="text-xs text-gray-400">{g.table_name}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={g.checked_in ? 'badge-success' : 'badge-warning'}>
                      {g.checked_in ? '✓' : '…'}
                    </span>
                    <a href={`/api/guests/${g.id}/qr`} target="_blank" rel="noreferrer"
                      className="text-xs text-orange-500 hover:text-orange-700 flex items-center gap-1">
                      <QrCode className="w-3.5 h-3.5" /> QR
                    </a>
                    <button
                      onClick={() => shareOnWhatsApp(g.id, g.full_name)}
                      className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
                      title="Partager sur WhatsApp">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
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
