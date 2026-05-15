'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { QrCode, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const pathname = usePathname()
  const logout = async () => { await supabase.auth.signOut(); window.location.href = '/login' }

  const nav = [
    { href: '/admin',        label: 'Dashboard' },
    { href: '/admin/events', label: 'Événements' },
    { href: '/admin/users',  label: 'Utilisateurs' },
  ]

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
              <QrCode className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm text-gray-900">EventScan</span>
            <span className="text-xs bg-red-100 text-red-600 font-medium px-2 py-0.5 rounded-full">Admin</span>
          </div>
          <nav className="flex items-center gap-1">
            {nav.map(({ href, label }) => (
              <Link key={href} href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive(href)
                    ? 'bg-orange-50 text-orange-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}>{label}</Link>
            ))}
            <button onClick={logout} title="Déconnexion"
              className="ml-2 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
