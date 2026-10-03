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

export interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

const item = (
  href: Route,
  segment: string | null,
  label: string,
  icon: LucideIcon,
  testId: string,
): NavItem => ({ href, segment, label, icon, testId })

/**
 * Sidebar sections, grouped by what the user is trying to do rather than by
 * feature name, so a first-time user finds "send a campaign" or "add contacts"
 * without knowing the product's vocabulary. Every route from the prototype
 * (SPRINTS.md §2) plus the D89 screens appears exactly once; the `nav-*` test
 * ids are a contract with the E2E suite.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      item('/', null, 'Dashboard', LayoutDashboard, 'nav-dashboard'),
      item('/inbox', 'inbox', 'Inbox', MessageSquare, 'nav-inbox'),
    ],
  },
  {
    id: 'messaging',
    label: 'Messaging',
    items: [
      item('/campaigns', 'campaigns', 'Campaigns', Megaphone, 'nav-campaigns'),
      item('/sequences', 'sequences', 'Sequences', ListOrdered, 'nav-sequences'),
      item('/broadcast', 'broadcast', 'Status & Channels', Radio, 'nav-broadcast'),
      item('/templates', 'templates', 'Templates', FileText, 'nav-templates'),
    ],
  },
  {
    id: 'audience',
    label: 'Audience',
    items: [
      item('/contacts', 'contacts', 'Contacts', Contact, 'nav-contacts'),
      item('/groups', 'groups', 'WA Groups', Users, 'nav-groups'),
    ],
  },
  {
    id: 'automation',
    label: 'Automation',
    items: [
      item('/automation', 'automation', 'Automation', Zap, 'nav-automation'),
      item('/chatbot', 'chatbot', 'AI Bot', Bot, 'nav-chatbot'),
    ],
  },
  {
    id: 'setup',
    label: 'Setup',
    items: [
      item('/devices', 'devices', 'Devices', Smartphone, 'nav-devices'),
      item('/settings', 'settings', 'Settings', Settings, 'nav-settings'),
    ],
  },
]

export const ALL_NAV: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)
