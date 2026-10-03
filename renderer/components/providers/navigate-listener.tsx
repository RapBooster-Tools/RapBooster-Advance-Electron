'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useIpcEvent } from '@renderer/hooks/useIpc'

/**
 * Follows `app:navigate` from main — a clicked notification, the tray — to the
 * screen it names. A chat opens through the inbox deep link `/inbox?chat=<id>`.
 *
 * Only in-app paths are followed: the event is ours, but a route that is not a
 * plain absolute path is never worth navigating to.
 */
export function NavigateListener() {
  const router = useRouter()

  useIpcEvent('app:navigate', ({ route, chatId }) => {
    if (!route.startsWith('/') || route.startsWith('//')) return
    const target = chatId ? `/inbox?chat=${encodeURIComponent(chatId)}` : route
    router.push(target as Route)
  })

  return null
}
