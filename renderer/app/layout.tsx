import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { ThemeProvider } from '@renderer/components/providers/theme-provider'
import { ToastProvider } from '@renderer/components/providers/toast-provider'
import { UI_BOOTSTRAP_SCRIPT } from '@renderer/components/providers/ui-preferences'
import './globals.css'

export const metadata: Metadata = {
  title: 'RapBooster Advance',
  description: 'WhatsApp marketing desktop application',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

/**
 * Root layout holds only the document, the theme and the toast host. The
 * application chrome lives in the `(app)` route group so the activation screen
 * — which the user sees before they are licensed — renders full-bleed with no
 * sidebar, but still in the user's theme.
 *
 * `suppressHydrationWarning` on <html> is scoped to that element's own
 * attributes: the bootstrap script sets data-theme/data-sidebar there before
 * React hydrates, by design.
 */
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* NOTE: a constant string from our own source, never user data; the
            CSP admits it by its build-time hash. */}
        <script dangerouslySetInnerHTML={{ __html: UI_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="h-full antialiased">
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
