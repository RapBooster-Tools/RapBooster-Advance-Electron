import type { HelpTopic } from '../types'

export const sequences: HelpTopic = {
  id: 'sequences',
  route: '/sequences',
  navLabel: 'Sequences',
  title: 'Sequences',
  summary:
    'A sequence is a series of follow-up messages sent over hours or days, one step at a time. For example: a welcome today, a reminder after two days and an offer after a week. Each person moves through the steps on their own clock, and the sequence can stop by itself as soon as they reply.',
  tasks: [
    {
      id: 'sequences-create',
      title: 'Create a sequence',
      steps: [
        'Create the templates you need on the Templates screen first.',
        'Click Sequences in the sidebar, then "+ New Sequence".',
        'Type a name and tick the phones to send from under "Send From".',
        'Leave "Stop when the contact replies" ticked unless you have a good reason.',
        'For Step 1, choose a template and how long to wait after someone is enrolled.',
        'Click "+ Add step" for each follow-up. Its wait counts from the previous step.',
        'Click "Create Sequence".',
      ],
    },
    {
      id: 'sequences-enroll',
      title: 'Add people to a sequence',
      steps: [
        'On the sequence card, click Enroll.',
        'Tick one or more contact lists, or tags.',
        'Click Enroll. Each number is added once.',
        'People on the opt-out list and people already in this sequence are skipped.',
      ],
    },
    {
      id: 'sequences-track',
      title: 'See who is in a sequence',
      steps: [
        'Read the counts on the card: Active, Completed, Stopped and Failed.',
        'Click Enrollments to see each person and which step they are on.',
        'Use the filters to show only Active, Completed, Stopped or Failed people.',
        'Tick people and click "Unenroll selected" to take them out.',
      ],
    },
    {
      id: 'sequences-pause',
      title: 'Pause, change or delete a sequence',
      steps: [
        'Click Pause on the card to hold every step. Click Resume to carry on.',
        'Click Edit to change the name, phones or steps, then Save.',
        'Click Delete and confirm to remove the sequence.',
      ],
    },
  ],
  tips: [
    'A sequence can have up to 20 steps.',
    'Wait times can be in minutes, hours or days.',
    'Sequence messages follow the same pacing, daily limit and quiet hours as campaigns. A step due during quiet hours goes out when they end.',
    'Use a sequence for follow-ups and a campaign for one-off announcements.',
  ],
  warnings: [
    'If you untick "Stop when the contact replies", people keep getting steps even after they answer you. That feels pushy and leads to blocks and reports.',
    'Someone who opts out, for example by sending STOP, gets no more steps from any sequence.',
  ],
  faq: [
    {
      question: 'When does the first message go out?',
      answer:
        'After the wait you set on Step 1, counted from the moment the person is enrolled. Set it to 0 minutes to send as soon as possible.',
    },
    {
      question: 'What happens if I pause a sequence for a week?',
      answer:
        'Nothing is sent while it is paused. When you resume, steps that became due are sent, paced as usual.',
    },
    {
      question: 'Why is someone "Stopped"?',
      answer:
        'They replied (when the sequence stops on reply), they opted out, their contact was deleted, or you unenrolled them. Hover over the row in Enrollments to see the reason.',
    },
  ],
  related: ['templates', 'contacts', 'campaigns', 'settings-sending'],
  keywords: ['drip', 'follow-up', 'followup', 'autoresponder', 'series', 'enroll'],
}
