import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import JSZip from 'jszip'

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim()
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const event_id = searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id requis' }, { status: 400 })

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

  const { data: guests, error } = await supabase
    .from('guests')
    .select('id, full_name, qr_token')
    .eq('event_id', event_id)

  if (error || !guests?.length) {
    return NextResponse.json({ error: 'Aucun invité' }, { status: 404 })
  }

  const zip = new JSZip()
  const folder = zip.folder('qrcodes')!

  for (const guest of guests) {
    const png = await QRCode.toBuffer(guest.qr_token, { type: 'png', width: 300, margin: 2 })
    folder.file(`${sanitize(guest.full_name)}.png`, png)
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="qrcodes-${event_id}.zip"`,
    },
  })
}
