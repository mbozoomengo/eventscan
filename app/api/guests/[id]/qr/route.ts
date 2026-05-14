import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import QRCode from 'qrcode'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()

  const { data: guest, error } = await supabase
    .from('guests')
    .select('id, full_name, qr_token, event_id')
    .eq('id', params.id)
    .single()

  if (error || !guest) {
    return NextResponse.json({ error: 'Invité introuvable' }, { status: 404 })
  }

  // Générer QR code en PNG (buffer)
  const png = await QRCode.toBuffer(guest.qr_token, {
    type: 'png',
    width: 300,
    margin: 2,
  })

  return new NextResponse(png, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="qr-${guest.full_name}.png"`,
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
