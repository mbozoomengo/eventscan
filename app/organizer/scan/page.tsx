'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Camera, CameraOff, CheckCircle, XCircle, AlertCircle, Users, QrCode, Eye } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'

type ScanStatus = 'success' | 'already_scanned' | 'invalid'
type ScanResult = { status: ScanStatus; guest?: any; first_scan_at?: string }

const CONFIG: Record<ScanStatus, { icon: any; color: string; bg: string; label: string }> = {
  success:        { icon: CheckCircle,  color: 'text-green-500',  bg: 'bg-green-50 border-green-200',   label: 'Bienvenue !' },
  already_scanned:{ icon: AlertCircle,  color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200',  label: 'Deja enregistre' },
  invalid:        { icon: XCircle,      color: 'text-red-500',    bg: 'bg-red-50 border-red-200',        label: 'QR invalide' },
}

export default function OrganizerScanPage() {
  const [event, setEvent] = useState<any>(null)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [stats, setStats] = useState({ total: 0, checked: 0 })
  const [guests, setGuests] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'scan' | 'list'>('scan')
  const [role, setRole] = useState<string>('')
  const [events, setEvents] = useState<any[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string>('')
  const [eventReady, setEventReady] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const cooldown = useRef(false)
  const router = useRouter()
  const supabase = createClient()

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
    setGuests(data ?? [])
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!['organizer', 'admin'].includes(profile?.role ?? '')) { router.replace('/dashboard'); return }
      setRole(profile?.role ?? '')

      if (profile?.role === 'admin') {
        // Admin: charge tous les evenements
        const { data: evs } = await supabase.from('events').select('id, name, date').order('date', { ascending: false })
        setEvents(evs ?? [])
      } else {
        // Organizer: evenement assigne
        const { data: teamEntry } = await supabase
          .from('event_team')
          .select('event_id, events(id, name, date)')
          .eq('user_id', user.id)
          .eq('role', 'organizer')
          .single()
        if (!teamEntry) { router.replace('/organizer'); return }
        const ev = (teamEntry as any).events
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
    const ev = events.find(e => e.id === evId)
    setEvent(ev)
    setEventReady(true)
    refreshStats(evId)
    loadGuests(evId)
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
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error || 'Erreur')
      setTimeout(() => { setResult(null); cooldown.current = false }, 2000)
      return
    }
    setResult(data)
    if (data.status === 'success') {
      toast.success(`Bienvenue, ${data.guest.full_name} !`)
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
    } catch { toast.error("Impossible d'acceder a la camera") }
  }, [handleScan])

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) { await scannerRef.current.stop(); scannerRef.current = null }
    setScanning(false)
  }, [])

  const pct = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0
  const cfg = result ? CONFIG[result.status] : null

  // Admin: selection d'evenement
  if (role === 'admin' && !eventReady) {
    return (
      <div className="max-w-md mx-auto mt-10">
        <h1 className="text-xl font-bold mb-2">Scanner un evenement</h1>
        <p className="text-sm text-gray-500 mb-6">Selectionnez l'evenement que vous souhaitez scanner.</p>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}>
            <option value="">-- Choisir un evenement --</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.name} ({new Date(ev.date).toLocaleDateString('fr-FR')})
              </option>
            ))}
          </select>
          <button
            onClick={() => handleEventSelect(selectedEventId)}
            disabled={!selectedEventId}
            className="w-full bg-orange-500 text-white font-medium py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            <QrCode className="w-4 h-4" /> Demarrer le scan
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Header avec infos evenement */}
      {event && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{event.name}</p>
              <p className="text-xs text-gray-500">{stats.checked}/{stats.total} entrees · {pct}%</p>
            </div>
            <div className="w-12 h-12 relative">
              <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="#22c55e" strokeWidth="3"
                  strokeDasharray={`${pct * 0.942} 94.2`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-green-600">{pct}%</span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-3">
            <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Switch tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
        <button
          onClick={() => setActiveTab('scan')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'scan' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'
          }`}>
          <QrCode className="w-4 h-4" /> Scanner
        </button>
        <button
          onClick={() => { setActiveTab('list'); if (event) loadGuests(event.id) }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'list' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'
          }`}>
          <Users className="w-4 h-4" /> Invites ({guests.length})
        </button>
      </div>

      {/* Tab Scanner */}
      {activeTab === 'scan' && (
        <div className="space-y-4">
          <div id="qr-reader-organizer" className="rounded-xl overflow-hidden bg-gray-100 w-full" />

          {!scanning ? (
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-10 text-center">
              <Camera className="w-14 h-14 text-gray-300 mx-auto mb-4" />
              <button onClick={startScanner}
                className="bg-orange-500 text-white font-medium px-6 py-3 rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-2 mx-auto text-sm">
                <Camera className="w-4 h-4" /> Activer la camera
              </button>
            </div>
          ) : (
            <button onClick={stopScanner}
              className="w-full border border-gray-300 text-gray-700 text-sm font-medium py-3 rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
              <CameraOff className="w-4 h-4" /> Arreter
            </button>
          )}

          {result && cfg && (
            <div className={`border-2 rounded-xl p-6 text-center ${cfg.bg}`}>
              <cfg.icon className={`w-12 h-12 ${cfg.color} mx-auto mb-2`} />
              <p className={`text-xl font-bold ${cfg.color}`}>{cfg.label}</p>
              {result.guest && (
                <div className="mt-3">
                  <p className="text-2xl font-bold text-gray-900">{result.guest.full_name}</p>
                  {result.guest.category && <p className="text-gray-600 mt-1">{result.guest.category}</p>}
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

      {/* Tab Liste invites */}
      {activeTab === 'list' && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-500 px-1 mb-2">
            <span>{guests.filter(g => g.checked_in).length} presents</span>
            <span>{guests.filter(g => !g.checked_in).length} en attente</span>
          </div>
          {guests.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-10">Aucun invite</p>
          ) : (
            guests.map(g => (
              <div key={g.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
                <div>
                  <p className={`text-sm font-medium ${g.checked_in ? 'text-green-700' : 'text-gray-900'}`}>{g.full_name}</p>
                  {g.category && <p className="text-xs text-gray-400">{g.category}{g.table_name ? ` · ${g.table_name}` : ''}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    g.checked_in ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>{g.checked_in ? 'Present' : 'Attente'}</span>
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
