'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { UserPlus, Loader2, X, ShieldOff, ShieldCheck, Users } from 'lucide-react'

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

interface TeamMember {
  id: string
  user_id: string
  is_blocked: boolean
  profiles: { id: string; full_name: string | null; email: string } | null
}

interface Scanner {
  id: string
  full_name: string | null
  email: string
}

interface EventShape {
  id: string
  name: string
}

export default function OrganizerTeamPage() {
  const [team,            setTeam]            = useState<TeamMember[]>([])
  const [available,       setAvailable]       = useState<Scanner[]>([])
  const [selectedScanner, setSelectedScanner] = useState('')
  const [event,           setEvent]           = useState<EventShape | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [saving,          setSaving]          = useState(false)
  const [removingId,      setRemovingId]      = useState<string | null>(null)
  const router   = useRouter()
  const supabase = createClient()

  const loadTeam = async (evId: string) => {
    const [{ data: teamData }, { data: allScanners }] = await Promise.all([
      supabase.from('event_team').select('id, user_id, is_blocked, profiles(id, full_name, email)').eq('event_id', evId).eq('role', 'scanner'),
      supabase.from('profiles').select('id, full_name, email').eq('role', 'scanner'),
    ])
    const inTeam = new Set((teamData ?? []).map((t: TeamMember) => t.user_id))
    setTeam((teamData as unknown as TeamMember[]) ?? [])
    setAvailable(((allScanners as unknown as Scanner[]) ?? []).filter(s => !inTeam.has(s.id)))
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!['organizer', 'admin'].includes(profile?.role ?? '')) { router.replace('/login'); return }
      const { data: teamEntry } = await supabase
        .from('event_team').select('event_id, events(id, name)').eq('user_id', user.id).eq('role', 'organizer').single()
      if (!teamEntry) { router.replace('/organizer'); return }
      const ev = (teamEntry as unknown as { event_id: string; events: EventShape }).events
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
      if (event) await loadTeam(event.id)
    } else {
      toast.error('Erreur')
    }
    setSaving(false)
  }

  const removeScanner = async (teamId: string) => {
    if (!window.confirm("Retirer ce scanner de l'équipe ?")) return
    setRemovingId(teamId)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/assign-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ action: 'remove_member', team_id: teamId }),
    })
    if (res.ok) {
      toast.success('Scanner retiré')
      if (event) await loadTeam(event.id)
    } else {
      toast.error('Erreur lors du retrait')
    }
    setRemovingId(null)
  }

  const addScanner = async () => {
    if (!selectedScanner || !event) return
    if (team.length >= 10) { toast.error('Maximum 10 scanners'); return }
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/assign-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ action: 'add_scanner', event_id: event.id, scanner_id: selectedScanner }),
    })
    if (res.ok) {
      toast.success('Scanner ajouté')
      setSelectedScanner('')
      await loadTeam(event.id)
    } else {
      const data = await res.json()
      toast.error(data.error || "Erreur lors de l'ajout")
    }
    setSaving(false)
  }

  if (loading) return <Spin />

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">

      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-orange-600" />
          </span>
          <div>
            <h1 className="font-bold text-lg text-gray-900">Équipe scanners</h1>
            <p className="text-sm text-gray-500">{event?.name} · {team.length}/10 scanners</p>
          </div>
        </div>
      </div>

      {/* Team list — cards responsive */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Membres actifs</h2>

        {team.length === 0 ? (
          <div className="card p-10 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Aucun scanner assigné</p>
          </div>
        ) : (
          team.map(t => (
            <div key={t.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Avatar initiales */}
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-gray-500">
                {(t.profiles?.full_name ?? t.profiles?.email ?? '?')[0]?.toUpperCase()}
              </div>

              {/* Infos */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">
                  {t.profiles?.full_name ?? '—'}
                </p>
                <p className="text-xs text-gray-400 truncate">{t.profiles?.email}</p>
              </div>

              {/* Badge statut */}
              <span className={`self-start sm:self-auto text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
                t.is_blocked ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
              }`}>
                {t.is_blocked ? 'Bloqué' : 'Actif'}
              </span>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleBlock(t.id, t.is_blocked)}
                  disabled={saving}
                  title={t.is_blocked ? 'Débloquer' : 'Bloquer'}
                  className={`p-2 rounded-lg border transition-colors disabled:opacity-50 ${
                    t.is_blocked
                      ? 'border-green-200 text-green-600 hover:bg-green-50'
                      : 'border-red-200 text-red-500 hover:bg-red-50'
                  }`}>
                  {t.is_blocked
                    ? <ShieldCheck className="w-4 h-4" />
                    : <ShieldOff  className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => removeScanner(t.id)}
                  disabled={removingId === t.id}
                  title="Retirer de l'équipe"
                  className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50">
                  {removingId === t.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <X className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Ajouter un scanner */}
      {team.length < 10 && (
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Ajouter un scanner</h2>
          {available.length === 0 ? (
            <p className="text-sm text-gray-400">Aucun scanner disponible.</p>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={selectedScanner} onChange={e => setSelectedScanner(e.target.value)}>
                <option value="">— Sélectionner un scanner —</option>
                {available.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.full_name ? `${s.full_name} (${s.email})` : s.email}
                  </option>
                ))}
              </select>
              <button onClick={addScanner} disabled={!selectedScanner || saving}
                className="btn-primary flex items-center justify-center gap-1.5 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Ajouter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
