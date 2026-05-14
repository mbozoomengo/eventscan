'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function NewEventPage() {
  const [form, setForm] = useState({ name: '', description: '', date: '', location: '' })
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }

    const { error } = await supabase.from('events').insert({
      name: form.name,
      description: form.description || null,
      date: new Date(form.date).toISOString(),
      location: form.location || null,
      owner_id: user.id,
    })

    if (error) {
      toast.error(`Erreur: ${error.message}`)
      setLoading(false)
      return
    }

    toast.success('Événement créé !')
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-semibold text-gray-900">Nouvel événement</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Nom *</label>
              <input type="text" className="input" placeholder="Mariage de Jean & Marie"
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">Date et heure *</label>
              <input type="datetime-local" className="input"
                value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div>
              <label className="label">Lieu</label>
              <input type="text" className="input" placeholder="Hôtel Hilton, Yaoundé"
                value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input min-h-[80px] resize-none" placeholder="Optionnel..."
                value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-2">
              <Link href="/dashboard" className="btn-secondary flex-1 text-center">Annuler</Link>
              <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Création...</> : 'Créer'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
