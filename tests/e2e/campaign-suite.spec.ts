/**
 * Campaign engine suite (D89) — E5.20 to E5.34.
 *
 * Written to break the engine rather than to demonstrate it: every spec drives
 * the real engine through the mock transport and then checks the outcome where
 * it actually lands — the mock's send log (what reached "WhatsApp"), SQLite
 * (what the engine decided) and the IPC responses (what the user is shown).
 *
 * Conventions: each spec owns a fresh userData directory; anything that needs
 * tags or opt-outs seeds them with the app closed (fixtures/campaign-harness).
 */
import { expect, test, type Page } from '@playwright/test'
import { appendFileSync, readFileSync } from 'node:fs'
import type { IpcRequestInput } from '../../shared/ipc'
import { cleanupUserDataDir, newUserDataDir } from './fixtures/licensed-app'
import {
  clock,
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
  recipients,
  readJsonl,
  seedSuppression,
  seedTags,
  sends,
  statusOf,
  type Session,
} from './fixtures/campaign-harness'

/** Epoch ms from however Prisma stored a DateTime. */
const ms = (v: string | number | null): number | null =>
  v === null ? null : typeof v === 'number' ? v : Date.parse(v)

async function waitForStatus(dir: string, campaignId: string, status: string) {
  await expect.poll(() => statusOf(dir, campaignId), { timeout: 90_000 }).toBe(status)
}

async function setSending(
  win: Page,
  patch: IpcRequestInput<'settings:setSendingDefaults'>,
) {
  await ipc(win, 'settings:setSendingDefaults', patch)
}

function inject(dir: string, event: Record<string, unknown>): void {
  appendFileSync(files(dir).inject, `${JSON.stringify(event)}\n`, 'utf8')
}

/** Phones `+9197PP0000NN`, distinct per spec prefix. */
const phones = (prefix: string, n: number, from = 1): string[] =>
  Array.from(
    { length: n },
    (_, i) => `+9197${prefix}${String(from + i).padStart(6, '0')}`,
  )

test('E5.20 — audience is lists ∪ included tags − excluded tags, one message per number', async () => {
  const dir = newUserDataDir()
  let s: Session = await launch(dir)
  try {
    const [deviceId] = await createDevices(s.win, 1)
    const templateId = await createTemplate(s.win)
    const a = await createList(s.win, 'Audience A', phones('10', 4))
    const [a1, a2, a3, a4] = phones('10', 4) as [string, string, string, string]
    // b-dup is a1's number on a second list; b4 and c1 share a number too.
    const [b1, b2, b3, b4] = phones('10', 4, 11) as [string, string, string, string]
    const b = await createList(s.win, 'Audience B', [b1, b2, b3, a1, b4])
    const c = await createList(s.win, 'Audience C', [b4])
    await s.app.close()

    seedTags(dir, [
      {
        id: 'tag-vip',
        name: 'VIP',
        contactIds: [b.ids[b1]!, b.ids[b2]!, b.ids[a1]!, b.ids[b4]!, c.ids[b4]!],
      },
      { id: 'tag-dnc', name: 'Do not contact', contactIds: [a.ids[a2]!, b.ids[b2]!] },
      { id: 'tag-other', name: 'Other', contactIds: [b.ids[b3]!] },
    ])

    s = await launch(dir)
    await connect(s.win, [deviceId!])

    const clash = await ipcResult(s.win, 'campaign:create', {
      name: 'Clash',
      templateId,
      deviceIds: [deviceId!],
      listIds: [a.listId],
      includeTagIds: ['tag-vip'],
      excludeTagIds: ['tag-vip'],
      delayFrom: 0,
      delayTo: 0,
      sleepDuration: 0,
      sleepAfter: 100,
    })
    expect(clash.ok).toBe(false)
    expect(clash.message).toContain('cannot be both included and excluded')

    const mixed = await createCampaign(s.win, {
      templateId,
      deviceIds: [deviceId!],
      listIds: [a.listId],
      includeTagIds: ['tag-vip'],
      excludeTagIds: ['tag-dnc'],
    })
    await ipc(s.win, 'campaign:start', { id: mixed })
    await waitForStatus(dir, mixed, 'completed')

    const expected = [a1, a3, a4, b1, b4].sort()
    expect(
      recipients(dir, mixed)
        .map((r) => r.phone)
        .sort(),
    ).toEqual(expected)
    // What reached WhatsApp, not just what was queued: each number exactly once.
    expect(
      sends(dir)
        .map((l) => l.to)
        .sort(),
    ).toEqual(expected)

    const got = await ipc(s.win, 'campaign:get', { id: mixed })
    expect(got.includeTagIds).toEqual(['tag-vip'])
    expect(got.excludeTagIds).toEqual(['tag-dnc'])
    expect([got.totalCount, got.sentCount, got.failedCount]).toEqual([5, 5, 0])

    // A tag alone is a valid audience: VIP minus "Do not contact".
    const tagOnly = await createCampaign(s.win, {
      templateId,
      deviceIds: [deviceId!],
      includeTagIds: ['tag-vip'],
      excludeTagIds: ['tag-dnc'],
    })
    await ipc(s.win, 'campaign:start', { id: tagOnly })
    await waitForStatus(dir, tagOnly, 'completed')
    expect(
      recipients(dir, tagOnly)
        .map((r) => r.phone)
        .sort(),
    ).toEqual([a1, b1, b4].sort())
  } finally {
    await s.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E5.21 — opted-out numbers are queued as skipped and never sent', async () => {
  const dir = newUserDataDir()
  let s: Session = await launch(dir)
  try {
    const [deviceId] = await createDevices(s.win, 1)
    const templateId = await createTemplate(s.win)
    const list = phones('21', 5)
    const { listId } = await createList(s.win, 'Opt-out list', list)
    await s.app.close()

    const optedOut = [list[1]!, list[3]!]
    seedSuppression(dir, optedOut)

    s = await launch(dir)
    await connect(s.win, [deviceId!])
    const id = await createCampaign(s.win, {
      templateId,
      deviceIds: [deviceId!],
      listIds: [listId],
    })
    await ipc(s.win, 'campaign:start', { id })
    await waitForStatus(dir, id, 'completed')

    const rows = recipients(dir, id)
    const skipped = rows.filter((r) => r.status === 'skipped')
    expect(skipped.map((r) => r.phone).sort()).toEqual([...optedOut].sort())
    expect(skipped.every((r) => r.error === 'Opted out' && r.attempts === 0)).toBe(true)
    expect(
      sends(dir)
        .map((l) => l.to)
        .sort(),
    ).toEqual(list.filter((p) => !optedOut.includes(p)).sort())

    const got = await ipc(s.win, 'campaign:get', { id })
    expect([got.totalCount, got.sentCount, got.skippedCount]).toEqual([5, 3, 2])

    const report = await ipc(s.win, 'campaign:report', { id })
    const csv = readFileSync(report.filePath, 'utf8')
    expect(csv).toContain('# Skipped,2')
    expect(csv.split('\n').filter((l) => l.endsWith(',Opted out'))).toHaveLength(2)

    // The card and the recipients view show the skip and its reason.
    await s.win.getByTestId('nav-campaigns').click()
    await expect(s.win.getByTestId('campaign-skipped')).toHaveText('Skipped: 2')
    await s.win.getByTestId('view-recipients').click()
    await s.win.getByTestId('recipient-filter-skipped').click()
    await expect(s.win.getByTestId('recipient-row')).toHaveCount(2)
    await expect(s.win.getByTestId('recipient-error').first()).toHaveText('Opted out')
  } finally {
    await s.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E5.22 — number check skips numbers not on WhatsApp and remembers the result', async () => {
  const dir = newUserDataDir()
  const s = await launch(dir)
  try {
    const [deviceId] = await createDevices(s.win, 1)
    const templateId = await createTemplate(s.win)
    const valid = phones('22', 5)
    const invalid = ['+919722001000', '+919722002000', '+919722003000']
    const { listId } = await createList(s.win, 'Check list', [
      valid[0]!,
      invalid[0]!,
      valid[1]!,
      valid[2]!,
      invalid[1]!,
      valid[3]!,
      invalid[2]!,
      valid[4]!,
    ])

    const id = await createCampaign(s.win, {
      templateId,
      deviceIds: [deviceId!],
      listIds: [listId],
      checkNumbers: true,
    })
    await ipc(s.win, 'campaign:start', { id })
    await waitForStatus(dir, id, 'completed')

    const rows = recipients(dir, id)
    expect(
      rows
        .filter((r) => r.status === 'skipped')
        .map((r) => r.phone)
        .sort(),
    ).toEqual(invalid)
    expect(
      rows
        .filter((r) => r.status === 'skipped')
        .every((r) => r.error === 'Not on WhatsApp'),
    ).toBe(true)
    expect(
      sends(dir)
        .map((l) => l.to)
        .sort(),
    ).toEqual([...valid].sort())

    const statuses = query<{ phone: string; waStatus: string; waCheckedAt: unknown }>(
      dir,
      'SELECT phone, waStatus, waCheckedAt FROM Contact',
    )
    for (const c of statuses) {
      expect(c.waStatus).toBe(invalid.includes(c.phone) ? 'invalid' : 'valid')
      expect(c.waCheckedAt).not.toBeNull()
    }
    const checks = readJsonl<{ action: string; count: number }>(
      files(dir).actions,
    ).filter((a) => a.action === 'checkNumbers')
    expect(checks.reduce((n, a) => n + a.count, 0)).toBe(8)

    // A rerun knows the answers already: the invalid numbers are skipped when
    // the queue is built, without asking WhatsApp again.
    const { id: rerun } = await ipc(s.win, 'campaign:duplicate', { id })
    await ipc(s.win, 'campaign:start', { id: rerun })
    await waitForStatus(dir, rerun, 'completed')
    const again = recipients(dir, rerun)
    expect(again.filter((r) => r.status === 'skipped')).toHaveLength(3)
    expect(again.filter((r) => r.status === 'sent')).toHaveLength(5)
    expect(
      readJsonl<{ action: string }>(files(dir).actions).filter(
        (a) => a.action === 'checkNumbers',
      ),
    ).toHaveLength(checks.length)
    expect(sends(dir).filter((l) => invalid.includes(l.to))).toHaveLength(0)
  } finally {
    await s.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E5.23 — number check covers a queue many check batches long', async () => {
  // The engine checks 50 numbers at most once a second, just ahead of the
  // claims. With zero pacing a device can send faster than that, so a claim
  // can reach a number nobody checked.
  const dir = newUserDataDir()
  const s = await launch(dir)
  try {
    const [deviceId] = await createDevices(s.win, 1)
    const templateId = await createTemplate(s.win)
    const list = Array.from({ length: 200 }, (_, i) =>
      i % 10 === 9
        ? `+919723${String(i).padStart(3, '0')}000`
        : `+919723${String(i).padStart(3, '0')}111`,
    )
    const invalid = list.filter((p) => p.endsWith('000'))
    const { listId } = await createList(s.win, 'Fast check', list)

    const id = await createCampaign(s.win, {
      templateId,
      deviceIds: [deviceId!],
      listIds: [listId],
      checkNumbers: true,
    })
    await ipc(s.win, 'campaign:start', { id })
    await waitForStatus(dir, id, 'completed')

    const leaked = sends(dir).filter((l) => invalid.includes(l.to))
    expect(leaked.map((l) => l.to)).toEqual([])
    const rows = recipients(dir, id)
    expect(rows.filter((r) => r.status === 'skipped')).toHaveLength(invalid.length)
    expect(rows.filter((r) => r.status === 'sent')).toHaveLength(
      list.length - invalid.length,
    )
  } finally {
    await s.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E5.24 — quiet hours park a campaign without charging attempts, and it resumes after', async () => {
  const dir = newUserDataDir()
  const s = await launch(dir)
  try {
    const [deviceId] = await createDevices(s.win, 1)
    const templateId = await createTemplate(s.win)
    const { listId } = await createList(s.win, 'Quiet', phones('24', 6))
    await setSending(s.win, {
      quietHoursEnabled: true,
      quietHoursStart: clock(-60),
      quietHoursEnd: clock(60),
    })

    const id = await createCampaign(s.win, {
      templateId,
      deviceIds: [deviceId!],
      listIds: [listId],
    })
    await ipc(s.win, 'campaign:start', { id })
    await expect.poll(() => recipients(dir, id).length).toBe(6)
    // Several scheduler ticks: none of them may push a send through.
    await s.win.waitForTimeout(4_000)

    expect(sends(dir)).toHaveLength(0)
    const parked = recipients(dir, id)
    expect(parked.every((r) => r.status === 'pending' && r.attempts === 0)).toBe(true)
    expect(statusOf(dir, id)).toBe('running')

    await setSending(s.win, { quietHoursEnabled: false })
    await waitForStatus(dir, id, 'completed')
    expect(sends(dir)).toHaveLength(6)
    expect(recipients(dir, id).every((r) => r.status === 'sent')).toBe(true)
  } finally {
    await s.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E5.25 — quiet hours starting mid-run park the rest, and the resumed run sends each number once', async () => {
  const dir = newUserDataDir()
  const s = await launch(dir)
  try {
    const [deviceId] = await createDevices(s.win, 1)
    const templateId = await createTemplate(s.win)
    const list = phones('25', 10)
    const { listId } = await createList(s.win, 'Quiet mid-run', list)

    const id = await createCampaign(s.win, {
      templateId,
      deviceIds: [deviceId!],
      listIds: [listId],
      delayFrom: 1,
      delayTo: 1,
    })
    await ipc(s.win, 'campaign:start', { id })
    await expect
      .poll(() => sends(dir).length, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(3)

    await setSending(s.win, {
      quietHoursEnabled: true,
      quietHoursStart: clock(-60),
      quietHoursEnd: clock(60),
    })
    // At most the one send already past the quiet-hours gate may land.
    await s.win.waitForTimeout(2_500)
    const atPark = sends(dir).length
    await s.win.waitForTimeout(3_000)
    expect(sends(dir).length).toBe(atPark)
    expect(atPark).toBeLessThan(10)

    const parked = recipients(dir, id)
    expect(parked.filter((r) => r.status === 'failed' || r.status === 'sending')).toEqual(
      [],
    )
    expect(
      parked.filter((r) => r.status === 'pending').every((r) => r.attempts === 0),
    ).toBe(true)

    await setSending(s.win, { quietHoursEnabled: false })
    await waitForStatus(dir, id, 'completed')
    const sent = sends(dir).map((l) => l.to)
    expect(sent.sort()).toEqual([...list].sort())
  } finally {
    await s.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E5.26 — a campaign paused while parked stays paused when quiet hours end', async () => {
  const dir = newUserDataDir()
  const s = await launch(dir)
  try {
    const [deviceId] = await createDevices(s.win, 1)
    const templateId = await createTemplate(s.win)
    const { listId } = await createList(s.win, 'Parked pause', phones('26', 4))
    await setSending(s.win, {
      quietHoursEnabled: true,
      quietHoursStart: clock(-60),
      quietHoursEnd: clock(60),
    })
    const id = await createCampaign(s.win, {
      templateId,
      deviceIds: [deviceId!],
      listIds: [listId],
    })
    await ipc(s.win, 'campaign:start', { id })
    await expect.poll(() => recipients(dir, id).length).toBe(4)
    await s.win.waitForTimeout(1_500)

    await ipc(s.win, 'campaign:pause', { id })
    await setSending(s.win, { quietHoursEnabled: false })
    await s.win.waitForTimeout(4_000)
    expect(sends(dir)).toHaveLength(0)
    expect(statusOf(dir, id)).toBe('paused')

    await ipc(s.win, 'campaign:resume', { id })
    await waitForStatus(dir, id, 'completed')
    expect(sends(dir)).toHaveLength(4)
  } finally {
    await s.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E5.27 — the health breaker pauses a failing device, and the pause survives a restart', async () => {
  const dir = newUserDataDir()
  const env = { WA_MOCK_FAIL_RATE: '1' }
  let s: Session = await launch(dir, env)
  try {
    const [deviceId] = await createDevices(s.win, 1)
    const templateId = await createTemplate(s.win)
    const { listId } = await createList(s.win, 'Failing', phones('27', 20))
    const id = await createCampaign(s.win, {
      templateId,
      deviceIds: [deviceId!],
      listIds: [listId],
    })
    const started = Date.now()
    await ipc(s.win, 'campaign:start', { id })

    const device = () =>
      query<{ healthPausedUntil: string | number | null; healthReason: string | null }>(
        dir,
        'SELECT healthPausedUntil, healthReason FROM Device WHERE id = ?',
        deviceId!,
      )[0]!
    await expect
      .poll(() => device().healthPausedUntil, { timeout: 60_000 })
      .not.toBeNull()

    const until = ms(device().healthPausedUntil)!
    expect(until - started).toBeGreaterThan(50 * 60_000)
    expect(until - started).toBeLessThan(70 * 60_000)
    expect(device().healthReason).toBeTruthy()

    // Sending stops at the trip and stays stopped across scheduler ticks.
    await s.win.waitForTimeout(1_000)
    const attempts = sends(dir).length
    expect(attempts).toBeGreaterThanOrEqual(10)
    expect(attempts).toBeLessThan(20)
    await s.win.waitForTimeout(4_000)
    expect(sends(dir)).toHaveLength(attempts)

    const rows = recipients(dir, id)
    expect(rows.filter((r) => r.status === 'sending')).toEqual([])
    expect(rows.filter((r) => r.status === 'pending').length).toBeGreaterThan(0)
    expect(statusOf(dir, id)).toBe('running')

    const analytics = await ipc(s.win, 'system:analytics')
    expect(
      analytics.devices.find((d) => d.deviceId === deviceId)?.healthPausedUntil,
    ).not.toBeNull()

    // The pause is in SQLite, so a restart must not hand the device back.
    await s.app.close()
    s = await launch(dir, env)
    await connect(s.win, [deviceId!])
    await s.win.waitForTimeout(5_000)
    expect(sends(dir)).toHaveLength(attempts)
  } finally {
    await s.app.close()
    cleanupUserDataDir(dir)
  }
})

/** A finished four-recipient campaign, ready for receipts and replies. */
async function sentCampaign(s: Session, dir: string, prefix: string) {
  const [deviceId] = await createDevices(s.win, 1)
  const templateId = await createTemplate(s.win)
  const list = phones(prefix, 4)
  const { listId } = await createList(s.win, 'Engagement', list)
  const id = await createCampaign(s.win, {
    templateId,
    deviceIds: [deviceId!],
    listIds: [listId],
  })
  await ipc(s.win, 'campaign:start', { id })
  await waitForStatus(dir, id, 'completed')
  const byPhone = new Map(recipients(dir, id).map((r) => [r.phone, r]))
  return { id, list, deviceId: deviceId!, templateId, listId, byPhone }
}

/** Delivered for r0, read-only for r1, delivered+read for r2; r0 replies. */
function engage(
  dir: string,
  list: string[],
  byPhone: Map<string, { messageId: string | null }>,
) {
  const msg = (i: number) => byPhone.get(list[i]!)!.messageId!
  inject(dir, { type: 'receipt', deviceId: '*', messageId: msg(0), status: 'delivered' })
  inject(dir, { type: 'receipt', deviceId: '*', messageId: msg(1), status: 'read' })
  inject(dir, { type: 'receipt', deviceId: '*', messageId: msg(2), status: 'delivered' })
  inject(dir, { type: 'receipt', deviceId: '*', messageId: msg(2), status: 'read' })
  // A repeated receipt must not count twice.
  inject(dir, { type: 'receipt', deviceId: '*', messageId: msg(2), status: 'delivered' })
  inject(dir, { type: 'receipt', deviceId: '*', messageId: 'not-a-campaign-message' })
  inject(dir, { type: 'message', deviceId: '*', from: list[0], body: 'Interested!' })
  inject(dir, { type: 'message', deviceId: '*', from: list[0], body: 'Call me' })
  inject(dir, {
    type: 'message',
    deviceId: '*',
    from: '+919799999999',
    body: 'Who is this?',
  })
}

test('E5.28 — receipts and replies land on the campaign, its report and its card', async () => {
  const dir = newUserDataDir()
  const s = await launch(dir)
  try {
    const { id, list, byPhone } = await sentCampaign(s, dir, '28')
    expect([...byPhone.values()].every((r) => r.messageId)).toBe(true)
    engage(dir, list, byPhone)

    await expect
      .poll(async () => {
        const c = await ipc(s.win, 'campaign:get', { id })
        return [c.deliveredCount, c.readCount, c.repliedCount]
      })
      .toEqual([3, 2, 1])
    // Settle: the second reply and the duplicate receipt change nothing.
    await s.win.waitForTimeout(1_500)
    const c = await ipc(s.win, 'campaign:get', { id })
    expect([c.deliveredCount, c.readCount, c.repliedCount]).toEqual([3, 2, 1])

    const report = await ipc(s.win, 'campaign:report', { id })
    const lines = readFileSync(report.filePath, 'utf8').split('\n')
    expect(lines).toEqual(
      expect.arrayContaining(['# Delivered,3', '# Read,2', '# Replied,1']),
    )
    const header = lines.find((l) => l.startsWith('phone,'))!.split(',')
    const row = (phone: string) => {
      const cells = lines.find((l) => l.startsWith(`${phone},`))!.split(',')
      return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']))
    }
    expect(row(list[0]!).repliedAt).not.toBe('')
    expect(row(list[0]!).deliveredAt).not.toBe('')
    expect(row(list[1]!).readAt).not.toBe('')
    expect(row(list[3]!).deliveredAt).toBe('')

    await s.win.getByTestId('nav-campaigns').click()
    await expect(s.win.getByTestId('campaign-delivered')).toHaveText('3 (75%)')
    await expect(s.win.getByTestId('campaign-read')).toHaveText('2 (50%)')
    await expect(s.win.getByTestId('campaign-replied')).toHaveText('1 (25%)')
  } finally {
    await s.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E5.29 — dashboard analytics for today agree with the campaign counters', async () => {
  const dir = newUserDataDir()
  const s = await launch(dir)
  try {
    const { id, list, byPhone } = await sentCampaign(s, dir, '29')
    engage(dir, list, byPhone)
    await expect
      .poll(async () => (await ipc(s.win, 'campaign:get', { id })).repliedCount)
      .toBe(1)

    const c = await ipc(s.win, 'campaign:get', { id })
    const analytics = await ipc(s.win, 'system:analytics')
    const today = analytics.days[analytics.days.length - 1]!
    expect(analytics.days).toHaveLength(7)
    expect([today.sent, today.failed, today.read, today.replied]).toEqual([4, 0, 2, 1])
    // A read message was delivered. The campaign counts it that way, so the
    // dashboard must too, or it shows more reads than deliveries.
    expect(today.delivered).toBe(c.deliveredCount)
    expect(today.delivered).toBeGreaterThanOrEqual(today.read)
  } finally {
    await s.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E5.30 — a reply is credited to the most recent campaign that messaged the number', async () => {
  const dir = newUserDataDir()
  const s = await launch(dir)
  try {
    const first = await sentCampaign(s, dir, '30')
    const second = await createCampaign(s.win, {
      templateId: first.templateId,
      deviceIds: [first.deviceId],
      listIds: [first.listId],
    })
    await ipc(s.win, 'campaign:start', { id: second })
    await waitForStatus(dir, second, 'completed')

    inject(dir, {
      type: 'message',
      deviceId: '*',
      from: first.list[2],
      body: 'Yes please',
    })
    await expect
      .poll(async () => (await ipc(s.win, 'campaign:get', { id: second })).repliedCount)
      .toBe(1)
    expect((await ipc(s.win, 'campaign:get', { id: first.id })).repliedCount).toBe(0)
  } finally {
    await s.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E5.31 — duplicate keeps audience and pacing and starts as an empty draft', async () => {
  const dir = newUserDataDir()
  let s: Session = await launch(dir)
  try {
    const [deviceId] = await createDevices(s.win, 1)
    const templateId = await createTemplate(s.win)
    const list = phones('31', 3)
    const { listId, ids } = await createList(s.win, 'Dup list', list)
    const other = await createList(s.win, 'Dup tagged', phones('31', 2, 50))
    await s.app.close()
    seedTags(dir, [
      { id: 'tag-vip', name: 'VIP', contactIds: Object.values(other.ids) },
      { id: 'tag-dnc', name: 'Do not contact', contactIds: [ids[list[2]!]!] },
    ])

    s = await launch(dir)
    await connect(s.win, [deviceId!])
    const id = await createCampaign(s.win, {
      name: 'Spring',
      templateId,
      deviceIds: [deviceId!],
      listIds: [listId],
      includeTagIds: ['tag-vip'],
      excludeTagIds: ['tag-dnc'],
      delayFrom: 0,
      delayTo: 1,
      sleepDuration: 7,
      sleepAfter: 9,
      checkNumbers: true,
    })
    await ipc(s.win, 'campaign:start', { id })
    await waitForStatus(dir, id, 'completed')
    expect(recipients(dir, id)).toHaveLength(4)

    const { id: copyId } = await ipc(s.win, 'campaign:duplicate', { id })
    const { id: namedId } = await ipc(s.win, 'campaign:duplicate', { id, name: 'Autumn' })
    const source = await ipc(s.win, 'campaign:get', { id })
    const copy = await ipc(s.win, 'campaign:get', { id: copyId })
    const named = await ipc(s.win, 'campaign:get', { id: namedId })

    expect(copy.name).toBe('Spring (copy)')
    expect(named.name).toBe('Autumn')
    for (const c of [copy, named]) {
      expect(c.status).toBe('draft')
      expect([c.totalCount, c.sentCount, c.failedCount, c.skippedCount]).toEqual([
        0, 0, 0, 0,
      ])
      expect(recipients(dir, c.id)).toHaveLength(0)
      for (const key of [
        'templateId',
        'deviceIds',
        'listIds',
        'includeTagIds',
        'excludeTagIds',
        'delayFrom',
        'delayTo',
        'sleepDuration',
        'sleepAfter',
        'checkNumbers',
      ] as const) {
        expect(c[key], key).toEqual(source[key])
      }
    }

    // The copy is a working campaign, not a shell: it sends to the same audience.
    await ipc(s.win, 'campaign:start', { id: copyId })
    await waitForStatus(dir, copyId, 'completed')
    expect(
      recipients(dir, copyId)
        .map((r) => r.phone)
        .sort(),
    ).toEqual(
      recipients(dir, id)
        .map((r) => r.phone)
        .sort(),
    )

    await s.win.getByTestId('nav-campaigns').click()
    await expect(s.win.getByTestId('campaign-card')).toHaveCount(3)
    await s.win.getByTestId('duplicate-campaign').first().click()
    await expect(s.win.getByTestId('campaign-card')).toHaveCount(4)
  } finally {
    await s.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E5.32 — with maxConcurrentDevices = 1 one device finishes before the next starts', async () => {
  const dir = newUserDataDir()
  const s = await launch(dir, { WA_MOCK_LATENCY_MS: '100' })
  try {
    const deviceIds = await createDevices(s.win, 2)
    const templateId = await createTemplate(s.win)
    const list = phones('32', 12)
    const { listId } = await createList(s.win, 'One at a time', list)
    await setSending(s.win, { maxConcurrentDevices: 1 })

    const id = await createCampaign(s.win, { templateId, deviceIds, listIds: [listId] })
    await ipc(s.win, 'campaign:start', { id })
    await waitForStatus(dir, id, 'completed')

    const log = sends(dir)
    expect(log.map((l) => l.to).sort()).toEqual([...list].sort())
    const order = log.map((l) => l.deviceId)
    const switches = order.filter((d, i) => i > 0 && d !== order[i - 1]).length
    expect(switches, `device order: ${order.join(' ')}`).toBe(1)
    for (const d of deviceIds) expect(order.filter((x) => x === d)).toHaveLength(6)
  } finally {
    await s.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E5.33 — the dialog creates a tag-audience campaign with number checking', async () => {
  const dir = newUserDataDir()
  let s: Session = await launch(dir)
  try {
    const [deviceId] = await createDevices(s.win, 1)
    const templateId = await createTemplate(s.win)
    const tagged = ['+919733000001', '+919733000002', '+919733001000']
    const { ids } = await createList(s.win, 'Untargeted list', [
      ...tagged,
      '+919733000003',
    ])
    await s.app.close()
    seedTags(dir, [
      { id: 'tag-vip', name: 'VIP', contactIds: tagged.map((p) => ids[p]!) },
      { id: 'tag-cold', name: 'Cold', contactIds: [] },
    ])

    s = await launch(dir)
    await connect(s.win, [deviceId!])
    const { win } = s
    await win.getByTestId('nav-campaigns').click()
    await win.getByTestId('new-campaign').click()
    await expect(win.getByTestId('create-campaign-dialog')).toBeVisible()

    const name = win.getByTestId('cmp-name')
    await name.fill('Tagged from the UI')
    await expect(name).toHaveValue('Tagged from the UI')
    await win.getByTestId(`cmp-device-${deviceId}`).check()

    // Ticking a tag on one side takes it off the other.
    await win.getByTestId('cmp-exclude-tag-tag-vip').check()
    await win.getByTestId('cmp-include-tag-tag-vip').check()
    await expect(win.getByTestId('cmp-exclude-tag-tag-vip')).not.toBeChecked()
    await win.getByTestId('cmp-exclude-tag-tag-cold').check()
    await expect(win.getByTestId('cmp-audience-summary')).toContainText('tagged VIP')

    await win.getByTestId('cmp-check-numbers').check()
    await win.getByTestId('cmp-template').selectOption(templateId)
    await win.getByTestId('cmp-delay-to').fill('0')
    await win.getByTestId('submit-campaign').click()

    await expect(win.getByTestId('create-campaign-dialog')).toHaveCount(0)
    await expect(win.getByTestId('campaign-card')).toHaveCount(1)
    // Live: the card reaches its final numbers through campaign:progress alone.
    await expect(win.getByTestId('campaign-counters')).toContainText('Sent: 2', {
      timeout: 60_000,
    })
    await expect(win.getByTestId('campaign-skipped')).toHaveText('Skipped: 1')

    const [campaign] = query<{ id: string; checkNumbers: number }>(
      dir,
      'SELECT id, checkNumbers FROM Campaign',
    )
    expect(campaign!.checkNumbers).toBe(1)
    expect(
      query<{ tagId: string; mode: string }>(
        dir,
        'SELECT tagId, mode FROM CampaignTag WHERE campaignId = ? ORDER BY mode',
        campaign!.id,
      ),
    ).toEqual([
      { tagId: 'tag-cold', mode: 'exclude' },
      { tagId: 'tag-vip', mode: 'include' },
    ])
    expect(
      sends(dir)
        .map((l) => l.to)
        .sort(),
    ).toEqual(tagged.slice(0, 2).sort())
  } finally {
    await s.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E5.34 — changing a sending setting mid-run keeps the campaign’s own pacing', async () => {
  // Settings changes re-apply the base policy to every connected device. If
  // that replaces the delays of a campaign already running there, a campaign
  // configured to send slowly speeds up to the global defaults mid-run.
  const dir = newUserDataDir()
  const s = await launch(dir)
  try {
    const [deviceId] = await createDevices(s.win, 1)
    const templateId = await createTemplate(s.win)
    const { listId } = await createList(s.win, 'Paced', phones('34', 5))
    // Fast global defaults, so a lost campaign pacing is unmistakable.
    await setSending(s.win, {
      delayFrom: 0,
      delayTo: 0,
      sleepAfter: 100,
      sleepDuration: 0,
    })

    const id = await createCampaign(s.win, {
      templateId,
      deviceIds: [deviceId!],
      listIds: [listId],
      delayFrom: 3,
      delayTo: 3,
    })
    await ipc(s.win, 'campaign:start', { id })
    await expect.poll(() => sends(dir).length, { timeout: 30_000 }).toBe(1)
    await setSending(s.win, { dailyCapPerDevice: 500 })
    await waitForStatus(dir, id, 'completed')

    const times = query<{ sentAt: string | number }>(
      dir,
      `SELECT sentAt FROM CampaignRecipient WHERE campaignId = ? AND status = 'sent'
        ORDER BY sentAt`,
      id,
    ).map((r) => ms(r.sentAt)!)
    expect(times).toHaveLength(5)
    const gaps = times.slice(1).map((t, i) => t - times[i]!)
    for (const gap of gaps)
      expect(gap, `gaps: ${gaps.join(', ')} ms`).toBeGreaterThan(2_500)
  } finally {
    await s.app.close()
    cleanupUserDataDir(dir)
  }
})
