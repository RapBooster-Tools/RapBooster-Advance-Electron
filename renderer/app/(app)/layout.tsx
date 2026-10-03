import type { ReactNode } from 'react'
import { AppShell } from '@renderer/components/layout/app-shell'
import { NavigateListener } from '@renderer/components/providers/navigate-listener'

/** Chrome for the licensed application: sidebar, title bar, content column. */
export default function AppGroupLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AppShell>
      {/* Main can open a screen — e.g. a clicked desktop notification. */}
      <NavigateListener />
      {children}
    </AppShell>
  )
}
