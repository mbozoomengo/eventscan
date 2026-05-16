import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

/**
 * Hook mutualisé pour vérifier l'auth et le rôle.
 * Redirige automatiquement si non autorisé.
 * @param allowedRoles - liste des rôles autorisés
 * @returns { userId, role, loading }
 */
export function useAuthGuard(allowedRoles: string[]) {
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!profile || !allowedRoles.includes(profile.role)) {
        router.replace('/login')
        return
      }
      setUserId(user.id)
      setRole(profile.role)
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { userId, role, loading, supabase }
}
