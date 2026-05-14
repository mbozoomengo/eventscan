'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { QrCode, Users, Calendar, Shield, UserPlus, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [stats, setStats] = useState({ events: 0, scans: 0 })
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', full_name: '', password: '', role: 'organizer', event_id: '' })
  const [creating, setCreating] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.replace('/dashboard'); return }
      const [{ data: us }, { data: evs }, { count: ev }, { count: sc }] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('events').select('id, name').order('date', { ascending: false }),
        supabase.from('events').select('*', { count: 'exact', head: true }),
        supabase.from('scan_logs').select('*', { count: 'exact', head: true }).eq('status', 'success')
      ])
      setUsers(us ?? [])
      setEvents(evs ?? [])
      setStats({ events: ev ?? 0, scans: sc ?? 0 })
      setLoading(false)
    }
    init()
  }, [])

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    // Envoyer le JWT dans le header pour que l'API route puisse vérifier l'identité
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify(form)
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Erreur'); setCreating(false); return }
    toast.success(`Compte créé pour ${form.email}`)
    setShowForm(false)
    setForm({ email: '', full_name: '', password: '', role: 'organizer', event_id: '' })
    window.location.reload()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center"><QrCode className="w-4 h-4 text-white" /></div>
            <span className="font-bold">EventScan</span>
            <span className="badge-error ml-2">Admin</span>
          </div>
          <Link href="/dashboard" className="btn-secondary text-sm py-1.5">Dashboard</Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><Shield className="w-5 h-5 text-orange-500" /> Administration</h1>
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Users className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-xl font-bold">{users.length}</p><p className="text-xs text-gray-500">Utilisateurs</p></div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center"><Calendar className="w-5 h-5 text-orange-600" /></div>
            <div><p className="text-xl font-bold">{stats.events}</p><p className="text-xs text-gray-500">Événements</p></div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center"><QrCode className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xl font-bold">{stats.scans}</p><p className="text-xs text-gray-500">Scans</p></div>
          </div>
        </div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Utilisateurs</h2>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
            <UserPlus className="w-4 h-4" /> Créer un compte
          </button>
        </div>
        {showForm && (
          <div className="card p-5 mb-4 border-orange-200 bg-orange-50">
            <h3 className="font-medium text-gray-900 mb-4">Nouveau compte</h3>
            <form onSubmit={createUser} className="grid grid-cols-2 gap-3">
              <div><label className="label">Nom complet</label><input type="text" className="input" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required /></div>
              <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required /></div>
              <div><label className="label">Mot de passe</label><input type="password" className="input" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required minLength={6} /></div>
              <div>
                <label className="label">Rôle</label>
                <select className="input" value={form.role} onChange={e => setForm({...form, role: e.target.value, event_id: ''})}>
                  <option value="organizer">Organisateur</option>
                  <option value="scanner">Scanner (accès événement unique)</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {form.role === 'scanner' && (
                <div className="col-span-2">
                  <label className="label">Événement assigné *</label>
                  <select className="input" value={form.event_id} onChange={e => setForm({...form, event_id: e.target.value})} required>
                    <option value="">-- Choisir un événement --</option>
                    {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                  </select>
                </div>
              )}
              <div className="col-span-2 flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">Annuler</button>
                <button type="submit" disabled={creating} className="btn-primary flex items-center gap-2 text-sm">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Créer
                </button>
              </div>
            </form>
          </div>
        )}
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>{['Nom','Email','Rôle','Créé le'].map(h => <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{u.full_name || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3"><span className={u.role === 'admin' ? 'badge-error' : u.role === 'scanner' ? 'badge-success' : 'badge-warning'}>{u.role}</span></td>
                  <td className="px-4 py-3 text-gray-500">{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
