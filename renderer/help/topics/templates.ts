import type { HelpTopic } from '../types'

export const templates: HelpTopic = {
  id: 'templates',
  route: '/templates',
  navLabel: 'Templates',
  title: 'Templates',
  summary:
    "A template is a message you write once and reuse in campaigns, sequences, group messages and auto-replies. It can be plain text, a photo or video with a caption, buttons, a list of options, a voice note, a sticker, a location, a contact card, a poll, an event invite or a product from your catalog. Merge tags such as {{Name}} fill in each person's details, and spintax varies the wording so every message is a little different.",
  tasks: [
    {
      id: 'templates-create',
      title: 'Create a text template',
      steps: [
        'Click Templates in the sidebar, then "+ New Template".',
        'Type a Template Name you will recognise later, such as "Diwali offer".',
        'Keep the Template Type as "Text Only".',
        'Write your message in "Message Content". Use *stars* for bold and _underscores_ for italics, as in WhatsApp.',
        'Check the Preview, then click "Create Template".',
      ],
    },
    {
      id: 'templates-merge-tags',
      title: 'Personalise with merge tags',
      steps: [
        'While writing, click a button under "Insert:", such as {{Name}}. It is added to the message.',
        'Each person receives their own value. "Hi {{Name}}" becomes "Hi Priya".',
        'The buttons come from the fields of your contact lists. Add custom fields when you create a list.',
        'If the Preview warns "No list provides" a tag, that tag would send as a blank. Remove it or add the field to your list.',
      ],
    },
    {
      id: 'templates-spintax',
      title: 'Vary the wording with spintax',
      steps: [
        'Write choices inside curly brackets, separated by a straight line: {Hi|Hello|Hey}.',
        'Each person gets one of the choices at random.',
        'Check the count under the box. "3 variations" means it worked. "1 variation" means a typo in the brackets.',
        'Click "Another variation" above the Preview to see other versions.',
      ],
    },
    {
      id: 'templates-media',
      title: 'Add a photo, video or buttons',
      steps: [
        'Choose "With Media (Image/Video)" as the Template Type.',
        'Choose the Media Type, then click "Choose file…" and pick the file. It is copied into RapBooster.',
        'Write a caption in "Message Content" if you want one.',
        'For buttons, choose "Button Message", add up to 5 buttons and pick what each does: Quick reply, Open a link, Call a number or Copy a code.',
        'Click "Create Template".',
      ],
    },
  ],
  tips: [
    "Button and list messages arrive as real WhatsApp buttons. If someone's WhatsApp cannot show them, they get a numbered list instead.",
    'A list ("Interactive Message") can have up to 10 options, one per line.',
    'Voice notes play best as OGG/Opus files. Stickers must be WebP files of 1 MB or less.',
    'To change a template, create a new one with your changes and use that from now on.',
  ],
  warnings: [
    'Sending the exact same text to hundreds of people looks like spam to WhatsApp. Use spintax and merge tags so each message is different.',
  ],
  faq: [
    {
      question: 'Can I edit a template?',
      answer:
        'Not at the moment. Create a new template with the changes. You can delete the old one with the Delete button on its card, unless a campaign uses it.',
    },
    {
      question: 'Why can I not delete a template?',
      answer:
        "A template that a campaign uses cannot be deleted, so that campaign's history and any remaining messages stay correct. The message says how many campaigns use it.",
    },
    {
      question: 'What is the difference between {Hi|Hello} and {{Name}}?',
      answer:
        "One pair of curly brackets with straight lines is spintax: RapBooster picks one word. Two pairs of curly brackets is a merge tag: RapBooster fills in that person's details.",
    },
    {
      question: 'Which fields can I use as merge tags?',
      answer:
        'Name and Mobile always, plus any custom field you added to a contact list, such as Company or City.',
    },
  ],
  related: ['campaigns', 'sequences', 'contacts', 'automation'],
  keywords: [
    'message',
    'text',
    'merge tag',
    'spintax',
    'personalise',
    'personalize',
    'buttons',
    'media',
  ],
}
