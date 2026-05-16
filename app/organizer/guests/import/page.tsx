'use client'
import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { ArrowLeft, Upload, FileSpreadsheet, Loader2, CheckCircle, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'

interface GuestRow {
  full_name: string
  email?: string
  phone?: string
  category?: string
  table_name?: string
}

export default function OrganizerImportPage() {
  const [guests, setGuests] = useState<GuestRow[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [fileName, setFileName] = useState('')
  const [eventId, setEventId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Auth + team check au montage
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!['organizer', 'admin'].includes(profile?.role ?? '')) { router.replace('/login'); return }
      const { data: teamEntry } = await supabase
        .from('event_team').select('event_id').eq('user_id', user.id).eq('role', 'organizer').single()
      if (!teamEntry) { toast.error('Aucun événement assigné'); router.replace('/organizer'); return }
      setEventId(teamEntry.event_id)
    }
    init()
  }, [])

  const normalizeRows = (data: Record<string, string>[]): GuestRow[] =>
    data.map(row => {
      const get = (variants: string[]) => {
        const key = Object.keys(row).find(k =>
          variants.includes(k.toLowerCase().trim())
        )
        return key ? String(row[key]).trim() : ''
      }
      return {
        full_name: get(['nom', 'name', 'full_name', 'nom complet', 'prénom', 'prenom', 'invité', 'guest']) || '',
        email:     get(['email', 'mail', 'e-mail']) || undefined,
        phone:     get(['tel', 'téléphone', 'telephone', 'phone', 'mobile']) || undefined,
        category:  get(['categorie', 'catégorie', 'category', 'groupe', 'group']) || undefined,
        table_name:get(['table', 'table_name', 'placement']) || undefined,
      }
    }).filter(g => !!g.full_name)

  const parseFile = useCallback((file: File) => {
    setLoading(true)
    setFileName(file.name)
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'csv') {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: (r) => {
          const rows = normalizeRows(r.data as Record<string, string>[])
          setGuests(rows)
          setLoading(false)
          toast.success(`${rows.length} invités détectés`)
        },
        error: () => { toast.error('Erreur CSV'); setLoading(false) },
      })
    } else if (['xlsx', 'xls'].includes(ext || '')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const wb = XLSX.read(e.target?.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, string>[]
        const rows = normalizeRows(data)
        setGuests(rows)
        setLoading(false)
        toast.success(`${rows.length} invités détectés`)
      }
      reader.readAsBinaryString(file)
    } else {
      toast.error('Format non supporté (CSV, XLSX, XLS)')
      setLoading(false)
    }
  }, [])

  const handleImport = async () => {
    if (guests.length === 0 || !eventId) return
    setImporting(true)
    setProgress(0)

    const toInsert = guests.map(g => ({
      event_id: eventId,
      full_name: g.full_name,
      email: g.email || null,
      phone: g.phone || null,
      category: g.category || null,
      table_name: g.table_name || null,
    }))

    let errors = 0
    const batchSize = 50
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const { error } = await supabase.from('guests').insert(toInsert.slice(i, i + batchSize))
      if (error) errors++
      setProgress(Math.round(((i + batchSize) / toInsert.length) * 100))
    }

    setImporting(false)
    setProgress(0)
    if (errors === 0) {
      toast.success(`${guests.length} invités importés !`)
      router.push('/organizer/guests')
    } else {
      toast.error(`Import partiel : ${errors} lot(s) en erreur. Vérifiez les doublons.`)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/organizer/guests" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold">Importer des invités</h1>
      </div>

      <div className="max-w-2xl space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-800 font-medium">Colonnes acceptées</p>
          <p className="text-xs text-blue-700 mt-0.5">
            Nom (obligatoire) · Email · Téléphone · Catégorie · Table
          </p>
          <p className="text-xs text-orange-600 mt-1">⚠ Les doublons ne sont pas détectés automatiquement.</p>
        </div>

        <div
          className="bg-white border-2 border-dashed border-gray-300 hover:border-orange-400 rounded-xl p-10 text-center cursor-pointer transition-colors"
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) parseFile(f) }}
          onDragOver={e => e.preventDefault()}
          onClick={() => document.getElementById('file-input')?.click()}>
          <input id="file-input" type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f) }} />
          {loading
            ? <Loader2 className="w-10 h-10 text-orange-400 animate-spin mx-auto" />
            : fileName
              ? <div>
                  <FileSpreadsheet className="w-10 h-10 text-green-500 mx-auto mb-2" />
                  <p className="font-medium">{fileName}</p>
                  <p className="text-sm text-gray-500">{guests.length} invités</p>
                </div>
              : <div>
                  <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">Glissez votre fichier ici</p>
                  <p className="text-xs text-gray-400 mt-1">CSV, Excel (.xlsx, .xls)</p>
                </div>}
        </div>

        {guests.length > 0 && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <span className="text-sm font-medium">Aperçu ({guests.length} invités)</span>
                <button onClick={() => { setGuests([]); setFileName('') }}>
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {['Nom', 'Catégorie', 'Table', 'Email'].map(h => (
                        <th key={h} className="text-left px-4 py-2 text-xs text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {guests.slice(0, 20).map((g, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 font-medium">{g.full_name}</td>
                        <td className="px-4 py-2 text-gray-500">{g.category || '—'}</td>
                        <td className="px-4 py-2 text-gray-500">{g.table_name || '—'}</td>
                        <td className="px-4 py-2 text-gray-500">{g.email || '—'}</td>
                      </tr>
                    ))}
                    {guests.length > 20 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-2 text-center text-xs text-gray-400">
                          ... et {guests.length - 20} autres
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {importing && progress > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Importation en cours...</span>
                  <span className="font-medium text-orange-500">{Math.min(progress, 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
                </div>
              </div>
            )}

            <button onClick={handleImport} disabled={importing}
              className="w-full bg-orange-500 text-white text-sm font-medium py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {importing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Importation...</>
                : <><CheckCircle className="w-4 h-4" /> Importer {guests.length} invités</>}
            </button>
          </>
        )}
      </div>
    </>
  )
}
