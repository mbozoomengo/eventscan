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
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function AdminEventDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const [event, setEvent] = useState<any>(null)
  const [team, setTeam] = useState<{ organizer: any | null; scanners: any[] }>({ organizer: null, scanners: [] })
  const [allOrganizers, setAllOrganizers] = useState<any[]>([])
  const [allScanners, setAllScanners] = useState<any[]>([])
  const [stats, setStats] = useState({ guests: 0, scans: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState('')
  const [selectedScanner, setSelectedScanner] = useState('')
  const router = useRouter()
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
    setEvent(ev)

    const [{ data: teamData }, { data: organizers }, { data: scanners }, { count: guestCount }, { count: scanCount }] =
      await Promise.all([
        supabase.from('event_team').select('*, profiles(id, full_name, email)').eq('event_id', id),
        supabase.from('profiles').select('id, full_name, email').eq('role', 'organizer'),
        supabase.from('profiles').select('id, full_name, email').eq('role', 'scanner'),
        supabase.from('guests').select('*', { count: 'exact', head: true }).eq('event_id', id),
        supabase.from('scan_logs').select('*', { count: 'exact', head: true }).eq('event_id', id).eq('status', 'success'),
      ])

    const td = teamData ?? []
    const org = td.find((t: any) => t.role === 'organizer') ?? null
    const scans = td.filter((t: any) => t.role === 'scanner')
    setTeam({ organizer: org, scanners: scans })

    const { data: assignedOrgs } = await supabase
      .from('event_team').select('user_id').eq('role', 'organizer').neq('event_id', id)
    const assignedIds = new Set((assignedOrgs ?? []).map((a: any) => a.user_id))
    setAllOrganizers((organizers ?? []).filter((o: any) => !assignedIds.has(o.id)))

    const scannerIdsInTeam = new Set(scans.map((s: any) => s.user_id))
    setAllScanners((scanners ?? []).filter((s: any) => !scannerIdsInTeam.has(s.id)))

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
    setSaving(true)
    const res = await callApi({ action: 'set_organizer', event_id: id, organizer_id: selectedOrg })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Erreur'); setSaving(false); return }
    toast.success('Organisateur assigné')
    setSelectedOrg('')
    await loadData()
    setSaving(false)
  }

  const addScanner = async () => {
    if (!selectedScanner) return
    if (team.scanners.length >= 10) { toast.error('Maximum 10 scanners'); return }
    setSaving(true)
    const res = await callApi({ action: 'add_scanner', event_id: id, scanner_id: selectedScanner })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Erreur'); setSaving(false); return }
    toast.success('Scanner ajouté')
    setSelectedScanner('')
    await loadData()
    setSaving(false)
  }

  const removeMember = async (teamId: string) => {
    setSaving(true)
    const res = await callApi({ action: 'remove_member', team_id: teamId })
    if (!res.ok) { toast.error('Erreur'); setSaving(false); return }
    toast.success('Retiré')
    await loadData()
    setSaving(false)
  }

  if (loading || !event) return <Spin />

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/events" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{event.name}</h1>
          <p className="text-sm text-gray-500">
            {new Date(event.date).toLocaleString('fr-FR')}
            {event.location ? ` · ${event.location}` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-2xl font-bold">{stats.guests}</p>
          <p className="text-xs text-gray-500">Invités</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-2xl font-bold">{stats.scans}</p>
          <p className="text-xs text-gray-500">Scans réussis</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="font-semibold mb-5 flex items-center gap-2">
          <Users className="w-4 h-4" /> Équipe
        </h2>

        <div className="mb-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Organisateur</p>
          {team.organizer ? (
            <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-100 rounded-lg">
              <div>
                <p className="font-medium text-sm">{(team.organizer.profiles as any)?.full_name || '—'}</p>
                <p className="text-xs text-gray-500">{(team.organizer.profiles as any)?.email}</p>
              </div>
              <button onClick={() => removeMember(team.organizer.id)} disabled={saving}
                className="text-red-400 hover:text-red-600 p-1 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={selectedOrg} onChange={e => setSelectedOrg(e.target.value)}>
                <option value="">— Sélectionner un organisateur —</option>
                {allOrganizers.map(o => (
                  <option key={o.id} value={o.id}>{o.full_name || o.email} ({o.email})</option>
                ))}
              </select>
              <button onClick={assignOrganizer} disabled={!selectedOrg || saving}
                className="bg-orange-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center gap-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Assigner
              </button>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
            Scanners ({team.scanners.length}/10)
          </p>
          <div className="space-y-2 mb-3">
            {team.scanners.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{s.profiles?.full_name || '—'}</p>
                  <p className="text-xs text-gray-500">{s.profiles?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {s.is_blocked && (
                    <span className="text-xs bg-red-100 text-red-600 font-medium px-2 py-0.5 rounded-full">Bloqué</span>
                  )}
                  <button onClick={() => removeMember(s.id)} disabled={saving}
                    className="text-red-400 hover:text-red-600 p-1 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {team.scanners.length === 0 && (
              <p className="text-sm text-gray-400">Aucun scanner assigné</p>
            )}
          </div>
          {team.scanners.length < 10 && (
            <div className="flex gap-2">
              <select
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={selectedScanner} onChange={e => setSelectedScanner(e.target.value)}>
                <option value="">— Ajouter un scanner —</option>
                {allScanners.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name || s.email} ({s.email})</option>
                ))}
              </select>
              <button onClick={addScanner} disabled={!selectedScanner || saving}
                className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Ajouter
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
