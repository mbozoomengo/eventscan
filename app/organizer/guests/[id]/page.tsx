'use client'
import { use, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || ''
const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

function Spin() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function GuestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [guest, setGuest] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: g } = await supabase.from('guests').select('*').eq('id', id).single()
      if (!g) { router.replace('/organizer/guests'); return }
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
    const qrUrl = `${SITE_URL}/api/guests/${id}/qr`
    const msg = encodeURIComponent(
      `Bonjour ${guest.full_name},\nVoici votre QR code d'accès : ${qrUrl}`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  if (loading) return <Spin />

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/organizer/guests" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold">{guest.full_name}</h1>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          guest.checked_in ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
        }`}>{guest.checked_in ? '✓ Présent' : '… En attente'}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
          <h2 className="font-semibold">Informations</h2>
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
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Partager WhatsApp
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
