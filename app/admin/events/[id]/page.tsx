'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, Users, UserPlus, X, Loader2 } from 'lucide-react'

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function AdminEventDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const [event,           setEvent]           = useState<Record<string, string> | null>(null)
  const [team,            setTeam]            = useState<{ organizer: Record<string, unknown> | null; scanners: Record<string, unknown>[] }>({ organizer: null, scanners: [] })
  const [allOrganizers,   setAllOrganizers]   = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [allScanners,     setAllScanners]     = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [stats,           setStats]           = useState({ guests: 0, scans: 0 })
  const [loading,         setLoading]         = useState(true)
  const [savingOrg,       setSavingOrg]       = useState(false)
  const [savingScanner,   setSavingScanner]   = useState(false)
  const [removingId,      setRemovingId]      = useState<string | null>(null)
  const [selectedOrg,     setSelectedOrg]     = useState('')
  const [selectedScanner, setSelectedScanner] = useState('')
  const router   = useRouter()
  const supabase = createClient()

  const callApi = async (body: object) => {
    const { data: { session } } = await supabase.auth.getSession()
    return fetch('/api/admin/assign-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    })
  }

  const loadData = async () => {
    const { data: ev } = await supabase.from('events').select('*').eq('id', id).single()
    if (!ev) { router.replace('/admin/events'); return }
    setEvent(ev as Record<string, string>)

    const [{ data: teamData }, { data: organizers }, { data: scanners }, { count: guestCount }, { count: scanCount }] =
      await Promise.all([
        supabase.from('event_team').select('*, profiles(id, full_name, email)').eq('event_id', id),
        supabase.from('profiles').select('id, full_name, email').eq('role', 'organizer'),
        supabase.from('profiles').select('id, full_name, email').eq('role', 'scanner'),
        supabase.from('guests').select('*', { count: 'exact', head: true }).eq('event_id', id),
        supabase.from('scan_logs').select('*', { count: 'exact', head: true }).eq('event_id', id).eq('status', 'success'),
      ])

    const td = (teamData ?? []) as Record<string, unknown>[]
    const org = td.find(t => t.role === 'organizer') ?? null
    const scans = td.filter(t => t.role === 'scanner')
    setTeam({ organizer: org, scanners: scans })

    const { data: assignedOrgs } = await supabase.from('event_team').select('user_id').eq('role', 'organizer').neq('event_id', id)
    const assignedIds = new Set((assignedOrgs ?? []).map((a: Record<string, string>) => a.user_id))
    setAllOrganizers(((organizers ?? []) as { id: string; full_name: string | null; email: string }[]).filter(o => !assignedIds.has(o.id)))

    const scannerIdsInTeam = new Set(scans.map(s => s.user_id as string))
    setAllScanners(((scanners ?? []) as { id: string; full_name: string | null; email: string }[]).filter(s => !scannerIdsInTeam.has(s.id)))

    setStats({ guests: guestCount ?? 0, scans: scanCount ?? 0 })
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.replace('/dashboard'); return }
      await loadData()
    }
    init()
  }, [id])

  const assignOrganizer = async () => {
    if (!selectedOrg) return
    setSavingOrg(true)
    const res = await callApi({ action: 'set_organizer', event_id: id, organizer_id: selectedOrg })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Erreur'); setSavingOrg(false); return }
    toast.success('Organisateur assigné')
    setSelectedOrg('')
    await loadData()
    setSavingOrg(false)
  }

  const addScanner = async () => {
    if (!selectedScanner) return
    if (team.scanners.length >= 10) { toast.error('Maximum 10 scanners'); return }
    setSavingScanner(true)
    const res = await callApi({ action: 'add_scanner', event_id: id, scanner_id: selectedScanner })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Erreur'); setSavingScanner(false); return }
    toast.success('Scanner ajouté')
    setSelectedScanner('')
    await loadData()
    setSavingScanner(false)
  }

  const removeMember = async (teamId: string) => {
    if (!window.confirm("Retirer ce membre de l'équipe ?")) return
    setRemovingId(teamId)
    const res = await callApi({ action: 'remove_member', team_id: teamId })
    if (!res.ok) { toast.error('Erreur'); setRemovingId(null); return }
    toast.success('Membre retiré')
    await loadData()
    setRemovingId(null)
  }

  if (loading || !event) return <Spin />

  const org = team.organizer as Record<string, unknown> | null
  const orgProfiles = org ? (org.profiles as Record<string, string> | null) : null

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/events" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{event.name}</h1>
          <p className="text-sm text-gray-500">
            {new Date(event.date).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {event.location ? ` · ${event.location}` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{stats.guests}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Invités</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{stats.scans}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Scans réussis</p>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-5 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Users className="w-4 h-4" /> Équipe
        </h2>

        <div className="mb-5">
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Organisateur</p>
          {org ? (
            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <div>
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{orgProfiles?.full_name || '—'}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{orgProfiles?.email}</p>
              </div>
              <button onClick={() => removeMember(org.id as string)} disabled={removingId === org.id}
                className="text-red-400 hover:text-red-600 p-1 transition-colors">
                {removingId === org.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select className="input flex-1" value={selectedOrg} onChange={e => setSelectedOrg(e.target.value)}>
                <option value="">— Sélectionner un organisateur —</option>
                {allOrganizers.map(o => (
                  <option key={o.id} value={o.id}>{o.full_name || o.email} ({o.email})</option>
                ))}
              </select>
              <button onClick={assignOrganizer} disabled={!selectedOrg || savingOrg} className="btn-primary flex items-center gap-1 text-sm">
                {savingOrg ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Assigner
              </button>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
            Scanners ({team.scanners.length}/10)
          </p>
          <div className="space-y-2 mb-3">
            {team.scanners.map(s => {
              const sr = s as Record<string, unknown>
              const sp = sr.profiles as Record<string, string> | null
              return (
                <div key={sr.id as string} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-page)' }}>
                  <div>
                    <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{sp?.full_name || '—'}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{sp?.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sr.is_blocked && <span className="text-xs bg-red-100 text-red-600 font-medium px-2 py-0.5 rounded-full">Bloqué</span>}
                    <button onClick={() => removeMember(sr.id as string)} disabled={removingId === sr.id}
                      className="text-red-400 hover:text-red-600 p-1 transition-colors">
                      {removingId === sr.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )
            })}
            {team.scanners.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Aucun scanner assigné</p>}
          </div>
          {team.scanners.length < 10 && (
            <div className="flex gap-2">
              <select className="input flex-1" value={selectedScanner} onChange={e => setSelectedScanner(e.target.value)}>
                <option value="">— Ajouter un scanner —</option>
                {allScanners.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name || s.email} ({s.email})</option>
                ))}
              </select>
              <button onClick={addScanner} disabled={!selectedScanner || savingScanner} className="btn-secondary flex items-center gap-1 text-sm">
                {savingScanner ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Ajouter
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
