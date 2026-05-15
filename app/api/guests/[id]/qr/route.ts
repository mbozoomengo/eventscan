import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: guest, error } = await supabase
    .from('guests')
    .select('id, full_name, qr_token, event_id')
    .eq('id', id)
    .single()

  if (error || !guest) {
    return NextResponse.json({ error: 'Invité introuvable' }, { status: 404 })
  }

  const png = await QRCode.toBuffer(guest.qr_token, {
    type: 'png',
    width: 300,
    margin: 2,
  })

  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="qr-${guest.full_name}.png"`,
    },
  })
}
