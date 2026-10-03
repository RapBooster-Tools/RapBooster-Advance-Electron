'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  readResolvedTheme,
  readSidebarCollapsed,
  readThemePreference,
  setSidebarCollapsed,
  setThemePreference,
  subscribeUiPreferences,
  type ResolvedTheme,
  type ThemePreference,
} from './ui-preferences'

export type { ResolvedTheme, ThemePreference } from './ui-preferences'

interface ThemeContextValue {
  /** What the user chose: Light, Dark, or follow the OS. */
  preference: ThemePreference
  /** What is on screen right now. */
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  resolved: 'light',
  setPreference: setThemePreference,
  sidebarCollapsed: false,
  setSidebarCollapsed,
})

/**
 * Theme and sidebar state for every screen.
 *
 * WHY useSyncExternalStore with a fixed server snapshot: the static export is
 * rendered at build time, where no preference exists. Reading the real value
 * during hydration would make the first client render disagree with the HTML
 * (a hydration error). React renders the server snapshot first, then the real
 * one — while the page itself never flashes, because the CSS keys on the
 * attributes the bootstrap script set before paint, not on this state.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(
    subscribeUiPreferences,
    readThemePreference,
    () => 'system' as const,
  )
  // The OS title bar follows nativeTheme in main, not this page's attribute.
  useEffect(() => {
    void window.api
      .invoke('system:setThemeSource', { source: preference })
      .then((result) => {
        if (!result.ok) console.warn('could not match the window frame to the theme')
      })
  }, [preference])

  const resolved = useSyncExternalStore(
    subscribeUiPreferences,
    readResolvedTheme,
    () => 'light' as const,
  )
  const sidebarCollapsed = useSyncExternalStore(
    subscribeUiPreferences,
    readSidebarCollapsed,
    () => false,
  )

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolved,
      setPreference: setThemePreference,
      sidebarCollapsed,
      setSidebarCollapsed,
    }),
    [preference, resolved, sidebarCollapsed],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
