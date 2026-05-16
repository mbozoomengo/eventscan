'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Search, Trash2, RefreshCw, Download, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 50

interface ScanLog {
  id: string
  scanned_at: string
  status: string
  guests: { full_name: string; category: string | null } | null
  profiles: { full_name: string | null } | null
}

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  success: 'Succès',
  already_scanned: 'Doublon',
  invalid: 'Invalide',
  cancelled: 'Annulé',
}

const STATUS_CLASS: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  already_scanned: 'bg-yellow-100 text-yellow-700',
  invalid: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
}

export default function ScanHistoryPage() {
  const [scans, setScans] = useState<ScanLog[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [scannerFilter, setScannerFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [eventId, setEventId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()
  const eventIdRef = useRef<string | null>(null)

  const loadScans = useCallback(async (evId: string, silent = false) => {
    if (!silent) setRefreshing(true)
    const { data } = await supabase
      .from('scan_logs')
      .select('id, scanned_at, status, guests(full_name, category), profiles(full_name)')
      .eq('event_id', evId)
      .order('scanned_at', { ascending: false })
      .limit(500)
    setScans((data as unknown as ScanLog[]) ?? [])
    if (!silent) setRefreshing(false)
  }, [supabase])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!['organizer', 'admin'].includes(profile?.role ?? '')) { router.replace('/login'); return }

      const { data: teamEntry } = await supabase
        .from('event_team').select('event_id').eq('user_id', user.id).single()
      if (!teamEntry) { router.replace('/organizer'); return }

      const evId = teamEntry.event_id
      setEventId(evId)
      eventIdRef.current = evId
      await loadScans(evId)
      setLoading(false)

      channel = supabase
        .channel(`scan_logs:${evId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'scan_logs',
          filter: `event_id=eq.${evId}`,
        }, () => { loadScans(evId, true) })
        .subscribe()
    }

    init()
    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  // Scanners uniques pour le select
  const scanners = useMemo(() => {
    const map = new Map<string, string>()
    scans.forEach(s => {
      const name = s.profiles?.full_name
      if (name) map.set(name, name)
    })
    return Array.from(map.values()).sort()
  }, [scans])

  // Filtrage client
  const filtered = useMemo(() => {
    let data = scans
    if (statusFilter !== 'all') data = data.filter(s => s.status === statusFilter)
    if (scannerFilter !== 'all') data = data.filter(s => s.profiles?.full_name === scannerFilter)
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(s => s.guests?.full_name?.toLowerCase().includes(q))
    }
    return data
  }, [scans, statusFilter, scannerFilter, search])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  )

  // Reset page quand filtre change
  useEffect(() => { setPage(1) }, [search, statusFilter, scannerFilter])

  // Export CSV côté client, sans lib
  const exportCSV = () => {
    const headers = ['Heure', 'Invité', 'Catégorie', 'Statut', 'Scanné par']
    const rows = filtered.map(s => [
      new Date(s.scanned_at).toLocaleString('fr-FR'),
      s.guests?.full_name ?? '',
      s.guests?.category ?? '',
      STATUS_LABEL[s.status] ?? s.status,
      s.profiles?.full_name ?? '',
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scan-history-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const deleteScan = async (scanId: string) => {
    if (!window.confirm('Supprimer ce scan ?')) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/scan/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ scan_log_id: scanId }),
    })
    if (res.ok) {
      toast.success('Scan supprimé')
      setScans(prev => prev.filter(s => s.id !== scanId))
    } else {
      toast.error('Erreur')
    }
  }

  if (loading) return <Spin />

  const successCount = scans.filter(s => s.status === 'success').length

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Historique des scans</h1>
          <p className="text-sm text-gray-500">{successCount} entrées valides sur {scans.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-orange-500 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={() => eventId && loadScans(eventId)}
            disabled={refreshing}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-orange-500 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="Rechercher par nom..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">Tous les statuts ({scans.length})</option>
          <option value="success">Succès ({scans.filter(s => s.status === 'success').length})</option>
          <option value="already_scanned">Doublons ({scans.filter(s => s.status === 'already_scanned').length})</option>
          <option value="invalid">Invalides ({scans.filter(s => s.status === 'invalid').length})</option>
          <option value="cancelled">Annulés ({scans.filter(s => s.status === 'cancelled').length})</option>
        </select>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          value={scannerFilter} onChange={e => setScannerFilter(e.target.value)}>
          <option value="all">Tous les scanners</option>
          {scanners.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Mobile cards */}
      <div className="block md:hidden space-y-2">
        {paginated.map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-sm">{s.guests?.full_name || '—'}</p>
                {s.guests?.category && <p className="text-xs text-gray-400">{s.guests.category}</p>}
                <p className="text-xs text-gray-400 mt-1">{new Date(s.scanned_at).toLocaleString('fr-FR')}</p>
                {s.profiles?.full_name && (
                  <p className="text-xs text-gray-400">par {s.profiles.full_name}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                  STATUS_CLASS[s.status] ?? 'bg-gray-100 text-gray-600'
                }`}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
                <button onClick={() => deleteScan(s.id)} className="text-gray-300 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {paginated.length === 0 && <p className="text-center text-gray-400 text-sm py-10">Aucun scan</p>}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Heure', 'Invité', 'Statut', 'Scanné par', ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-2 text-xs text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {new Date(s.scanned_at).toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{s.guests?.full_name || '—'}</p>
                  {s.guests?.category && <p className="text-xs text-gray-400">{s.guests.category}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    STATUS_CLASS[s.status] ?? 'bg-gray-100 text-gray-600'
                  }`}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{s.profiles?.full_name || '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => deleteScan(s.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">Aucun scan</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} sur {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm px-2">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
