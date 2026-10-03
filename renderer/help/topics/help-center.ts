import type { HelpTopic } from '../types'

export const helpCenter: HelpTopic = {
  id: 'help',
  route: '/help',
  navLabel: 'Help Center',
  title: 'Help Center',
  summary:
    "The Help Center collects all of RapBooster's help in one place: a guide to every screen, the safety rules that protect your WhatsApp numbers, answers to common problems, a dictionary of the words the app uses, and the keyboard shortcuts. You can also restart any guided tour, bring back the getting-started checklist, and find out how to contact support.",
  tasks: [
    {
      id: 'help-search',
      title: 'Search the help',
      steps: [
        'Type a few words in the search box, such as "daily limit" or "QR code".',
        'Click a result to read it.',
        'You can also press F1 on any screen to open help for that screen, with the same search.',
      ],
    },
    {
      id: 'help-tour',
      title: 'Take a guided tour again',
      steps: [
        'In the Help Center, find "Guided tours".',
        'Click the screen you want to learn about.',
        'RapBooster opens that screen and points at each part in turn. Use Next and Back, or the arrow keys.',
        'Press Escape or click Skip to stop at any time.',
      ],
    },
    {
      id: 'help-support',
      title: 'Contact support',
      steps: [
        'Write down what you were doing and what you expected to happen.',
        'Click "Export diagnostics" in the "Contact support" section, or in Settings under "Data & diagnostics".',
        'Send the file together with your description to your RapBooster seller or support contact.',
      ],
    },
  ],
  tips: [
    'Every screen has a "?" button next to its title. It opens the help for that screen.',
    'Small "?" icons next to settings explain them. Hover over them or reach them with the Tab key.',
  ],
  warnings: [],
  faq: [],
  related: ['dashboard', 'settings-diagnostics'],
  keywords: ['help', 'support', 'tour', 'guide', 'manual', 'how to'],
}
