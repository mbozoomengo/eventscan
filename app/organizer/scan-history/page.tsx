'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Search, Trash2, RefreshCw, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import type { RecentScanEntry } from '@/app/organizer/scan/page'

const PAGE_SIZE = 50
const RECENT_SCANS_KEY = 'recent_scans'

type ScanStatus = 'success' | 'already_scanned' | 'invalid' | 'cancelled'

interface ScanRow extends RecentScanEntry {
  status: ScanStatus
}

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  success:         'Succ\u00e8s',
  already_scanned: 'Doublon',
  invalid:         'Invalide',
  cancelled:       'Annul\u00e9',
}

const STATUS_CLASS: Record<string, string> = {
  success:         'bg-green-100 text-green-700',
  already_scanned: 'bg-yellow-100 text-yellow-700',
  invalid:         'bg-red-100 text-red-700',
  cancelled:       'bg-gray-100 text-gray-600',
}

function readSession(): ScanRow[] {
  try {
    const raw = sessionStorage.getItem(RECENT_SCANS_KEY)
    return raw ? (JSON.parse(raw) as ScanRow[]) : []
  } catch { return [] }
}

export default function ScanHistoryPage() {
  const [scans,         setScans]         = useState<ScanRow[]>([])
  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [categoryFilter,setCategoryFilter]= useState('all')
  const [page,          setPage]          = useState(1)
  const [loading,       setLoading]       = useState(true)
  const [refreshing,    setRefreshing]    = useState(false)
  const [eventId,       setEventId]       = useState<string | null>(null)
  const router   = useRouter()
  const supabase = createClient()

  // Merge sessionStorage + Supabase, deduplicate by guest_id+scanned_at
  const mergeScans = useCallback((supabaseRows: ScanRow[], sessionRows: ScanRow[]): ScanRow[] => {
    const seen = new Set<string>()
    const all  = [...sessionRows, ...supabaseRows]
    return all.filter(r => {
      const key = `${r.guest_id}|${r.scanned_at}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime())
  }, [])

  const loadFromSupabase = useCallback(async (evId: string, silent = false): Promise<ScanRow[]> => {
    if (!silent) setRefreshing(true)
    const { data, error } = await supabase
      .from('scan_logs')
      .select('id, scanned_at, status, guest_id, guests(full_name, category, table_name)')
      .eq('event_id', evId)
      .order('scanned_at', { ascending: false })
      .limit(100)
    if (error) console.error('[scan-history] supabase error:', error)
    if (!silent) setRefreshing(false)
    if (!data) return []
    return (data as unknown as {
      id: string
      scanned_at: string
      status: string
      guest_id: string
      guests: { full_name: string; category: string | null; table_name: string | null } | null
    }[]).map(r => ({
      guest_id:   r.guest_id,
      full_name:  r.guests?.full_name ?? '\u2014',
      scanned_at: r.scanned_at,
      status:     r.status as ScanStatus,
      category:   r.guests?.category ?? null,
      table_name: r.guests?.table_name ?? null,
    }))
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!['organizer', 'admin'].includes(profile?.role ?? '')) { router.replace('/login'); return }

      const { data: teamEntry } = await supabase
        .from('event_team').select('event_id').eq('user_id', user.id).eq('role', 'organizer').single()
      if (!teamEntry) { router.replace('/organizer'); return }

      const evId = teamEntry.event_id
      setEventId(evId)

      // 1. Show sessionStorage immediately
      const sessionRows = readSession()
      setScans(sessionRows)

      // 2. Load from Supabase and merge
      const dbRows = await loadFromSupabase(evId)
      setScans(mergeScans(dbRows, sessionRows))
      setLoading(false)
    }
    init()
  }, [])

  const handleRefresh = async () => {
    if (!eventId) return
    const dbRows      = await loadFromSupabase(eventId)
    const sessionRows = readSession()
    setScans(mergeScans(dbRows, sessionRows))
  }

  // Dynamic category list
  const categories = useMemo(() => {
    const set = new Set(scans.map(s => s.category ?? 'Sans cat\u00e9gorie'))
    return Array.from(set).sort()
  }, [scans])

  const filtered = useMemo(() => {
    let data = scans
    if (statusFilter !== 'all')   data = data.filter(s => s.status === statusFilter)
    if (categoryFilter !== 'all') data = data.filter(s => (s.category ?? 'Sans cat\u00e9gorie') === categoryFilter)
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(s => s.full_name.toLowerCase().includes(q))
    }
    return data
  }, [scans, statusFilter, categoryFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  )
  useEffect(() => { setPage(1) }, [search, statusFilter, categoryFilter])

  const exportCSV = () => {
    const headers = ['Heure', 'Nom', 'Cat\u00e9gorie', 'Table', 'Statut']
    const rows = filtered.map(s => [
      new Date(s.scanned_at).toLocaleString('fr-FR'),
      s.full_name,
      s.category ?? '',
      s.table_name ?? '',
      STATUS_LABEL[s.status] ?? s.status,
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `scan-history-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const deleteScan = async (entry: ScanRow) => {
    if (!window.confirm('Retirer ce scan de l\'affichage ?')) return
    // Remove from local state only (session + display) — no API call needed for session entries
    setScans(prev => prev.filter(s => !(s.guest_id === entry.guest_id && s.scanned_at === entry.scanned_at)))
    toast.success('Entr\u00e9e retir\u00e9e')
  }

  if (loading) return <Spin />

  const successCount = scans.filter(s => s.status === 'success').length

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Historique des scans</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{successCount} entr\u00e9es valides sur {scans.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} disabled={filtered.length === 0}
            className="flex items-center gap-1 text-sm border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-1 text-sm border rounded-lg px-3 py-1.5 transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input className="input pl-9" placeholder="Rechercher par nom..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input" style={{ width: 'auto' }}
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">Tous les statuts ({scans.length})</option>
          <option value="success">Succ\u00e8s ({scans.filter(s => s.status === 'success').length})</option>
          <option value="already_scanned">Doublons ({scans.filter(s => s.status === 'already_scanned').length})</option>
          <option value="invalid">Invalides ({scans.filter(s => s.status === 'invalid').length})</option>
          <option value="cancelled">Annul\u00e9s ({scans.filter(s => s.status === 'cancelled').length})</option>
        </select>
        <select className="input" style={{ width: 'auto' }}
          value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="all">Toutes cat\u00e9gories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Mobile cards */}
      <div className="block md:hidden space-y-2">
        {paginated.map((s, i) => (
          <div key={`${s.guest_id}-${s.scanned_at}-${i}`} className="card p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{s.full_name}</p>
                {s.category && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.category}{s.table_name ? ` \u00b7 ${s.table_name}` : ''}</p>}
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{new Date(s.scanned_at).toLocaleString('fr-FR')}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  STATUS_CLASS[s.status] ?? 'bg-gray-100 text-gray-600'
                }`}>{STATUS_LABEL[s.status] ?? s.status}</span>
                <button onClick={() => deleteScan(s)} style={{ color: 'var(--text-muted)' }} className="hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {paginated.length === 0 && (
          <p className="text-center text-sm py-10" style={{ color: 'var(--text-muted)' }}>Aucun scan</p>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: 'var(--border-light)', borderBottom: '1px solid var(--border)' }}>
            <tr>
              {['Heure', 'Nom', 'Cat\u00e9gorie', 'Table', 'Statut', ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((s, i) => (
              <tr key={`${s.guest_id}-${s.scanned_at}-${i}`} style={{ borderBottom: '1px solid var(--border-light)' }}>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                  {new Date(s.scanned_at).toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{s.full_name}</p>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{s.category ?? '\u2014'}</td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{s.table_name ?? '\u2014'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    STATUS_CLASS[s.status] ?? 'bg-gray-100 text-gray-600'
                  }`}>{STATUS_LABEL[s.status] ?? s.status}</span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => deleteScan(s)} className="hover:text-red-500 transition-colors" style={{ color: 'var(--text-muted)' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Aucun scan</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {(page - 1) * PAGE_SIZE + 1}\u2013{Math.min(page * PAGE_SIZE, filtered.length)} sur {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded-lg border disabled:opacity-40 transition-colors" style={{ borderColor: 'var(--border)' }}>
              <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            </button>
            <span className="text-sm px-2" style={{ color: 'var(--text-secondary)' }}>{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 rounded-lg border disabled:opacity-40 transition-colors" style={{ borderColor: 'var(--border)' }}>
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
