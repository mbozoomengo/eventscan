'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { UserPlus, Loader2 } from 'lucide-react'

interface Profile {
  id: string
  email: string
  full_name: string | null
  role: string
  created_at: string
}

export default function AdminUsersClient({ users, totalGuests }: { users: Profile[]; totalGuests: number }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', full_name: '', password: '', role: 'organizer' })
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error || 'Erreur création utilisateur')
    } else {
      toast.success(`Compte créé pour ${form.email}`)
      setShowForm(false)
      setForm({ email: '', full_name: '', password: '', role: 'organizer' })
      window.location.reload()
    }
    setLoading(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Utilisateurs ({users.length}) · {totalGuests} invités total
        </h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <UserPlus className="w-4 h-4" /> Créer un compte
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-4 border-blue-200 bg-blue-50">
          <h3 className="font-medium text-gray-900 mb-4">Nouveau compte</h3>
          <form onSubmit={createUser} className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nom complet</label>
              <input type="text" className="input" placeholder="Jean Dupont"
                value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" placeholder="jean@example.com"
                value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label className="label">Mot de passe</label>
              <input type="password" className="input" placeholder="••••••••"
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} />
            </div>
            <div>
              <label className="label">Rôle</label>
              <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="organizer">Organisateur</option>
                <option value="scanner">Scanner</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">Annuler</button>
              <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2 text-sm">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Créer le compte
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Utilisateur</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Email</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Rôle</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Créé le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{u.full_name || '-'}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={u.role === 'admin' ? 'badge-error' : u.role === 'scanner' ? 'badge-warning' : 'badge-success'}>
                    {u.role === 'admin' ? 'Admin' : u.role === 'scanner' ? 'Scanner' : 'Organisateur'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
