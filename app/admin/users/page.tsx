'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { UserPlus, Loader2 } from 'lucide-react'

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', full_name: '', password: '', role: 'organizer' })
  const [creating, setCreating] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const loadUsers = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setUsers(data ?? [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.replace('/dashboard'); return }
      await loadUsers()
      setLoading(false)
    }
    init()
  }, [])

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Erreur'); setCreating(false); return }
    toast.success(`Compte créé pour ${form.email}`)
    setShowForm(false)
    setForm({ email: '', full_name: '', password: '', role: 'organizer' })
    await loadUsers()
    setCreating(false)
  }

  if (loading) return <Spin />

  const byRole = (role: string) => users.filter(u => u.role === role)
  const roleLabel = (role: string) =>
    role === 'admin' ? 'Admins' : role === 'organizer' ? 'Organisateurs' : 'Scanners'

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Utilisateurs ({users.length})</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-orange-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-1">
          <UserPlus className="w-4 h-4" /> Créer un compte
        </button>
      </div>

      {showForm && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 mb-6">
          <h3 className="font-medium mb-4">Nouveau compte</h3>
          <form onSubmit={createUser} className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
              <input type="password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="organizer">Organisateur</option>
                <option value="scanner">Scanner</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)}
                className="border border-gray-300 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">Annuler</button>
              <button type="submit" disabled={creating}
                className="bg-orange-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center gap-2">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Créer
              </button>
            </div>
          </form>
        </div>
      )}

      {['admin', 'organizer', 'scanner'].map(role => (
        <div key={role} className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {roleLabel(role)} ({byRole(role).length})
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Nom', 'Email', 'Créé le'].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {byRole(role).map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{u.full_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(u.created_at).toLocaleDateString('fr-FR')}
                    </td>
                  </tr>
                ))}
                {byRole(role).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-xs">Aucun</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  )
}
