import type { HelpTopic } from '../types'

export const groups: HelpTopic = {
  id: 'groups',
  route: '/groups',
  navLabel: 'WA Groups',
  title: 'WhatsApp Groups',
  summary:
    'WA Groups lists the WhatsApp groups and communities your linked phones belong to. You can send a template to several groups at once, create many groups in one go, join a group by its invite link, export group members into a contact list, and manage members, invite links and join requests in groups where you are an admin.',
  tasks: [
    {
      id: 'groups-sync',
      title: 'Load your groups',
      steps: [
        'Link at least one phone on the Devices screen.',
        'Click WA Groups in the sidebar, then click Sync.',
        'Your groups appear with their member count. "admin" means your number can manage the group.',
        'Use "Filter by Device" to see the groups of one phone.',
      ],
    },
    {
      id: 'groups-send',
      title: 'Send a message to several groups',
      steps: [
        'Click each group you want, or "Select All".',
        'Under "Send Messages to Groups", choose a template.',
        'Set "Delay Between Messages (seconds)". A few seconds or more is safer.',
        'Click "Send to Selected Groups".',
      ],
    },
    {
      id: 'groups-bulk-create',
      title: 'Create many groups at once',
      steps: [
        'Click "+ Create Bulk".',
        'Choose the device, a "Group Name Prefix" (such as "Sales Team") and a "Suffix Rule" (001, 002… or A, B…).',
        'Set how many groups to create and the delay between them.',
        'Optionally tick contact lists and set "Contacts per Group" to add members.',
        'Check the preview of the names, then click "Create Groups".',
      ],
    },
    {
      id: 'groups-manage',
      title: 'Manage a group where you are admin',
      steps: [
        "Click Manage on the group's row.",
        'On "Invite link", show, copy or reset the link.',
        'On Settings, choose who can send messages and edit group info, and whether new members need approval.',
        'On Members, add people by phone number or from a contact list, make someone admin, or remove them.',
        'On "Join requests", approve or reject people waiting to join.',
      ],
    },
    {
      id: 'groups-export',
      title: 'Save group members as a contact list',
      steps: [
        'Select one or more groups.',
        'Click "Export members".',
        'Type a name for the new list and click Export.',
        'The new list appears on the Contacts screen.',
      ],
    },
  ],
  tips: [
    'Click "Join via link" and paste a chat.whatsapp.com link to join a group with one of your phones.',
    'Open the Communities tab to create a community and link groups to it.',
    'WhatsApp privacy settings can stop some people being added to a group. Fewer members than you asked for is normal.',
    'Phone numbers for members must include the country code, such as +919876543210.',
  ],
  warnings: [
    'Adding many strangers to groups is one of the fastest ways to get a number banned. Only add people who know you.',
    'Resetting an invite link stops the old link working for everyone who has it.',
    "Bulk group messages count toward each phone's daily limit and pause during quiet hours, like campaigns.",
  ],
  faq: [
    {
      question: 'Why can I not see the Members or Join requests of a group?',
      answer:
        'Only group admins can manage members and see join requests. Your number must be an admin of that group.',
    },
    {
      question: 'Why do some members show "Number hidden by WhatsApp"?',
      answer:
        "In groups, WhatsApp often shares only a private ID instead of a member's phone number. RapBooster replaces it with the real number as soon as WhatsApp reveals it. Until then that person is left out of exports and campaigns, because there is no real number to send to.",
    },
    {
      question: 'A group I just joined is missing. What do I do?',
      answer: 'Click Sync again. Groups are read from your phones when you sync.',
    },
  ],
  related: ['devices', 'templates', 'contacts', 'broadcast'],
  keywords: ['group', 'community', 'members', 'invite', 'admin', 'join', 'bulk create'],
}
