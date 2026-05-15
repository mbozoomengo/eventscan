'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function ScannerHistoryPage() {
  const [scans, setScans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: teamEntry } = await supabase
        .from('event_team').select('event_id').eq('user_id', user.id).eq('role', 'scanner').single()
      if (!teamEntry) { router.replace('/scanner'); return }
      const { data } = await supabase
        .from('scan_logs')
        .select('*, guests(full_name, category, table_name)')
        .eq('event_id', teamEntry.event_id)
        .eq('scanned_by', user.id)
        .neq('deleted', true)
        .order('scanned_at', { ascending: false })
      setScans(data ?? [])
      setLoading(false)
    }
    init()
  }, [])

  if (loading) return <Spin />

  return (
    <>
      <h1 className="text-lg font-bold mb-4">Mon historique ({scans.length})</h1>
      <div className="space-y-2">
        {scans.map(s => (
          <div key={s.id} className="bg-gray-800 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{(s.guests as any)?.full_name || '—'}</p>
              <p className="text-xs text-gray-400">
                {new Date(s.scanned_at).toLocaleString('fr-FR')}
              </p>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              s.status === 'success' ? 'bg-green-800 text-green-300' : 'bg-yellow-800 text-yellow-300'
            }`}>
              {s.status === 'success' ? '✓' : '⚠'}
            </span>
          </div>
        ))}
        {scans.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-10">Aucun scan effectué</p>
        )}
      </div>
    </>
  )
}
