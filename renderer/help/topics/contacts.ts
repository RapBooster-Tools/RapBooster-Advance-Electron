import type { HelpTopic } from '../types'

export const contacts: HelpTopic = {
  id: 'contacts',
  route: '/contacts',
  navLabel: 'Contacts',
  title: 'Contacts',
  summary:
    'Contacts is where you keep the people you message, in lists such as "Customers" or "Leads". You can add people by hand, import a CSV, Excel or contact-card file or a Google Sheet, or copy the numbers your linked phones already know. You can also tag people, check which numbers are on WhatsApp, and manage the opt-out list of people who asked not to be messaged.',
  tasks: [
    {
      id: 'contacts-new-list',
      title: 'Create a contact list',
      steps: [
        'Click Contacts in the sidebar, then "+ New List".',
        'Type a List Name, such as "Customers".',
        'Optionally type extra columns in "Custom Fields", separated by commas, such as Company, City.',
        'Click "Create List". Name and Mobile are always included. Every custom field becomes a merge tag for templates.',
      ],
    },
    {
      id: 'contacts-import',
      title: 'Import contacts from a file',
      steps: [
        'Open the list, then click Import.',
        'On "From a file", click "Choose file…" and pick a CSV, Excel (.xlsx) or contact-card (.vcf) file. Click "Read file".',
        'Check that each column points to the right field. One column must go to Mobile.',
        'Answer "Do these numbers already include their country code?". If not, type your country code, such as +91.',
        'Choose what happens when a number is already in the list, then click Import.',
        'A message says how many were imported, skipped and invalid.',
      ],
    },
    {
      id: 'contacts-sheet',
      title: 'Import from a Google Sheet',
      steps: [
        'In Google Sheets, click Share and set it to "Anyone with the link can view".',
        'Copy the link of the tab you want.',
        'In RapBooster, open the list, click Import, then choose "Google Sheets".',
        'Paste the link and click "Read sheet". Then map the columns and import as with a file.',
      ],
    },
    {
      id: 'contacts-wa-import',
      title: 'Import the numbers your phone already knows',
      steps: [
        'Click "Import from WhatsApp".',
        'Under "Who to import", choose Everyone, "Saved contacts" or "Chats (incl. unsaved numbers)". You can limit chats to the last few days.',
        'Choose which phones to take numbers from, and look at the preview.',
        'Type a name for the new list and click "Import into a new list".',
        'A number known to several phones is imported once.',
      ],
    },
    {
      id: 'contacts-tags',
      title: 'Tag contacts',
      steps: [
        'Click "Manage tags" at the top. Type a tag name, such as VIP, pick a colour and click "Add tag".',
        'In a list, tick the people you want to tag.',
        'In the bar that appears, choose the tag and click "Tag selected".',
        'Use the "All tags" filter to show only people with one tag. Campaigns and sequences can target tags.',
      ],
    },
    {
      id: 'contacts-optouts',
      title: 'Manage the opt-out list',
      steps: [
        'Click the Opt-outs tab at the top of the Contacts screen.',
        'To add numbers by hand, type them with their country code and click "Add to opt-outs".',
        'To add many at once, import a CSV or TXT file of numbers.',
        'Under "Automatic opt-outs", choose the words that opt someone out, such as STOP, and whether to send a confirmation.',
        'Click Remove only if the person asked to receive messages again.',
      ],
    },
  ],
  tips: [
    'Columns called Phone, Number or WhatsApp are matched to Mobile for you. Always check the mapping before importing.',
    'Excel files: only the first sheet is read, and its first row must hold the column names.',
    'Click "Verify numbers" to ask WhatsApp which numbers have an account. It runs slowly in the background through one of your phones. Then filter by WhatsApp status.',
    'Click "Export CSV" to save the list (or the current search) as a file.',
  ],
  warnings: [
    'Only message people who agreed to hear from you. Messages to strangers get your number reported and banned.',
    'Getting the country code wrong sends messages to the wrong people. There is no default on purpose. Answer the question carefully.',
    'Opted-out numbers can still be imported, but RapBooster never messages them. Respect opt-outs: it is the law in many countries.',
  ],
  faq: [
    {
      question: 'Why were some rows "invalid"?',
      answer:
        'The number was missing, too short, or had no country code and you did not give one. An error report is saved to your exports folder so you can fix them.',
    },
    {
      question: 'Can I import an old .xls file?',
      answer: 'No. Open it in Excel and save it as .xlsx or .csv, then import that file.',
    },
    {
      question: 'How does someone opt out?',
      answer:
        'By replying with exactly one of your opt-out words, such as STOP, in any letter case. Replying START lifts an opt-out they made themselves. You can also add or remove numbers by hand.',
    },
  ],
  related: ['campaigns', 'templates', 'sequences', 'groups'],
  keywords: [
    'import',
    'csv',
    'excel',
    'xlsx',
    'vcf',
    'list',
    'audience',
    'tags',
    'opt-out',
    'unsubscribe',
    'stop',
  ],
}
