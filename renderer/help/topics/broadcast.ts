import type { HelpTopic } from '../types'

export const broadcast: HelpTopic = {
  id: 'broadcast',
  route: '/broadcast',
  navLabel: 'Status & Channels',
  title: 'Status & Channels',
  summary:
    'Post WhatsApp Status updates and WhatsApp Channel messages from your linked numbers, now or at a time you choose. A Status is seen by your contacts for 24 hours. A Channel is a one-way feed that anyone can follow with its link.',
  tasks: [
    {
      id: 'broadcast-status',
      title: 'Post a Status update',
      steps: [
        'Click "Status & Channels" in the sidebar. The Status tab is open.',
        'Choose the Device that should post it.',
        'Choose the Type: Text, Image or Video.',
        'Type the text, or choose the file and an optional caption. For text you can pick a background colour.',
        'Under "Who can see it", keep "Every contact on file" or choose "Only these contact lists".',
        'Choose "Post now", or "Schedule" and pick a date and time. Then click the button at the bottom.',
      ],
    },
    {
      id: 'broadcast-create-channel',
      title: 'Create or follow a Channel',
      steps: [
        'Open the Channels tab.',
        'Click "+ Create channel", choose a device, and type a channel name and description. Click Create.',
        'To use a channel you already have, click "Follow channel" and paste its link (https://whatsapp.com/channel/…).',
        'Click Copy next to a channel to copy its invite link and share it with customers.',
      ],
    },
    {
      id: 'broadcast-channel-post',
      title: 'Post to a Channel',
      steps: [
        'Open the Channels tab.',
        'In the post form, choose the device and a channel you own.',
        'Choose the type, write the text or pick the file.',
        'Choose "Post now" or "Schedule", then click the button at the bottom.',
      ],
    },
    {
      id: 'broadcast-history',
      title: 'Check or cancel a scheduled post',
      steps: [
        'Scroll down to "Status posts" or "Channel posts".',
        'Each row shows where it goes, the device, the content, the time and its status.',
        'Click Cancel on a post that has not gone out yet.',
        'If a post failed, the Error column says why.',
      ],
    },
  ],
  tips: [
    'Image and video files are copied into RapBooster, so a scheduled post still works if you move the original file.',
    'Opted-out numbers never see your Status, even when you choose "Every contact on file".',
    'Scheduled posts go out at the time you chose, even during quiet hours.',
    'Removing a channel only forgets it in RapBooster. The channel itself stays on WhatsApp.',
  ],
  warnings: [
    'You can only post to channels you own. A channel you follow can be read but not posted to.',
  ],
  faq: [
    {
      question: 'Who sees my Status?',
      answer:
        'The contacts you choose. WhatsApp usually only shows a Status to people who have your number saved in their phone, and it disappears after 24 hours.',
    },
    {
      question: 'My scheduled post did not go out. Why?',
      answer:
        'Posts go out while RapBooster is running and the chosen device is connected. A post that was due while the app was closed goes out soon after you open it. Check the Status and Error columns in the table.',
    },
  ],
  related: ['devices', 'contacts', 'groups'],
  keywords: ['status', 'story', 'channel', 'newsletter', 'post', 'broadcast', 'schedule'],
}
