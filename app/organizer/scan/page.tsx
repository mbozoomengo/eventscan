'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Camera, CameraOff, CheckCircle, XCircle, AlertCircle, Users, QrCode, Eye } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'

const RECENT_SCANS_KEY = 'recent_scans'
const RECENT_SCANS_MAX = 20

type ScanStatus = 'success' | 'already_scanned' | 'invalid'

interface GuestResult {
  id: string
  full_name: string
  category: string | null
  table_name: string | null
  checked_in: boolean
}

interface ScanResult {
  status: ScanStatus
  guest?: GuestResult
  first_scan_at?: string
}

export interface RecentScanEntry {
  guest_id: string
  full_name: string
  scanned_at: string
  status: ScanStatus
  category: string | null
  table_name: string | null
}

interface EventRow {
  id: string
  name: string
  date: string
}

interface GuestListItem {
  id: string
  full_name: string
  category: string | null
  table_name: string | null
  checked_in: boolean
}

const CONFIG: Record<ScanStatus, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  success:         { icon: CheckCircle, color: 'text-green-500',  bg: 'bg-green-50 border-green-200',   label: 'Bienvenue !' },
  already_scanned: { icon: AlertCircle, color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200', label: 'D\u00e9j\u00e0 enregistr\u00e9' },
  invalid:         { icon: XCircle,     color: 'text-red-500',    bg: 'bg-red-50 border-red-200',       label: 'QR invalide' },
}

function readRecentScans(): RecentScanEntry[] {
  try {
    const raw = sessionStorage.getItem(RECENT_SCANS_KEY)
    return raw ? (JSON.parse(raw) as RecentScanEntry[]) : []
  } catch { return [] }
}

function writeRecentScans(entries: RecentScanEntry[]): void {
  try { sessionStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(entries)) } catch { /* ignore */ }
}

function pushRecentScan(entry: RecentScanEntry): void {
  const existing = readRecentScans()
  const updated = [entry, ...existing].slice(0, RECENT_SCANS_MAX)
  writeRecentScans(updated)
}

export default function OrganizerScanPage() {
  const [event,          setEvent]          = useState<EventRow | null>(null)
  const [scanning,       setScanning]       = useState(false)
  const [result,         setResult]         = useState<ScanResult | null>(null)
  const [stats,          setStats]          = useState({ total: 0, checked: 0 })
  const [guests,         setGuests]         = useState<GuestListItem[]>([])
  const [activeTab,      setActiveTab]      = useState<'scan' | 'list'>('scan')
  const [role,           setRole]           = useState<string>('')
  const [events,         setEvents]         = useState<EventRow[]>([])
  const [selectedEventId,setSelectedEventId]= useState<string>('')
  const [eventReady,     setEventReady]     = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const cooldown   = useRef(false)
  const router     = useRouter()
  const supabase   = createClient()

  const refreshStats = useCallback(async (eventId: string) => {
    const [{ count: total }, { count: checked }] = await Promise.all([
      supabase.from('guests').select('*', { count: 'exact', head: true }).eq('event_id', eventId),
      supabase.from('guests').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('checked_in', true),
    ])
    setStats({ total: total ?? 0, checked: checked ?? 0 })
  }, [])

  const loadGuests = useCallback(async (eventId: string) => {
    const { data } = await supabase
      .from('guests')
      .select('id, full_name, category, table_name, checked_in')
      .eq('event_id', eventId)
      .order('full_name')
    setGuests((data as GuestListItem[]) ?? [])
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!['organizer', 'admin'].includes(profile?.role ?? '')) { router.replace('/dashboard'); return }
      setRole(profile?.role ?? '')

      if (profile?.role === 'admin') {
        const { data: evs } = await supabase.from('events').select('id, name, date').order('date', { ascending: false })
        setEvents((evs as EventRow[]) ?? [])
      } else {
        const { data: teamEntry } = await supabase
          .from('event_team')
          .select('event_id, events(id, name, date)')
          .eq('user_id', user.id)
          .eq('role', 'organizer')
          .single()
        if (!teamEntry) { router.replace('/organizer'); return }
        const ev = (teamEntry as unknown as { event_id: string; events: EventRow }).events
        setEvent(ev)
        setSelectedEventId(ev.id)
        setEventReady(true)
        refreshStats(ev.id)
        loadGuests(ev.id)
      }
    }
    init()
    return () => { scannerRef.current?.stop().catch(() => {}) }
  }, [])

  const handleEventSelect = async (evId: string) => {
    if (!evId) return
    setSelectedEventId(evId)
    const ev = events.find(e => e.id === evId) ?? null
    setEvent(ev)
    setEventReady(true)
    if (ev) { refreshStats(ev.id); loadGuests(ev.id) }
  }

  const handleScan = useCallback(async (token: string) => {
    if (cooldown.current || !event) return
    cooldown.current = true
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/scan/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ qr_token: token, event_id: event.id }),
    })
    const data = await res.json() as ScanResult
    if (!res.ok) {
      toast.error((data as { error?: string }).error || 'Erreur')
      setTimeout(() => { setResult(null); cooldown.current = false }, 2000)
      return
    }
    setResult(data)
    // Persist to sessionStorage
    if (data.guest) {
      pushRecentScan({
        guest_id:   data.guest.id,
        full_name:  data.guest.full_name,
        scanned_at: new Date().toISOString(),
        status:     data.status,
        category:   data.guest.category,
        table_name: data.guest.table_name,
      })
    }
    if (data.status === 'success') {
      toast.success(`Bienvenue, ${data.guest?.full_name} !`)
      refreshStats(event.id)
      loadGuests(event.id)
    }
    setTimeout(() => { setResult(null); cooldown.current = false }, data.status === 'success' ? 4000 : 3000)
  }, [event, refreshStats, loadGuests])

  const startScanner = useCallback(async () => {
    const scanner = new Html5Qrcode('qr-reader-organizer')
    scannerRef.current = scanner
    try {
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }, handleScan, undefined)
      setScanning(true)
    } catch { toast.error("Impossible d'acc\u00e9der \u00e0 la cam\u00e9ra") }
  }, [handleScan])

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) { await scannerRef.current.stop(); scannerRef.current = null }
    setScanning(false)
  }, [])

  const pct = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0
  const cfg = result ? CONFIG[result.status] : null

  if (role === 'admin' && !eventReady) {
    return (
      <div className="max-w-md mx-auto mt-10">
        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Scanner un \u00e9v\u00e9nement</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>S\u00e9lectionnez l'\u00e9v\u00e9nement que vous souhaitez scanner.</p>
        <div className="card p-6 space-y-4">
          <select
            className="input"
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}>
            <option value="">-- Choisir un \u00e9v\u00e9nement --</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.name} ({new Date(ev.date).toLocaleDateString('fr-FR')})
              </option>
            ))}
          </select>
          <button
            onClick={() => handleEventSelect(selectedEventId)}
            disabled={!selectedEventId}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3">
            <QrCode className="w-4 h-4" /> D\u00e9marrer le scan
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      {event && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{event.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{stats.checked}/{stats.total} entr\u00e9es \u00b7 {pct}%</p>
            </div>
            <div className="w-12 h-12 relative">
              <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="#22c55e" strokeWidth="3"
                  strokeDasharray={`${pct * 0.942} 94.2`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-green-600">{pct}%</span>
            </div>
          </div>
          <div className="w-full rounded-full h-1.5 mt-3" style={{ backgroundColor: 'var(--border)' }}>
            <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex rounded-xl p-1 mb-4" style={{ backgroundColor: 'var(--border)' }}>
        <button
          onClick={() => setActiveTab('scan')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'scan' ? 'shadow' : ''
          }`}
          style={activeTab === 'scan'
            ? { backgroundColor: 'var(--bg-card)', color: 'var(--nav-active-text)' }
            : { color: 'var(--text-secondary)' }
          }>
          <QrCode className="w-4 h-4" /> Scanner
        </button>
        <button
          onClick={() => { setActiveTab('list'); if (event) loadGuests(event.id) }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'list' ? 'shadow' : ''
          }`}
          style={activeTab === 'list'
            ? { backgroundColor: 'var(--bg-card)', color: 'var(--nav-active-text)' }
            : { color: 'var(--text-secondary)' }
          }>
          <Users className="w-4 h-4" /> Invit\u00e9s ({guests.length})
        </button>
      </div>

      {activeTab === 'scan' && (
        <div className="space-y-4">
          <div id="qr-reader-organizer" className="rounded-xl overflow-hidden w-full" style={{ backgroundColor: 'var(--border)' }} />
          {!scanning ? (
            <div className="border-2 border-dashed rounded-xl p-10 text-center" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
              <Camera className="w-14 h-14 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
              <button onClick={startScanner} className="btn-primary flex items-center gap-2 mx-auto text-sm px-6 py-3">
                <Camera className="w-4 h-4" /> Activer la cam\u00e9ra
              </button>
            </div>
          ) : (
            <button onClick={stopScanner} className="btn-secondary w-full flex items-center justify-center gap-2 py-3">
              <CameraOff className="w-4 h-4" /> Arr\u00eater
            </button>
          )}
          {result && cfg && (
            <div className={`border-2 rounded-xl p-6 text-center ${cfg.bg}`}>
              <cfg.icon className={`w-12 h-12 ${cfg.color} mx-auto mb-2`} />
              <p className={`text-xl font-bold ${cfg.color}`}>{cfg.label}</p>
              {result.guest && (
                <div className="mt-3">
                  <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{result.guest.full_name}</p>
                  {result.guest.category && <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>{result.guest.category}</p>}
                  {result.guest.table_name && <p className="text-orange-600 font-medium mt-1">Table : {result.guest.table_name}</p>}
                  {result.status === 'already_scanned' && result.first_scan_at && (
                    <p className="text-sm text-orange-500 mt-1">1er scan : {new Date(result.first_scan_at).toLocaleTimeString('fr-FR')}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'list' && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs px-1 mb-2" style={{ color: 'var(--text-secondary)' }}>
            <span>{guests.filter(g => g.checked_in).length} pr\u00e9sents</span>
            <span>{guests.filter(g => !g.checked_in).length} en attente</span>
          </div>
          {guests.length === 0 ? (
            <p className="text-center text-sm py-10" style={{ color: 'var(--text-muted)' }}>Aucun invit\u00e9</p>
          ) : (
            guests.map(g => (
              <div key={g.id} className="card px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: g.checked_in ? '#16a34a' : 'var(--text-primary)' }}>{g.full_name}</p>
                  {g.category && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{g.category}{g.table_name ? ` \u00b7 ${g.table_name}` : ''}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    g.checked_in ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>{g.checked_in ? 'Pr\u00e9sent' : 'Attente'}</span>
                  <Link href={`/organizer/guests/${g.id}`} className="text-blue-400 hover:text-blue-600 p-1">
                    <Eye className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
