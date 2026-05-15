'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Camera, CameraOff, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
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

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      // Admin et organizer peuvent scanner
      if (!['organizer', 'admin'].includes(profile?.role ?? '')) { router.replace('/dashboard'); return }

      const { data: teamEntry } = await supabase
        .from('event_team')
        .select('event_id, events(id, name)')
        .eq('user_id', user.id)
        .single()

      if (!teamEntry) {
        toast.error('Aucun evenement assigne')
        router.replace(profile?.role === 'admin' ? '/admin' : '/organizer')
        return
      }
      const ev = (teamEntry as any).events
      setEvent(ev)
      refreshStats(ev.id)
    }
    init()
    return () => { scannerRef.current?.stop().catch(() => {}) }
  }, [])

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
    if (data.status === 'success') { toast.success(`Bienvenue, ${data.guest.full_name} !`); refreshStats(event.id) }
    setTimeout(() => { setResult(null); cooldown.current = false }, data.status === 'success' ? 4000 : 3000)
  }, [event, refreshStats])

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

  return (
    <div className="space-y-4 max-w-md mx-auto">
      {event && (
        <div className="text-center">
          <p className="font-semibold text-gray-900">{event.name}</p>
          <p className="text-sm text-gray-500">{stats.checked}/{stats.total} entrees</p>
        </div>
      )}

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
                <p className="text-sm text-orange-500 mt-1">
                  1er scan : {new Date(result.first_scan_at).toLocaleTimeString('fr-FR')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {stats.total > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600">Progression</span>
            <span className="font-medium text-green-600">{pct}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}
