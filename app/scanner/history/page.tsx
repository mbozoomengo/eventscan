'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function ScannerHistoryPage() {
  const [scans, setScans] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'scanner') { router.replace('/login'); return }

      const { data: teamEntry } = await supabase
        .from('event_team').select('event_id').eq('user_id', user.id).eq('role', 'scanner').single()
      if (!teamEntry) { router.replace('/scanner'); return }

      const { data } = await supabase
        .from('scan_logs')
        .select('*, guests(full_name, category, table_name)')
        .eq('event_id', teamEntry.event_id)
        .eq('scanned_by', user.id)
        .order('scanned_at', { ascending: false })
        .limit(100)
      setScans(data ?? [])
      setFiltered(data ?? [])
      setLoading(false)
    }
    init()
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

  if (loading) return <Spin />

  const successCount = scans.filter(s => s.status === 'success').length

  return (
    <>
      <div className="mb-4">
        <h1 className="text-lg font-bold">Mon historique ({scans.length})</h1>
        <p className="text-sm text-gray-400">{successCount} entrées valides</p>
        {scans.length >= 100 && (
          <p className="text-xs text-orange-400">Affichage limité aux 100 derniers scans</p>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="Rechercher..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select
          className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">Tous</option>
          <option value="success">Succès</option>
          <option value="already_scanned">Doublons</option>
        </select>
      </div>

      <div className="space-y-2">
        {filtered.map(s => (
          <div key={s.id} className="bg-gray-800 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{(s.guests as any)?.full_name || '—'}</p>
              <p className="text-xs text-gray-400">
                {new Date(s.scanned_at).toLocaleString('fr-FR')}
              </p>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              s.status === 'success' ? 'bg-green-800 text-green-300'
              : s.status === 'already_scanned' ? 'bg-yellow-800 text-yellow-300'
              : 'bg-red-800 text-red-300'
            }`}>
              {s.status === 'success' ? 'Succès' : s.status === 'already_scanned' ? 'Doublon' : 'Invalide'}
            </span>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-10">Aucun scan</p>
        )}
      </div>
    </>
  )
}
