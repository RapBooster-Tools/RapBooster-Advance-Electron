import type { GlossaryEntry } from './types'

/** Words the app uses, explained for someone who has never used a marketing tool. */
export const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'AI bot',
    definition:
      'An automatic helper that writes replies to customers using an AI service such as ChatGPT, Claude or Gemini. Set it up on the AI Bot screen.',
  },
  {
    term: 'API key',
    definition:
      'A long secret code from an AI company that lets RapBooster use your account with them. Treat it like a password.',
  },
  {
    term: 'Campaign',
    definition:
      'One message (a template) sent to many people from your contact lists, paced slowly by RapBooster to keep your numbers safe.',
  },
  {
    term: 'Channel',
    definition:
      'A WhatsApp Channel: a one-way feed of updates that anyone can follow with its link. Followers cannot reply.',
  },
  {
    term: 'Contact list',
    definition:
      'A named group of people with their phone numbers, such as "Customers" or "Leads". Campaigns and sequences send to lists.',
  },
  {
    term: 'Country code',
    definition:
      'The digits in front of a phone number that say which country it is in, such as +91 for India or +44 for the United Kingdom. WhatsApp needs it.',
  },
  {
    term: 'Daily cap',
    definition:
      'The most automated messages one phone may send in a day. When it is reached, sending waits until the next day. The safe default is 200.',
  },
  {
    term: 'Device',
    definition:
      'One WhatsApp number linked to RapBooster, like WhatsApp Web. You can link up to 20.',
  },
  {
    term: 'Draft (AI draft)',
    definition:
      'A reply the AI bot wrote that is waiting for a person to approve, edit or discard it in the Inbox.',
  },
  {
    term: 'Escalated chat',
    definition:
      'A conversation the bot or a flow handed to a person. The bot stays quiet there until you click "Resume bot".',
  },
  {
    term: 'Flow (chatbot flow)',
    definition:
      'A set of automatic steps, such as a menu and questions, that guides a customer to an answer or to a person. Built on the Automation screen.',
  },
  {
    term: 'Health breaker',
    definition:
      'A safety switch that pauses a phone by itself when its messages start failing at an unusual rate, which can be a sign of a coming ban.',
  },
  {
    term: 'Hidden number',
    definition:
      'Shown as "Number hidden by WhatsApp" when WhatsApp shares only a private ID instead of a phone number. RapBooster fills in the real number as soon as WhatsApp reveals it.',
  },
  {
    term: 'Keyword rule',
    definition:
      'An automatic answer sent when a customer\'s message contains a word you chose, such as "price".',
  },
  {
    term: 'Merge tag',
    definition:
      "A word in double curly brackets, such as {{Name}}, that is replaced with each person's own details when the message is sent.",
  },
  {
    term: 'Opt-out',
    definition:
      'A person who asked not to receive messages, for example by replying STOP. RapBooster never sends them campaigns, sequences or automatic replies.',
  },
  {
    term: 'Pacing',
    definition:
      'The random waits and regular breaks between messages that make sending look like a person instead of a machine.',
  },
  {
    term: 'Pairing code',
    definition:
      'An 8-character code you type on your phone to link it to RapBooster, instead of scanning a QR code.',
  },
  {
    term: 'QR code',
    definition:
      'The square barcode RapBooster shows when you link a phone. You scan it from WhatsApp, under Linked Devices.',
  },
  {
    term: 'Quick reply',
    definition:
      'A saved answer you insert in the Inbox by typing / and picking it, such as your price list or opening hours.',
  },
  {
    term: 'Quiet hours',
    definition:
      'A time window, such as 21:00 to 09:00, when campaigns, follow-up sequences, bulk group messages and warmup pause. Replies to customers and messages you schedule still go out.',
  },
  {
    term: 'Sequence',
    definition:
      'A series of follow-up messages sent one step at a time over hours or days, which can stop when the person replies.',
  },
  {
    term: 'Spintax',
    definition:
      'Choices written as {Hi|Hello|Hey}. Each person gets one of them at random, so not every message is the same.',
  },
  {
    term: 'Status',
    definition:
      'A WhatsApp Status update: text, a photo or a video your contacts can see for 24 hours.',
  },
  {
    term: 'Tag',
    definition:
      'A label such as "VIP" you put on contacts, to target or leave them out of campaigns and sequences.',
  },
  {
    term: 'Template',
    definition:
      'A message you write once and reuse in campaigns, sequences, groups and auto-replies.',
  },
  {
    term: 'Token',
    definition:
      'The unit AI companies charge by. A token is roughly three quarters of a word.',
  },
  {
    term: 'Warmup',
    definition:
      'A plan for new numbers: the daily limit starts at 20 messages and grows over ten days, so WhatsApp sees normal, gradual use.',
  },
  {
    term: 'Webhook',
    definition:
      'A way to tell another computer system, such as a CRM, when something happens in RapBooster, for example a new message or an opt-out.',
  },
  {
    term: 'Welcome and away messages',
    definition:
      'Automatic greetings: a welcome for someone writing to you for the first time, and an away message outside your business hours.',
  },
]
