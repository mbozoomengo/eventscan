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

export default function ScannerGuestsPage() {
  const [guests, setGuests] = useState<any[]>([])
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
        .from('guests')
        .select('id, full_name, category, table_name, checked_in')
        .eq('event_id', teamEntry.event_id)
        .eq('checked_in', true)
        .order('full_name')
      setGuests(data ?? [])
      setLoading(false)
    }
    init()
  }, [])

  if (loading) return <Spin />

  return (
    <>
      <h1 className="text-lg font-bold mb-4">Invités présents ({guests.length})</h1>
      <div className="space-y-2">
        {guests.map(g => (
          <div key={g.id} className="bg-gray-800 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{g.full_name}</p>
              {g.category && (
                <p className="text-xs text-gray-400">
                  {g.category}{g.table_name ? ` · ${g.table_name}` : ''}
                </p>
              )}
            </div>
            <span className="text-xs bg-green-800 text-green-300 font-medium px-2 py-0.5 rounded-full">✓</span>
          </div>
        ))}
        {guests.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-10">Aucun invité scanné</p>
        )}
      </div>
    </>
  )
}
