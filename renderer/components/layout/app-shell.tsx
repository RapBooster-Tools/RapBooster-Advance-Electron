'use client'

import { MessageCircle, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import type { ReactNode } from 'react'
import { useTheme } from '@renderer/components/providers/theme-provider'
import { Tooltip } from '@renderer/components/ui/tooltip'
import { cn } from '../../lib/cn'
import { NAV_GROUPS, type NavItem } from './nav'
import { ThemeToggle } from './theme-toggle'

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
}) {
  const Icon = item.icon
  return (
    // Collapsed, the label is visually hidden but still the link's accessible
    // name; the tooltip gives sighted mouse and keyboard users the same word.
    <Tooltip content={item.label} side="right" disabled={!collapsed}>
      <Link
        href={item.href}
        data-testid={item.testId}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex h-9 items-center gap-3 rounded-control px-3 text-[13.5px] transition-colors duration-150',
          'collapsed:justify-center collapsed:px-0',
          active
            ? 'bg-primary/10 font-semibold text-primary'
            : 'text-ink-muted hover:bg-wa-in hover:text-ink',
        )}
      >
        {active && (
          <span
            aria-hidden
            className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-primary collapsed:-left-2"
          />
        )}
        <Icon
          className={cn(
            'size-[18px] shrink-0 transition-transform duration-150 group-hover:scale-105',
            active ? 'text-primary' : 'text-ink-subtle group-hover:text-ink',
          )}
          strokeWidth={active ? 2.2 : 1.9}
          aria-hidden
        />
        <span className="truncate collapsed:sr-only">{item.label}</span>
      </Link>
    </Tooltip>
  )
}

/** The product mark: a gradient tile, used in the title bar. */
function BrandMark() {
  return (
    <span
      aria-hidden
      className="flex size-8 items-center justify-center rounded-[10px] shadow-raised"
      style={{ backgroundImage: 'var(--gradient-accent)' }}
    >
      <MessageCircle className="size-[18px] text-white" strokeWidth={2.2} />
    </span>
  )
}

/**
 * Application chrome: a full-width title bar (product name, theme choice, help)
 * over a grouped, collapsible sidebar and the scrolling content column.
 *
 * Collapse state is a data attribute on <html> set before first paint (see
 * providers/ui-preferences.ts), and the `collapsed:` variant styles off it — so
 * a collapsed sidebar never flashes open on launch.
 */
export function AppShell({
  children,
  headerHelp,
}: {
  children: ReactNode
  /**
   * Slot for the future "?" help button at the right of the title bar. Pass a
   * single focusable element; it is placed in the no-drag region, after the
   * theme toggle.
   */
  headerHelp?: ReactNode
}) {
  // useSelectedLayoutSegment is the API intended for highlighting nav inside a
  // persisted layout. usePathname does not reliably update here on client-side
  // navigation in a static export, which left every item marked active at once.
  const segment = useSelectedLayoutSegment()
  const { sidebarCollapsed, setSidebarCollapsed } = useTheme()
  const ToggleIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <div className="flex h-full flex-col bg-app-bg">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-control bg-primary px-3 py-2 text-sm font-medium text-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      {/* The title bar is the draggable region; its controls opt out. */}
      <header className="app-drag relative flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark />
          <span className="truncate text-[15px] font-semibold tracking-tight text-ink">
            RapBooster <span className="font-medium text-ink-muted">Advance</span>
          </span>
        </div>
        <div
          className="app-no-drag flex items-center gap-2"
          data-testid="app-header-actions"
        >
          <ThemeToggle />
          {headerHelp && <div data-slot="help">{headerHelp}</div>}
        </div>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-px h-px opacity-60"
          style={{ backgroundImage: 'var(--gradient-accent)' }}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          id="app-sidebar"
          aria-label="Main"
          data-testid="app-sidebar"
          className="flex w-[232px] shrink-0 flex-col border-r border-line bg-sidebar transition-[width] duration-200 ease-[var(--ease-soft)] collapsed:w-[68px]"
        >
          <div className="flex flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-3 py-4 collapsed:px-2">
            {NAV_GROUPS.map((group, index) => (
              <div
                key={group.id}
                role="group"
                aria-labelledby={`nav-group-${group.id}`}
                data-testid={`nav-group-${group.id}`}
              >
                <p
                  id={`nav-group-${group.id}`}
                  className="mb-1 px-3 text-[11px] font-semibold tracking-[0.08em] text-ink-subtle uppercase collapsed:sr-only"
                >
                  {group.label}
                </p>
                {index > 0 && (
                  <div
                    aria-hidden
                    className="mx-2 mb-2 hidden h-px bg-line collapsed:block"
                  />
                )}
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <NavLink
                        item={item}
                        active={item.segment === segment}
                        collapsed={sidebarCollapsed}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-line p-2">
            <Tooltip content="Expand sidebar" side="right" disabled={!sidebarCollapsed}>
              <button
                type="button"
                data-testid="sidebar-toggle"
                aria-controls="app-sidebar"
                aria-expanded={!sidebarCollapsed}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="flex h-9 w-full items-center gap-3 rounded-control px-3 text-[13px] text-ink-muted transition-colors hover:bg-wa-in hover:text-ink collapsed:justify-center collapsed:px-0"
              >
                <ToggleIcon className="size-[18px] shrink-0" aria-hidden />
                <span className="collapsed:sr-only">Collapse</span>
              </button>
            </Tooltip>
          </div>
        </nav>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
