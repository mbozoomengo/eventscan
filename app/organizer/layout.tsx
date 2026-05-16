'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { QrCode, LogOut, Menu, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const logout = async () => { await supabase.auth.signOut(); window.location.href = '/login' }

  const nav = [
    { href: '/organizer',              label: 'Dashboard' },
    { href: '/organizer/guests',       label: 'Invités' },
    { href: '/organizer/scan',         label: 'Scanner' },
    { href: '/organizer/scan-history', label: 'Historique' },
    { href: '/organizer/team',         label: 'Équipe' },
  ]

  const isActive = (href: string) =>
    href === '/organizer' ? pathname === '/organizer' : pathname.startsWith(href)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
              <QrCode className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm text-gray-900">EventScan</span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {nav.map(({ href, label }) => (
              <Link key={href} href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive(href) ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}>{label}</Link>
            ))}
            <button onClick={logout} title="Déconnexion" aria-label="Déconnexion"
              className="ml-2 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </nav>

          {/* Mobile hamburger */}
          <button className="md:hidden p-2 text-gray-500" aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1">
            {nav.map(({ href, label }) => (
              <Link key={href} href={href} onClick={() => setMenuOpen(false)}
                className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive(href) ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'
                }`}>{label}</Link>
            ))}
            <button onClick={logout}
              className="flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-md w-full">
              <LogOut className="w-4 h-4" /> Déconnexion
            </button>
          </div>
        )}
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
