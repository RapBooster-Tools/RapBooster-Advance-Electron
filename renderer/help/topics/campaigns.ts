import type { HelpTopic } from '../types'

export const campaigns: HelpTopic = {
  id: 'campaigns',
  route: '/campaigns',
  navLabel: 'Campaigns',
  title: 'Campaigns',
  summary:
    'A campaign sends one template to everyone in the contact lists you choose, from one or more of your WhatsApp numbers. RapBooster sends the messages slowly, with random pauses, so your numbers look like a person and not a machine. You can pause, resume or stop a campaign at any time and see exactly who received it.',
  tasks: [
    {
      id: 'campaigns-create',
      title: 'Send your first campaign',
      steps: [
        'Make a small test list on the Contacts screen first, with two or three of your own numbers.',
        'Click Campaigns in the sidebar, then "+ Create Campaign".',
        'Type a campaign name. Tick the phones to send from under "Select Devices".',
        'Tick your test list under "Select Contact Lists", then choose a template under "Select Template".',
        'Leave the four pacing boxes as they are unless you know you need something else.',
        'Click "Create & Start". Watch the counters on the campaign card go up.',
        'When the test looks right on your own phone, create the real campaign with your full list.',
      ],
    },
    {
      id: 'campaigns-schedule',
      title: 'Schedule a campaign for later',
      steps: [
        'Fill in the campaign as usual.',
        'In "Schedule Send (optional)", pick the date and time.',
        'The main button changes to Schedule. Click it.',
        'The card shows the status Scheduled and the time it will start.',
      ],
    },
    {
      id: 'campaigns-control',
      title: 'Pause, resume or stop a campaign',
      steps: [
        'Find the campaign card on the Campaigns screen.',
        'Click Pause to stop sending for now. Nothing is lost.',
        'Click Resume to carry on from where it stopped.',
        'Click Stop to finish it for good. People not yet reached will not get the message.',
        'A draft campaign has a Start button instead.',
      ],
    },
    {
      id: 'campaigns-results',
      title: 'See who received the message',
      steps: [
        'On the campaign card, read Sent, Failed and Skipped, and Delivered, Read and Replied below them.',
        'Click Recipients to see every person and their status. Use All, Sent, Failed, Pending and Skipped to filter.',
        'The "Error / reason" column says why a message failed or was skipped.',
        'Click Report to save the full list as a CSV file, which opens in Excel or Google Sheets. It opens when it is ready.',
      ],
    },
    {
      id: 'campaigns-tags',
      title: 'Target people by tag',
      steps: [
        'Tag contacts on the Contacts screen first (for example "VIP").',
        'In "Create Campaign", tick tags under "Include contacts tagged" to add those people.',
        'Tick tags under "Exclude contacts tagged" to leave people out, even if they are in a chosen list.',
        'Read the summary line at the bottom of the window. Each number is messaged only once.',
      ],
    },
  ],
  tips: [
    'Tick "Skip numbers not on WhatsApp" to check each number just before sending. Numbers without WhatsApp are skipped instead of counted as failures.',
    'If the window warns that a merge tag such as {{Company}} is not in your lists, those messages would go out with a blank. Fix the template or the list first.',
    'Choosing several phones spreads the work. Each phone sends one message at a time.',
    "Duplicate copies a campaign's settings into a new draft. Use it to send the same message again later.",
  ],
  warnings: [
    'Always test with a small list of your own numbers before sending to customers.',
    'Very short delays make a number look like a robot. Keep "Random Delay" at a few seconds or more, and keep the sleep pause.',
    'Each phone stops at its daily limit, and campaigns pause during quiet hours. The campaign carries on by itself when the limit resets or when quiet hours end.',
    'A duplicated campaign sends to everyone in its lists again, including people the first campaign already reached.',
    'People on your opt-out list are always skipped. Never remove someone from the opt-out list unless they asked you to.',
  ],
  faq: [
    {
      question: 'Why is my campaign running but nothing is being sent?',
      answer:
        'The usual reasons are: it is quiet hours, the phones reached their daily limit, a phone was paused for safety, or no chosen phone is connected. Check Devices and Settings › Sending & safety.',
    },
    {
      question: 'Can I change a campaign after it starts?',
      answer:
        'No. Pause it, stop it if needed, and create a new one. Use Duplicate to start from the same settings.',
    },
    {
      question: 'What does "Skipped" mean?',
      answer:
        'The person was not sent the message on purpose: they are on the opt-out list, or their number is not on WhatsApp. Skipped messages never count as failures.',
    },
    {
      question: 'How does RapBooster know someone replied because of my campaign?',
      answer:
        'A reply that arrives within the "Reply attribution window" after your message is counted as a reply to the campaign. You can change the window in Settings › Sending & safety.',
    },
  ],
  related: ['templates', 'contacts', 'devices', 'settings-sending', 'sequences'],
  keywords: [
    'bulk',
    'broadcast',
    'blast',
    'send',
    'marketing',
    'pacing',
    'delay',
    'report',
  ],
}
