import type { HelpTopic } from '../types'

export const automation: HelpTopic = {
  id: 'automation',
  route: '/automation',
  navLabel: 'Automation',
  title: 'Automation',
  summary:
    'Automation answers customers for you, day and night. Chatbot flows guide people through menus and questions. Keyword rules send a fixed answer when a message contains a word such as "price". Welcome and away messages greet new customers and tell people when you are closed. Webhooks pass events to your other systems, and Calls can reject WhatsApp calls with a polite message.',
  tasks: [
    {
      id: 'automation-rule',
      title: 'Answer a common question with a keyword rule',
      steps: [
        'Click Automation in the sidebar. The "Keyword rules" tab is open.',
        'Click "+ New rule" and give it a name, such as "Prices".',
        'Type each keyword and press Enter after it, such as price, cost, rate.',
        'Choose how the message must match, then write the reply text or choose a template.',
        'Tick the phones the rule should answer on, then click "Save rule".',
        'Type a sample message in "Test a message" and click Test to check which rule answers.',
      ],
    },
    {
      id: 'chatbot-flows',
      title: 'Build a chatbot menu',
      steps: [
        'Open the "Chatbot flows" tab and click "+ New flow".',
        'Pick a ready-made flow (Main menu, Lead capture or FAQ), or a blank one.',
        'Click a step on the canvas and change its wording in the panel on the right.',
        'Use "Add a step" to add a Message, Menu, Question, "Hand to a person" or End step.',
        'Under "Start this flow", choose what starts it, such as a keyword like "menu".',
        'Use "Test this flow" to chat with it. Nothing is sent to WhatsApp. Tick "Flow switched on" and click "Save flow".',
      ],
    },
    {
      id: 'welcome-away',
      title: 'Set up welcome and away messages',
      steps: [
        'Open the "Welcome & away" tab.',
        'Tick "Welcome message" and write the text. It goes once, to someone writing to you for the very first time.',
        'Tick "Away message" and write the text.',
        'Set your business hours for each day. Outside them, the away message is sent.',
        'Choose how often the same chat can get the away message, then click Save.',
      ],
    },
    {
      id: 'automation-calls',
      title: 'Reject WhatsApp calls automatically',
      steps: [
        'Open the Calls tab.',
        'Tick "Automatically reject voice and video calls".',
        'Write a short message for the caller, such as "We cannot take calls. Please send a message." Leave it empty to send nothing.',
        'Click Save. Recent calls are listed below.',
      ],
    },
    {
      id: 'automation-webhooks',
      title: 'Send events to another system',
      steps: [
        'Open the Webhooks tab and click "+ New webhook".',
        'Paste the web address (URL) your other system gave you.',
        'Tick the events to send, such as incoming messages or opt-outs, then click "Create webhook".',
        'Copy the secret shown and give it to whoever runs the other system.',
        'Click "Send test" to check it works, and Deliveries to see what was sent.',
      ],
    },
  ],
  tips: [
    'Opt-out words are always handled first. Welcome and away messages go out alongside any other answer. After that come chatbot flows, then keyword rules, then the AI bot: the first of these that answers wins.',
    'A customer in the middle of a flow always gets the next step of that flow.',
    "In a flow, customers can answer a menu by typing the number, typing the choice's title, or tapping a button.",
    'Question steps save the answer. Later steps can use it, for example {{name}}.',
    'A flow waits 30 minutes for an answer. After that, the next message starts fresh.',
  ],
  warnings: [
    'Automatic answers are never sent to groups, to chats that opted out or to numbers on your opt-out list.',
    "Automatic answers go out at any hour, quiet hours included, but they count toward each phone's daily limit. When the limit is reached they stop until it resets.",
    'Switching a flow off or deleting it ends the conversations that are in progress.',
  ],
  faq: [
    {
      question: 'Two rules match the same message. Which one answers?',
      answer:
        'The one with the higher Priority number. Flows work the same way: when two could start, the higher priority wins.',
    },
    {
      question: 'What does "Hand to a person" do?',
      answer:
        'It sends its message, marks the chat as Escalated in the Inbox, and stops the flow and the AI bot in that chat until you click "Resume bot".',
    },
    {
      question: 'Which time zone do business hours use?',
      answer: 'The time zone of this computer.',
    },
  ],
  related: ['chatbot', 'inbox', 'templates', 'contacts'],
  keywords: [
    'auto reply',
    'autoreply',
    'keyword',
    'bot',
    'flow',
    'menu',
    'welcome',
    'away',
    'webhook',
    'calls',
  ],
}
