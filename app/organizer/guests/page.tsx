'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Plus, Upload, Download, Search, Trash2, Eye, Loader2,
  FileText, MessageCircle, CheckCircle2, XCircle,
} from 'lucide-react'

type Template = 'corporate' | 'gala' | 'associatif'
type SortKey = 'name' | 'arrival' | 'category'
type StatusFilter = 'all' | 'present' | 'absent' | 'unnotified'

interface Guest {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  category: string | null
  table_name: string | null
  checked_in: boolean
  invitation_sent_at: string | null
  checked_in_at?: string | null
}

interface TeamEntryShape {
  event_id: string
  events: { id: string; name: string }
}

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function OrganizerGuestsPage() {
  const [event, setEvent] = useState<{ id: string; name: string } | null>(null)
  const [guests, setGuests] = useState<Guest[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [tableFilter, setTableFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [template, setTemplate] = useState<Template>('corporate')
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [downloadingInv, setDownloadingInv] = useState(false)
  const [exportFilter, setExportFilter] = useState<'all' | 'present'>('all')
  const [exportSort, setExportSort] = useState<'name' | 'time'>('name')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!['organizer', 'admin'].includes(profile?.role ?? '')) { router.replace('/login'); return }

      const { data: teamEntry } = await supabase
        .from('event_team')
        .select('event_id, events(id, name)')
        .eq('user_id', user.id)
        .single()
      if (!teamEntry) { router.replace('/organizer'); return }

      const ev = (teamEntry as unknown as TeamEntryShape).events
      setEvent(ev)

      const { data: gs } = await supabase
        .from('guests')
        .select('id, full_name, email, phone, category, table_name, checked_in, checked_in_at, invitation_sent_at')
        .eq('event_id', ev.id)
        .order('category')
        .order('full_name')
      setGuests((gs as Guest[]) ?? [])
      setLoading(false)
    }
    init()
  }, [])

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }, [])

  const categories = useMemo(() => {
    const set = new Set(guests.map(g => g.category ?? 'Sans catégorie'))
    return Array.from(set).sort()
  }, [guests])

  const tables = useMemo(() => {
    const set = new Set(guests.filter(g => g.table_name).map(g => g.table_name!))
    return Array.from(set).sort()
  }, [guests])

  const filtered = useMemo(() => {
    let list = guests
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(g =>
        g.full_name.toLowerCase().includes(q) ||
        g.email?.toLowerCase().includes(q) ||
        g.category?.toLowerCase().includes(q)
      )
    }
    if (statusFilter === 'present')    list = list.filter(g => g.checked_in)
    else if (statusFilter === 'absent')     list = list.filter(g => !g.checked_in)
    else if (statusFilter === 'unnotified') list = list.filter(g => !g.invitation_sent_at)
    if (categoryFilter !== 'all') list = list.filter(g => (g.category ?? 'Sans catégorie') === categoryFilter)
    if (tableFilter !== 'all')    list = list.filter(g => g.table_name === tableFilter)
    list = [...list].sort((a, b) => {
      if (sortKey === 'name')     return a.full_name.localeCompare(b.full_name)
      if (sortKey === 'arrival') {
        if (!a.checked_in_at) return 1
        if (!b.checked_in_at) return -1
        return new Date(a.checked_in_at).getTime() - new Date(b.checked_in_at).getTime()
      }
      if (sortKey === 'category') return (a.category ?? '').localeCompare(b.category ?? '')
      return 0
    })
    return list
  }, [guests, search, statusFilter, categoryFilter, tableFilter, sortKey])

  const deleteGuest = async (id: string, name: string) => {
    if (!window.confirm(`Supprimer l'invité "${name}" ?`)) return
    const token = await getToken()
    const res = await fetch(`/api/guests/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const data = await res.json()
      toast.error(data.error || 'Erreur suppression')
      return
    }
    setGuests(prev => prev.filter(g => g.id !== id))
    toast.success('Invité supprimé')
  }

  const cancelCheckIn = async (guest: Guest) => {
    setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, checked_in: false, checked_in_at: null } : g))
    const token = await getToken()
    const res = await fetch(`/api/scan/${guest.id}/cancel`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, checked_in: true, checked_in_at: guest.checked_in_at ?? null } : g))
      const data = await res.json()
      toast.error(data.error || 'Erreur annulation')
      return
    }
    toast.success(`Check-in de ${guest.full_name} annulé`)
  }

  // ---- téléchargements (3 actions distinctes, aucun doublon) ----
  const downloadAllQR = async () => {
    if (!event) return
    setDownloading(true)
    try {
      const token = await getToken()
      const res = await fetch(`/api/guests/batch-qr?event_id=${event.id}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { toast.error('Erreur téléchargement'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `QRCodes-${event.name}.zip`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Erreur réseau') }
    finally { setDownloading(false) }
  }

  const downloadInvitations = async () => {
    if (!event) return
    setDownloadingInv(true)
    try {
      const token = await getToken()
      const res = await fetch(`/api/events/${event.id}/invitation?all=true&template=${template}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { toast.error('Erreur génération PDF'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `Invitations-${event.name}.zip`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Erreur réseau') }
    finally { setDownloadingInv(false) }
  }

  const exportExcel = async () => {
    if (!event) return
    try {
      const token = await getToken()
      const res = await fetch(`/api/events/${event.id}/export?filter=${exportFilter}&sort=${exportSort}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { toast.error('Erreur export'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `Presences-${event.name}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Erreur réseau') }
  }

  const sendWhatsAppAll = async () => {
    if (!event) return
    const withPhone = guests.filter(g => g.phone)
    if (withPhone.length === 0) { toast.error('Aucun invité avec numéro de téléphone'); return }
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const lines = withPhone.map(g => {
      const qrUrl = `${origin}/api/guests/${g.id}/qr`
      const msg = encodeURIComponent(`Bonjour ${g.full_name},\nVoici votre invitation pour ${event.name}.\nQR code : ${qrUrl}`)
      const phone = g.phone!.replace(/\D/g, '')
      const fullPhone = phone.startsWith('237') ? phone : `237${phone}`
      return `https://wa.me/${fullPhone}?text=${msg}`
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `WhatsApp-${event.name}.txt`; a.click()
    URL.revokeObjectURL(url)
    const token = await getToken()
    await Promise.allSettled(withPhone.map(g => fetch(`/api/guests/${g.id}/invitation-sent`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } })))
    setGuests(prev => prev.map(g => withPhone.find(w => w.id === g.id) ? { ...g, invitation_sent_at: new Date().toISOString() } : g))
    toast.success(`${withPhone.length} liens générés`)
  }

  if (loading) return <Spin />

  const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'all',        label: 'Tous' },
    { key: 'present',    label: 'Présents' },
    { key: 'absent',     label: 'Absents' },
    { key: 'unnotified', label: 'Non notifiés' },
  ]

  const grouped = filtered.reduce<Record<string, Guest[]>>((acc, g) => {
    const cat = g.category ?? 'Sans catégorie'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(g)
    return acc
  }, {})

  return (
    <>
      {/* ---- Barre d'actions ---- */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h1 className="text-xl font-bold">Invités ({guests.length})</h1>
        <div className="flex flex-wrap gap-2">

          {/* QR codes ZIP */}
          <button onClick={downloadAllQR} disabled={downloading || guests.length === 0}
            className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-50">
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">QR codes</span>
          </button>

          {/* Export Excel avec options */}
          <div className="flex items-center gap-1">
            <select value={exportFilter} onChange={e => setExportFilter(e.target.value as 'all' | 'present')}
              className="border border-gray-300 rounded-lg text-xs px-2 py-1.5 focus:outline-none">
              <option value="all">Tous</option>
              <option value="present">Présents</option>
            </select>
            <select value={exportSort} onChange={e => setExportSort(e.target.value as 'name' | 'time')}
              className="border border-gray-300 rounded-lg text-xs px-2 py-1.5 focus:outline-none">
              <option value="name">Par nom</option>
              <option value="time">Par heure</option>
            </select>
            <button onClick={exportExcel} disabled={guests.length === 0}
              className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-50">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Excel</span>
            </button>
          </div>

          {/* Invitations PDF avec choix template */}
          <div className="flex items-center gap-1">
            <select value={template} onChange={e => setTemplate(e.target.value as Template)}
              className="border border-gray-300 rounded-lg text-xs px-2 py-1.5 focus:outline-none">
              <option value="corporate">Corporate</option>
              <option value="gala">Gala</option>
              <option value="associatif">Associatif</option>
            </select>
            <button onClick={downloadInvitations} disabled={downloadingInv || guests.length === 0}
              className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-50">
              {downloadingInv ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span className="hidden sm:inline">Invitations</span>
            </button>
          </div>

          {/* WhatsApp */}
          <button onClick={sendWhatsAppAll} disabled={guests.length === 0}
            className="border border-green-500 text-green-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-green-50 disabled:opacity-50 transition-colors flex items-center gap-1">
            <MessageCircle className="w-4 h-4" />
            <span className="hidden sm:inline">WhatsApp</span>
          </button>

          <Link href="/organizer/guests/import"
            className="btn-secondary text-sm flex items-center gap-1">
            <Upload className="w-4 h-4" /><span className="hidden sm:inline">Importer</span>
          </Link>
          <Link href="/organizer/guests/new"
            className="btn-primary text-sm flex items-center gap-1">
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">Ajouter</span>
          </Link>
        </div>
      </div>

      {/* Recherche */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="Rechercher…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Chips filtres */}
      <div className="flex flex-wrap gap-2 mb-2">
        {STATUS_FILTERS.map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
              statusFilter === f.key ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}>{f.label}</button>
        ))}
        {categories.map(cat => (
          <button key={cat} onClick={() => setCategoryFilter(prev => prev === cat ? 'all' : cat)}
            className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
              categoryFilter === cat ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}>{cat}</button>
        ))}
        {tables.map(table => (
          <button key={table} onClick={() => setTableFilter(prev => prev === table ? 'all' : table)}
            className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
              tableFilter === table ? 'bg-purple-500 border-purple-500 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}>{table}</button>
        ))}
      </div>

      {/* Tri */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-500">Trier :</span>
        <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
          className="border border-gray-300 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400">
          <option value="name">Alphabétique</option>
          <option value="arrival">Heure d'arrivée</option>
          <option value="category">Catégorie</option>
        </select>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} résultat{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          {search || statusFilter !== 'all' || categoryFilter !== 'all' || tableFilter !== 'all'
            ? 'Aucun résultat' : 'Aucun invité — importez votre liste.'}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex justify-between">
                <span className="text-sm font-medium">{cat}</span>
                <span className="text-xs text-gray-400">{list.length} pers.</span>
              </div>
              {list.map((g) => (
                <div key={g.id} className="px-4 py-3 flex items-center justify-between border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{g.full_name}</p>
                      {g.invitation_sent_at && (
                        <span className="flex items-center gap-0.5 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Notifié
                        </span>
                      )}
                    </div>
                    {g.table_name && <p className="text-xs text-gray-400">{g.table_name}</p>}
                    {g.checked_in && g.checked_in_at && (
                      <p className="text-xs text-green-600">Arrivée : {new Date(g.checked_in_at).toLocaleTimeString('fr-FR')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      g.checked_in ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>{g.checked_in ? 'Présent' : 'Attente'}</span>
                    {g.checked_in && (
                      <button onClick={() => cancelCheckIn(g)} title="Annuler le check-in"
                        className="text-orange-400 hover:text-orange-600 transition-colors p-1">
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                    <Link href={`/organizer/guests/${g.id}`} className="text-blue-400 hover:text-blue-600 transition-colors p-1">
                      <Eye className="w-4 h-4" />
                    </Link>
                    <button onClick={() => deleteGuest(g.id, g.full_name)}
                      className="text-gray-300 hover:text-red-500 transition-colors p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
