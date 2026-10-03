/**
 * Removing a device (D158): a device never used by a campaign is deleted with
 * everything it holds; one that campaign reports reference is archived — its
 * chats are deleted, the row stays for the reports, and it frees its slot.
 * A device an unfinished campaign still uses cannot be removed.
 *
 * All numbers are fakes.
 */
import { expect, test } from '@playwright/test'
import { appendFileSync } from 'node:fs'
import {
  connect,
  createCampaign,
  createDevices,
  createList,
  createTemplate,
  files,
  ipc,
  ipcResult,
  launch,
  query,
  statusOf,
  type Session,
} from './fixtures/campaign-harness'
import { cleanupUserDataDir, newUserDataDir } from './fixtures/licensed-app'

let dir: string
let s: Session

test.beforeEach(async () => {
  dir = newUserDataDir()
  s = await launch(dir)
})

test.afterEach(async () => {
  await s?.app.close()
  cleanupUserDataDir(dir)
})

function inject(event: Record<string, unknown>): void {
  appendFileSync(files(dir).inject, `${JSON.stringify(event)}\n`)
}

const chatsOf = (deviceId: string) =>
  query<{ n: number }>(
    dir,
    'SELECT COUNT(*) AS n FROM Chat WHERE deviceId = ?',
    deviceId,
  )[0]!.n

test('E6.71 — removing an unused device deletes it and its chats, from the Devices screen', async () => {
  const [deviceId] = await createDevices(s.win, 1)
  inject({ type: 'message', deviceId, from: '+919811200001', body: 'hello' })
  await expect.poll(() => chatsOf(deviceId!)).toBe(1)

  await s.win.getByTestId('nav-devices').click()
  await s.win.getByTestId('remove-device').click()
  const dialog = s.win.getByTestId('remove-device-dialog')
  await expect(dialog).toContainText('permanently deletes')
  await dialog.getByTestId('confirm-remove-device').click()

  await expect(s.win.getByTestId('device-card')).toHaveCount(0)
  expect(query(dir, 'SELECT 1 FROM Device WHERE id = ?', deviceId!)).toHaveLength(0)
  expect(chatsOf(deviceId!)).toBe(0)
})

test('E6.72 — a device campaign reports use is archived: chats gone, reports kept, slot freed', async () => {
  const [deviceId] = await createDevices(s.win, 1)
  const templateId = await createTemplate(s.win)
  const list = await createList(s.win, 'Remove', ['+919811200011', '+919811200012'])
  const campaignId = await createCampaign(s.win, {
    templateId,
    deviceIds: [deviceId!],
    listIds: [list.listId],
  })
  await ipc(s.win, 'campaign:start', { id: campaignId })
  await expect
    .poll(() => statusOf(dir, campaignId), { timeout: 30_000 })
    .toBe('completed')
  inject({ type: 'message', deviceId, from: '+919811200011', body: 'thanks' })
  await expect.poll(() => chatsOf(deviceId!)).toBeGreaterThan(0)

  await ipc(s.win, 'device:delete', { id: deviceId! })

  const [row] = query<{ archivedAt: string | null; status: string }>(
    dir,
    'SELECT archivedAt, status FROM Device WHERE id = ?',
    deviceId!,
  )
  expect(row?.archivedAt).not.toBeNull()
  expect(row?.status).toBe('logged_out')
  expect(chatsOf(deviceId!)).toBe(0)
  // The campaign's report still has every recipient.
  expect(
    query(dir, 'SELECT 1 FROM CampaignRecipient WHERE campaignId = ?', campaignId),
  ).toHaveLength(2)
  // Hidden everywhere, and it no longer counts toward the limit.
  expect(await ipc(s.win, 'device:list')).toHaveLength(0)
  const again = await ipcResult(s.win, 'device:connect', { id: deviceId! })
  expect(again.ok).toBe(false)
})

test('E6.73 — a device an unfinished campaign uses cannot be removed', async () => {
  const [deviceId] = await createDevices(s.win, 1)
  const templateId = await createTemplate(s.win)
  const list = await createList(s.win, 'Busy', ['+919811200021'])
  const campaignId = await createCampaign(s.win, {
    name: 'Busy campaign',
    templateId,
    deviceIds: [deviceId!],
    listIds: [list.listId],
    scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
  })
  expect(statusOf(dir, campaignId)).toBe('scheduled')

  const result = await ipcResult(s.win, 'device:delete', { id: deviceId! })
  expect(result.ok).toBe(false)
  expect(result.message).toContain('Busy campaign')
  expect(await ipc(s.win, 'device:list')).toHaveLength(1)
  await connect(s.win, [deviceId!])
})
