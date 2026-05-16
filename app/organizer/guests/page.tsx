'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Plus, Upload, Download, Search, Trash2, Eye, Loader2 } from 'lucide-react'

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function OrganizerGuestsPage() {
  const [event, setEvent] = useState<any>(null)
  const [guests, setGuests] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
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

      const ev = (teamEntry as any).events
      setEvent(ev)

      const { data: gs } = await supabase
        .from('guests')
        .select('*')
        .eq('event_id', ev.id)
        .order('category')
        .order('full_name')
      setGuests(gs ?? [])
      setFiltered(gs ?? [])
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!search) { setFiltered(guests); return }
    const q = search.toLowerCase()
    setFiltered(guests.filter(g =>
      g.full_name.toLowerCase().includes(q) ||
      g.email?.toLowerCase().includes(q) ||
      g.category?.toLowerCase().includes(q)
    ))
  }, [search, guests])

  const deleteGuest = async (id: string, name: string) => {
    if (!window.confirm(`Supprimer l'invité "${name}" ?`)) return
    const { error } = await supabase.from('guests').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setGuests(prev => prev.filter(g => g.id !== id))
    toast.success('Invité supprimé')
  }

  const downloadAllQR = async () => {
    if (!event) return
    setDownloading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/guests/batch-qr?event_id=${event.id}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (!res.ok) { toast.error('Erreur téléchargement'); setDownloading(false); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `QRCodes-${event.name}.zip`; a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erreur réseau lors du téléchargement')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) return <Spin />

  const grouped = filtered.reduce((acc, g) => {
    const cat = g.category ?? 'Sans catégorie'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(g)
    return acc
  }, {} as Record<string, any[]>)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h1 className="text-xl font-bold">Invités ({guests.length})</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadAllQR} disabled={downloading || guests.length === 0}
            className="border border-gray-300 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-1">
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">ZIP QR</span>
          </button>
          <Link href="/organizer/guests/import"
            className="border border-gray-300 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1">
            <Upload className="w-4 h-4" /><span className="hidden sm:inline">Importer</span>
          </Link>
          <Link href="/organizer/guests/new"
            className="bg-orange-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-1">
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">Ajouter</span>
          </Link>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="Rechercher..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          {search ? 'Aucun résultat' : 'Aucun invité — importez votre liste.'}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex justify-between">
                <span className="text-sm font-medium">{cat}</span>
                <span className="text-xs text-gray-400">{(list as any[]).length} pers.</span>
              </div>
              {(list as any[]).map((g: any) => (
                <div key={g.id} className="px-4 py-3 flex items-center justify-between border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{g.full_name}</p>
                    {g.table_name && <p className="text-xs text-gray-400">{g.table_name}</p>}
                  </div>
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      g.checked_in ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>{g.checked_in ? 'Présent' : 'Attente'}</span>
                    <Link href={`/organizer/guests/${g.id}`}
                      className="text-blue-400 hover:text-blue-600 transition-colors p-1">
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
