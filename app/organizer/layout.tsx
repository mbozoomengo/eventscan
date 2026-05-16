'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { QrCode, LogOut, Menu, X, Sun, Moon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'

function useDarkMode() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const stored = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const shouldBeDark = stored ? stored === 'dark' : prefersDark
    setDark(shouldBeDark)
    document.documentElement.classList.toggle('dark', shouldBeDark)
  }, [])
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }
  return { dark, toggle }
}

export default function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const { dark, toggle } = useDarkMode()
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
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      <header className="sticky top-0 z-10 border-b" style={{ backgroundColor: 'var(--bg-header)', borderColor: 'var(--border)' }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <QrCode className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>EventScan</span>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {nav.map(({ href, label }) => (
              <Link key={href} href={href}
                className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                style={isActive(href)
                  ? { backgroundColor: 'var(--nav-active-bg)', color: 'var(--nav-active-text)' }
                  : { color: 'var(--text-secondary)' }
                }>
                {label}
              </Link>
            ))}

            <button onClick={toggle}
              title={dark ? 'Mode clair' : 'Mode sombre'}
              aria-label={dark ? 'Activer le mode clair' : 'Activer le mode sombre'}
              className="ml-2 p-1.5 rounded-md border transition-colors"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)', color: dark ? '#f59e0b' : '#6366f1' }}>
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button onClick={logout} title="Déconnexion" aria-label="Déconnexion"
              className="ml-1 p-1.5 rounded-md transition-colors"
              style={{ color: 'var(--text-muted)' }}>
              <LogOut className="w-4 h-4" />
            </button>
          </nav>

          <div className="md:hidden flex items-center gap-2">
            <button onClick={toggle} aria-label={dark ? 'Mode clair' : 'Mode sombre'}
              className="p-1.5 rounded-md border"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)', color: dark ? '#f59e0b' : '#6366f1' }}>
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button className="p-2" style={{ color: 'var(--text-secondary)' }} aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t px-4 py-3 space-y-1" style={{ backgroundColor: 'var(--bg-header)', borderColor: 'var(--border)' }}>
            {nav.map(({ href, label }) => (
              <Link key={href} href={href} onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-sm font-medium transition-colors"
                style={isActive(href)
                  ? { backgroundColor: 'var(--nav-active-bg)', color: 'var(--nav-active-text)' }
                  : { color: 'var(--text-secondary)' }
                }>
                {label}
              </Link>
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
