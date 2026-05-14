'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Camera, CameraOff, CheckCircle, XCircle, AlertCircle, Users, LogOut } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'

type ScanResult = { status: 'success'|'already_scanned'|'invalid'; guest?: { full_name: string; category: string|null; table_name: string|null } }

export default function ScannerPage() {
  const [event, setEvent] = useState<any>(null)
  const [guests, setGuests] = useState<any[]>([])
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult|null>(null)
  const [stats, setStats] = useState({ total: 0, checked: 0 })
  const [userId, setUserId] = useState<string|null>(null)
  const [tab, setTab] = useState<'scan'|'list'>('scan')
  const scannerRef = useRef<Html5Qrcode|null>(null)
  const cooldownRef = useRef(false)
  const router = useRouter()
  const supabase = createClient()

  const loadData = useCallback(async (eventId: string) => {
    const { data: gs } = await supabase.from('guests').select('*').eq('event_id', eventId).order('category').order('full_name')
    const list = gs ?? []
    setGuests(list)
    setStats({ total: list.length, checked: list.filter((g:any) => g.checked_in).length })
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)

      // Récupérer l'événement assigné
      const { data: access } = await supabase
        .from('event_access')
        .select('event_id, events(id, name, date, location)')
        .eq('user_id', user.id)
        .single()

      if (!access) { toast.error('Aucun événement assigné'); router.replace('/login'); return }
      const ev = (access as any).events
      setEvent(ev)
      loadData(ev.id)
    }
    init()
    return () => { scannerRef.current?.stop().catch(() => {}) }
  }, [])

  const handleScan = useCallback(async (token: string) => {
    if (cooldownRef.current || !event) return
    cooldownRef.current = true

    const { data: guest, error } = await supabase
      .from('guests')
      .select('id,full_name,category,table_name,checked_in,event_id')
      .eq('qr_token', token).single()

    if (error || !guest || guest.event_id !== event.id) {
      setResult({ status: 'invalid' }); toast.error('QR invalide')
      setTimeout(() => { setResult(null); cooldownRef.current = false }, 3000); return
    }
    if (guest.checked_in) {
      setResult({ status: 'already_scanned', guest }); toast.error(`${guest.full_name} déjà enregistré !`)
      setTimeout(() => { setResult(null); cooldownRef.current = false }, 3000); return
    }
    await supabase.from('guests').update({ checked_in: true, checked_in_at: new Date().toISOString() }).eq('id', guest.id)
    await supabase.from('scan_logs').insert({ guest_id: guest.id, event_id: event.id, status: 'success', scanned_by: userId })
    setResult({ status: 'success', guest })
    toast.success(`Bienvenue, ${guest.full_name} !`)
    loadData(event.id)
    setTimeout(() => { setResult(null); cooldownRef.current = false }, 4000)
  }, [event, userId, loadData])

  const startScanner = useCallback(async () => {
    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner
    try {
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }, handleScan, undefined)
      setScanning(true)
    } catch { toast.error('Impossible d\'accéder à la caméra') }
  }, [handleScan])

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) { await scannerRef.current.stop(); scannerRef.current = null }
    setScanning(false)
  }, [])

  const logout = async () => {
    await stopScanner()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const cfg = result ? {
    success: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50 border-green-200', label: '✓ Bienvenue !' },
    already_scanned: { icon: AlertCircle, color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200', label: 'Déjà enregistré' },
    invalid: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 border-red-200', label: 'QR invalide' },
  }[result.status] : null

  if (!event) return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">{event.name}</p>
            <p className="text-xs text-gray-400">{new Date(event.date).toLocaleDateString('fr-FR')}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-green-400 font-bold">{stats.checked}/{stats.total}</span>
            <button onClick={logout} className="text-gray-400 hover:text-white"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex border-t border-gray-700 max-w-lg mx-auto">
          <button onClick={() => setTab('scan')} className={`flex-1 py-2 text-sm font-medium ${tab==='scan' ? 'text-orange-400 border-b-2 border-orange-400' : 'text-gray-400'}`}>Scanner</button>
          <button onClick={() => { setTab('list'); stopScanner() }} className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-1 ${tab==='list' ? 'text-orange-400 border-b-2 border-orange-400' : 'text-gray-400'}`}>
            <Users className="w-3.5 h-3.5" /> Invités
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4">
        {tab === 'scan' && (
          <div className="space-y-4">
            <div id="qr-reader" className="rounded-xl overflow-hidden bg-gray-800" />
            {!scanning ? (
              <div className="card bg-gray-800 border-gray-700 p-8 text-center rounded-xl">
                <Camera className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                <button onClick={startScanner} className="btn-primary flex items-center gap-2 mx-auto">
                  <Camera className="w-4 h-4" /> Activer la caméra
                </button>
              </div>
            ) : (
              <button onClick={stopScanner} className="btn-secondary w-full flex items-center justify-center gap-2">
                <CameraOff className="w-4 h-4" /> Arrêter
              </button>
            )}
            {result && cfg && (() => {
              const Icon = cfg.icon
              return (
                <div className={`card border-2 p-6 text-center ${cfg.bg}`}>
                  <Icon className={`w-12 h-12 ${cfg.color} mx-auto mb-3`} />
                  <p className={`text-xl font-bold ${cfg.color}`}>{cfg.label}</p>
                  {result.guest && (
                    <div className="mt-3">
                      <p className="text-2xl font-bold text-gray-900">{result.guest.full_name}</p>
                      {result.guest.category && <p className="text-gray-600 mt-1">{result.guest.category}</p>}
                      {result.guest.table_name && <p className="text-orange-600 font-medium mt-1">Table : {result.guest.table_name}</p>}
                    </div>
                  )}
                </div>
              )
            })()}
            {stats.total > 0 && (
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Progression</span>
                  <span className="text-green-400 font-medium">{Math.round((stats.checked/stats.total)*100)}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${(stats.checked/stats.total)*100}%` }} />
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'list' && (
          <div className="space-y-3 mt-2">
            {guests.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-10">Aucun invité</p>
            ) : (
              Object.entries(
                guests.reduce((acc, g) => {
                  const cat = g.category ?? 'Sans catégorie'
                  if (!acc[cat]) acc[cat] = []
                  acc[cat].push(g)
                  return acc
                }, {} as Record<string, any[]>)
              ).map(([cat, list]) => (
                <div key={cat} className="bg-gray-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 border-b border-gray-700 flex justify-between">
                    <span className="text-sm font-medium text-gray-300">{cat}</span>
                    <span className="text-xs text-gray-500">{(list as any[]).length} pers.</span>
                  </div>
                  {(list as any[]).map((g: any) => (
                    <div key={g.id} className="px-4 py-3 flex items-center justify-between border-b border-gray-700 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-white">{g.full_name}</p>
                        {g.table_name && <p className="text-xs text-gray-400">{g.table_name}</p>}
                      </div>
                      <span className={g.checked_in ? 'badge-success' : 'badge-warning'}>{g.checked_in ? '✓' : '…'}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  )
}
