/**
 * Group power tools, member grabber and communities (D89, E5.60–E5.79).
 *
 * Everything runs against the mock transport. Each device gets three fixture
 * groups: `<deviceId>-group-1@g.us` "Sales Team 001" (15 members, admin),
 * `-group-2` "Support Group A" (8, admin), `-group-3` "Marketing Team 001"
 * (12, NOT admin); members are `+9198NN000MMM`, and each group has two pending
 * join requests from `+919890+NN…`.
 */
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { APP_READY_TIMEOUT_MS } from './fixtures/constants'
import { cleanupUserDataDir, newUserDataDir } from './fixtures/licensed-app'

const actionLog = (dir: string) => join(dir, 'wa-actions.jsonl')

async function launch(dir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${dir}`],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: undefined,
      LICENSE_SERVICE: 'mock',
      WA_TRANSPORT: 'mock',
      WA_MOCK_ACTION_LOG: actionLog(dir),
      NODE_ENV: 'test',
    } as NodeJS.ProcessEnv,
  })
  const win = await app.firstWindow()
  await win
    .locator('[data-testid="license-key"], [data-testid="nav-dashboard"]')
    .first()
    .waitFor({ state: 'visible', timeout: APP_READY_TIMEOUT_MS })
  if (await win.getByTestId('license-key').isVisible()) {
    const field = win.getByTestId('license-key')
    await field.fill('VALID-E2E-0001')
    await expect(field).toHaveValue('VALID-E2E-0001')
    await win.getByTestId('license-activate').click()
  }
  await win
    .getByTestId('nav-dashboard')
    .waitFor({ state: 'visible', timeout: APP_READY_TIMEOUT_MS })
  return { app, win }
}

/** Create, connect and sync a device; returns its id and own phone. */
async function connectedDevice(
  win: Page,
  name = 'Group Admin',
): Promise<{ deviceId: string; phone: string }> {
  return win.evaluate(async (deviceName) => {
    const d = await window.api.invoke('device:create', { name: deviceName })
    if (!d.ok) throw new Error('device')
    await window.api.invoke('device:connect', { id: d.data.id })
    for (let i = 0; i < 80; i += 1) {
      const list = await window.api.invoke('device:list')
      const row = list.ok ? list.data.find((x) => x.id === d.data.id) : undefined
      if (row?.status === 'connected') {
        const synced = await window.api.invoke('group:sync', { deviceId: d.data.id })
        if (!synced.ok) throw new Error('sync')
        return { deviceId: d.data.id, phone: row.phone ?? '' }
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    throw new Error('device never connected')
  }, name)
}

const groupId = (deviceId: string, n: 1 | 2 | 3) => `${deviceId}-group-${n}@g.us`

function query<T>(dir: string, sql: string, ...params: Array<string | number>): T[] {
  const db = new DatabaseSync(join(dir, 'rapbooster.db'), { readOnly: true })
  try {
    return db.prepare(sql).all(...params) as T[]
  } finally {
    db.close()
  }
}

function groupRow(dir: string, id: string) {
  return query<{
    memberCount: number
    announce: number
    restrict: number
    joinApproval: number
    isCommunity: number
    parentId: string | null
  }>(
    dir,
    'SELECT memberCount, announce, restrict, joinApproval, isCommunity, parentId FROM "Group" WHERE id = ?',
    id,
  )[0]
}

function actions(dir: string): Array<Record<string, unknown>> {
  if (!existsSync(actionLog(dir))) return []
  return readFileSync(actionLog(dir), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Record<string, unknown>)
}

/** Participant updates the mock saw for one group, in order. */
function participantUpdates(dir: string, group: string) {
  return actions(dir)
    .filter((a) => a.groupId === group && typeof a.count === 'number')
    .map((a) => ({ action: a.action, count: a.count }))
}

async function withApp(
  body: (ctx: { app: ElectronApplication; win: Page; dir: string }) => Promise<void>,
  dir = newUserDataDir(),
): Promise<void> {
  const { app, win } = await launch(dir)
  try {
    await body({ app, win, dir })
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
}

test('E5.60 — invite link is shown, revoking changes the code, non-admins are refused', async () => {
  await withApp(async ({ win, dir }) => {
    const { deviceId } = await connectedDevice(win)
    const out = await win.evaluate(
      async ({ admin, notAdmin }) => {
        const first = await window.api.invoke('group:inviteLink', { groupId: admin })
        const revoked = await window.api.invoke('group:revokeInvite', { groupId: admin })
        const after = await window.api.invoke('group:inviteLink', { groupId: admin })
        const refused = await window.api.invoke('group:inviteLink', { groupId: notAdmin })
        return { first, revoked, after, refused }
      },
      { admin: groupId(deviceId, 1), notAdmin: groupId(deviceId, 3) },
    )
    expect(out.first.ok && out.revoked.ok && out.after.ok).toBe(true)
    if (!out.first.ok || !out.revoked.ok || !out.after.ok) return
    expect(out.first.data.url).toBe(`https://chat.whatsapp.com/${out.first.data.code}`)
    expect(out.revoked.data.code).not.toBe(out.first.data.code)
    expect(out.after.data.code).toBe(out.revoked.data.code)

    expect(out.refused.ok).toBe(false)
    if (!out.refused.ok) expect(out.refused.error.userMessage).toContain('not an admin')

    expect(actions(dir).some((a) => a.action === 'revokeInvite')).toBe(true)
  })
})

test('E5.61 — joining by link or bare code adds the group; junk is refused', async () => {
  await withApp(async ({ win }) => {
    const { deviceId } = await connectedDevice(win)
    const out = await win.evaluate(async (id) => {
      const byUrl = await window.api.invoke('group:join', {
        deviceId: id,
        invite: 'https://chat.whatsapp.com/AbCdEfGh123',
      })
      const byCode = await window.api.invoke('group:join', {
        deviceId: id,
        invite: 'ZyXwVu987',
      })
      const junk = await window.api.invoke('group:join', {
        deviceId: id,
        invite: 'https://example.com/not-an-invite',
      })
      const groups = await window.api.invoke('group:list', { deviceId: id })
      return { byUrl, byCode, junk, groups }
    }, deviceId)

    expect(out.byUrl.ok && out.byCode.ok).toBe(true)
    expect(out.junk.ok).toBe(false)
    if (!out.junk.ok) expect(out.junk.error.userMessage).toContain('invite link')
    if (!out.groups.ok || !out.byUrl.ok || !out.byCode.ok) throw new Error('list')
    const ids = out.groups.data.map((g) => g.id)
    // The new groups are synced into the list without pressing Sync.
    expect(ids).toContain(out.byUrl.data.groupId)
    expect(ids).toContain(out.byCode.data.groupId)
    expect(out.groups.data.map((g) => g.name)).toContain('Joined AbCdEfGh123')
  })
})

test('E5.62 — settings toggles reach WhatsApp and persist on the group', async () => {
  await withApp(async ({ win, dir }) => {
    const { deviceId } = await connectedDevice(win)
    const admin = groupId(deviceId, 1)
    const out = await win.evaluate(
      async ({ g, notAdmin }) => {
        const all = await window.api.invoke('group:updateSettings', {
          groupId: g,
          announce: true,
          restrict: true,
          joinApproval: true,
          description: 'Weekly offers only',
        })
        const off = await window.api.invoke('group:updateSettings', {
          groupId: g,
          restrict: false,
        })
        const refused = await window.api.invoke('group:updateSettings', {
          groupId: notAdmin,
          announce: true,
        })
        return { all: all.ok, off: off.ok, refused }
      },
      { g: admin, notAdmin: groupId(deviceId, 3) },
    )
    expect(out.all).toBe(true)
    expect(out.off).toBe(true)
    expect(out.refused.ok).toBe(false)
    if (!out.refused.ok) expect(out.refused.error.userMessage).toContain('admin')

    const settings = actions(dir)
      .filter((a) => a.action === 'groupSetting' && a.groupId === admin)
      .map((a) => a.setting)
    expect(settings).toEqual(['announcement', 'locked', 'unlocked'])

    const row = groupRow(dir, admin)!
    expect(row.announce).toBe(1)
    expect(row.restrict).toBe(0)
    expect(row.joinApproval).toBe(1)
  })
})

test('E5.63 — adding members reports each number: added, not on WhatsApp, opted out', async () => {
  const dir = newUserDataDir()
  // Seed the opt-out list while the app is not running (one SQLite writer).
  const first = await launch(dir)
  await first.app.close()
  const db = new DatabaseSync(join(dir, 'rapbooster.db'))
  db.prepare('INSERT INTO "Suppression" (phone, reason, source) VALUES (?, ?, ?)').run(
    '+919876543211',
    'asked to stop',
    'manual',
  )
  db.close()

  await withApp(async ({ win, dir: d }) => {
    const { deviceId } = await connectedDevice(win)
    const target = groupId(deviceId, 2)
    const out = await win.evaluate(async (g) => {
      const fromPhones = await window.api.invoke('group:updateMembers', {
        groupId: g,
        action: 'add',
        phones: ['+919876543210', '+919876543000', '+919876543211'],
      })
      const list = await window.api.invoke('contactList:create', {
        name: 'To add',
        customFields: [],
      })
      if (!list.ok) throw new Error('list')
      for (const mobile of ['+919876500001', '+919876500002']) {
        await window.api.invoke('contacts:create', {
          listId: list.data.id,
          data: { Name: mobile, Mobile: mobile },
        })
      }
      const fromList = await window.api.invoke('group:updateMembers', {
        groupId: g,
        action: 'add',
        listId: list.data.id,
      })
      const members = await window.api.invoke('group:members', { groupId: g })
      return { fromPhones, fromList, members }
    }, target)

    if (!out.fromPhones.ok || !out.fromList.ok || !out.members.ok)
      throw new Error('calls')
    const byPhone = Object.fromEntries(
      out.fromPhones.data.results.map((r) => [r.phone, r]),
    )
    expect(byPhone['+919876543210']).toMatchObject({ ok: true, error: null })
    expect(byPhone['+919876543000']).toMatchObject({
      ok: false,
      error: 'not on WhatsApp',
    })
    expect(byPhone['+919876543211']).toMatchObject({ ok: false, error: 'opted out' })
    expect(out.fromList.data.results.every((r) => r.ok)).toBe(true)
    expect(out.fromList.data.results).toHaveLength(2)

    const phones = out.members.data.map((m) => m.phone)
    expect(phones).toContain('+919876543210')
    expect(phones).not.toContain('+919876543211')
    // 8 fixture members + 1 from phones + 2 from the list, refreshed from WhatsApp.
    expect(groupRow(d, target)!.memberCount).toBe(11)
    // The opted-out number never reached WhatsApp at all. (The mock logs a
    // participant update with its own `action` — add/remove/… — and a count.)
    const sent = participantUpdates(d, target)
    expect(sent).toEqual([
      { action: 'add', count: 2 },
      { action: 'add', count: 2 },
    ])
  }, dir)
})

test('E5.64 — remove and promote act on WhatsApp and refresh the count', async () => {
  await withApp(async ({ win, dir }) => {
    const { deviceId } = await connectedDevice(win)
    const g = groupId(deviceId, 1)
    const out = await win.evaluate(async (id) => {
      const removed = await window.api.invoke('group:updateMembers', {
        groupId: id,
        action: 'remove',
        phones: ['+919801000001', '+919801000002'],
      })
      const promoted = await window.api.invoke('group:updateMembers', {
        groupId: id,
        action: 'promote',
        phones: ['+919801000003'],
      })
      const members = await window.api.invoke('group:members', { groupId: id })
      return { removed, promoted, members }
    }, g)
    if (!out.removed.ok || !out.promoted.ok || !out.members.ok) throw new Error('calls')
    expect(out.removed.data.results.every((r) => r.ok)).toBe(true)
    expect(out.members.data).toHaveLength(13)
    expect(out.members.data.find((m) => m.phone === '+919801000003')?.isAdmin).toBe(true)
    expect(groupRow(dir, g)!.memberCount).toBe(13)
    expect(participantUpdates(dir, g)).toEqual([
      { action: 'remove', count: 2 },
      { action: 'promote', count: 1 },
    ])
  })
})

test('E5.65 — approving a join request adds the member; rejecting removes the request', async () => {
  await withApp(async ({ win, dir }) => {
    const { deviceId } = await connectedDevice(win)
    const g = groupId(deviceId, 1)
    const out = await win.evaluate(async (id) => {
      const pending = await window.api.invoke('group:joinRequests', { groupId: id })
      if (!pending.ok) throw new Error('requests')
      const [first, second] = pending.data
      const approve = await window.api.invoke('group:handleJoinRequests', {
        groupId: id,
        jids: [first!.jid],
        action: 'approve',
      })
      const reject = await window.api.invoke('group:handleJoinRequests', {
        groupId: id,
        jids: [second!.jid],
        action: 'reject',
      })
      const left = await window.api.invoke('group:joinRequests', { groupId: id })
      return { pending: pending.data, approve, reject, left }
    }, g)
    expect(out.pending).toHaveLength(2)
    expect(out.pending[0]!.phone).toBe('+919890000001')
    if (!out.approve.ok || !out.reject.ok || !out.left.ok) throw new Error('calls')
    expect(out.approve.data).toEqual({ approved: 1, failed: 0 })
    expect(out.reject.data).toEqual({ approved: 1, failed: 0 })
    expect(out.left.data).toHaveLength(0)
    expect(groupRow(dir, g)!.memberCount).toBe(16)
  })
})

test('E5.66 — exporting members of two groups builds a de-duplicated list without our own number', async () => {
  await withApp(async ({ win, dir }) => {
    const { deviceId, phone } = await connectedDevice(win)
    const g1 = groupId(deviceId, 1)
    const g2 = groupId(deviceId, 2)
    const out = await win.evaluate(
      async ({ a, b }) => {
        // Put a member of group 1 into group 2 so the two overlap.
        await window.api.invoke('group:updateMembers', {
          groupId: b,
          action: 'add',
          phones: ['+919801000005'],
        })
        // Take the name first, so the export must pick "Grabbed (2)".
        await window.api.invoke('contactList:create', {
          name: 'Grabbed',
          customFields: [],
        })
        const exported = await window.api.invoke('group:exportMembers', {
          groupIds: [a, b],
          listName: 'Grabbed',
        })
        const lists = await window.api.invoke('contactList:list')
        return { exported, lists }
      },
      { a: g1, b: g2 },
    )
    if (!out.exported.ok || !out.lists.ok) throw new Error('calls')
    // 14 others in group 1 + 7 others in group 2; the shared member once.
    expect(out.exported.data.imported).toBe(21)
    // Our own number twice, the overlap once.
    expect(out.exported.data.skipped).toBe(3)
    const list = out.lists.data.find((l) => l.id === out.exported.data.listId)
    expect(list?.name).toBe('Grabbed (2)')
    expect(list?.contactCount).toBe(21)

    const rows = query<{ phone: string; name: string; data: string }>(
      dir,
      'SELECT phone, name, data FROM Contact WHERE listId = ?',
      out.exported.data.listId,
    )
    expect(rows).toHaveLength(21)
    expect(new Set(rows.map((r) => r.phone)).size).toBe(21)
    expect(rows.map((r) => r.phone)).not.toContain(phone)
    expect(JSON.parse(rows[0]!.data)).toEqual({
      Name: rows[0]!.phone,
      Mobile: rows[0]!.phone,
    })
  })
})

test('E5.67 — communities: create, link, list, create a group inside, unlink', async () => {
  await withApp(async ({ win, dir }) => {
    const { deviceId } = await connectedDevice(win)
    const g1 = groupId(deviceId, 1)
    const out = await win.evaluate(
      async ({ device, group }) => {
        const created = await window.api.invoke('community:create', {
          deviceId: device,
          name: 'Customers',
          description: 'Everyone who bought',
        })
        if (!created.ok) throw new Error('create')
        const link = await window.api.invoke('community:linkGroup', {
          communityId: created.data.id,
          groupId: group,
        })
        const inner = await window.api.invoke('community:createGroup', {
          communityId: created.data.id,
          name: 'Customers — Mumbai',
          phones: ['+919876500010'],
        })
        const listed = await window.api.invoke('community:list', { deviceId: device })
        const groups = await window.api.invoke('group:list', { deviceId: device })
        return { created: created.data, link, inner, listed, groups }
      },
      { device: deviceId, group: g1 },
    )
    if (!out.link.ok || !out.inner.ok || !out.listed.ok || !out.groups.ok)
      throw new Error('calls')
    const community = out.listed.data.find((c) => c.id === out.created.id)
    expect(community?.name).toBe('Customers')
    expect(community?.linkedGroupIds.sort()).toEqual([g1, out.inner.data.groupId].sort())
    // Communities are not mixed into the group list.
    expect(out.groups.data.some((g) => g.id === out.created.id)).toBe(false)
    expect(groupRow(dir, out.created.id)!.isCommunity).toBe(1)
    expect(groupRow(dir, g1)!.parentId).toBe(out.created.id)

    const unlinked = await win.evaluate(
      async ({ c, g }) => {
        await window.api.invoke('community:unlinkGroup', { communityId: c, groupId: g })
        return window.api.invoke('community:list', {})
      },
      { c: out.created.id, g: g1 },
    )
    if (!unlinked.ok) throw new Error('list')
    expect(unlinked.data.find((c) => c.id === out.created.id)?.linkedGroupIds).toEqual([
      out.inner.data.groupId,
    ])
    expect(groupRow(dir, g1)!.parentId).toBeNull()
  })
})

test('E5.68 — bulk create applies admins-only, join approval and description', async () => {
  await withApp(async ({ win, dir }) => {
    const { deviceId } = await connectedDevice(win)
    const status = await win.evaluate(async (id) => {
      const job = await window.api.invoke('groupCreate:create', {
        deviceId: id,
        prefix: 'Announce',
        suffixRule: 'number',
        count: 2,
        delaySeconds: 0,
        listIds: [],
        contactsPerGroup: 0,
        description: 'Read-only offers',
        announce: true,
        joinApproval: true,
      })
      if (!job.ok) throw new Error('job')
      for (let i = 0; i < 120; i += 1) {
        const s = await window.api.invoke('groupCreate:status', { jobId: job.data.jobId })
        if (s.ok && s.data.status === 'completed') return s.data
        await new Promise((r) => setTimeout(r, 250))
      }
      throw new Error('timeout')
    }, deviceId)
    expect(status.created).toBe(2)
    expect(status.failed).toBe(0)

    const created = query<{ id: string; announce: number; joinApproval: number }>(
      dir,
      `SELECT id, announce, joinApproval FROM "Group" WHERE name LIKE 'Announce%'`,
    )
    expect(created).toHaveLength(2)
    expect(created.every((g) => g.announce === 1 && g.joinApproval === 1)).toBe(true)
    const announced = actions(dir)
      .filter((a) => a.action === 'groupSetting' && a.setting === 'announcement')
      .map((a) => a.groupId)
    expect(announced.sort()).toEqual(created.map((g) => g.id).sort())
  })
})

test('E5.69 — the Manage dialog drives invite, settings, members and join requests', async () => {
  await withApp(async ({ win, dir }) => {
    const { deviceId } = await connectedDevice(win)
    await win.getByTestId('nav-groups').click()
    await expect(win.getByTestId('page-title')).toHaveText('WhatsApp Groups')

    const sales = win.getByTestId('group-row').filter({ hasText: 'Sales Team 001' })
    await sales.getByTestId('manage-group').click()
    const dialog = win.getByTestId('manage-group-dialog')
    await expect(dialog).toBeVisible()

    // Invite link: show, then reset to a new code.
    await dialog.getByTestId('show-invite').click()
    const url = dialog.getByTestId('invite-url')
    await expect(url).toHaveValue(/^https:\/\/chat\.whatsapp\.com\/INV/)
    await dialog.getByTestId('revoke-invite').click()
    await dialog.getByTestId('confirm-revoke').click()
    await expect(url).toHaveValue(/^https:\/\/chat\.whatsapp\.com\/REV/)

    // Settings: admins-only applies and shows on the group row.
    await dialog.getByTestId('manage-tab-settings').click()
    await dialog.getByTestId('setting-announce').check()
    await expect(dialog.getByTestId('setting-announce')).toBeChecked()
    await expect(sales.getByTestId('group-meta')).toContainText('admins only')

    // Members: one good, one not on WhatsApp, one malformed.
    await dialog.getByTestId('manage-tab-members').click()
    await expect(dialog.getByTestId('member-count')).toHaveText('15 members')
    await dialog
      .getByTestId('member-phones')
      .fill('+919876543210\n+919876543000\nnot-a-number')
    await dialog.getByTestId('add-members').click()
    await expect(dialog.getByTestId('member-result')).toHaveCount(3, { timeout: 30_000 })
    await expect(
      dialog.locator('[data-testid="member-result"][data-ok="true"]'),
    ).toHaveCount(1)
    await expect(dialog.getByTestId('member-results')).toContainText('not on WhatsApp')
    await expect(dialog.getByTestId('member-count')).toHaveText('16 members', {
      timeout: 30_000,
    })

    // Join requests: approve one.
    await dialog.getByTestId('manage-tab-requests').click()
    await expect(dialog.getByTestId('join-request')).toHaveCount(2, { timeout: 30_000 })
    await dialog.getByTestId('approve-request').first().click()
    await expect(dialog.getByTestId('join-request')).toHaveCount(1, { timeout: 30_000 })
    await expect(sales.getByTestId('group-meta')).toContainText('17 members')

    await dialog.press('Escape')
    await expect(dialog).toBeHidden()
    expect(groupRow(dir, groupId(deviceId, 1))!.announce).toBe(1)

    // A non-admin group explains why its admin actions are disabled.
    await win
      .getByTestId('group-row')
      .filter({ hasText: 'Marketing Team 001' })
      .getByTestId('manage-group')
      .click()
    await expect(dialog.getByTestId('not-admin-reason')).toContainText('not an admin')
    await dialog.getByTestId('manage-tab-settings').click()
    await expect(dialog.getByTestId('setting-announce')).toBeDisabled()
  })
})

test('E5.70 — join, export and communities through the Groups screen', async () => {
  await withApp(async ({ win }) => {
    await connectedDevice(win, 'UI Device')
    await win.getByTestId('nav-groups').click()
    await expect(win.getByTestId('group-item').first()).toBeVisible()

    // Join via link.
    await win.getByTestId('join-group').click()
    const join = win.getByTestId('join-group-dialog')
    await join.getByTestId('join-device').selectOption({ label: 'UI Device' })
    await join.getByTestId('join-invite').fill('https://chat.whatsapp.com/UiJoin42')
    await join.getByTestId('submit-join').click()
    await expect(join).toBeHidden({ timeout: 30_000 })
    await expect(
      win.getByTestId('group-row').filter({ hasText: 'Joined UiJoin42' }),
    ).toBeVisible()

    // Export the members of two selected groups.
    await expect(win.getByTestId('export-members')).toBeDisabled()
    await win.getByTestId('group-item').filter({ hasText: 'Sales Team 001' }).click()
    await win.getByTestId('group-item').filter({ hasText: 'Support Group A' }).click()
    await win.getByTestId('export-members').click()
    const exportDialog = win.getByTestId('export-members-dialog')
    await exportDialog.getByTestId('export-list-name').fill('UI grabbed')
    await exportDialog.getByTestId('submit-export').click()
    await expect(exportDialog.getByTestId('export-result')).toContainText('Imported 21', {
      timeout: 30_000,
    })
    await exportDialog.getByTestId('export-done').click()

    // Communities: create one and link a group into it.
    await win.getByTestId('groups-tab-communities').click()
    await expect(win.getByTestId('no-communities')).toBeVisible()
    await win.getByTestId('new-community').click()
    await win.getByTestId('community-device').selectOption({ label: 'UI Device' })
    await win.getByTestId('community-name').fill('UI Community')
    await win.getByTestId('submit-community').click()
    const card = win.getByTestId('community-card').filter({ hasText: 'UI Community' })
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.getByTestId('link-group-select').selectOption({ label: 'Support Group A' })
    await card.getByTestId('link-group').click()
    await expect(card.getByTestId('community-linked-group')).toContainText(
      'Support Group A',
    )
    // A non-admin group cannot be picked for linking.
    await expect(
      card.locator('[data-testid="link-group-select"] option', {
        hasText: 'Marketing Team 001',
      }),
    ).toBeDisabled()
  })
})
