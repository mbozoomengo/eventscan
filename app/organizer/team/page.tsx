'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { UserPlus, Loader2 } from 'lucide-react'

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function OrganizerTeamPage() {
  const [team, setTeam] = useState<any[]>([])
  const [available, setAvailable] = useState<any[]>([])
  const [selectedScanner, setSelectedScanner] = useState('')
  const [event, setEvent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const loadTeam = async (evId: string) => {
    const { data: teamData } = await supabase
      .from('event_team')
      .select('*, profiles(id, full_name, email)')
      .eq('event_id', evId)
      .eq('role', 'scanner')
    const inTeam = new Set((teamData ?? []).map((t: any) => t.user_id))
    const { data: allScanners } = await supabase
      .from('profiles').select('id, full_name, email').eq('role', 'scanner')
    setTeam(teamData ?? [])
    setAvailable((allScanners ?? []).filter((s: any) => !inTeam.has(s.id)))
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'organizer') { router.replace('/dashboard'); return }
      const { data: teamEntry } = await supabase
        .from('event_team').select('event_id, events(id, name)').eq('user_id', user.id).eq('role', 'organizer').single()
      if (!teamEntry) { router.replace('/organizer'); return }
      const ev = (teamEntry as any).events
      setEvent(ev)
      await loadTeam(ev.id)
      setLoading(false)
    }
    init()
  }, [])

  const toggleBlock = async (teamId: string, currentlyBlocked: boolean) => {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/team/block-scanner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ event_team_id: teamId, is_blocked: !currentlyBlocked }),
    })
    if (res.ok) {
      toast.success(!currentlyBlocked ? 'Scanner bloqué' : 'Scanner débloqué')
      await loadTeam(event.id)
    } else {
      toast.error('Erreur')
    }
    setSaving(false)
  }

  const addScanner = async () => {
    if (!selectedScanner || !event) return
    if (team.length >= 10) { toast.error('Maximum 10 scanners'); return }
    setSaving(true)
    const { error } = await supabase.from('event_team').insert({
      event_id: event.id,
      user_id: selectedScanner,
      role: 'scanner',
    })
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Scanner ajouté')
    setSelectedScanner('')
    await loadTeam(event.id)
    setSaving(false)
  }

  if (loading) return <Spin />

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold">Équipe ({team.length}/10 scanners)</h1>
        <p className="text-sm text-gray-500">{event?.name}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Scanner', 'Email', 'Statut', 'Action'].map(h => (
                <th key={h} className="text-left px-4 py-2 text-xs text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {team.map((t: any) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{(t.profiles as any)?.full_name || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{(t.profiles as any)?.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    t.is_blocked ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
                  }`}>
                    {t.is_blocked ? 'Bloqué' : 'Actif'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleBlock(t.id, t.is_blocked)}
                    disabled={saving}
                    className={`text-xs font-medium px-3 py-1 rounded-lg border transition-colors ${
                      t.is_blocked
                        ? 'border-green-300 text-green-600 hover:bg-green-50'
                        : 'border-red-300 text-red-500 hover:bg-red-50'
                    }`}>
                    {t.is_blocked ? 'Débloquer' : 'Bloquer'}
                  </button>
                </td>
              </tr>
            ))}
            {team.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-gray-400 text-sm">
                  Aucun scanner assigné
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {team.length < 10 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h2 className="font-medium mb-3">Ajouter un scanner</h2>
          <div className="flex gap-2">
            <select
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              value={selectedScanner} onChange={e => setSelectedScanner(e.target.value)}>
              <option value="">-- Sélectionner un scanner --</option>
              {available.map(s => (
                <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>
              ))}
            </select>
            <button onClick={addScanner} disabled={!selectedScanner || saving}
              className="bg-orange-500 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center gap-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Ajouter
            </button>
          </div>
        </div>
      )}
    </>
  )
}
