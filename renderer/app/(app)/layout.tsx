import type { ReactNode } from 'react'
import { HeaderHelpButton } from '@renderer/components/help/help-buttons'
import { HelpProvider } from '@renderer/components/help/help-provider'
import { AppShell } from '@renderer/components/layout/app-shell'
import { NavigateListener } from '@renderer/components/providers/navigate-listener'

/** Chrome for the licensed application: sidebar, title bar, content column. */
export default function AppGroupLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // Help wraps the shell so the title-bar "?" and every screen's header can
    // reach the drawer, the tours and the first-run welcome.
    <HelpProvider>
      <AppShell headerHelp={<HeaderHelpButton />}>
        {/* Main can open a screen — e.g. a clicked desktop notification. */}
        <NavigateListener />
        {children}
      </AppShell>
    </HelpProvider>
  )
}
