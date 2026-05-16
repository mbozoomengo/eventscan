'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Search, Trash2, RefreshCw } from 'lucide-react'

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function ScanHistoryPage() {
  const [scans, setScans] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
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
      .select('*, guests(full_name, category), profiles(full_name)')
      .eq('event_id', evId)
      .order('scanned_at', { ascending: false })
      .limit(200)
    setScans(data ?? [])
    if (!silent) setRefreshing(false)
  }, [supabase])

  useEffect(() => {
    let channel: any = null

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

      // Realtime uniquement (suppression du polling redondant)
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

  useEffect(() => {
    let data = scans
    if (statusFilter !== 'all') data = data.filter(s => s.status === statusFilter)
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(s => (s.guests as any)?.full_name?.toLowerCase().includes(q))
    }
    setFiltered(data)
  }, [search, statusFilter, scans])

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
          {scans.length >= 200 && (
            <p className="text-xs text-orange-500">Affichage limité aux 200 derniers scans</p>
          )}
        </div>
        <button
          onClick={() => eventId && loadScans(eventId)}
          disabled={refreshing}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-orange-500 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="Rechercher par nom..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">Tous ({scans.length})</option>
          <option value="success">Succès ({successCount})</option>
          <option value="already_scanned">Doublons ({scans.filter(s => s.status === 'already_scanned').length})</option>
        </select>
      </div>

      {/* Mobile cards */}
      <div className="block md:hidden space-y-2">
        {filtered.map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-sm">{(s.guests as any)?.full_name || '—'}</p>
                {(s.guests as any)?.category && <p className="text-xs text-gray-400">{(s.guests as any).category}</p>}
                <p className="text-xs text-gray-400 mt-1">{new Date(s.scanned_at).toLocaleString('fr-FR')}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                  s.status === 'success' ? 'bg-green-100 text-green-700'
                  : s.status === 'already_scanned' ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-red-100 text-red-700'
                }`}>
                  {s.status === 'success' ? 'Succès' : s.status === 'already_scanned' ? 'Doublon' : 'Invalide'}
                </span>
                <button onClick={() => deleteScan(s.id)} className="text-gray-300 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-10">Aucun scan</p>}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Invité', 'Statut', 'Heure', 'Scanné par', ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-2 text-xs text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium">{(s.guests as any)?.full_name || '—'}</p>
                  {(s.guests as any)?.category && <p className="text-xs text-gray-400">{(s.guests as any).category}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    s.status === 'success' ? 'bg-green-100 text-green-700'
                    : s.status === 'already_scanned' ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
                  }`}>
                    {s.status === 'success' ? 'Succès' : s.status === 'already_scanned' ? 'Doublon' : 'Invalide'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(s.scanned_at).toLocaleString('fr-FR')}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{(s.profiles as any)?.full_name || '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => deleteScan(s.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">Aucun scan</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
