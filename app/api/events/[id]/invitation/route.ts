import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer'
import JSZip from 'jszip'

type Template = 'corporate' | 'gala' | 'associatif'

const TEMPLATES: Record<Template, { bg: string; accent: string; font: string }> = {
  corporate:   { bg: '#FFFFFF', accent: '#1E3A5F', font: '#1E3A5F' },
  gala:        { bg: '#1A1A2E', accent: '#C9A84C', font: '#F5F5F5' },
  associatif:  { bg: '#F0FDF4', accent: '#16A34A', font: '#14532D' },
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
  const styles = buildStyles(template)
  const qrBase64 = await fetchQrBase64(guest.id, origin)
  const qrSrc = qrBase64 ? `data:image/png;base64,${qrBase64}` : ''

  const doc = (
    <Document>
      <Page size="A5" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{event.name}</Text>
          <Text style={styles.subtitle}>Invitation personnelle</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Invité</Text>
          <Text style={styles.value}>{guest.full_name}</Text>
        </View>

        {guest.category ? (
          <View style={styles.section}>
            <Text style={styles.label}>Catégorie</Text>
            <Text style={styles.value}>{guest.category}</Text>
          </View>
        ) : null}

        {guest.table_name ? (
          <View style={styles.section}>
            <Text style={styles.label}>Table</Text>
            <Text style={styles.value}>{guest.table_name}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>
            {new Date(event.date).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}
          </Text>
        </View>

        {event.location ? (
          <View style={styles.section}>
            <Text style={styles.label}>Lieu</Text>
            <Text style={styles.value}>{event.location}</Text>
          </View>
        ) : null}

        {qrSrc ? (
          <View style={styles.qrBox}>
            <Image src={qrSrc} style={styles.qrImage} />
            <Text style={styles.qrCaption}>Présentez ce code à l'entrée</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.footerTxt}>Document généré par EventScan • Ne pas partager</Text>
        </View>
      </Page>
    </Document>
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

  // ZIP de tous les PDF
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
