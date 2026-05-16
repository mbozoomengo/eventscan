'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Users, Upload, QrCode, Clock, Wifi, WifiOff, CheckCircle2, ChevronRight } from 'lucide-react'

// ---- types ----------------------------------------------------------------

interface EventRow {
  id: string
  name: string
  date: string
  location: string | null
  description: string | null
}

interface RecentScan {
  id: string
  scanned_at: string
  guests: { full_name: string } | null
}

interface TeamEntryShape {
  event_id: string
  events: EventRow
}

// ---- helpers --------------------------------------------------------------

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

function getEventStatus(dateStr: string): { label: string; cls: string } {
  const now = Date.now()
  const d = new Date(dateStr).getTime()
  const diff = d - now
  if (diff > 2 * 60 * 60 * 1000)  return { label: 'À venir',  cls: 'bg-blue-100 text-blue-700' }
  if (diff > -4 * 60 * 60 * 1000) return { label: 'En cours', cls: 'bg-green-100 text-green-700' }
  return { label: 'Passé', cls: 'bg-gray-100 text-gray-500' }
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

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

// ---- page -----------------------------------------------------------------

export default function OrganizerDashboard() {
  const [event,       setEvent]       = useState<EventRow | null>(null)
  const [stats,       setStats]       = useState({ total: 0, checked: 0 })
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  const [userName,    setUserName]    = useState('')
  const [isOnline,    setIsOnline]    = useState(true)
  const [loading,     setLoading]     = useState(true)
  const router   = useRouter()
  const supabase = createClient()

  // network status
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine)
    window.addEventListener('online',  update)
    window.addEventListener('offline', update)
    update()
    return () => {
      window.removeEventListener('online',  update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const loadRecentScans = useCallback(async (eventId: string) => {
    const { data } = await supabase
      .from('scan_logs')
      .select('id, scanned_at, guests(full_name)')
      .eq('event_id', eventId)
      .eq('status', 'success')
      .order('scanned_at', { ascending: false })
      .limit(5)
    setRecentScans((data as unknown as RecentScan[]) ?? [])
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .single()
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
        toast.error('Aucun événement assigné')
        setLoading(false)
        return
      }

      // Supabase infère events comme tableau — on passe par unknown
      const ev = (teamEntry as unknown as TeamEntryShape).events
      setEvent(ev)

      const [{ count: total }, { count: checked }] = await Promise.all([
        supabase.from('guests').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
        supabase.from('guests').select('*', { count: 'exact', head: true }).eq('event_id', ev.id).eq('checked_in', true),
      ])
      setStats({ total: total ?? 0, checked: checked ?? 0 })
      await loadRecentScans(ev.id)
      setLoading(false)
    }
    init()
  }, [])

  if (loading) return <Spin />

  // ---- empty state --------------------------------------------------------
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
        <p className="font-semibold text-gray-800 mb-1">Aucun événement assigné</p>
        <p className="text-sm text-gray-400 mb-5">Contactez un administrateur pour être assigné à un événement.</p>
      </div>
    </div>
  )

  const pct    = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0
  const absent = stats.total - stats.checked
  const status = getEventStatus(event.date)

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">

      {/* ---- offline banner ------------------------------------------------ */}
      {!isOnline && (
        <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 text-sm font-medium px-4 py-2.5 rounded-xl">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          Mode hors-ligne — les données affichées peuvent ne pas être à jour.
        </div>
      )}
      {isOnline && (
        <div className="flex items-center gap-2 text-green-600 text-xs">
          <Wifi className="w-3.5 h-3.5" /> Connexion active
        </div>
      )}

      {/* ---- header -------------------------------------------------------- */}
      <div className="card p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-base">{initials(userName)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400">{getGreeting()}</p>
          <p className="font-bold text-gray-900 truncate">{userName}</p>
        </div>
        <Link href="/organizer/scan" className="btn-primary text-sm flex items-center gap-1.5 flex-shrink-0">
          <QrCode className="w-4 h-4" /> Scanner
        </Link>
      </div>

      {/* ---- event card ---------------------------------------------------- */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-xl text-gray-900 leading-tight truncate">{event.name}</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {new Date(event.date).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {event.location ? ` · ${event.location}` : ''}
            </p>
          </div>
          <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${status.cls}`}>
            {status.label}
          </span>
        </div>
      </div>

      {/* ---- stats cards --------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </span>
            <span className="text-xs text-gray-500 font-medium">Présents</span>
          </div>
          <p className="text-4xl font-black text-green-600 leading-none mt-2">{stats.checked}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
              <Clock className="w-4 h-4 text-orange-500" />
            </span>
            <span className="text-xs text-gray-500 font-medium">En attente</span>
          </div>
          <p className="text-4xl font-black text-orange-500 leading-none mt-2">{absent}</p>
        </div>
      </div>

      {/* ---- progress bar -------------------------------------------------- */}
      <div className="card p-5">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-600 font-medium">Progression des entrées</span>
          <span className="font-bold text-gray-900">
            {stats.checked}<span className="text-gray-400 font-normal">/{stats.total}</span>
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-orange-400 to-green-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-right text-xs text-gray-400 mt-1.5">{pct}%</p>
      </div>

      {/* ---- quick actions ------------------------------------------------- */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Accès rapides</h2>

        <Link href="/organizer/scan"
          className="card p-4 flex items-center gap-4 hover:border-orange-300 hover:shadow-md transition-all group">
          <span className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <QrCode className="w-5 h-5 text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">Scanner les entrées</p>
            <p className="text-xs text-gray-400">Démarrer la caméra QR code</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400 transition-colors" />
        </Link>

        <Link href="/organizer/guests"
          className="card p-4 flex items-center gap-4 hover:border-blue-200 hover:shadow-md transition-all group">
          <span className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <Users className="w-5 h-5 text-blue-500" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">Voir la liste des invités</p>
            <p className="text-xs text-gray-400">{stats.total} invités · recherche et filtres</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors" />
        </Link>

        <Link href="/organizer/guests/import"
          className="card p-4 flex items-center gap-4 hover:border-purple-200 hover:shadow-md transition-all group">
          <span className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <Upload className="w-5 h-5 text-purple-500" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">Importer des invités</p>
            <p className="text-xs text-gray-400">CSV / Excel</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-purple-400 transition-colors" />
        </Link>

        <Link href="/organizer/scan-history"
          className="card p-4 flex items-center gap-4 hover:border-gray-300 hover:shadow-md transition-all group">
          <span className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <Clock className="w-5 h-5 text-gray-500" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">Historique des scans</p>
            <p className="text-xs text-gray-400">Logs et exports CSV</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
        </Link>
      </div>

      {/* ---- recent check-ins --------------------------------------------- */}
      {recentScans.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Derniers check-ins</h2>
            <Link href="/organizer/scan-history" className="text-xs text-orange-500 hover:text-orange-600 font-medium">Tout voir</Link>
          </div>
          <div className="card divide-y divide-gray-50">
            {recentScans.map((scan) => (
              <div key={scan.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {scan.guests?.full_name ?? '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="badge-success">Présent</span>
                  <span className="text-xs text-gray-400">
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
