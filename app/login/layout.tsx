// Force le rendu dynamique de la page login (évite le cache statique Vercel)
export const dynamic = 'force-dynamic'

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
