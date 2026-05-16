'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { QrCode, LogOut, Menu, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
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

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {nav.map(({ href, label }) => (
              <Link key={href} href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  pathname === href
                    ? 'text-orange-400 bg-gray-700'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}>{label}</Link>
            ))}
            <button onClick={logout} title="Déconnexion" aria-label="Déconnexion"
              className="ml-2 p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </nav>

          {/* Mobile hamburger */}
          <button className="md:hidden p-2 text-gray-400" aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-700 bg-gray-800 px-4 py-3 space-y-1">
            {nav.map(({ href, label }) => (
              <Link key={href} href={href} onClick={() => setMenuOpen(false)}
                className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  pathname === href ? 'text-orange-400 bg-gray-700' : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}>{label}</Link>
            ))}
            <button onClick={logout}
              className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-gray-700 rounded-md w-full">
              <LogOut className="w-4 h-4" /> Déconnexion
            </button>
          </div>
        )}
      </header>
      <main className="max-w-lg mx-auto px-4 py-4">{children}</main>
    </div>
  )
}
