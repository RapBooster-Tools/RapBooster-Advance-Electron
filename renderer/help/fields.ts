import type { FieldHelp } from './types'

/**
 * The text behind every "?" InfoTip next to a setting, keyed by a stable id.
 * The user guide lists them under "Settings explained" in each chapter, so a
 * reader of the printed guide sees exactly what the tooltip says.
 */
export const FIELD_HELP = {
  'pacing-delay-from': {
    label: 'Random Delay From / To (sec)',
    text: 'Before each message, RapBooster waits a random time between these two numbers of seconds. Random gaps look like a person typing. A few seconds or more is safer.',
    topic: 'campaigns',
  },
  'pacing-sleep': {
    label: 'Sleep Duration / Sleep After N Messages',
    text: 'After this many messages, the phone takes a longer break of this many seconds. Regular breaks make the sending pattern look natural.',
    topic: 'campaigns',
  },
  'campaign-check-numbers': {
    label: 'Skip numbers not on WhatsApp',
    text: 'Checks each number with WhatsApp just before sending. Numbers without WhatsApp are marked Skipped instead of Failed, which keeps your failure rate low.',
    topic: 'campaigns',
  },
  'campaign-tags': {
    label: 'Include / Exclude contacts tagged',
    text: 'Include adds everyone with that tag, even if they are not in a chosen list. Exclude leaves people with that tag out, even if they are in a chosen list. Each number still gets one message.',
    topic: 'campaigns',
  },
  'campaign-schedule': {
    label: 'Schedule Send (optional)',
    text: 'Pick a date and time to start later. Leave it empty to start now. Quiet hours and daily limits still apply after it starts.',
    topic: 'campaigns',
  },
  'daily-cap': {
    label: 'Daily cap per device',
    text: 'The most automated messages one phone may send in a day: campaigns, sequences, group messages and automatic replies alike. When it is reached, they wait until it resets. Replies you type yourself are not limited. 200 is a safe start. 0 means no limit, which is risky.',
    topic: 'settings-sending',
  },
  'quiet-hours': {
    label: 'Quiet hours',
    text: 'Campaigns, follow-up sequences, bulk group messages and warmup pause in this window (local time) and resume when it ends. Replies to customers — AI, chatbot flows, keyword and welcome/away replies — and messages you schedule still go out at any hour, within the daily limit.',
    topic: 'settings-sending',
  },
  'retry-attempts': {
    label: 'Retry attempts',
    text: 'How many more times RapBooster tries a message that failed for a temporary reason, such as a weak connection, before marking it Failed.',
    topic: 'settings-sending',
  },
  'max-concurrent-devices': {
    label: 'Max devices sending at once',
    text: 'How many of your phones may send at the same time. Each phone still sends only one message at a time.',
    topic: 'settings-sending',
  },
  'attribution-hours': {
    label: 'Reply attribution window (hours)',
    text: 'A reply that arrives within this many hours of a campaign message is counted as "Replied" for that campaign.',
    topic: 'settings-sending',
  },
  'group-delays': {
    label: 'Group message delay / Group create delay',
    text: 'The default wait between messages to groups, and between creating groups in bulk. Longer waits are safer.',
    topic: 'settings-sending',
  },
  warmup: {
    label: 'Warmup',
    text: 'For new numbers. Day 1 allows 20 messages, rising each day for ten days until your normal daily cap. Optional warmup conversations let your own numbers chat with each other.',
    topic: 'devices',
  },
  'warmup-conversations': {
    label: 'Warmup conversations between my devices',
    text: "With two or more warmup numbers connected, they send each other a few short everyday messages, spread over the day and outside quiet hours. These count toward each phone's daily cap.",
    topic: 'settings-sending',
  },
  spintax: {
    label: 'Spintax',
    text: 'Write {Hi|Hello|Hey} and each person gets one of the words at random, so not every message is identical. The count below shows how many different messages your text can make.',
    topic: 'templates',
  },
  'merge-tags': {
    label: 'Merge tags',
    text: "A tag in double curly brackets, such as {{Name}}, is replaced with each person's own details when the message is sent. The buttons list the fields your contact lists have.",
    topic: 'templates',
  },
  'sequence-delay': {
    label: 'Wait (step delay)',
    text: 'How long to wait before this step. Step 1 counts from when the person is enrolled; every other step counts from the previous step. Quiet hours and daily caps can make a step a little later.',
    topic: 'sequences',
  },
  'sequence-stop-on-reply': {
    label: 'Stop when the contact replies',
    text: 'When the person writes back, they get no more steps from this sequence. Keep it on: following up after someone answered feels pushy.',
    topic: 'sequences',
  },
  'duplicate-policy': {
    label: 'When a number already exists in this list',
    text: 'Skip keeps the contact you already have. Overwrite replaces it with the row from the file. A number can only be in a list once, so "Import anyway" still keeps the existing contact and adds every new number.',
    topic: 'contacts',
  },
  'dial-prefix': {
    label: 'Country code',
    text: 'If your numbers are written without a country code (such as 98765 43210), choose "No" and type the code to add, such as +91. Numbers that already start with + keep their own code.',
    topic: 'contacts',
  },
  'group-send-delay': {
    label: 'Delay Between Messages (seconds)',
    text: 'The wait between one group and the next. A few seconds or more looks natural and is safer for your number.',
    topic: 'groups',
  },
  'flow-trigger': {
    label: 'Start this flow',
    text: "When the flow begins: when a message contains one of its keywords (whole words), on a new customer's first message, or on every message when no other flow is running.",
    topic: 'automation',
  },
  'flow-priority': {
    label: 'Priority',
    text: 'When two flows or two keyword rules could answer the same message, the higher number wins. Use it to make a specific answer beat a general one.',
    topic: 'automation',
  },
  'rule-match': {
    label: 'Match when the message…',
    text: '"Contains" finds the keyword anywhere as a whole word. "Starts with" needs it at the beginning. "Is exactly" needs the whole message to be just the keyword. Upper and lower case do not matter.',
    topic: 'automation',
  },
  'rule-cooldown': {
    label: 'Cooldown per chat (minutes)',
    text: 'After answering a chat, the rule stays quiet in that chat for this many minutes, so a customer who repeats a word does not get the same answer again and again.',
    topic: 'automation',
  },
  'away-cooldown': {
    label: 'Away message frequency',
    text: 'The same chat gets the away message at most once in this many hours, even if the customer sends several messages at night.',
    topic: 'automation',
  },
  'ai-provider': {
    label: 'Provider and model',
    text: 'The AI company that writes the replies, and which of its models to use. Each company has its own price per reply. Leave the model as it is unless you know you need another.',
    topic: 'chatbot',
  },
  'ai-response-delay': {
    label: 'Response Delay',
    text: 'A short pause before the bot answers, so the reply does not arrive unnaturally fast.',
    topic: 'chatbot',
  },
  'ai-approve': {
    label: 'Approve before sending',
    text: 'Bot replies wait in the Inbox (Drafts) until a person approves, edits or discards them. Use this while you learn how the bot answers.',
    topic: 'chatbot',
  },
  'ai-caps': {
    label: 'Daily replies per device / per chat',
    text: 'The most AI replies one phone, or one conversation, can get in a day. They protect you from a large bill and from a bot that talks too much. 0 means no limit.',
    topic: 'chatbot',
  },
  'ai-debounce': {
    label: 'Wait for more messages (sec)',
    text: 'People often send several short messages in a row. The bot waits this long after the last one and answers them all in one reply.',
    topic: 'chatbot',
  },
  'ai-history': {
    label: 'History depth (messages)',
    text: 'How many earlier messages of the chat the bot reads before answering. More history gives better answers but costs more.',
    topic: 'chatbot',
  },
  'ai-max-tokens': {
    label: 'Max tokens per reply',
    text: 'The longest reply the bot may write. A token is roughly three quarters of a word. Smaller numbers give shorter, cheaper replies.',
    topic: 'chatbot',
  },
  'ai-temperature': {
    label: 'Temperature',
    text: 'How creative the replies are. Low (such as 0.3) gives steady, predictable answers. High gives more varied answers that can wander off topic.',
    topic: 'chatbot',
  },
  'ai-escalation': {
    label: 'Escalation Trigger',
    text: 'When the bot should stop and hand the chat to a person: when the customer uses words such as "complaint" or "refund", after a number of bot replies, or after a conversation has run a number of minutes.',
    topic: 'chatbot',
  },
} satisfies Record<string, FieldHelp>

export type FieldHelpId = keyof typeof FIELD_HELP
