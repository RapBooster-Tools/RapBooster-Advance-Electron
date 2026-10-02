/**
 * One phone number, one message per campaign.
 *
 * The same person imported into two lists is two `Contact` rows with different
 * ids, so the unique(campaignId, contactId) constraint never caught it: picking
 * both lists messaged that number twice. Sending the same marketing message
 * twice is exactly the behaviour that gets an account reported.
 */
import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  cleanupUserDataDir,
  launchLicensed,
  newUserDataDir,
} from './fixtures/licensed-app'

test('E3.30 — a number in two selected lists is queued and sent once', async () => {
  const dir = newUserDataDir()
  const { app, win } = await launchLicensed(dir)
  try {
    const campaignId = await win.evaluate(async () => {
      const lists: string[] = []
      for (const [name, phones] of [
        ['Dedup A', ['+919600000001', '+919600000002']],
        ['Dedup B', ['+919600000002', '+919600000003']],
      ] as const) {
        const list = await window.api.invoke('contactList:create', {
          name,
          customFields: [],
        })
        if (!list.ok) throw new Error('list')
        for (const phone of phones) {
          const created = await window.api.invoke('contacts:create', {
            listId: list.data.id,
            data: { Name: `Person ${phone.slice(-1)}`, Mobile: phone },
          })
          if (!created.ok) throw new Error('contact')
        }
        lists.push(list.data.id)
      }

      const device = await window.api.invoke('device:create', { name: 'Dedup' })
      if (!device.ok) throw new Error('device')
      await window.api.invoke('device:connect', { id: device.data.id })
      const template = await window.api.invoke('template:create', {
        name: `Dedup tpl ${Date.now()}`,
        type: 'text',
        content: 'Hello {{Name}}',
      })
      if (!template.ok) throw new Error('template')

      const c = await window.api.invoke('campaign:create', {
        name: `Dedup ${Date.now()}`,
        templateId: template.data.id,
        deviceIds: [device.data.id],
        listIds: lists,
        delayFrom: 0,
        delayTo: 0,
        sleepDuration: 0,
        sleepAfter: 100,
      })
      if (!c.ok) throw new Error('campaign')
      await window.api.invoke('campaign:start', { id: c.data.id })
      return c.data.id
    })

    const rows = (): { phone: string; status: string }[] => {
      const db = new DatabaseSync(join(dir, 'rapbooster.db'), { readOnly: true })
      try {
        return db
          .prepare('SELECT phone, status FROM CampaignRecipient WHERE campaignId = ?')
          .all(campaignId) as unknown as { phone: string; status: string }[]
      } finally {
        db.close()
      }
    }

    await expect
      .poll(() => rows().filter((r) => r.status === 'sent').length, { timeout: 45_000 })
      .toBe(3)
    const phones = rows().map((r) => r.phone)
    expect(phones).toHaveLength(3)
    expect(new Set(phones).size).toBe(3)
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})
