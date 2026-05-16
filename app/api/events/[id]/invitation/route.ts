import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import {
  renderToBuffer,
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import JSZip from 'jszip'

const ce = React.createElement

type Template = 'corporate' | 'gala' | 'associatif'

const TEMPLATES: Record<Template, { bg: string; accent: string; font: string }> = {
  corporate:  { bg: '#FFFFFF', accent: '#1E3A5F', font: '#1E3A5F' },
  gala:       { bg: '#1A1A2E', accent: '#C9A84C', font: '#F5F5F5' },
  associatif: { bg: '#F0FDF4', accent: '#16A34A', font: '#14532D' },
}

function buildStyles(tpl: Template) {
  const { bg, accent, font } = TEMPLATES[tpl]
  return StyleSheet.create({
    page:      { backgroundColor: bg, padding: 48, fontFamily: 'Helvetica', flexDirection: 'column' },
    header:    { borderBottomWidth: 3, borderBottomColor: accent, paddingBottom: 16, marginBottom: 24 },
    title:     { fontSize: 26, fontFamily: 'Helvetica-Bold', color: accent, marginBottom: 6 },
    subtitle:  { fontSize: 13, color: font, opacity: 0.7 },
    section:   { marginBottom: 16 },
    label:     { fontSize: 9, color: accent, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
    value:     { fontSize: 14, color: font, fontFamily: 'Helvetica-Bold' },
    qrBox:     { marginTop: 24, alignItems: 'center' },
    qrImage:   { width: 160, height: 160 },
    qrCaption: { fontSize: 9, color: font, opacity: 0.5, marginTop: 8 },
    footer:    { position: 'absolute', bottom: 32, left: 48, right: 48, borderTopWidth: 1, borderTopColor: accent, paddingTop: 10 },
    footerTxt: { fontSize: 8, color: font, opacity: 0.4, textAlign: 'center' },
  })
}

async function fetchQrBase64(guestId: string, origin: string): Promise<string> {
  const res = await fetch(`${origin}/api/guests/${guestId}/qr`)
  if (!res.ok) return ''
  const buf = await res.arrayBuffer()
  return Buffer.from(buf).toString('base64')
}

async function buildPDF(
  guest: { id: string; full_name: string; category: string | null; table_name: string | null },
  event: { name: string; date: string; location: string | null },
  template: Template,
  origin: string
): Promise<Buffer> {
  const s = buildStyles(template)
  const qrBase64 = await fetchQrBase64(guest.id, origin)
  const qrSrc = qrBase64 ? `data:image/png;base64,${qrBase64}` : ''
  const dateStr = new Date(event.date).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })

  const doc = ce(
    Document,
    null,
    ce(
      Page,
      { size: 'A5', style: s.page },
      // Header
      ce(View, { style: s.header },
        ce(Text, { style: s.title }, event.name),
        ce(Text, { style: s.subtitle }, 'Invitation personnelle'),
      ),
      // Invité
      ce(View, { style: s.section },
        ce(Text, { style: s.label }, 'Invité'),
        ce(Text, { style: s.value }, guest.full_name),
      ),
      // Catégorie (optionnel)
      guest.category
        ? ce(View, { style: s.section },
            ce(Text, { style: s.label }, 'Catégorie'),
            ce(Text, { style: s.value }, guest.category),
          )
        : null,
      // Table (optionnel)
      guest.table_name
        ? ce(View, { style: s.section },
            ce(Text, { style: s.label }, 'Table'),
            ce(Text, { style: s.value }, guest.table_name),
          )
        : null,
      // Date
      ce(View, { style: s.section },
        ce(Text, { style: s.label }, 'Date'),
        ce(Text, { style: s.value }, dateStr),
      ),
      // Lieu (optionnel)
      event.location
        ? ce(View, { style: s.section },
            ce(Text, { style: s.label }, 'Lieu'),
            ce(Text, { style: s.value }, event.location),
          )
        : null,
      // QR code (optionnel)
      qrSrc
        ? ce(View, { style: s.qrBox },
            ce(Image, { src: qrSrc, style: s.qrImage }),
            ce(Text, { style: s.qrCaption }, "Présentez ce code à l'entrée"),
          )
        : null,
      // Footer
      ce(View, { style: s.footer },
        ce(Text, { style: s.footerTxt }, 'Document généré par EventScan • Ne pas partager'),
      ),
    )
  )

  return Buffer.from(await renderToBuffer(doc))
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

  const { data: event } = await supabase
    .from('events')
    .select('id, name, date, location, owner_id')
    .eq('id', eventId)
    .single()

  if (!event) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'
  if (!isAdmin && event.owner_id !== user.id) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const templateParam = (searchParams.get('template') ?? 'corporate') as Template
  const template: Template = ['corporate', 'gala', 'associatif'].includes(templateParam)
    ? templateParam
    : 'corporate'

  const origin = request.nextUrl.origin

  // PDF unitaire
  const guestId = searchParams.get('guest_id')
  if (guestId) {
    const { data: guest } = await supabase
      .from('guests')
      .select('id, full_name, category, table_name')
      .eq('id', guestId)
      .eq('event_id', eventId)
      .single()
    if (!guest) return NextResponse.json({ error: 'Invité introuvable' }, { status: 404 })

    const pdf = await buildPDF(guest, event, template, origin)
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invitation-${guest.full_name.replace(/\s+/g, '-')}.pdf"`,
      },
    })
  }

  // ZIP tous les PDF
  const allParam = searchParams.get('all')
  if (allParam === 'true') {
    const { data: guests } = await supabase
      .from('guests')
      .select('id, full_name, category, table_name')
      .eq('event_id', eventId)
      .order('full_name')

    if (!guests || guests.length === 0) {
      return NextResponse.json({ error: 'Aucun invité' }, { status: 404 })
    }

    const zip = new JSZip()
    await Promise.all(
      guests.map(async (g) => {
        const pdf = await buildPDF(g, event, template, origin)
        zip.file(`${g.full_name.replace(/\s+/g, '-')}.pdf`, pdf)
      })
    )

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="invitations-${event.name.replace(/\s+/g, '-')}.zip"`,
      },
    })
  }

  return NextResponse.json({ error: 'Paramètre manquant: guest_id ou all=true' }, { status: 400 })
}
