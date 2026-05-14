'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, Camera, CameraOff, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'

type ScanResult = {
  status: 'success' | 'already_scanned' | 'invalid'
  guest?: {
    full_name: string
    category: string | null
    table_name: string | null
  }
}

export default function ScanPage({ params }: { params: { id: string } }) {
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [stats, setStats] = useState({ total: 0, checked: 0 })
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const cooldownRef = useRef(false)
  const supabase = createClient()

  // Charger stats
  const loadStats = useCallback(async () => {
    const { count: total } = await supabase
      .from('guests').select('*', { count: 'exact', head: true }).eq('event_id', params.id)
    const { count: checked } = await supabase
      .from('guests').select('*', { count: 'exact', head: true }).eq('event_id', params.id).eq('checked_in', true)
    setStats({ total: total || 0, checked: checked || 0 })
  }, [params.id, supabase])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const handleScan = useCallback(async (token: string) => {
    if (cooldownRef.current) return
    cooldownRef.current = true

    // Lookup guest by token
    const { data: guest, error } = await supabase
      .from('guests')
      .select('id, full_name, category, table_name, checked_in, event_id')
      .eq('qr_token', token)
      .single()

    if (error || !guest) {
      setResult({ status: 'invalid' })
      toast.error('QR code invalide')
      setTimeout(() => { setResult(null); cooldownRef.current = false }, 3000)
      return
    }

    if (guest.event_id !== params.id) {
      setResult({ status: 'invalid' })
      toast.error('QR code appartient à un autre événement')
      setTimeout(() => { setResult(null); cooldownRef.current = false }, 3000)
      return
    }

    if (guest.checked_in) {
      setResult({ status: 'already_scanned', guest })
      toast.error(`${guest.full_name} est déjà enregistré !`)
      setTimeout(() => { setResult(null); cooldownRef.current = false }, 3000)
      return
    }

    // Check in
    const { error: updateError } = await supabase
      .from('guests')
      .update({ checked_in: true, checked_in_at: new Date().toISOString() })
      .eq('id', guest.id)

    // Log scan
    await supabase.from('scan_logs').insert({
      guest_id: guest.id,
      event_id: params.id,
      status: 'success',
    })

    if (updateError) {
      setResult({ status: 'invalid' })
      toast.error('Erreur lors de l\'enregistrement')
    } else {
      setResult({ status: 'success', guest })
      toast.success(`Bienvenue, ${guest.full_name} !`)
      loadStats()
    }

    setTimeout(() => { setResult(null); cooldownRef.current = false }, 4000)
  }, [params.id, supabase, loadStats])

  const startScanner = useCallback(async () => {
    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => handleScan(decodedText),
        undefined
      )
      setScanning(true)
    } catch {
      toast.error('Impossible d\'accéder à la caméra')
    }
  }, [handleScan])

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop()
      scannerRef.current = null
    }
    setScanning(false)
  }, [])

  useEffect(() => {
    return () => { stopScanner() }
  }, [stopScanner])

  const resultConfig = {
    success: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50 border-green-200', label: '✓ Bienvenue !' },
    already_scanned: { icon: AlertCircle, color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200', label: 'Déjà enregistré' },
    invalid: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 border-red-200', label: 'QR invalide' },
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/dashboard/events/${params.id}`} className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-semibold">Scanner QR</h1>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-green-400">{stats.checked}/{stats.total}</p>
            <p className="text-xs text-gray-400">présents</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Scanner */}
        <div className="relative">
          <div id="qr-reader" className="rounded-xl overflow-hidden bg-gray-800" style={{ minHeight: scanning ? 'auto' : '0' }} />

          {!scanning && (
            <div className="card bg-gray-800 border-gray-700 p-10 text-center rounded-xl">
              <Camera className="w-16 h-16 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400 mb-4">Activez la caméra pour scanner</p>
              <button onClick={startScanner} className="btn-primary flex items-center gap-2 mx-auto">
                <Camera className="w-4 h-4" />
                Activer la caméra
              </button>
            </div>
          )}
        </div>

        {scanning && (
          <button onClick={stopScanner} className="btn-secondary w-full flex items-center justify-center gap-2">
            <CameraOff className="w-4 h-4" />
            Arrêter le scan
          </button>
        )}

        {/* Result overlay */}
        {result && (() => {
          const cfg = resultConfig[result.status]
          const Icon = cfg.icon
          return (
            <div className={`card border-2 p-6 text-center ${cfg.bg}`}>
              <Icon className={`w-12 h-12 ${cfg.color} mx-auto mb-3`} />
              <p className={`text-xl font-bold ${cfg.color}`}>{cfg.label}</p>
              {result.guest && (
                <div className="mt-3">
                  <p className="text-2xl font-bold text-gray-900">{result.guest.full_name}</p>
                  {result.guest.category && (
                    <p className="text-gray-600 mt-1">{result.guest.category}</p>
                  )}
                  {result.guest.table_name && (
                    <p className="text-orange-600 font-medium mt-1">Table : {result.guest.table_name}</p>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* Progress bar */}
        {stats.total > 0 && (
          <div className="card bg-gray-800 border-gray-700 p-4 rounded-xl">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">Progression</span>
              <span className="text-green-400 font-medium">
                {Math.round((stats.checked / stats.total) * 100)}%
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${(stats.checked / stats.total) * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              {stats.total - stats.checked} personnes en attente
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
