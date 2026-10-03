import type { HelpTopic } from '../types'

export const settings: HelpTopic = {
  id: 'settings',
  route: '/settings',
  navLabel: 'Settings',
  title: 'Settings',
  summary:
    'Settings holds everything that applies to the whole app: your license, the safety limits every phone follows, how RapBooster looks and behaves on your computer, backups, and the diagnostics file our support team may ask for. Each part has its own section below.',
  tasks: [
    {
      id: 'settings-find',
      title: 'Find a setting',
      steps: [
        'Click Settings at the bottom of the sidebar.',
        'Scroll to the section you need: License, "Data & diagnostics", Appearance, Desktop, "Sending & safety" or "Backup & restore".',
        'A section with a Save button changes only when you click it. The Desktop and Appearance choices apply straight away.',
      ],
    },
    {
      id: 'settings-help',
      title: 'Get help on one section',
      steps: [
        'Click into the section you want to know about.',
        'Press F1. The help panel opens on that section.',
        'Hover over or focus a small "?" next to a setting to read what it does.',
      ],
    },
  ],
  tips: [
    'Most people only ever need "Sending & safety" and "Backup & restore".',
    'Your theme choice (Light, Dark or System) is also in the title bar at the top right.',
  ],
  warnings: [
    '"Clear all data" removes every contact, template, campaign, group and message. Back up first.',
  ],
  faq: [
    {
      question: 'Where is my data stored?',
      answer:
        'On this computer. The "Data & diagnostics" section shows the exact folders. Your contacts and messages only leave this computer when you send them through WhatsApp, to your AI provider, or to a webhook you set up.',
    },
  ],
  related: [
    'settings-sending',
    'settings-license',
    'settings-backup',
    'settings-diagnostics',
    'settings-desktop',
    'settings-appearance',
  ],
  keywords: ['options', 'preferences', 'configuration'],
}

export const settingsSending: HelpTopic = {
  id: 'settings-sending',
  parent: 'settings',
  route: '/settings',
  navLabel: 'Settings',
  title: 'Settings › Sending & safety',
  summary:
    'These are the anti-ban rules every phone follows: how long to wait between messages, the most messages one phone may send in a day, the quiet hours when campaign-style sending pauses, and the warmup plan for new numbers. They protect your WhatsApp numbers from being restricted or banned.',
  tasks: [
    {
      id: 'settings-sending-cap',
      title: 'Change the daily limit',
      steps: [
        'Open Settings and scroll to "Sending & safety".',
        'Change "Daily cap per device (0 = none)". The safe default is 200.',
        'Click "Save sending defaults". The new limit applies to every phone at once, even mid-campaign.',
      ],
    },
    {
      id: 'settings-sending-quiet',
      title: 'Set quiet hours',
      steps: [
        'In "Sending & safety", tick "Quiet hours".',
        "Set From and Until, such as 21:00 until 09:00. The times are this computer's local time.",
        'Click "Save sending defaults".',
        'Campaigns, follow-up sequences, bulk group messages and warmup pause in this window (local time) and resume when it ends. Replies to customers — AI, chatbot flows, keyword and welcome/away replies — and messages you schedule still go out at any hour, within the daily limit.',
      ],
    },
    {
      id: 'settings-sending-warmup',
      title: 'Let your numbers chat with each other while warming up',
      steps: [
        'Switch on Warmup for each new number on the Devices screen.',
        'In Settings, under Warmup, tick "Warmup conversations between my devices".',
        'Choose "Conversations per day".',
        'Click "Save warmup". With two or more warmup numbers connected, they exchange a few short everyday messages.',
      ],
    },
  ],
  tips: [
    'The four delay boxes here are the starting values for new campaigns. A running campaign keeps its own delays.',
    'Leave "Health breaker" on. It pauses a phone automatically when its messages start failing like a ban is coming.',
    '"Simulate typing" shows "typing…" before each automated message, like a person would.',
  ],
  warnings: [
    'Setting the daily cap to 0 removes the limit. WhatsApp bans numbers that send hundreds of messages a day, especially new ones.',
    'Turning quiet hours off means campaigns and sequences can message people in the middle of the night. That leads to blocks and reports.',
    'Very short delays are risky. Keep a random delay of a few seconds and a sleep pause after every few messages.',
  ],
  faq: [
    {
      question: 'What are the safe defaults?',
      answer:
        'A daily cap of 200 messages per phone and quiet hours from 21:00 to 09:00, both switched on for a new installation. New numbers should use Warmup on top of that.',
    },
    {
      question: 'Does warmup chat count toward the daily limit?',
      answer: "Yes. Warmup conversations count toward each phone's daily limit.",
    },
  ],
  related: ['devices', 'campaigns', 'settings'],
  keywords: [
    'daily cap',
    'limit',
    'quiet hours',
    'night',
    'night',
    'delay',
    'pacing',
    'warmup',
    'ban',
    'safety',
    'throttle',
  ],
}

export const settingsLicense: HelpTopic = {
  id: 'settings-license',
  parent: 'settings',
  route: '/settings',
  navLabel: 'Settings',
  title: 'Settings › License',
  summary:
    'The License section shows whether your license is valid, which computer it is bound to, and when it expires. You can re-check it now, or release it from this computer so you can use it on another one.',
  tasks: [
    {
      id: 'settings-license-move',
      title: 'Move your license to another computer',
      steps: [
        'On the old computer, open Settings and find License.',
        'Click "Deactivate this device", then Confirm.',
        'On the new computer, install RapBooster and enter the same license key.',
      ],
    },
    {
      id: 'settings-license-recheck',
      title: 'Re-check your license',
      steps: [
        'Make sure the computer is online.',
        'Click "Re-check now".',
        'The Status updates. "valid" means everything is fine.',
      ],
    },
  ],
  tips: [
    'If the computer is offline, RapBooster keeps working for a grace period. "Offline grace until" shows how long.',
  ],
  warnings: [
    'Deactivating takes this computer back to the activation screen. Keep your license key: you need it to use RapBooster here again.',
  ],
  faq: [
    {
      question: 'My license says "conflict". What does that mean?',
      answer:
        'The key is already active on another computer. Deactivate it there first, or contact your seller.',
    },
  ],
  related: ['settings', 'settings-diagnostics'],
  keywords: ['license', 'licence', 'activation', 'key', 'expired', 'deactivate'],
}

export const settingsDiagnostics: HelpTopic = {
  id: 'settings-diagnostics',
  parent: 'settings',
  route: '/settings',
  navLabel: 'Settings',
  title: 'Settings › Data & diagnostics',
  summary:
    'This section shows where RapBooster keeps its database and log files, and which version you are running. "Export diagnostics" makes one file our support team can read to find a problem. It never contains your message text, and phone numbers and keys in it are hidden.',
  tasks: [
    {
      id: 'settings-diagnostics-export',
      title: 'Send diagnostics to support',
      steps: [
        'Open Settings and find "Data & diagnostics".',
        'Click "Export diagnostics".',
        'The folder with the new file opens.',
        'Attach that file to your email or message to support, and say what you were doing when the problem happened.',
      ],
    },
  ],
  tips: ['"Open logs folder" shows the log files, if support asks for them directly.'],
  warnings: [],
  faq: [
    {
      question: 'Is it safe to send the diagnostics file?',
      answer:
        'Yes. It contains no message content, and phone numbers, license keys and API keys are hidden before the file is written.',
    },
  ],
  related: ['settings', 'help'],
  keywords: ['support', 'logs', 'diagnostics', 'version', 'bug', 'problem', 'report'],
}

export const settingsAppearance: HelpTopic = {
  id: 'settings-appearance',
  parent: 'settings',
  route: '/settings',
  navLabel: 'Settings',
  title: 'Settings › Appearance',
  summary:
    'Choose Light, Dark or System. System follows your Windows or macOS setting by itself. A phone preview shows how your messages look to customers, including WhatsApp formatting.',
  tasks: [
    {
      id: 'settings-appearance-theme',
      title: 'Switch to dark mode',
      steps: [
        'Open Settings and find Appearance.',
        'Click Dark. The whole app changes at once.',
        'Choose System to follow your computer instead.',
      ],
    },
  ],
  tips: [
    'WhatsApp formatting: *bold*, _italic_, ~strike~ and ```monospace```.',
    'The same Light, Dark and System buttons are in the title bar.',
  ],
  warnings: [],
  faq: [],
  related: ['settings'],
  keywords: ['theme', 'dark mode', 'light mode', 'colours', 'colors', 'look'],
}

export const settingsDesktop: HelpTopic = {
  id: 'settings-desktop',
  parent: 'settings',
  route: '/settings',
  navLabel: 'Settings',
  title: 'Settings › Desktop',
  summary:
    'Choose how RapBooster behaves on your computer: desktop notifications for new messages, whether it keeps running in the tray when you close the window, and whether it starts when the computer starts.',
  tasks: [
    {
      id: 'settings-desktop-background',
      title: 'Keep campaigns sending after closing the window',
      steps: [
        'Open Settings and find Desktop.',
        'Switch on "Keep running when the window is closed".',
        'Closing the window now leaves RapBooster in the tray (the menu bar on a Mac).',
        'To stop everything, choose Quit from the tray icon.',
      ],
    },
    {
      id: 'settings-desktop-notify',
      title: 'Get notified about new messages',
      steps: [
        'Switch on "Notify me about new messages".',
        'When a customer writes and RapBooster is not in front, a notification appears.',
        'Click it to open that chat.',
      ],
    },
  ],
  tips: [
    '"Start RapBooster when the computer starts" opens it quietly in the tray, so campaigns and replies carry on after a restart. It works on Windows and macOS.',
    'On a Mac, closing the window never quits. Use Quit (⌘Q) or the tray menu.',
    'You get at most one notification per chat every 10 seconds.',
  ],
  warnings: [
    'If RapBooster is not running, nothing is sent: campaigns, sequences, scheduled messages and auto-replies all wait.',
  ],
  faq: [],
  related: ['settings', 'inbox'],
  keywords: ['notifications', 'tray', 'background', 'startup', 'start at login'],
}

export const settingsBackup: HelpTopic = {
  id: 'settings-backup',
  parent: 'settings',
  route: '/settings',
  navLabel: 'Settings',
  title: 'Settings › Backup & restore',
  summary:
    'A backup is a copy of everything in RapBooster: contacts, templates, campaigns and message history. RapBooster makes one by itself before every update to its database and before clearing data. You can also make one whenever you like.',
  tasks: [
    {
      id: 'settings-backup-now',
      title: 'Make a backup',
      steps: [
        'Open Settings and find "Backup & restore".',
        'Click "Back up now".',
        'The folder with the backup opens. Copy the file to a USB drive or cloud storage for safe keeping.',
      ],
    },
    {
      id: 'settings-backup-clear',
      title: 'Start again with no data',
      steps: [
        'Make a backup first.',
        'Under "Clear all data", type DELETE in the box.',
        'Click "Clear all data". Devices and your license are kept.',
      ],
    },
  ],
  tips: ['Click "Open backups folder" to see every backup RapBooster has made.'],
  warnings: [
    'Clearing data cannot be undone except from a backup.',
    'Backups stay on this computer. If the computer is lost, so are they. Keep a copy somewhere else.',
  ],
  faq: [
    {
      question: 'How do I restore a backup?',
      answer:
        'There is no restore button on this screen. Keep the backup file safe and contact support: they will guide you through restoring it, so nothing current is lost by mistake.',
    },
  ],
  related: ['settings', 'settings-diagnostics'],
  keywords: ['backup', 'restore', 'copy', 'clear', 'delete everything', 'reset'],
}
