import type { HelpTopic } from '../types'

export const devices: HelpTopic = {
  id: 'devices',
  route: '/devices',
  navLabel: 'Devices',
  title: 'Devices',
  summary:
    'A device is one WhatsApp number linked to RapBooster, the same way WhatsApp Web is linked to your phone. You can link up to 20 numbers. Each card shows whether the number is connected, how many messages it sent today against its daily limit, and its safety settings, such as warmup for new numbers.',
  tasks: [
    {
      id: 'devices-link-qr',
      title: 'Link your WhatsApp number with a QR code',
      steps: [
        'Click Devices in the sidebar, then "+ Add Device".',
        'Type a Device Name you will recognise, such as "Shop phone".',
        'Click "Generate QR & Connect". A QR code appears.',
        'On your phone, open WhatsApp, then Settings, then "Linked Devices", then "Link a Device".',
        'Point your phone at the QR code on the screen.',
        'Wait a few seconds. The window closes and the card shows Connected.',
      ],
    },
    {
      id: 'devices-link-code',
      title: 'Link with a pairing code instead',
      steps: [
        'Click "+ Add Device", type a Device Name, and open the "Pairing code" tab.',
        'Type the phone number with its country code, such as +91 98765 43210.',
        'Click "Get pairing code". An 8-character code appears.',
        'On your phone, open WhatsApp, then "Linked Devices", then "Link a Device", then "Link with phone number instead".',
        'Type the code on your phone. The card shows Connected when it is done.',
      ],
    },
    {
      id: 'devices-warmup',
      title: 'Warm up a new number',
      steps: [
        'Find the card of the new number.',
        'Switch on Warmup. The number starts at day 1.',
        'Its daily limit starts at 20 messages and grows each day for ten days, up to your normal daily limit.',
        'The caption shows the day and today\'s limit. Leave it on until it says "Ramp complete".',
      ],
    },
    {
      id: 'devices-fix',
      title: 'Fix a number that is not connected',
      steps: [
        'Make sure the phone is switched on and has internet.',
        'Click Reconnect on the card and wait a few seconds.',
        'If the card says "Logged out", the link was removed from the phone. Link it again with "+ Add Device".',
        'If a red message is shown on the card, read it. It says what went wrong.',
      ],
    },
    {
      id: 'devices-safety-pause',
      title: 'Understand "Paused for safety"',
      steps: [
        'When many messages fail in a row, RapBooster pauses that number to protect it. The card says why and when it resumes.',
        'Check the phone: is WhatsApp showing a warning, or is the number restricted?',
        'Slow down your campaigns before sending more.',
        'Click "Resume now" only when you are sure the number is fine.',
      ],
    },
    {
      id: 'devices-remove',
      title: 'Remove a number you no longer use',
      steps: [
        'Make sure no unfinished campaign uses the number. A scheduled, running or paused campaign blocks removal: finish or cancel it first.',
        "On the number's card, click Remove.",
        'Read what will be deleted, then click "Remove permanently".',
        'The card disappears and frees one of your 20 places. Its chats and messages, groups, channels, scheduled posts, call history and synced contacts are deleted.',
        'Campaign reports keep their figures, and your contact lists and templates are not touched. You can link the same number again later with "+ Add Device".',
      ],
    },
  ],
  tips: [
    'Keep the phone charged and online. WhatsApp disconnects linked devices if the phone stays offline for about two weeks.',
    'The usage bar shows messages sent today against the daily limit. It resets at midnight.',
    'A "Business" badge means the number uses WhatsApp Business. Click Re-check if you change the account type.',
    'Logout unlinks the number from RapBooster but keeps its card and chats. Remove deletes the card and its chats for good.',
  ],
  warnings: [
    'New numbers get banned most easily. Switch on Warmup for any number that is less than a few weeks old, or has not sent many messages before.',
    'Never send many messages from a number that was just linked. Let it chat normally for a few days first.',
    'If WhatsApp shows a warning on the phone, stop all campaigns on that number straight away.',
  ],
  faq: [
    {
      question: 'The QR code does not scan. What can I try?',
      answer:
        'Make the window bigger and hold the phone steady about 20 cm away. The code changes every 20 seconds or so, which is normal. If it stops changing, close the window and click "+ Add Device" again, or use a pairing code.',
    },
    {
      question: 'Do I need to keep my phone near the computer?',
      answer:
        'No. After linking, the phone only needs to be switched on with internet now and then. It does not need to be near the computer.',
    },
    {
      question: 'Why is "+ Add Device" greyed out?',
      answer:
        'You have reached the limit of 20 devices. Remove a number you no longer use to free a place.',
    },
  ],
  related: ['settings-sending', 'dashboard', 'campaigns', 'groups'],
  keywords: [
    'phone',
    'number',
    'link',
    'qr',
    'pairing',
    'connect',
    'warmup',
    'remove',
    'delete',
    'logout',
    'reconnect',
    'ban',
  ],
}
