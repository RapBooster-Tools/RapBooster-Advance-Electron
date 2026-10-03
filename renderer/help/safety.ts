import type { HelpFaq, SafetyRule } from './types'

/**
 * The anti-ban rules, in plain words. Shown in the Help Center, the welcome
 * dialog and the user guide's "Safety rules" chapter.
 */
export const SAFETY_RULES: SafetyRule[] = [
  {
    id: 'consent',
    title: 'Only message people who want to hear from you',
    text: 'Messages to strangers get blocked and reported, and reports are what get numbers banned. Use lists of your own customers and people who gave you their number.',
  },
  {
    id: 'daily-cap',
    title: 'Keep the daily cap on',
    text: 'Each phone sends at most 200 automated messages a day unless you change it in Settings › Sending & safety. When the cap is reached, sending waits until the next day. A cap of 0 means no limit, which is risky.',
  },
  {
    id: 'quiet-hours',
    title: 'Respect quiet hours',
    text: "By default, campaigns, follow-up sequences, bulk group messages and warmup pause between 21:00 and 09:00, this computer's time, and carry on in the morning. Replies to customers (AI bot, chatbot flows, keyword, welcome and away replies) and messages you schedule for a set time still go out at any hour, within the daily limit.",
  },
  {
    id: 'warmup',
    title: 'Warm up new numbers',
    text: 'A new number starts at 20 messages a day and grows over ten days. Switch on Warmup on the Devices screen for any number that is new or has not sent much before.',
  },
  {
    id: 'pacing',
    title: 'Send slowly and vary your words',
    text: 'Keep the random delays and sleep pauses. Use spintax ({Hi|Hello}) and merge tags ({{Name}}) so no two messages are identical.',
  },
  {
    id: 'opt-outs',
    title: 'Honour every opt-out',
    text: 'Anyone who replies STOP (or another opt-out word you choose) goes on the opt-out list. RapBooster never sends them campaigns, sequences or automatic replies. Only remove someone if they ask.',
  },
  {
    id: 'test-first',
    title: 'Test with a small list first',
    text: 'Before any big campaign, send it to two or three of your own numbers. Check the wording, the merge tags and any buttons on a real phone.',
  },
  {
    id: 'watch-failures',
    title: 'Stop when things go wrong',
    text: 'If many messages fail, or WhatsApp shows a warning on the phone, pause your campaigns at once. The health breaker pauses a phone by itself when failures look like a ban is coming.',
  },
]

/** Questions that are about the app as a whole rather than one screen. */
export const GENERAL_FAQ: HelpFaq[] = [
  {
    question: 'Is RapBooster an official WhatsApp product?',
    answer:
      "No. It links to your WhatsApp numbers the same way WhatsApp Web does. You are responsible for following WhatsApp's rules and the law where you live.",
  },
  {
    question: 'Does RapBooster need to stay open?',
    answer:
      'Yes, to send. Messages go out from this computer. You can close the window and keep it running in the tray (Settings › Desktop).',
  },
  {
    question: 'What do quiet hours stop, and what still goes out?',
    answer:
      'Quiet hours pause campaigns, follow-up sequences, bulk group messages and warmup. Replies to customers (AI bot, chatbot flows, keyword replies, welcome and away messages, call auto-reply and opt-out confirmations) and messages you scheduled for a set time (inbox messages, Status and Channel posts) still go out at any hour. Everything automated still counts toward the daily limit; replies you type yourself in the Inbox ignore both.',
  },
  {
    question: 'How many WhatsApp numbers can I use?',
    answer: 'Up to 20 at the same time. Each one sends one message at a time.',
  },
  {
    question: 'Can I use WhatsApp on my phone at the same time?',
    answer:
      'Yes. Linking RapBooster works like WhatsApp Web, so your phone keeps working as normal.',
  },
  {
    question: 'Where do I start?',
    answer:
      'Follow the getting-started checklist on the Dashboard: link your number, import contacts, create a template, then send a small test campaign.',
  },
  {
    question: 'How do I get help on the screen I am looking at?',
    answer:
      'Press F1, or click the "?" next to the screen\'s title. To learn a screen step by step, choose "Take the tour".',
  },
]
