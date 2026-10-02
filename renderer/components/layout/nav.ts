import {
  Bot,
  ListOrdered,
  Radio,
  Zap,
  Contact,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Megaphone,
  Settings,
  Smartphone,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Route } from 'next'

export interface NavItem {
  /** Typed against the generated route map — `typedRoutes` is on, so a link to
   *  a route that does not exist is a compile error rather than a dead click. */
  href: Route
  /**
   * Route segment as reported by useSelectedLayoutSegment(), which is `null` at
   * the index. Active state is keyed on this rather than on usePathname:
   * the sidebar lives in a persisted layout, where the pathname hook does not
   * reliably update on client-side navigation in a static export.
   */
  segment: string | null
  label: string
  icon: LucideIcon
  testId: string
}

/**
 * Sidebar order is taken from the prototype (SPRINTS.md §2), with Lucide icons
 * replacing its emoji, plus the D89 screens (Sequences, Status & Channels,
 * Automation) placed beside the features they extend. Settings is pinned to the
 * bottom.
 */
export const PRIMARY_NAV: NavItem[] = [
  {
    href: '/',
    segment: null,
    label: 'Dashboard',
    icon: LayoutDashboard,
    testId: 'nav-dashboard',
  },
  {
    href: '/inbox',
    segment: 'inbox',
    label: 'Inbox',
    icon: MessageSquare,
    testId: 'nav-inbox',
  },
  {
    href: '/campaigns',
    segment: 'campaigns',
    label: 'Campaigns',
    icon: Megaphone,
    testId: 'nav-campaigns',
  },
  {
    href: '/sequences',
    segment: 'sequences',
    label: 'Sequences',
    icon: ListOrdered,
    testId: 'nav-sequences',
  },
  {
    href: '/broadcast',
    segment: 'broadcast',
    label: 'Status & Channels',
    icon: Radio,
    testId: 'nav-broadcast',
  },
  {
    href: '/groups',
    segment: 'groups',
    label: 'WA Groups',
    icon: Users,
    testId: 'nav-groups',
  },
  {
    href: '/devices',
    segment: 'devices',
    label: 'Devices',
    icon: Smartphone,
    testId: 'nav-devices',
  },
  {
    href: '/contacts',
    segment: 'contacts',
    label: 'Contacts',
    icon: Contact,
    testId: 'nav-contacts',
  },
  {
    href: '/templates',
    segment: 'templates',
    label: 'Templates',
    icon: FileText,
    testId: 'nav-templates',
  },
  {
    href: '/automation',
    segment: 'automation',
    label: 'Automation',
    icon: Zap,
    testId: 'nav-automation',
  },
  {
    href: '/chatbot',
    segment: 'chatbot',
    label: 'AI Bot',
    icon: Bot,
    testId: 'nav-chatbot',
  },
]

export const FOOTER_NAV: NavItem[] = [
  {
    href: '/settings',
    segment: 'settings',
    label: 'Settings',
    icon: Settings,
    testId: 'nav-settings',
  },
]

export const ALL_NAV = [...PRIMARY_NAV, ...FOOTER_NAV]
