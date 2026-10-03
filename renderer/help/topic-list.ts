import type { HelpTopic } from './types'
import { automation } from './topics/automation'
import { broadcast } from './topics/broadcast'
import { campaigns } from './topics/campaigns'
import { chatbot } from './topics/chatbot'
import { contacts } from './topics/contacts'
import { dashboard } from './topics/dashboard'
import { devices } from './topics/devices'
import { groups } from './topics/groups'
import { helpCenter } from './topics/help-center'
import { inbox } from './topics/inbox'
import { sequences } from './topics/sequences'
import {
  settings,
  settingsAppearance,
  settingsBackup,
  settingsDesktop,
  settingsDiagnostics,
  settingsLicense,
  settingsSending,
} from './topics/settings'
import { templates } from './topics/templates'

/**
 * Every topic, in the order a new user meets the screens: set up first, then
 * audience and messages, then sending, then automation. The guide's chapters
 * and the Help Center's topic list follow this order.
 */
export const HELP_TOPICS: HelpTopic[] = [
  dashboard,
  devices,
  contacts,
  templates,
  campaigns,
  inbox,
  sequences,
  broadcast,
  groups,
  automation,
  chatbot,
  settings,
  settingsSending,
  settingsLicense,
  settingsDiagnostics,
  settingsAppearance,
  settingsDesktop,
  settingsBackup,
  helpCenter,
]
