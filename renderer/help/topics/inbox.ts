import type { HelpTopic } from '../types'

export const inbox: HelpTopic = {
  id: 'inbox',
  route: '/inbox',
  navLabel: 'Inbox',
  title: 'Inbox',
  summary:
    'The Inbox shows the WhatsApp conversations of every linked phone in one place. You can read and answer customers, send ready-made quick replies, schedule a message for later, approve replies written by the AI bot, and keep private notes about a customer.',
  tasks: [
    {
      id: 'inbox-reply',
      title: 'Answer a customer',
      steps: [
        'Click Inbox in the sidebar.',
        'Pick a conversation from the list on the left. Use "Search chats..." or the device filter to find it.',
        'Type your answer in the message box at the bottom.',
        'Click Send. Your message goes out from the same WhatsApp number the customer wrote to.',
      ],
    },
    {
      id: 'inbox-quick-replies',
      title: 'Save and use quick replies',
      steps: [
        'Click "Quick replies" at the top right of the Inbox.',
        'Click "New quick reply". Give it a short shortcut (for example "prices"), a title and the message.',
        "You can use {{Name}} in the message. It is replaced with the customer's name.",
        'Click Save.',
        'In any chat, type / in the message box. Pick a reply with the arrow keys and press Enter. Nothing is sent until you click Send.',
      ],
    },
    {
      id: 'inbox-schedule',
      title: 'Schedule a message for later',
      steps: [
        'Open the chat and type the message, if you like.',
        'Click Schedule next to Send.',
        'Choose the date and time in "Send on". Check the message.',
        'Optionally click "Choose file…" to add a photo, video or document.',
        'Click Schedule. The waiting message shows above the message box, with a Cancel button.',
      ],
    },
    {
      id: 'inbox-drafts',
      title: 'Approve a reply written by the AI bot',
      steps: [
        'Click the Drafts tab above the chat list to see chats with AI replies waiting.',
        'Open a chat. The waiting reply shows at the top of the conversation.',
        'Click Approve to send it as it is, or "Edit & approve" to change it first.',
        'Click Discard if the reply is wrong. Nothing is sent.',
      ],
    },
    {
      id: 'inbox-contact-panel',
      title: 'See who you are talking to and add notes',
      steps: [
        'Open a chat and click "Contact info" at the top right.',
        'The panel shows the phone number, whether they opted out, their contact lists and tags.',
        'It also shows which campaigns reached them (Sent, Delivered, Read, Replied) and their follow-up sequences.',
        'Under Notes, type a note and click "Add note". Notes are private. The customer never sees them.',
      ],
    },
    {
      id: 'inbox-escalated',
      title: 'Take over a chat from the bot',
      steps: [
        'Click the Escalated tab above the chat list.',
        'These are chats the bot or a chatbot flow handed to a person. The bot stays quiet in them.',
        'Answer the customer yourself.',
        'When you are done, click "Resume bot" at the top of the chat to let the bot answer again.',
      ],
    },
  ],
  tips: [
    'Click the paperclip button to send a location, contact cards, a poll, a voice note or a sticker.',
    "Replies you type yourself are never held back by the daily limit or quiet hours. They still count toward the phone's total for today.",
    'Scheduled messages go out at the time you chose, even during quiet hours, but they count toward the daily limit. If RapBooster was closed at the time, they go out when you open it again.',
    'Photos, documents, voice notes, locations, polls and other special messages show as labelled cards in the conversation.',
  ],
  warnings: [
    'A person shown as "Number hidden by WhatsApp" can still opt out: a STOP from them is honoured straight away. Their chat is never exported or added to a campaign, because there is no real number to send to.',
    'A chat marked "Opted out" asked not to receive messages. Campaigns, sequences and bots skip it. Only write to them if they contact you first and clearly want an answer.',
  ],
  faq: [
    {
      question: 'Why is the Inbox empty?',
      answer:
        'Conversations only appear for linked phones. Link a WhatsApp number on the Devices screen. New messages appear as they arrive.',
    },
    {
      question: 'Why does a chat say "Number hidden by WhatsApp"?',
      answer:
        'WhatsApp sometimes shares only a private ID instead of the phone number, especially in groups and for people you have not saved. You can still read and reply to the chat. As soon as WhatsApp reveals the number, RapBooster shows it everywhere by itself, and if you already had a chat with that number, the two chats are merged.',
    },
    {
      question: 'Can the customer see my notes?',
      answer: 'No. Notes stay on this computer and are never sent to WhatsApp.',
    },
    {
      question: 'Why did my scheduled message not go out on time?',
      answer:
        'A scheduled message waits if the phone has reached its daily limit, and goes out when the limit resets. Quiet hours do not hold it back. A message to an opted-out number is never sent. The strip above the message box says why, with a Dismiss button.',
    },
  ],
  related: ['chatbot', 'automation', 'contacts', 'settings-desktop'],
  keywords: [
    'chat',
    'conversation',
    'reply',
    'message',
    'notes',
    'quick reply',
    'schedule',
  ],
}
