'use client'

import { Palette } from 'lucide-react'
import { ThemeToggle } from '@renderer/components/layout/theme-toggle'
import {
  PhonePreview,
  type PreviewMessage,
} from '@renderer/components/preview/phone-preview'
import { useTheme } from '@renderer/components/providers/theme-provider'
import { Card, CardHeader } from '@renderer/components/ui/card'

/**
 * Sample used to show the theme and WhatsApp formatting together. It is also
 * a quiet lesson: users see that *stars* make bold text in WhatsApp.
 */
const SAMPLE: PreviewMessage[] = [
  {
    kind: 'text',
    text: 'Hi Priya! 🎉 Our *Diwali sale* starts today — _20% off_ everything.\n~₹999~ now ₹799\nUse code ```DIWALI20``` at checkout.',
  },
  {
    kind: 'buttons',
    text: 'Would you like a reminder before it ends?',
    footer: 'Reply STOP to opt out',
    buttons: [
      { type: 'reply', label: 'Yes, remind me' },
      { type: 'url', label: 'Shop now' },
    ],
  },
]

/** Settings → Appearance: Light / Dark / System, with a live preview. */
export function AppearanceSection() {
  const { resolved } = useTheme()
  return (
    <Card data-testid="appearance-section" data-help="settings-appearance">
      <CardHeader
        icon={<Palette />}
        title="Appearance"
        description="Choose how RapBooster looks. “System” follows your Windows or macOS setting automatically."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-3">
          <ThemeToggle variant="cards" testIdPrefix="appearance" />
          <p className="text-xs text-ink-muted" data-testid="appearance-current">
            Showing the {resolved} theme now. Your choice is saved on this computer.
          </p>
          <div className="rounded-control border border-line bg-surface-muted p-3 text-xs text-ink-muted">
            <p className="mb-1 font-medium text-ink">WhatsApp formatting</p>
            <p>
              <code className="font-mono">*bold*</code> ·{' '}
              <code className="font-mono">_italic_</code> ·{' '}
              <code className="font-mono">~strike~</code> ·{' '}
              <code className="font-mono">```monospace```</code> — the preview shows them
              exactly as your customers will see them.
            </p>
          </div>
        </div>
        <PhonePreview
          messages={SAMPLE}
          senderName="Sharma Stores"
          testId="appearance-preview"
        />
      </div>
    </Card>
  )
}
