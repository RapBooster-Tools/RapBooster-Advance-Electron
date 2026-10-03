'use client'

import { CircleHelp } from 'lucide-react'
import { Tooltip } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/cn'
import { HELP_DRAWER_ID } from './help-drawer'
import { useHelp } from './help-provider'

/** The "?" at the right of the title bar: toggles the help drawer, like F1. */
export function HeaderHelpButton() {
  const help = useHelp()
  if (!help) return null
  return (
    <Tooltip content="Help (F1)" side="bottom">
      <button
        type="button"
        onClick={help.toggleHelp}
        aria-label="Help"
        aria-keyshortcuts="F1"
        aria-expanded={help.drawerOpen}
        aria-controls={help.drawerOpen ? HELP_DRAWER_ID : undefined}
        data-testid="help-button"
        data-tour="help-button"
        className={cn(
          'inline-flex size-9 items-center justify-center rounded-control text-ink-muted transition-colors',
          'hover:bg-wa-in hover:text-ink',
          help.drawerOpen && 'bg-primary/10 text-primary',
        )}
      >
        <CircleHelp className="size-[18px]" aria-hidden />
      </button>
    </Tooltip>
  )
}

/** The small "?" beside a screen's title: help for that screen. */
export function PageHelpButton() {
  const help = useHelp()
  if (!help) return null
  return (
    <Tooltip content="Help for this screen (F1)">
      <button
        type="button"
        onClick={() => help.openHelp()}
        aria-label="Help for this screen"
        data-testid="page-help"
        className="inline-flex size-7 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-wa-in hover:text-primary"
      >
        <CircleHelp className="size-[18px]" aria-hidden />
      </button>
    </Tooltip>
  )
}
