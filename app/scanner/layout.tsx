'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { QrCode, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const pathname = usePathname()
  const logout = async () => { await supabase.auth.signOut(); window.location.href = '/login' }

  const nav = [
    { href: '/scanner',         label: 'Scanner' },
    { href: '/scanner/history', label: 'Historique' },
    { href: '/scanner/guests',  label: 'Invités' },
  ]

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
              <QrCode className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm">EventScan</span>
          </div>
          <nav className="flex items-center gap-1">
            {nav.map(({ href, label }) => (
              <Link key={href} href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  pathname === href
                    ? 'text-orange-400 bg-gray-700'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}>{label}</Link>
            ))}
            <button onClick={logout} title="Déconnexion"
              className="ml-2 p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-4">{children}</main>
    </div>
  )
}
