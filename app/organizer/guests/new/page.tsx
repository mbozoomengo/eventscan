'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

const emptyForm = { full_name: '', email: '', phone: '', category: '', table_name: '' }

export default function NewGuestPage() {
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [eventId, setEventId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Auth + team check au montage
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!['organizer', 'admin'].includes(profile?.role ?? '')) { router.replace('/login'); return }
      const { data: teamEntry } = await supabase
        .from('event_team').select('event_id').eq('user_id', user.id).eq('role', 'organizer').single()
      if (!teamEntry) { toast.error('Aucun événement assigné'); router.replace('/organizer'); return }
      setEventId(teamEntry.event_id)
    }
    init()
  }, [])

  const handleSubmit = async (e: React.FormEvent, addAnother = false) => {
    e.preventDefault()
    if (!eventId) return
    setLoading(true)
    const { error } = await supabase.from('guests').insert({
      event_id: eventId,
      full_name: form.full_name,
      email: form.email || null,
      phone: form.phone || null,
      category: form.category || null,
      table_name: form.table_name || null,
    })
    if (error) { toast.error(error.message); setLoading(false); return }
    toast.success('Invité ajouté')
    if (addAnother) {
      setForm(emptyForm)
    } else {
      router.push('/organizer/guests')
    }
    setLoading(false)
  }

  if (!eventId && !loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/organizer/guests" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold">Ajouter un invité</h1>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg shadow-sm">
        <form onSubmit={e => handleSubmit(e, false)} className="space-y-4">
          <div><label className={labelCls}>Nom complet *</label><input className={inputCls} value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required /></div>
          <div><label className={labelCls}>Email</label><input type="email" className={inputCls} value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
          <div><label className={labelCls}>Téléphone</label><input className={inputCls} value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
          <div><label className={labelCls}>Catégorie</label><input className={inputCls} placeholder="VIP, Standard..." value={form.category} onChange={e => setForm({...form, category: e.target.value})} /></div>
          <div><label className={labelCls}>Table</label><input className={inputCls} placeholder="Table 1, Table VIP..." value={form.table_name} onChange={e => setForm({...form, table_name: e.target.value})} /></div>
          <div className="flex gap-3 pt-2">
            <Link href="/organizer/guests"
              className="flex-1 text-center border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors">
              Annuler
            </Link>
            <button type="button" disabled={loading} onClick={e => handleSubmit(e as any, true)}
              className="flex-1 border border-orange-400 text-orange-600 text-sm font-medium py-2 rounded-lg hover:bg-orange-50 disabled:opacity-50 transition-colors">
              + Ajouter un autre
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-orange-500 text-white text-sm font-medium py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Ajout...</> : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
