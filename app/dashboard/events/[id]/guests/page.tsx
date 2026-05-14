'use client'

import { use, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { ArrowLeft, Upload, FileSpreadsheet, Loader2, CheckCircle, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'

interface GuestRow { full_name: string; email?: string; phone?: string; category?: string; table_name?: string }

export default function GuestsImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [guests, setGuests] = useState<GuestRow[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [fileName, setFileName] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const normalizeRows = (data: Record<string, string>[]): GuestRow[] =>
    data.map(row => {
      const get = (variants: string[]) => {
        const key = Object.keys(row).find(k => variants.includes(k.toLowerCase().trim()))
        return key ? String(row[key]).trim() : ''
      }
      return {
        full_name: get(['nom','name','full_name','nom complet','prenom','prénom','invité','guest']) || 'Invité',
        email: get(['email','mail','e-mail']) || undefined,
        phone: get(['tel','téléphone','telephone','phone','mobile']) || undefined,
        category: get(['categorie','catégorie','category','groupe','group']) || undefined,
        table_name: get(['table','table_name','placement']) || undefined,
      }
    }).filter(g => g.full_name && g.full_name !== 'Invité')

  const parseFile = useCallback((file: File) => {
    setLoading(true); setFileName(file.name)
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'csv') {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: (r) => { const rows = normalizeRows(r.data as Record<string, string>[]); setGuests(rows); setLoading(false); toast.success(`${rows.length} invités détectés`) },
        error: () => { toast.error('Erreur CSV'); setLoading(false) }
      })
    } else if (['xlsx','xls'].includes(ext || '')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const wb = XLSX.read(e.target?.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, string>[]
        const rows = normalizeRows(data)
        setGuests(rows); setLoading(false); toast.success(`${rows.length} invités détectés`)
      }
      reader.readAsBinaryString(file)
    } else { toast.error('Format non supporté'); setLoading(false) }
  }, [])

  const handleImport = async () => {
    if (guests.length === 0) return
    setImporting(true)
    const toInsert = guests.map(g => ({ event_id: id, full_name: g.full_name, email: g.email || null, phone: g.phone || null, category: g.category || null, table_name: g.table_name || null }))
    let errors = 0
    for (let i = 0; i < toInsert.length; i += 50) {
      const { error } = await supabase.from('guests').insert(toInsert.slice(i, i + 50))
      if (error) errors++
    }
    setImporting(false)
    if (errors === 0) { toast.success(`${guests.length} invités importés !`); router.push(`/dashboard/events/${id}`) }
    else toast.error('Certains invités non importés')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href={`/dashboard/events/${id}`} className="text-gray-500 hover:text-gray-700"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="font-semibold text-gray-900">Importer des invités</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="card p-4 bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-800 font-medium">Colonnes acceptées :</p>
          <p className="text-xs text-blue-700">Nom (obligatoire) · Email · Téléphone · Catégorie · Table</p>
        </div>
        <div className="card p-10 border-2 border-dashed border-gray-300 hover:border-orange-400 transition-colors text-center cursor-pointer"
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) parseFile(f) }}
          onDragOver={e => e.preventDefault()}
          onClick={() => document.getElementById('file-input')?.click()}>
          <input id="file-input" type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f) }} />
          {loading ? <Loader2 className="w-10 h-10 text-orange-400 animate-spin mx-auto" />
            : fileName ? <div><FileSpreadsheet className="w-10 h-10 text-green-500 mx-auto mb-2" /><p className="font-medium text-gray-700">{fileName}</p><p className="text-sm text-gray-500">{guests.length} invités</p></div>
            : <div><Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-gray-600 font-medium">Glissez votre fichier ici</p><p className="text-xs text-gray-400 mt-1">CSV, Excel (.xlsx, .xls)</p></div>}
        </div>
        {guests.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Aperçu ({guests.length} invités)</span>
              <button onClick={() => { setGuests([]); setFileName('') }}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>{['Nom','Catégorie','Table','Email'].map(h => <th key={h} className="text-left px-4 py-2 text-xs text-gray-500">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {guests.slice(0,20).map((g,i) => (
                    <tr key={i}><td className="px-4 py-2 font-medium">{g.full_name}</td><td className="px-4 py-2 text-gray-500">{g.category||'-'}</td><td className="px-4 py-2 text-gray-500">{g.table_name||'-'}</td><td className="px-4 py-2 text-gray-500">{g.email||'-'}</td></tr>
                  ))}
                  {guests.length > 20 && <tr><td colSpan={4} className="px-4 py-2 text-center text-xs text-gray-400">... et {guests.length-20} autres</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {guests.length > 0 && (
          <button onClick={handleImport} disabled={importing} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
            {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importation...</> : <><CheckCircle className="w-4 h-4" /> Importer {guests.length} invités</>}
          </button>
        )}
      </main>
    </div>
  )
}
