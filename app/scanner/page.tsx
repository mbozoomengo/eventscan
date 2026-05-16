'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Camera, CameraOff, CheckCircle, XCircle, AlertCircle, Wifi, WifiOff } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { useNetworkStatus } from '@/lib/hooks/useNetworkStatus'
import { loadCache, scanOffline, syncPending, CachedGuest } from '@/lib/hooks/useOfflineSync'

type ScanStatus = 'success' | 'already_scanned' | 'invalid'
type ScanResult = {
  status: ScanStatus
  guest?: { full_name: string; category?: string | null; table_name?: string | null }
  first_scan_at?: string
}

const OVERLAY_CONFIG: Record<ScanStatus, { color: string; label: string }> = {
  success:         { color: 'bg-green-500',  label: '✓ Bienvenue !' },
  already_scanned: { color: 'bg-red-500',    label: 'Déjà enregistré' },
  invalid:         { color: 'bg-orange-500', label: 'QR invalide' },
}

function beep(frequency: number, durationMs: number) {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = frequency
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + durationMs / 1000)
  } catch {
    // AudioContext non disponible (SSR ou navigateur restreint)
  }
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern)
  }
}

export default function ScannerPage() {
  const [event, setEvent] = useState<{ id: string; name: string; date: string } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [overlay, setOverlay] = useState<ScanResult | null>(null)
  const [stats, setStats] = useState({ total: 0, checked: 0 })
  const [blocked, setBlocked] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const cooldown = useRef(false)
  const sessionToken = useRef<string>('')
  const router = useRouter()
  const supabase = createClient()
  const { isOnline, pendingCount } = useNetworkStatus()

  const refreshStats = useCallback(async (eventId: string) => {
    const [{ count: total }, { count: checked }] = await Promise.all([
      supabase.from('guests').select('*', { count: 'exact', head: true }).eq('event_id', eventId),
      supabase.from('guests').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('checked_in', true),
    ])
    setStats({ total: total ?? 0, checked: checked ?? 0 })
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'scanner') { router.replace('/dashboard'); return }

      const { data: { session } } = await supabase.auth.getSession()
      sessionToken.current = session?.access_token ?? ''

      const { data: teamEntry } = await supabase
        .from('event_team')
        .select('event_id, is_blocked, events(id, name, date)')
        .eq('user_id', user.id)
        .eq('role', 'scanner')
        .single()

      if (!teamEntry) { toast.error('Aucun événement assigné'); return }
      if (teamEntry.is_blocked) { setBlocked(true); return }

      const ev = (teamEntry as any).events as { id: string; name: string; date: string }
      setEvent(ev)
      refreshStats(ev.id)

      // Load IndexedDB cache
      await loadCache(ev.id, sessionToken.current)

      // Refresh cache every 5 minutes
      const interval = setInterval(() => {
        loadCache(ev.id, sessionToken.current)
      }, 5 * 60 * 1000)

      return () => clearInterval(interval)
    }
    init()
    return () => { scannerRef.current?.stop().catch(() => {}) }
  }, [])

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && sessionToken.current && pendingCount > 0) {
      syncPending(sessionToken.current).then(() => {
        if (event) refreshStats(event.id)
      })
    }
  }, [isOnline])

  const showOverlay = useCallback((result: ScanResult) => {
    setOverlay(result)
    const { status } = result

    if (status === 'success') {
      beep(880, 300)
      vibrate(200)
    } else {
      beep(220, 500)
      vibrate([100, 50, 100])
    }

    setTimeout(() => {
      setOverlay(null)
      cooldown.current = false
    }, 1500)
  }, [])

  const handleScan = useCallback(async (token: string) => {
    if (cooldown.current || !event) return
    cooldown.current = true

    if (!isOnline) {
      const offlineResult = await scanOffline(token, event.id)
      showOverlay(offlineResult)
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    sessionToken.current = session?.access_token ?? ''

    const res = await fetch('/api/scan/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken.current}` },
      body: JSON.stringify({ qr_token: token, event_id: event.id }),
    })
    const data = await res.json()

    if (!res.ok) {
      if (data.blocked) setBlocked(true)
      toast.error(data.error || 'Erreur')
      cooldown.current = false
      return
    }

    showOverlay(data)
    if (data.status === 'success') refreshStats(event.id)
  }, [event, isOnline, showOverlay, refreshStats])

  const startScanner = useCallback(async () => {
    const scanner = new Html5Qrcode('qr-reader-scanner')
    scannerRef.current = scanner
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        handleScan,
        undefined
      )
      setScanning(true)
    } catch {
      toast.error("Impossible d'accéder à la caméra")
    }
  }, [handleScan])

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) { await scannerRef.current.stop(); scannerRef.current = null }
    setScanning(false)
  }, [])

  if (blocked) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-red-900/30 border border-red-600 rounded-xl p-8 text-center max-w-sm">
        <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="font-semibold text-red-300">Accès bloqué</p>
        <p className="text-sm text-gray-400 mt-2">Vous avez été bloqué par l'organisateur.</p>
      </div>
    </div>
  )

  const pct = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0
  const overlayCfg = overlay ? OVERLAY_CONFIG[overlay.status] : null

  return (
    <div className="space-y-4 relative">

      {/* Bandeau réseau — fixe en haut */}
      <div className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-1.5 text-sm font-medium ${
        isOnline ? 'bg-green-600 text-white' : 'bg-orange-500 text-white'
      }`}>
        {isOnline
          ? <><Wifi className="w-4 h-4" /> En ligne</>
          : <><WifiOff className="w-4 h-4" /> Hors-ligne{pendingCount > 0 ? ` — ${pendingCount} en attente` : ''}</>
        }
      </div>

      {/* Overlay plein écran post-scan */}
      {overlay && overlayCfg && (
        <div className={`fixed inset-0 z-40 flex flex-col items-center justify-center ${overlayCfg.color} text-white`}>
          <p className="text-4xl font-black mb-4">{overlayCfg.label}</p>
          {overlay.guest && (
            <div className="text-center mt-2 space-y-1">
              <p className="text-3xl font-bold">{overlay.guest.full_name}</p>
              {overlay.guest.category && <p className="text-xl opacity-90">{overlay.guest.category}</p>}
              {overlay.guest.table_name && <p className="text-xl font-semibold">Table : {overlay.guest.table_name}</p>}
            </div>
          )}
        </div>
      )}

      {/* Padding pour le bandeau fixe */}
      <div className="pt-8">
        {event && (
          <div className="text-center">
            <p className="font-semibold">{event.name}</p>
            <p className="text-sm text-gray-400">{stats.checked}/{stats.total} entrées</p>
          </div>
        )}

        <div id="qr-reader-scanner" className="rounded-xl overflow-hidden bg-gray-800" />

        {!scanning ? (
          <div className="bg-gray-800 border-2 border-dashed border-gray-600 rounded-xl p-10 text-center">
            <Camera className="w-14 h-14 text-gray-500 mx-auto mb-4" />
            <button
              onClick={startScanner}
              className="bg-orange-500 text-white font-medium px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2 mx-auto"
            >
              <Camera className="w-4 h-4" /> Activer la caméra
            </button>
          </div>
        ) : (
          <button
            onClick={stopScanner}
            className="w-full bg-gray-700 text-gray-300 text-sm font-medium py-2 rounded-lg hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
          >
            <CameraOff className="w-4 h-4" /> Arrêter
          </button>
        )}

        {stats.total > 0 && (
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">Progression</span>
              <span className="text-green-400 font-medium">{pct}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
