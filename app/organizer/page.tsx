'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Users, Upload, QrCode, Clock, CheckCircle2, ChevronRight } from 'lucide-react'
import type { RecentScanEntry } from '@/app/organizer/scan/page'

const RECENT_SCANS_KEY = 'recent_scans'

interface EventRow {
  id: string
  name: string
  date: string
  location: string | null
  description: string | null
}

interface TeamEntryShape {
  event_id: string
  events: EventRow
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon apr\u00e8s-midi'
  return 'Bonsoir'
}

function getEventStatus(dateStr: string): { label: string; cls: string } {
  const now  = Date.now()
  const d    = new Date(dateStr).getTime()
  const diff = d - now
  if (diff > 2 * 60 * 60 * 1000)  return { label: '\u00c0 venir',  cls: 'bg-blue-100 text-blue-700' }
  if (diff > -4 * 60 * 60 * 1000) return { label: 'En cours', cls: 'bg-green-100 text-green-700' }
  return { label: 'Pass\u00e9', cls: 'bg-gray-100 text-gray-500' }
}

function readRecentScans(): RecentScanEntry[] {
  try {
    const raw = sessionStorage.getItem(RECENT_SCANS_KEY)
    return raw ? (JSON.parse(raw) as RecentScanEntry[]) : []
  } catch { return [] }
}

function Spin() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-page)' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement\u2026</p>
      </div>
    </div>
  )
}

export default function OrganizerDashboard() {
  const [event,         setEvent]         = useState<EventRow | null>(null)
  const [stats,         setStats]         = useState({ total: 0, checked: 0 })
  const [recentScans,   setRecentScans]   = useState<RecentScanEntry[]>([])
  const [userName,      setUserName]      = useState('')
  const [loading,       setLoading]       = useState(true)
  const router   = useRouter()
  const supabase = createClient()

  const loadRecentScansFromSupabase = useCallback(async (eventId: string) => {
    const { data } = await supabase
      .from('scan_logs')
      .select('id, scanned_at, status, guest_id, guests(full_name, category, table_name)')
      .eq('event_id', eventId)
      .eq('status', 'success')
      .order('scanned_at', { ascending: false })
      .limit(5)
    if (!data) return
    const mapped: RecentScanEntry[] = (data as unknown as {
      guest_id: string
      scanned_at: string
      status: string
      guests: { full_name: string; category: string | null; table_name: string | null } | null
    }[]).map(r => ({
      guest_id:   r.guest_id,
      full_name:  r.guests?.full_name ?? '\u2014',
      scanned_at: r.scanned_at,
      status:     r.status as RecentScanEntry['status'],
      category:   r.guests?.category ?? null,
      table_name: r.guests?.table_name ?? null,
    }))
    setRecentScans(mapped)
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('role, full_name').eq('id', user.id).single()
      if (!profile || !['organizer', 'admin'].includes(profile.role)) {
        router.replace('/login'); return
      }
      setUserName(profile.full_name ?? user.email ?? '')

      const { data: teamEntry } = await supabase
        .from('event_team')
        .select('event_id, events(id, name, date, location, description)')
        .eq('user_id', user.id)
        .eq('role', 'organizer')
        .single()

      if (!teamEntry) {
        toast.error('Aucun \u00e9v\u00e9nement assign\u00e9')
        setLoading(false)
        return
      }
      const ev = (teamEntry as unknown as TeamEntryShape).events
      setEvent(ev)

      const [{ count: total }, { count: checked }] = await Promise.all([
        supabase.from('guests').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
        supabase.from('guests').select('*', { count: 'exact', head: true }).eq('event_id', ev.id).eq('checked_in', true),
      ])
      setStats({ total: total ?? 0, checked: checked ?? 0 })

      // Try sessionStorage first, fallback to Supabase
      const sessionScans = readRecentScans()
      if (sessionScans.length > 0) {
        setRecentScans(sessionScans.slice(0, 5))
      } else {
        await loadRecentScansFromSupabase(ev.id)
      }

      setLoading(false)
    }
    init()
  }, [])

  if (loading) return <Spin />

  if (!event) return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="card p-10 text-center max-w-sm mx-auto">
        <svg viewBox="0 0 120 100" className="w-32 h-32 mx-auto mb-4" aria-hidden>
          <rect x="10" y="20" width="100" height="65" rx="8" fill="#fff7ed" stroke="#fed7aa" strokeWidth="2"/>
          <rect x="25" y="38" width="45" height="6" rx="3" fill="#fdba74"/>
          <rect x="25" y="52" width="30" height="6" rx="3" fill="#fed7aa"/>
          <circle cx="88" cy="35" r="14" fill="#f97316"/>
          <text x="88" y="40" textAnchor="middle" fontSize="16" fill="white" fontWeight="bold">+</text>
        </svg>
        <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Aucun \u00e9v\u00e9nement assign\u00e9</p>
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>Contactez un administrateur pour \u00eatre assign\u00e9 \u00e0 un \u00e9v\u00e9nement.</p>
      </div>
    </div>
  )

  const pct    = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0
  const absent = stats.total - stats.checked
  const status = getEventStatus(event.date)

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">

      {/* Header */}
      <div className="card p-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{getGreeting()}</p>
          <p className="font-bold text-lg truncate" style={{ color: 'var(--text-primary)' }}>{userName}</p>
        </div>
        <Link href="/organizer/scan" className="btn-primary text-sm flex items-center gap-1.5 flex-shrink-0">
          <QrCode className="w-4 h-4" /> Scanner
        </Link>
      </div>

      {/* Event */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-xl leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{event.name}</p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {new Date(event.date).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {event.location ? ` \u00b7 ${event.location}` : ''}
            </p>
          </div>
          <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${status.cls}`}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </span>
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Pr\u00e9sents</span>
          </div>
          <p className="text-4xl font-black text-green-600 leading-none mt-2">{stats.checked}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
              <Clock className="w-4 h-4 text-orange-500" />
            </span>
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>En attente</span>
          </div>
          <p className="text-4xl font-black text-orange-500 leading-none mt-2">{absent}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="card p-5">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>Progression des entr\u00e9es</span>
          <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
            {stats.checked}<span style={{ color: 'var(--text-muted)' }}>/{stats.total}</span>
          </span>
        </div>
        <div className="w-full rounded-full h-3 overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
          <div className="bg-gradient-to-r from-orange-400 to-green-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }} />
        </div>
        <p className="text-right text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>{pct}%</p>
      </div>

      {/* Quick actions */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Acc\u00e8s rapides</h2>

        {([
          { href: '/organizer/scan',         icon: QrCode,  iconCls: 'bg-orange-500',                       label: 'Scanner les entr\u00e9es',       sub: 'D\u00e9marrer la cam\u00e9ra QR code',        hoverBorder: '#f97316' },
          { href: '/organizer/guests',       icon: Users,   iconCls: 'bg-blue-50 border border-blue-100',   label: 'Voir la liste des invit\u00e9s', sub: `${stats.total} invit\u00e9s \u00b7 recherche et filtres`, hoverBorder: '#93c5fd' },
          { href: '/organizer/guests/import',icon: Upload,  iconCls: 'bg-purple-50 border border-purple-100',label: 'Importer des invit\u00e9s',    sub: 'CSV / Excel',                              hoverBorder: '#c4b5fd' },
          { href: '/organizer/scan-history', icon: Clock,   iconCls: 'bg-gray-100',                          label: 'Historique des scans',        sub: 'Logs et exports CSV',                      hoverBorder: '#d1d5db' },
        ] as const).map(({ href, icon: Icon, iconCls, label, sub }) => (
          <Link key={href} href={href} className="card p-4 flex items-center gap-4 hover:shadow-md transition-all group">
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconCls}`}>
              <Icon className={`w-5 h-5 ${iconCls.includes('orange') ? 'text-white' : iconCls.includes('blue') ? 'text-blue-500' : iconCls.includes('purple') ? 'text-purple-500' : 'text-gray-500'}`} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>
            </div>
            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          </Link>
        ))}
      </div>

      {/* Recent check-ins — from sessionStorage */}
      {recentScans.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Derniers check-ins</h2>
            <Link href="/organizer/scan-history" className="text-xs text-orange-500 hover:text-orange-600 font-medium">Tout voir</Link>
          </div>
          <div className="card divide-y" style={{ borderColor: 'var(--border-light)' }}>
            {recentScans.slice(0, 5).map((scan, i) => (
              <div key={`${scan.guest_id}-${i}`} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {scan.full_name}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="badge-success">Pr\u00e9sent</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(scan.scanned_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
