import type { HelpTopic } from '../types'

export const chatbot: HelpTopic = {
  id: 'chatbot',
  route: '/chatbot',
  navLabel: 'AI Bot',
  title: 'AI Bot',
  summary:
    'The AI bot writes replies to your customers using an AI service such as OpenAI (ChatGPT), Anthropic (Claude) or Google Gemini. You tell it about your business, your products and the questions people often ask, and it answers in the tone you choose. You can ask it to wait for your approval before anything is sent, and to hand a chat to a person when the customer is upset or asks for one.',
  tasks: [
    {
      id: 'chatbot-key',
      title: 'Connect an AI service',
      steps: [
        'Create an account with the AI company you want to use and copy your API key from their website.',
        'Click "AI Bot" in the sidebar.',
        'Under "AI Provider", choose the Provider. Leave Model as it is unless you know which one you want.',
        'Paste the key into the API key box and click "Save key".',
        'Click "Test key". A green message means it works.',
      ],
    },
    {
      id: 'chatbot-teach',
      title: 'Teach the bot about your business',
      steps: [
        'Under "System Instructions", describe how the bot should behave, such as "Be polite. Never promise discounts."',
        'Fill in "Business Information": name, email and phone.',
        'Under "Products & Services (Bulk)", write one product per line as: Name | Description.',
        'Under "Knowledge Base (Bulk)", write one question per line as: Q: Question | A: Answer.',
        'Click "Save Configuration".',
      ],
    },
    {
      id: 'chatbot-enable',
      title: 'Switch on automatic replies safely',
      steps: [
        'Under "Limits & Safety", tick "Approve before sending" for the first days.',
        'Set "Daily replies per device" and "Daily replies per chat" to sensible numbers.',
        'Under "Auto-Reply Settings", tick "Enable Auto-Replies" and choose the Tone.',
        'Click "Save Configuration".',
        'Check the Drafts tab in the Inbox and approve, edit or discard each reply.',
        'When you trust the answers, untick "Approve before sending" and save again.',
      ],
    },
    {
      id: 'chatbot-escalation',
      title: 'Hand difficult chats to a person',
      steps: [
        'Find "Escalation & Handling".',
        'Choose an "Escalation Trigger", such as keywords like urgent, complaint or refund.',
        'Optionally hand over after a number of bot replies, or after a conversation has run a number of minutes.',
        'Write the "Escalation Message" the customer sees, such as "Connecting you with our team".',
        'Click "Save Configuration". Escalated chats appear in the Inbox under Escalated.',
      ],
    },
  ],
  tips: [
    'The Usage panel shows how many replies and tokens were used today and this month. Tokens are what AI companies charge for.',
    'Lower "Temperature" gives more predictable answers. Higher gives more varied ones.',
    '"Wait for more messages" lets a customer finish typing. Several quick messages get one reply.',
    'Chatbot flows and keyword rules answer before the AI bot. Use them for questions with one fixed answer.',
  ],
  warnings: [
    'The AI company charges you for every reply. Set daily limits so a busy day cannot run up a large bill.',
    'An AI can be confidently wrong. Start with "Approve before sending" switched on, and never let it promise prices or refunds you have not written down.',
    'Your API key is stored encrypted on this computer and only sent to the provider you chose. Never share it or paste it into a chat.',
  ],
  faq: [
    {
      question: 'Does the bot reply in groups?',
      answer:
        'No. It never replies in a group, never replies to itself and skips any chat that opted out. Its replies are paced like every other automated message.',
    },
    {
      question: 'Can I use a free model on my own computer?',
      answer:
        'Yes, if you run one that speaks the OpenAI format. Choose "OpenAI-compatible (local or gateway)" and type its Base URL, such as http://localhost:11434/v1.',
    },
    {
      question: 'Why did the bot not answer a customer?',
      answer:
        "Common reasons: auto-replies are switched off, a daily reply limit or the phone's daily limit was reached, the chat is escalated, the customer opted out, or a flow or keyword rule answered first. Quiet hours do not stop the bot. A reply held by the daily limit waits in the Inbox and goes out when the limit resets.",
    },
  ],
  related: ['automation', 'inbox', 'settings-sending'],
  keywords: [
    'ai',
    'openai',
    'chatgpt',
    'gpt',
    'claude',
    'anthropic',
    'gemini',
    'api key',
    'bot',
    'auto reply',
  ],
}
