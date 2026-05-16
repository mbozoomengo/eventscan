'use client'
import { openDB, IDBPDatabase } from 'idb'
import { setPendingCount } from './useNetworkStatus'

export interface CachedGuest {
  qr_token: string
  id: string
  full_name: string
  category: string | null
  table_name: string | null
  checked_in: boolean
}

export interface SyncQueueEntry {
  guest_id: string
  event_id: string
  scanned_at: string
  status: 'pending' | 'synced' | 'conflict'
}

const DB_NAME = 'eventscan-offline'
const DB_VERSION = 1

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('guests-cache')) {
        const store = db.createObjectStore('guests-cache', { keyPath: 'qr_token' })
        store.createIndex('event_id', 'event_id')
      }
      if (!db.objectStoreNames.contains('sync-queue')) {
        db.createObjectStore('sync-queue', { keyPath: 'guest_id' })
      }
    },
  })
}

async function refreshPendingCount() {
  const db = await getDB()
  const all = await db.getAll('sync-queue') as (SyncQueueEntry & { event_id: string })[]
  const pending = all.filter((e) => e.status === 'pending').length
  setPendingCount(pending)
}

export async function loadCache(eventId: string, token: string): Promise<void> {
  const res = await fetch('/api/scan/cache', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return

  const guests: (CachedGuest & { event_id: string })[] = await res.json()
  const db = await getDB()
  const tx = db.transaction('guests-cache', 'readwrite')
  for (const g of guests) {
    if (g.event_id === eventId) {
      await tx.store.put(g)
    }
  }
  await tx.done
}

export async function scanOffline(token: string, eventId: string): Promise<{
  status: 'success' | 'already_scanned' | 'invalid'
  guest?: CachedGuest
}> {
  const db = await getDB()
  const guest = await db.get('guests-cache', token) as (CachedGuest & { event_id: string }) | undefined

  if (!guest || guest.event_id !== eventId) {
    return { status: 'invalid' }
  }

  const existing = await db.get('sync-queue', guest.id) as SyncQueueEntry | undefined
  if (guest.checked_in || existing?.status === 'pending') {
    return { status: 'already_scanned', guest }
  }

  // Mark as checked_in locally
  await db.put('guests-cache', { ...guest, checked_in: true })

  const entry: SyncQueueEntry & { event_id: string } = {
    guest_id: guest.id,
    event_id: eventId,
    scanned_at: new Date().toISOString(),
    status: 'pending',
  }
  await db.put('sync-queue', entry)
  await refreshPendingCount()

  return { status: 'success', guest }
}

export async function syncPending(token: string): Promise<void> {
  const db = await getDB()
  const queue = await db.getAll('sync-queue') as (SyncQueueEntry & { event_id: string })[]
  const pending = queue.filter((e) => e.status === 'pending')

  for (const entry of pending) {
    const guest = await db.get('guests-cache', entry.guest_id) as (CachedGuest & { event_id: string }) | undefined
    if (!guest) continue

    try {
      const res = await fetch('/api/scan/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ qr_token: guest.qr_token, event_id: entry.event_id }),
      })
      const data = await res.json()

      if (data.status === 'success') {
        await db.put('sync-queue', { ...entry, status: 'synced' })
      } else if (data.status === 'already_scanned') {
        // Conflict: someone else checked in first — warn without overwriting
        console.warn(`[sync] Conflit pour ${guest.full_name}: déjà scanné côté serveur`)
        await db.put('sync-queue', { ...entry, status: 'conflict' })
      }
    } catch {
      // Network still failing, leave as pending
    }
  }

  await refreshPendingCount()
}
