'use client'
import { useEffect, useState } from 'react'

export interface NetworkStatus {
  isOnline: boolean
  pendingCount: number
}

let pendingCountGlobal = 0
const listeners = new Set<(count: number) => void>()

export function setPendingCount(count: number) {
  pendingCountGlobal = count
  listeners.forEach((fn) => fn(count))
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [pendingCount, setPending] = useState(pendingCountGlobal)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const listener = (count: number) => setPending(count)
    listeners.add(listener)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      listeners.delete(listener)
    }
  }, [])

  return { isOnline, pendingCount }
}
