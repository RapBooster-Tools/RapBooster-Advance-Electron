/**
 * Short everyday exchanges for warmup conversations between the user's own
 * numbers. Each script alternates speakers, starting with the first sender.
 *
 * WHY scripted rather than random lines: WhatsApp sees a reply that answers
 * the message before it as a real conversation. Unrelated lines thrown back and
 * forth are as recognisable as a bot as no traffic at all. Nothing here sells,
 * links or mentions a product — warmup exists to look like ordinary use.
 */
export const WARMUP_SCRIPTS: readonly (readonly string[])[] = [
  ['Hi, how are you?', 'Good, thanks! And you?', 'All well here 🙂', 'Great, talk soon'],
  [
    'Are you free later today?',
    'Should be, after 5',
    'Okay, I will call you then',
    'Sounds good 👍',
  ],
  [
    'Did you reach home okay?',
    'Yes, just got in',
    'Good, the traffic was bad today',
    'Tell me about it 😅',
  ],
  ['Good morning!', 'Morning! Slept well?', 'Yes, finally', 'Have a good day'],
  [
    'Can you send me that address again?',
    'Sure, I will share it in a bit',
    'Thanks a lot',
    'No problem',
  ],
  [
    'What time is the meeting tomorrow?',
    'I think 11',
    'Okay, I will be there',
    'See you then',
  ],
  ['Lunch?', 'Already ate, sorry!', 'No worries, next time', 'Definitely 😄'],
  [
    'Happy birthday to your brother!',
    'Thank you, I will tell him',
    'Hope you all celebrate well',
    'We will 🎉',
  ],
  ['Is it raining there?', 'Yes, since the morning', 'Same here, stay dry', 'You too ☔'],
  [
    'Got your message, will check and reply',
    'Sure, take your time',
    'Done, all looks fine',
    'Perfect, thanks',
  ],
  [
    'Are we still on for the weekend?',
    'Yes! Saturday works',
    'Great, I will confirm the time',
    'Okay 👌',
  ],
  ['Did you watch the match?', 'Only the second half', 'It was close!', 'Very close 😬'],
  [
    'Thanks for your help yesterday',
    'Anytime!',
    'Really appreciated it',
    'Happy to help 🙂',
  ],
  ['Call me when you are free', 'Will do in 10 minutes', 'Okay', '👍'],
  ['Have you had dinner?', 'Not yet, just about to', 'Enjoy!', 'Thanks, good night'],
  [
    'Running a bit late, sorry',
    'No problem, take your time',
    'Be there in 15',
    'Okay, see you',
  ],
]
