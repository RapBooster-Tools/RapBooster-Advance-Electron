import type { HelpTopic } from '../types'

export const dashboard: HelpTopic = {
  id: 'dashboard',
  route: '/',
  navLabel: 'Dashboard',
  title: 'Dashboard',
  summary:
    'The Dashboard is your home screen. It shows how many contacts, connected phones, campaigns and templates you have, how many campaign messages went out today, and how each phone is doing against its daily limit. It also tells you when a customer is waiting for a person in the Inbox.',
  tasks: [
    {
      id: 'dashboard-today',
      title: 'Check how today is going',
      steps: [
        'Click Dashboard at the top of the sidebar.',
        'Look at "Sent today" and "Failed today". They count campaign messages since midnight.',
        'Look at "Device usage today". Each bar shows how many messages a phone sent against its daily limit.',
        'A "Warmup" label means the phone is new and its limit is still growing.',
        'A "Paused for safety" label means RapBooster stopped that phone for a while. Open Devices to see why.',
      ],
    },
    {
      id: 'dashboard-attention',
      title: 'Find customers who are waiting for you',
      steps: [
        'Look at the two cards under the daily numbers.',
        '"Escalated chats" are conversations the bot handed to a person.',
        '"AI drafts awaiting approval" are AI replies waiting for you to approve.',
        'Click either card to open the Inbox and answer them.',
      ],
    },
    {
      id: 'dashboard-chart',
      title: 'Read the last 7 days chart',
      steps: [
        'Find the "Last 7 days" panel.',
        'Each day shows messages Sent, Failed, Delivered, Read and Replied.',
        'Use the legend to see which colour is which.',
        'A rising Failed line is a warning sign. Slow down and check your phones before sending more.',
      ],
    },
    {
      id: 'dashboard-checklist',
      title: 'Use the getting-started checklist',
      steps: [
        'After the welcome message, a "Getting started" list appears on the Dashboard.',
        'Each step ticks itself when you finish it. You do not need to tick anything.',
        'Click "Show me" next to a step. RapBooster opens the right screen and gives you a short tour.',
        'Click "Hide checklist" when you no longer need it.',
        'To bring it back, open Help Center and choose "Show the getting-started checklist again".',
      ],
    },
  ],
  tips: [
    'The numbers update by themselves while the Dashboard is open. You never need to refresh.',
    '"Running Campaigns" includes paused campaigns, because they still have messages left to send.',
    '"Active Devices" counts only phones that are connected right now.',
  ],
  warnings: [
    'If "Failed today" keeps climbing, pause your campaigns and check the Devices screen before you send more. Many failures in a row can mean WhatsApp is limiting the number.',
  ],
  faq: [
    {
      question: 'Why does Active Devices show fewer phones than I linked?',
      answer:
        'It only counts phones that are connected at this moment. A phone that is switched off, offline or logged out is not counted. Open Devices to reconnect it.',
    },
    {
      question: 'Do inbox replies count in "Sent today"?',
      answer:
        'No. "Sent today" and "Failed today" count campaign messages only. Inbox replies, bot replies and sequence steps still count toward each phone\'s daily limit, which you see under "Device usage today".',
    },
    {
      question: 'The green safety notice disappeared. How do I see my limits again?',
      answer:
        'The notice shows once. Your daily limit and quiet hours are always in Settings, under "Sending & safety".',
    },
  ],
  related: ['inbox', 'devices', 'campaigns', 'settings-sending'],
  keywords: ['home', 'overview', 'stats', 'statistics', 'today', 'report', 'chart'],
}
