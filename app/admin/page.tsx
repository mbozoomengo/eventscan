import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { QrCode, Users, Calendar, Shield } from 'lucide-react'
import AdminUsersClient from './UsersClient'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: users } = await supabase
    .from('profiles').select('*').order('created_at', { ascending: false })

  const { count: totalEvents } = await supabase
    .from('events').select('*', { count: 'exact', head: true })

  const { count: totalGuests } = await supabase
    .from('guests').select('*', { count: 'exact', head: true })

  const { count: totalScans } = await supabase
    .from('scan_logs').select('*', { count: 'exact', head: true }).eq('status', 'success')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <QrCode className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">EventScan</span>
            <span className="badge-error ml-2">Admin</span>
          </div>
          <Link href="/dashboard" className="btn-secondary text-sm py-1.5">
            Mon dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <Shield className="w-6 h-6 text-orange-500" />
          Administration
        </h1>

        {/* Stats globales */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="card p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold">{users?.length || 0}</p>
              <p className="text-xs text-gray-500">Utilisateurs</p>
            </div>
          </div>
          <div className="card p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xl font-bold">{totalEvents || 0}</p>
              <p className="text-xs text-gray-500">Événements</p>
            </div>
          </div>
          <div className="card p-5 flex items-center gap-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <QrCode className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xl font-bold">{totalScans || 0}</p>
              <p className="text-xs text-gray-500">Scans réussis</p>
            </div>
          </div>
        </div>

        {/* Gestion utilisateurs */}
        <AdminUsersClient users={users || []} totalGuests={totalGuests || 0} />
      </main>
    </div>
  )
}
