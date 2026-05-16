'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function GuestDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const [guest, setGuest] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!['organizer', 'admin'].includes(profile?.role ?? '')) { router.replace('/login'); return }

      // Vérifier que l'invité appartient à l'event de l'organisateur
      const { data: teamEntry } = await supabase
        .from('event_team').select('event_id').eq('user_id', user.id).single()

      const { data: g } = await supabase.from('guests').select('*').eq('id', id).single()
      if (!g) { router.replace('/organizer/guests'); return }

      // Sécurité : vérifier que l'invité appartient à l'événement de l'organisateur
      if (teamEntry && g.event_id !== teamEntry.event_id) {
        router.replace('/organizer/guests')
        return
      }

      setGuest(g)
      setLoading(false)
    }
    init()
  }, [id])

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.from('guests').update({
      full_name: guest.full_name,
      email: guest.email,
      phone: guest.phone,
      category: guest.category,
      table_name: guest.table_name,
    }).eq('id', id)
    if (error) toast.error(error.message)
    else toast.success('Sauvegardé')
    setSaving(false)
  }

  const shareWhatsApp = () => {
    const siteUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const qrUrl = `${siteUrl}/api/guests/${id}/qr`
    const msg = encodeURIComponent(`Bonjour ${guest.full_name},\nVoici votre QR code d'accès : ${qrUrl}`)
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  if (loading || !guest) return <Spin />

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/organizer/guests" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold">{guest.full_name}</h1>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          guest.checked_in ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
        }`}>{guest.checked_in ? 'Présent' : 'En attente'}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
          <h2 className="font-semibold mb-2">Informations</h2>
          <div><label className={labelCls}>Nom complet</label><input className={inputCls} value={guest.full_name ?? ''} onChange={e => setGuest({...guest, full_name: e.target.value})} /></div>
          <div><label className={labelCls}>Email</label><input type="email" className={inputCls} value={guest.email ?? ''} onChange={e => setGuest({...guest, email: e.target.value})} /></div>
          <div><label className={labelCls}>Téléphone</label><input className={inputCls} value={guest.phone ?? ''} onChange={e => setGuest({...guest, phone: e.target.value})} /></div>
          <div><label className={labelCls}>Catégorie</label><input className={inputCls} value={guest.category ?? ''} onChange={e => setGuest({...guest, category: e.target.value})} /></div>
          <div><label className={labelCls}>Table</label><input className={inputCls} value={guest.table_name ?? ''} onChange={e => setGuest({...guest, table_name: e.target.value})} /></div>
          <button onClick={save} disabled={saving}
            className="w-full bg-orange-500 text-white text-sm font-medium py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Enregistrer
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="font-semibold mb-4">QR Code</h2>
          <div className="flex justify-center mb-4">
            <img src={`/api/guests/${id}/qr`} alt="QR Code"
              className="w-48 h-48 border border-gray-200 rounded-lg" />
          </div>
          <div className="space-y-2">
            <a href={`/api/guests/${id}/qr`} download={`${guest.full_name}.png`}
              className="w-full bg-orange-500 text-white text-sm font-medium py-2 rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2">
              <Download className="w-4 h-4" /> Télécharger PNG
            </a>
            <button onClick={shareWhatsApp}
              className="w-full border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
              Partager WhatsApp
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
