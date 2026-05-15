'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function AdminNewEventPage() {
  const [form, setForm] = useState({ name: '', description: '', date: '', location: '' })
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }

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

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/events" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold">Nouvel événement</h1>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-xl shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
              placeholder="Gala Charity 2026" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date et heure *</label>
            <input type="datetime-local"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lieu</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 min-h-[80px] resize-none"
              value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex gap-3 pt-2">
            <Link href="/admin/events"
              className="flex-1 text-center border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors">
              Annuler
            </Link>
            <button type="submit" disabled={loading}
              className="flex-1 bg-orange-500 text-white text-sm font-medium py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Création...</> : 'Créer et assigner'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
