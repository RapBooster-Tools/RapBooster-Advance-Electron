import type { ChecklistItem, Shortcut } from './types'

/** The first-run welcome: what the app does, in three sentences. */
export const WELCOME = {
  title: 'Welcome to RapBooster Advance',
  sentences: [
    'RapBooster sends WhatsApp messages to your customers from your own WhatsApp numbers, right from this computer.',
    'You link a number, add your contacts, write a message once, and RapBooster sends it to everyone at a safe, steady pace.',
    'It can also answer customers for you with automatic replies, chatbot menus and an AI assistant, while you follow every conversation in one Inbox.',
  ],
  safetyTitle: 'Your numbers are protected from the start',
  checklistIntro:
    'A short checklist on the Dashboard walks you through the first steps. Each step ticks itself when it is done.',
}

/** The Dashboard's getting-started checklist, in the order to do it. */
export const CHECKLIST: ChecklistItem[] = [
  {
    id: 'device',
    title: 'Link your WhatsApp number',
    description: 'Scan a QR code from WhatsApp on your phone, like WhatsApp Web.',
    route: '/devices',
    tour: 'devices',
    optional: false,
  },
  {
    id: 'contacts',
    title: 'Import contacts',
    description: 'Add a list of customers from a file, a Google Sheet or your phone.',
    route: '/contacts',
    tour: 'contacts',
    optional: false,
  },
  {
    id: 'template',
    title: 'Create a message template',
    description: 'Write your message once. Use {{Name}} to greet each person by name.',
    route: '/templates',
    tour: 'templates',
    optional: false,
  },
  {
    id: 'campaign',
    title: 'Send your first campaign',
    description:
      'Start with a small test list of your own numbers before you send to customers.',
    route: '/campaigns',
    tour: 'campaigns',
    optional: false,
  },
  {
    id: 'autoreply',
    title: 'Optional: set up auto-replies',
    description:
      'Answer common questions automatically with a keyword rule, a chatbot menu or the AI bot.',
    route: '/automation',
    tour: 'automation',
    optional: true,
  },
]

export const SHORTCUTS: Shortcut[] = [
  {
    keys: 'F1',
    description: 'Open help for the screen you are on. Press again to close it.',
  },
  {
    keys: 'Escape',
    description: 'Close the help panel, a window or a tooltip, or stop a guided tour.',
  },
  {
    keys: '→ or Enter',
    description: 'During a guided tour: go to the next step.',
  },
  { keys: '←', description: 'During a guided tour: go back one step.' },
  {
    keys: '/',
    description:
      'In the Inbox message box: pick a quick reply. Use ↑ and ↓ to choose and Enter to insert.',
  },
  { keys: 'Enter', description: 'In the Inbox message box: send the message.' },
  {
    keys: 'Enter',
    description:
      'In a keyword box (keyword rules and chatbot flows): add the keyword you typed.',
  },
  {
    keys: 'Tab / Shift+Tab',
    description: 'Move between buttons and boxes without the mouse.',
  },
  {
    keys: '← and →',
    description:
      'Move between tabs, or between the Light, Dark and System theme choices.',
  },
  {
    keys: '⌘Q',
    description:
      'On a Mac: quit RapBooster completely. On Windows, right-click the tray icon and choose Quit.',
  },
]
