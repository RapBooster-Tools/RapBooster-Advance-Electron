import type { Tour } from './types'

/**
 * Guided tours. Each step points at an element carrying the matching
 * `data-tour` attribute; a step whose element is not on screen (an empty
 * list, a chat not yet open) is skipped rather than shown pointing at nothing.
 */
export const TOURS: Tour[] = [
  {
    id: 'dashboard',
    route: '/',
    title: 'Dashboard tour',
    steps: [
      {
        target: 'dashboard-stats',
        title: 'Your business at a glance',
        body: 'How many contacts, connected phones, campaigns and templates you have. These update by themselves.',
      },
      {
        target: 'dashboard-today',
        title: "Today's sending",
        body: 'Campaign messages sent and failed since midnight. If "Failed today" keeps rising, pause and check your phones.',
      },
      {
        target: 'dashboard-attention',
        title: 'Customers waiting for you',
        body: 'Chats handed to a person and AI replies waiting for approval. Click a card to open the Inbox.',
      },
      {
        target: 'dashboard-chart',
        title: 'The last 7 days',
        body: 'Sent, failed, delivered, read and replied messages for each day.',
      },
      {
        target: 'dashboard-usage',
        title: "Each phone's daily limit",
        body: 'How many messages each phone sent today against its limit. The limit keeps your numbers safe.',
      },
      {
        target: 'help-button',
        title: 'Help is always here',
        body: 'Click this button or press F1 on any screen to read about it, search the help or take its tour.',
      },
    ],
  },
  {
    id: 'devices',
    route: '/devices',
    title: 'Devices tour',
    steps: [
      {
        target: 'devices-add',
        title: 'Link a WhatsApp number',
        body: 'Click here, give the phone a name and scan the QR code from WhatsApp on your phone (Settings → Linked Devices → Link a Device).',
      },
      {
        target: 'device-card',
        title: 'One card per number',
        body: 'The card shows the number and whether it is connected. "Connected" in green means it is ready to send.',
      },
      {
        target: 'device-usage',
        title: "Today's limit",
        body: 'Messages sent today against the daily limit. When the bar is full, sending waits until tomorrow.',
      },
      {
        target: 'device-warmup',
        title: 'Warmup for new numbers',
        body: 'Switch this on for a new number. Its limit starts at 20 a day and grows over ten days.',
      },
      {
        target: 'device-actions',
        title: 'Reconnect or log out',
        body: 'Reconnect fixes most connection problems. Logout unlinks the number from RapBooster.',
      },
    ],
  },
  {
    id: 'contacts',
    route: '/contacts',
    title: 'Contacts tour',
    steps: [
      {
        target: 'contacts-new-list',
        title: 'Start with a list',
        body: 'Create a list such as "Customers". You can add extra columns like Company or City.',
      },
      {
        target: 'contacts-views',
        title: 'Contacts and opt-outs',
        body: 'Switch between your lists and the opt-out list of people who asked not to be messaged.',
      },
      {
        target: 'contacts-list-tabs',
        title: 'Your lists',
        body: 'Click a list to open it. The number shows how many people are in it.',
      },
      {
        target: 'contacts-import',
        title: 'Import a file',
        body: 'Bring in contacts from a CSV, Excel or contact-card file, or a Google Sheet. You check every column before anything is saved.',
      },
      {
        target: 'contacts-import-whatsapp',
        title: 'Or copy them from WhatsApp',
        body: 'Import the saved contacts and chats your linked phones already know.',
      },
      {
        target: 'contacts-verify',
        title: 'Check numbers',
        body: 'Ask WhatsApp which numbers have an account, so campaigns can skip the rest.',
      },
      {
        target: 'contacts-manage-tags',
        title: 'Tags',
        body: 'Create tags such as VIP, then tick contacts to tag them. Campaigns can include or leave out tags.',
      },
    ],
  },
  {
    id: 'templates',
    route: '/templates',
    title: 'Templates tour',
    steps: [
      {
        target: 'templates-new',
        title: 'Write a message once',
        body: 'Create a template with text, a photo, buttons and more. Use {{Name}} to greet each person by name.',
      },
      {
        target: 'template-card',
        title: 'Your templates',
        body: 'Each card shows the message as customers will see it. Campaigns, sequences and auto-replies use these.',
      },
    ],
  },
  {
    id: 'campaigns',
    route: '/campaigns',
    title: 'Campaigns tour',
    steps: [
      {
        target: 'campaigns-new',
        title: 'Create a campaign',
        body: 'Pick the phones, the contact lists and a template. Send to a small test list of your own numbers first.',
      },
      {
        target: 'campaign-card',
        title: 'Follow its progress',
        body: 'The card shows the status, the pacing and how far it has got.',
      },
      {
        target: 'campaign-counters',
        title: 'Results',
        body: 'Sent, Failed and Skipped, then Delivered, Read and Replied. Skipped people were left out on purpose, for example because they opted out.',
      },
      {
        target: 'campaign-actions',
        title: 'Stay in control',
        body: 'Pause, resume or stop at any time. Recipients shows every person; Report saves the list as a file.',
      },
    ],
  },
  {
    id: 'inbox',
    route: '/inbox',
    title: 'Inbox tour',
    steps: [
      {
        target: 'inbox-chat-list',
        title: 'All your chats in one place',
        body: 'Conversations from every linked phone. Search, or filter by phone.',
      },
      {
        target: 'inbox-filters',
        title: 'What needs you',
        body: 'Unread chats, chats handed to a person (Escalated) and AI replies waiting for approval (Drafts).',
      },
      {
        target: 'inbox-composer',
        title: 'Answer here',
        body: 'Type and press Enter to send. Type / to insert a quick reply, or click Schedule to send later.',
      },
      {
        target: 'inbox-contact-info',
        title: 'Know your customer',
        body: 'See their lists, tags, campaign history and private team notes.',
      },
      {
        target: 'inbox-quick-replies',
        title: 'Quick replies',
        body: 'Save answers you send often, such as prices or opening hours.',
      },
    ],
  },
  {
    id: 'automation',
    route: '/automation',
    title: 'Automation tour',
    steps: [
      {
        target: 'automation-tabs',
        title: 'Five kinds of automation',
        body: 'Chatbot flows, keyword rules, welcome and away messages, webhooks and call handling.',
      },
      {
        target: 'automation-rule-new',
        title: 'A first keyword rule',
        body: 'Answer a common question, such as prices, the moment someone asks.',
      },
      {
        target: 'automation-rule-test',
        title: 'Try it safely',
        body: 'Type what a customer might send and see which rule would answer. Nothing is sent.',
      },
    ],
  },
  {
    id: 'chatbot',
    route: '/chatbot',
    title: 'AI Bot tour',
    steps: [
      {
        target: 'ai-provider',
        title: 'Connect an AI service',
        body: 'Choose OpenAI, Anthropic, Gemini or a compatible service, paste your API key, then click Test key.',
      },
      {
        target: 'ai-instructions',
        title: 'Tell it how to behave',
        body: 'Describe your business and the rules the bot must follow, such as "never promise discounts".',
      },
      {
        target: 'ai-auto-reply',
        title: 'Switch it on',
        body: 'Tick "Enable Auto-Replies" and choose the tone of voice.',
      },
      {
        target: 'ai-limits',
        title: 'Stay safe and on budget',
        body: 'Start with "Approve before sending", and set daily reply limits so a busy day cannot run up a big bill.',
      },
      {
        target: 'ai-escalation',
        title: 'Hand over to a person',
        body: 'Choose when the bot should stop and pass the chat to you, such as when a customer complains.',
      },
      {
        target: 'ai-save',
        title: 'Save',
        body: 'Nothing changes until you click Save Configuration.',
      },
    ],
  },
]

export function tourFor(id: string): Tour | undefined {
  return TOURS.find((t) => t.id === id)
}
