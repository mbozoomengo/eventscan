/**
 * ============================================================
 * EVENTSCAN — SCRIPT DE TESTS D'INTÉGRATION COMPLET
 * ============================================================
 * USAGE :
 *   node test-endpoints.js
 *   node test-endpoints.js --base-url http://localhost:3000
 *
 * ENDPOINTS COUVERTS :
 *  [SUPABASE REST]
 *   POST   /auth/v1/token          → login (succès + échec)
 *   GET    /rest/v1/profiles       → lecture profil (auth + RLS)
 *   POST   /rest/v1/events         → créer event (auth + RLS)
 *   GET    /rest/v1/events         → lister events (auth + RLS)
 *   PATCH  /rest/v1/events         → sécurité RLS
 *   DELETE /rest/v1/events         → sécurité RLS
 *   POST   /rest/v1/guests         → créer invité (auth + unicité qr_token)
 *   GET    /rest/v1/guests         → lister / lookup par qr_token
 *   PATCH  /rest/v1/guests         → check-in
 *   POST   /rest/v1/scan_logs      → log scan (success + invalid)
 *
 *  [NEXT.JS API ROUTES]
 *   GET    /api/auth/callback      → redirect sans code
 *   GET    /api/auth/logout        → déconnexion
 *   POST   /api/admin/create-user  → 401 sans auth / 400 body incomplet
 *   GET    /api/guests/:id/qr      → 404 id inexistant / 200 PNG valide
 * ============================================================
 */

const BASE_URL = process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : 'http://localhost:3000'

const SUPABASE_URL = 'https://hwnrfyjujqzqqvtccwyh.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3bnJmeWp1anF6cXF2dGNjd3loIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NDY4NzAsImV4cCI6MjA5NDMyMjg3MH0.aeddL4S0P2J67gPHhTxAkaRhlju8Ar-ibOLIcafJfN8'

let ctx = { token: null, userId: null, eventId: null, guestId: null, qrToken: null }
let results = { passed: 0, failed: 0, skipped: 0, errors: [] }

const c = {
  green: s => `\x1b[32m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  yellow:s => `\x1b[33m${s}\x1b[0m`,
  blue:  s => `\x1b[34m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  dim:   s => `\x1b[2m${s}\x1b[0m`,
}

function assert(condition, label, detail = '') {
  if (condition) { console.log(`    ${c.green('✅')} ${label}`); results.passed++ }
  else {
    console.log(`    ${c.red('❌')} ${label}${detail ? c.dim(` → ${detail}`) : ''}`)
    results.failed++
    results.errors.push({ label, detail })
  }
}

function skip(label, reason) {
  console.log(`    ${c.yellow('⏭️ ')} ${label} ${c.dim(`(skipped: ${reason})`)}`)
  results.skipped++
}

function section(title) {
  console.log(`\n${c.bold(c.blue(`▶ ${title}`))}`)
  console.log(c.dim('  ' + '─'.repeat(50)))
}

async function supabase(path, method = 'GET', body = null, token = null) {
  const headers = {
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${token || ANON_KEY}`,
    'Content-Type': 'application/json',
  }
  if (method === 'POST') headers['Prefer'] = 'return=representation'
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : null,
  })
  let data = null
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('json')) { try { data = await res.json() } catch {} }
  return { status: res.status, data, headers: res.headers }
}

async function api(path, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE_URL}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : null,
    redirect: 'manual',
  })
  let data = null
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('json')) { try { data = await res.json() } catch {} }
  return { status: res.status, data, headers: res.headers }
}

async function testAuth() {
  section('BLOC 1 — Auth (/auth/v1/token)')
  console.log(`  ${c.dim('T1: mauvais mot de passe → 400')}`)
  const bad = await supabase('/auth/v1/token?grant_type=password', 'POST', { email: 'williammengo79@gmail.com', password: 'WRONG' })
  assert(bad.status === 400 || bad.status === 422, 'T1: 400 sur mauvais mdp', `status=${bad.status}`)
  assert(bad.data?.error != null || bad.data?.message != null, 'T1: corps erreur présent')

  console.log(`\n  ${c.dim('T2: login correct → 200 + access_token')}`)
  const good = await supabase('/auth/v1/token?grant_type=password', 'POST', { email: 'williammengo79@gmail.com', password: '10052006' })
  assert(good.status === 200, 'T2: 200 login correct', `status=${good.status} | ${good.data?.error}`)
  assert(typeof good.data?.access_token === 'string', 'T2: access_token présent')
  assert(good.data?.token_type === 'bearer', 'T2: token_type=bearer')
  if (good.data?.access_token) { ctx.token = good.data.access_token; ctx.userId = good.data.user?.id }

  console.log(`\n  ${c.dim('T3: email inexistant → 400')}`)
  const unk = await supabase('/auth/v1/token?grant_type=password', 'POST', { email: 'nobody@nowhere.com', password: 'x' })
  assert(unk.status === 400 || unk.status === 422, 'T3: 400 sur email inconnu', `status=${unk.status}`)
}

async function testProfiles() {
  section('BLOC 2 — Profiles (/rest/v1/profiles)')
  if (!ctx.token) { skip('T4-T6', 'no token'); return }

  console.log(`  ${c.dim('T4: GET avec token admin')}`)
  const r = await supabase('/rest/v1/profiles?select=*', 'GET', null, ctx.token)
  assert(r.status === 200, 'T4: 200', `status=${r.status}`)
  const me = r.data?.find(p => p.id === ctx.userId)
  assert(me?.role === 'admin', 'T4: rôle admin confirmé', `role=${me?.role}`)
  ;['id','email','role','created_at'].forEach(f => assert(me?.hasOwnProperty(f), `T4: champ ${f} présent`))

  console.log(`\n  ${c.dim('T5: GET sans auth → RLS filtre')}`)
  const anon = await supabase('/rest/v1/profiles?select=*')
  assert(anon.status === 200 && anon.data?.length === 0, 'T5: RLS → tableau vide pour anon')
}

async function testEvents() {
  section('BLOC 3 — Events (/rest/v1/events)')
  if (!ctx.token) { skip('T6-T12', 'no token'); return }

  console.log(`  ${c.dim('T6: POST sans auth → bloqué')}`)
  const anonPost = await supabase('/rest/v1/events', 'POST', { name: 'x', date: new Date().toISOString(), owner_id: ctx.userId })
  assert(anonPost.status !== 201, 'T6: RLS bloque POST anon', `status=${anonPost.status}`)

  console.log(`\n  ${c.dim('T7: POST avec auth → 201')}`)
  const ev = await supabase('/rest/v1/events', 'POST', {
    name: '[TEST] Auto', date: new Date(Date.now() + 86400000).toISOString(),
    location: 'Yaoundé Test', owner_id: ctx.userId
  }, ctx.token)
  assert(ev.status === 201, 'T7: 201 créé', `status=${ev.status} | ${JSON.stringify(ev.data)}`)
  assert(ev.data?.[0]?.owner_id === ctx.userId, 'T7: owner_id correct')
  if (ev.data?.[0]?.id) ctx.eventId = ev.data[0].id

  console.log(`\n  ${c.dim('T8: GET avec auth → liste')}`)
  const list = await supabase('/rest/v1/events?select=*', 'GET', null, ctx.token)
  assert(list.status === 200 && list.data?.some(e => e.id === ctx.eventId), 'T8: event visible dans liste')

  console.log(`\n  ${c.dim('T9: GET sans auth → vide (RLS)')}`)
  const anonGet = await supabase('/rest/v1/events?select=*')
  assert(anonGet.data?.length === 0, 'T9: RLS → liste vide anon')

  console.log(`\n  ${c.dim('T10: filtre par id')}`)
  const f = await supabase(`/rest/v1/events?id=eq.${ctx.eventId}&select=*`, 'GET', null, ctx.token)
  assert(f.data?.length === 1 && f.data[0].id === ctx.eventId, 'T10: filtre exact OK')
}

async function testGuests() {
  section('BLOC 4 — Guests (/rest/v1/guests)')
  if (!ctx.eventId) { skip('T11-T19', 'no eventId'); return }

  console.log(`  ${c.dim('T11: POST sans auth → bloqué')}`)
  const anonG = await supabase('/rest/v1/guests', 'POST', { event_id: ctx.eventId, full_name: 'Hack' })
  assert(anonG.status !== 201, 'T11: RLS bloque POST anon', `status=${anonG.status}`)

  console.log(`\n  ${c.dim('T12: POST avec auth → 201 + qr_token auto')}`)
  const g = await supabase('/rest/v1/guests', 'POST', {
    event_id: ctx.eventId, full_name: 'Jean Test',
    email: 'jean@test.com', category: 'TABLE VIP', table_name: 'Table 1'
  }, ctx.token)
  assert(g.status === 201, 'T12: 201 créé', `status=${g.status} | ${JSON.stringify(g.data)}`)
  assert(g.data?.[0]?.checked_in === false, 'T12: checked_in=false défaut')
  assert(typeof g.data?.[0]?.qr_token === 'string', 'T12: qr_token auto-généré')
  if (g.data?.[0]) { ctx.guestId = g.data[0].id; ctx.qrToken = g.data[0].qr_token }

  console.log(`\n  ${c.dim('T13: lookup par qr_token (simulation scan)')}`)
  const scan = await supabase(`/rest/v1/guests?qr_token=eq.${ctx.qrToken}&select=*`, 'GET', null, ctx.token)
  assert(scan.data?.length === 1 && scan.data[0].checked_in === false, 'T13: lookup qr_token → 1 résultat, non scanné')

  console.log(`\n  ${c.dim('T14: doublon qr_token → rejeté')}`)
  const dup = await supabase('/rest/v1/guests', 'POST', { event_id: ctx.eventId, full_name: 'Dup', qr_token: ctx.qrToken }, ctx.token)
  assert(dup.status !== 201, 'T14: contrainte unique qr_token respectée', `status=${dup.status}`)

  console.log(`\n  ${c.dim('T15: PATCH check-in → 200/204')}`)
  const ci = await supabase(`/rest/v1/guests?id=eq.${ctx.guestId}`, 'PATCH', {
    checked_in: true, checked_in_at: new Date().toISOString()
  }, ctx.token)
  assert(ci.status === 200 || ci.status === 204, 'T15: check-in réussi', `status=${ci.status}`)

  console.log(`\n  ${c.dim('T16: vérification checked_in=true')}`)
  const after = await supabase(`/rest/v1/guests?id=eq.${ctx.guestId}&select=checked_in,checked_in_at`, 'GET', null, ctx.token)
  assert(after.data?.[0]?.checked_in === true, 'T16: checked_in=true confirmé')
  assert(after.data?.[0]?.checked_in_at != null, 'T16: checked_in_at renseigné')

  console.log(`\n  ${c.dim('T17: PATCH sans auth → bloqué (RLS)')}`)
  const badP = await supabase(`/rest/v1/guests?id=eq.${ctx.guestId}`, 'PATCH', { full_name: 'Hacked' })
  assert(badP.status !== 204 && badP.status !== 200, 'T17: RLS bloque PATCH anon', `status=${badP.status}`)
}

async function testScanLogs() {
  section('BLOC 5 — Scan Logs (/rest/v1/scan_logs)')
  if (!ctx.guestId) { skip('T18-T20', 'no guestId'); return }

  console.log(`  ${c.dim('T18: POST success → 201')}`)
  const ok = await supabase('/rest/v1/scan_logs', 'POST', {
    guest_id: ctx.guestId, event_id: ctx.eventId, status: 'success', scanned_by: ctx.userId
  }, ctx.token)
  assert(ok.status === 201, 'T18: 201 scan log créé', `status=${ok.status}`)

  console.log(`\n  ${c.dim('T19: POST already_scanned → 201')}`)
  const dup = await supabase('/rest/v1/scan_logs', 'POST', {
    guest_id: ctx.guestId, event_id: ctx.eventId, status: 'already_scanned', scanned_by: ctx.userId
  }, ctx.token)
  assert(dup.status === 201, 'T19: already_scanned accepté')

  console.log(`\n  ${c.dim('T20: POST statut invalide → rejeté')}`)
  const bad = await supabase('/rest/v1/scan_logs', 'POST', {
    guest_id: ctx.guestId, event_id: ctx.eventId, status: 'INVALID'
  }, ctx.token)
  assert(bad.status !== 201, 'T20: check constraint rejette statut invalide', `status=${bad.status}`)
}

async function testNextRoutes() {
  section('BLOC 6 — Next.js API Routes')

  console.log(`  ${c.dim('T21: GET /api/auth/callback sans code → redirect /login')}`)
  const cb = await api('/api/auth/callback')
  assert([301,302,307,308].includes(cb.status), 'T21: redirect', `status=${cb.status}`)
  const loc = cb.headers.get('location') || ''
  assert(loc.includes('/login'), 'T21: redirect → /login', `location=${loc}`)

  console.log(`\n  ${c.dim('T22: GET /api/auth/logout → redirect')}`)
  const lo = await api('/api/auth/logout')
  assert([200,301,302,307,308].includes(lo.status), 'T22: logout OK', `status=${lo.status}`)

  console.log(`\n  ${c.dim('T23: POST /api/admin/create-user sans auth → 401')}`)
  const na = await api('/api/admin/create-user', 'POST', { email: 'x@x.com', password: '123456', full_name: 'X' })
  assert(na.status === 401 || na.status === 403, 'T23: 401/403 sans auth', `status=${na.status}`)

  console.log(`\n  ${c.dim('T24: POST /api/admin/create-user body incomplet → 400/401')}`)
  const inc = await api('/api/admin/create-user', 'POST', { email: 'x@x.com' })
  assert(inc.status === 400 || inc.status === 401, 'T24: 400/401 body incomplet', `status=${inc.status}`)

  console.log(`\n  ${c.dim('T25: GET /api/guests/fake-id/qr → 404')}`)
  const fk = await api('/api/guests/00000000-0000-0000-0000-000000000000/qr')
  assert(fk.status === 404, 'T25: 404 guest inexistant', `status=${fk.status}`)

  if (ctx.guestId) {
    console.log(`\n  ${c.dim('T26: GET /api/guests/:id/qr valide → image/png')}`)
    const res = await fetch(`${BASE_URL}/api/guests/${ctx.guestId}/qr`)
    assert(res.status === 200, 'T26: 200 QR valide', `status=${res.status}`)
    assert((res.headers.get('content-type') || '').includes('image/png'), 'T26: Content-Type=image/png')
    const buf = await res.arrayBuffer()
    assert(buf.byteLength > 100, 'T26: corps PNG non vide', `size=${buf.byteLength}`)
  } else { skip('T26', 'guestId non disponible') }
}

async function testSecurity() {
  section('BLOC 7 — Sécurité & Edge Cases')

  console.log(`  ${c.dim('T27: injection SQL via query param')}`)
  const inj = await supabase(`/rest/v1/events?name=eq.' OR 1=1; --&select=*`, 'GET', null, ctx.token)
  assert(inj.status === 200 && Array.isArray(inj.data), 'T27: SQL injection ignorée proprement')

  if (ctx.eventId) {
    console.log(`\n  ${c.dim('T28: PATCH event sans auth → bloqué')}`)
    const bp = await supabase(`/rest/v1/events?id=eq.${ctx.eventId}`, 'PATCH', { name: 'Hacked' })
    assert(bp.status !== 200 && bp.status !== 204, 'T28: RLS bloque PATCH event anon', `status=${bp.status}`)

    console.log(`\n  ${c.dim('T29: DELETE event sans auth → bloqué')}`)
    const bd = await supabase(`/rest/v1/events?id=eq.${ctx.eventId}`, 'DELETE')
    assert(bd.status !== 200 && bd.status !== 204, 'T29: RLS bloque DELETE anon', `status=${bd.status}`)
  }
}

async function cleanup() {
  section('NETTOYAGE')
  if (!ctx.token || !ctx.eventId) return
  const del = await supabase(`/rest/v1/events?id=eq.${ctx.eventId}`, 'DELETE', null, ctx.token)
  console.log(del.status === 200 || del.status === 204
    ? c.dim(`  🗑️  Event [${ctx.eventId}] supprimé (cascade guests + scan_logs)`)
    : c.yellow(`  ⚠️  Suppression échouée: status=${del.status}`))
}

function report() {
  const total = results.passed + results.failed + results.skipped
  console.log('\n' + c.bold('═'.repeat(55)))
  console.log(c.bold('  RAPPORT FINAL'))
  console.log(c.bold('─'.repeat(55)))
  console.log(`  Total   : ${total}`)
  console.log(`  ${c.green('Passed')}  : ${results.passed}`)
  console.log(`  ${c.red('Failed')}  : ${results.failed}`)
  console.log(`  ${c.yellow('Skipped')} : ${results.skipped}`)
  if (results.errors.length > 0) {
    console.log(`\n  ${c.red('❌ À CORRIGER :')}`)
    results.errors.forEach((e, i) => {
      console.log(`  ${i+1}. ${e.label}`)
      if (e.detail) console.log(c.dim(`     ${e.detail}`))
    })
  } else {
    console.log(`\n  ${c.green('🎉 Tous les tests passés!')}`)
  }
  console.log(c.bold('═'.repeat(55)) + '\n')
}

async function main() {
  console.log(c.bold('\n╔════════════════════════════════════════╗'))
  console.log(c.bold('║  EVENTSCAN — INTEGRATION TESTS         ║'))
  console.log(c.bold('╚════════════════════════════════════════╝'))
  console.log(c.dim(`  App  : ${BASE_URL}`))
  console.log(c.dim(`  Date : ${new Date().toISOString()}\n`))
  try {
    await testAuth()
    await testProfiles()
    await testEvents()
    await testGuests()
    await testScanLogs()
    await testNextRoutes()
    await testSecurity()
    await cleanup()
  } catch (err) {
    console.error(c.red('\n⚠️  Erreur:'), err.message)
  }
  report()
  process.exit(results.failed > 0 ? 1 : 0)
}

main()
