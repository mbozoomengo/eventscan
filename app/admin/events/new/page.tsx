'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function AdminNewEventPage() {
  const [form, setForm] = useState({ name: '', description: '', date: '', location: '' })
  const [loading, setLoading] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.replace('/dashboard'); return }
      setAuthChecked(true)
    }
    init()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    const { data: ev, error } = await supabase.from('events').insert({
      name: form.name,
      description: form.description || null,
      date: new Date(form.date).toISOString(),
      location: form.location || null,
      owner_id: user.id,
    }).select('id').single()
    if (error) { toast.error(error.message); setLoading(false); return }
    toast.success('Événement créé !')
    router.push(`/admin/events/${ev.id}`)
  }

  if (!authChecked) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const minDate = new Date().toISOString().slice(0, 16)

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/events" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold">Nouvel événement</h1>
      </div>
      <div className="card p-6 max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Nom *</label>
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Gala Charity 2026" />
          </div>
          <div>
            <label className="label">Date et heure *</label>
            <input type="datetime-local" min={minDate} className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
          </div>
          <div>
            <label className="label">Lieu</label>
            <input className="input" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input min-h-[80px] resize-none" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex gap-3 pt-2">
            <Link href="/admin/events" className="flex-1 text-center btn-secondary text-sm py-2">Annuler</Link>
            <button type="submit" disabled={loading} className="flex-1 btn-primary text-sm flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Création...</> : "Créer l'événement"}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
