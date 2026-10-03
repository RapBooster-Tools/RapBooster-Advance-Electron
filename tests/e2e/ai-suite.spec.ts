/**
 * The AI suite (D89): multiple providers, usage and caps, coalescing,
 * escalation triggers, approve-before-send drafts and quiet-hours holds.
 *
 * Every provider is a local stub (fixtures/ai-harness.ts) and every inbound
 * message comes through the mock WhatsApp transport's inject file, so the whole
 * chain runs for real: message stored -> responder -> provider HTTP call ->
 * throttle -> send log.
 */
import { expect, test, type Page } from '@playwright/test'
import {
  AiStub,
  STUB_USAGE,
  armBot,
  connectDevice,
  inboundCount,
  inject,
  launchAiApp,
  query,
  sentBodies,
  type AiApp,
} from './fixtures/ai-harness'
import { cleanupUserDataDir, newUserDataDir } from './fixtures/licensed-app'

const stub = new AiStub()

test.beforeAll(() => stub.start())
test.afterAll(() => stub.stop())
test.beforeEach(() => stub.reset())

async function withApp(
  env: Record<string, string>,
  body: (ctx: AiApp) => Promise<void>,
): Promise<void> {
  const dir = newUserDataDir()
  const ctx = await launchAiApp(dir, stub, env)
  try {
    await body(ctx)
  } finally {
    await ctx.app.close()
    cleanupUserDataDir(dir)
  }
}

function drafts(win: Page) {
  return win.evaluate(async () => {
    const r = await window.api.invoke('aiDraft:list', {})
    return r.ok ? r.data : []
  })
}

type Turn = { role: string; content: string }

test('E6.40 — Anthropic answers with the system prompt as a top-level field', async () => {
  await withApp({}, async (ctx) => {
    stub.reply = 'Hello from Claude.'
    await armBot(ctx.win, {
      ai: { provider: 'anthropic', model: 'claude-haiku-4-5' },
      key: { setting: 'ai.anthropicKey', value: 'sk-ant-stub' },
    })
    await connectDevice(ctx.win)
    inject(ctx, '+919800001101', 'Hi there')

    await expect
      .poll(() => sentBodies(ctx), { timeout: 30_000 })
      .toContain('Hello from Claude.')

    const call = stub.completions[0]!
    expect(call.path).toBe('/v1/messages')
    expect(call.headers['x-api-key']).toBe('sk-ant-stub')
    expect(call.headers['anthropic-version']).toBe('2023-06-01')
    const body = call.body as { model: string; system: string; messages: Turn[] }
    expect(body.model).toBe('claude-haiku-4-5')
    expect(body.system).toContain('Be brief and kind.')
    // The system prompt is not smuggled in as a message.
    expect(body.messages.every((m) => m.role !== 'system')).toBe(true)
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'Hi there' })
  })
})

test('E6.41 + E6.42 — Gemini answers with systemInstruction and a header key; usage is recorded', async () => {
  await withApp({}, async (ctx) => {
    stub.reply = 'Hello from Gemini.'
    await armBot(ctx.win, {
      ai: { provider: 'gemini', model: 'gemini-2.5-flash' },
      key: { setting: 'ai.geminiKey', value: 'gem-stub-key' },
    })
    await connectDevice(ctx.win)
    inject(ctx, '+919800001102', 'Are you open?')

    await expect
      .poll(() => sentBodies(ctx), { timeout: 30_000 })
      .toContain('Hello from Gemini.')

    const call = stub.completions[0]!
    expect(call.path).toBe('/v1beta/models/gemini-2.5-flash:generateContent')
    expect(call.headers['x-goog-api-key']).toBe('gem-stub-key')
    // A key in the URL ends up in logs.
    expect(call.path).not.toContain('key=')
    const body = call.body as {
      systemInstruction: { parts: { text: string }[] }
      contents: { role: string; parts: { text: string }[] }[]
    }
    expect(body.systemInstruction.parts[0]!.text).toContain('Be brief and kind.')
    expect(body.contents.at(-1)).toEqual({
      role: 'user',
      parts: [{ text: 'Are you open?' }],
    })

    // E6.42 — the call is recorded and reported.
    const rows = query<{
      provider: string
      promptTokens: number
      completionTokens: number
    }>(ctx, 'SELECT provider, promptTokens, completionTokens FROM AiUsage')
    expect(rows).toEqual([
      {
        provider: 'gemini',
        promptTokens: STUB_USAGE.prompt,
        completionTokens: STUB_USAGE.completion,
      },
    ])
    const usage = await ctx.win.evaluate(() => window.api.invoke('ai:usage'))
    if (!usage.ok) throw new Error('ai:usage failed')
    expect(usage.data.today).toEqual({
      calls: 1,
      promptTokens: STUB_USAGE.prompt,
      completionTokens: STUB_USAGE.completion,
    })
    expect(usage.data.month.calls).toBe(1)
    expect(usage.data.days).toHaveLength(7)
    expect(usage.data.days.at(-1)!.calls).toBe(1)

    await ctx.win.getByTestId('nav-chatbot').click()
    await expect(ctx.win.getByTestId('ai-usage-today-calls')).toHaveText('1')
  })
})

test('E6.43 — the per-chat daily cap stops the second reply and says so once', async () => {
  await withApp({}, async (ctx) => {
    stub.reply = 'First and only answer.'
    await armBot(ctx.win, {
      ai: { dailyCapPerChat: 1 },
      key: { setting: 'ai.apiKey', value: 'sk-stub' },
    })
    await connectDevice(ctx.win)

    inject(ctx, '+919800001103', 'Question one')
    await expect.poll(() => sentBodies(ctx), { timeout: 30_000 }).toHaveLength(1)

    inject(ctx, '+919800001103', 'Question two')
    await expect.poll(() => inboundCount(ctx), { timeout: 30_000 }).toBe(2)
    await expect(ctx.win.getByTestId('toast').filter({ hasText: 'limit' })).toBeVisible({
      timeout: 15_000,
    })
    expect(stub.completions).toHaveLength(1)
    expect(sentBodies(ctx)).toHaveLength(1)
  })
})

test('E6.44 + E6.45 — approve-before-send drafts; approve sends, discard does not', async () => {
  await withApp({}, async (ctx) => {
    stub.reply = 'Drafted answer.'
    await armBot(ctx.win, {
      ai: { approveBeforeSend: true },
      key: { setting: 'ai.apiKey', value: 'sk-stub' },
    })
    await connectDevice(ctx.win)
    inject(ctx, '+919800001104', 'Please approve me')
    inject(ctx, '+919800001105', 'Please discard me')

    await expect
      .poll(async () => (await drafts(ctx.win)).length, { timeout: 30_000 })
      .toBe(2)
    const all = await drafts(ctx.win)
    expect(all.every((d) => d.status === 'pending_approval')).toBe(true)
    expect(sentBodies(ctx)).toHaveLength(0)

    const listed = await ctx.win.evaluate(() =>
      window.api.invoke('chat:list', { filter: 'drafts' }),
    )
    if (!listed.ok) throw new Error('chat:list failed')
    expect(listed.data.total).toBe(2)
    expect(listed.data.items.every((c) => c.pendingDrafts === 1)).toBe(true)

    const toApprove = all.find((d) => d.chatId.includes('919800001104'))!
    const toDiscard = all.find((d) => d.chatId.includes('919800001105'))!

    const approved = await ctx.win.evaluate(
      (id) => window.api.invoke('aiDraft:approve', { id }),
      toApprove.id,
    )
    expect(approved.ok).toBe(true)
    const discarded = await ctx.win.evaluate(
      (id) => window.api.invoke('aiDraft:discard', { id }),
      toDiscard.id,
    )
    expect(discarded.ok).toBe(true)

    await expect
      .poll(() => sentBodies(ctx), { timeout: 15_000 })
      .toEqual(['Drafted answer.'])
    expect(await drafts(ctx.win)).toHaveLength(0)
    const stored = query<{ chatId: string }>(
      ctx,
      `SELECT chatId FROM Message WHERE isAiReply = 1 AND direction = 'out'`,
    )
    expect(stored.map((m) => m.chatId)).toEqual([toApprove.chatId])
    // A decided draft cannot be sent again.
    const again = await ctx.win.evaluate(
      (id) => window.api.invoke('aiDraft:approve', { id }),
      toApprove.id,
    )
    expect(again.ok).toBe(false)
  })
})

test('E6.46 — a quick burst of messages gets one model call that reads all of them', async () => {
  await withApp({}, async (ctx) => {
    stub.reply = 'One answer for both.'
    await armBot(ctx.win, {
      ai: { coalesceSeconds: 3 },
      key: { setting: 'ai.apiKey', value: 'sk-stub' },
    })
    await connectDevice(ctx.win)
    inject(ctx, '+919800001106', 'First part', 'Second part')

    await expect
      .poll(() => sentBodies(ctx), { timeout: 30_000 })
      .toEqual(['One answer for both.'])
    await ctx.win.waitForTimeout(4_000)
    expect(stub.completions).toHaveLength(1)
    const messages = (stub.completions[0]!.body as { messages: Turn[] }).messages
    const userTurns = messages.filter((m) => m.role === 'user').map((m) => m.content)
    expect(userTurns).toEqual(['First part', 'Second part'])
  })
})

test('E6.47 — the "after N messages" trigger escalates instead of calling the model', async () => {
  await withApp({}, async (ctx) => {
    stub.reply = 'Bot answer.'
    await armBot(ctx.win, {
      bot: {
        escalationTrigger: 'messages',
        escalateAfterMessages: 1,
        escalationMessage: 'A person will take over from here.',
      },
      key: { setting: 'ai.apiKey', value: 'sk-stub' },
    })
    await connectDevice(ctx.win)

    inject(ctx, '+919800001107', 'Hello')
    await expect.poll(() => sentBodies(ctx), { timeout: 30_000 }).toEqual(['Bot answer.'])

    inject(ctx, '+919800001107', 'Still there?')
    await expect
      .poll(() => sentBodies(ctx), { timeout: 30_000 })
      .toEqual(['Bot answer.', 'A person will take over from here.'])
    expect(stub.completions).toHaveLength(1)

    const escalated = await ctx.win.evaluate(() =>
      window.api.invoke('chat:list', { filter: 'escalated' }),
    )
    if (!escalated.ok) throw new Error('chat:list failed')
    expect(escalated.data.total).toBe(1)
    const row = query<{ escalatedAt: string | null }>(
      ctx,
      'SELECT escalatedAt FROM Chat WHERE isEscalated = 1',
    )
    expect(row[0]?.escalatedAt).not.toBeNull()
  })
})

function clock(offsetMinutes: number): string {
  const d = new Date(Date.now() + offsetMinutes * 60_000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

test('E6.48 — quiet hours hold the reply, and it sends once they end', async () => {
  await withApp({ RB_TICK_MS: '1000' }, async (ctx) => {
    stub.reply = 'Good morning reply.'
    await armBot(ctx.win, { key: { setting: 'ai.apiKey', value: 'sk-stub' } })
    await ctx.win.evaluate(
      ({ start, end }) =>
        window.api.invoke('settings:setSendingDefaults', {
          quietHoursEnabled: true,
          quietHoursStart: start,
          quietHoursEnd: end,
        }),
      { start: clock(-60), end: clock(60) },
    )
    await connectDevice(ctx.win)
    inject(ctx, '+919800001108', 'Late night question')

    await expect
      .poll(async () => (await drafts(ctx.win)).map((d) => [d.status, d.reason]), {
        timeout: 30_000,
      })
      .toEqual([['held', 'quiet hours']])
    // The tick keeps running and must not push it out while still quiet.
    await ctx.win.waitForTimeout(2_500)
    expect(sentBodies(ctx)).toHaveLength(0)

    await ctx.win.evaluate(() =>
      window.api.invoke('settings:setSendingDefaults', { quietHoursEnabled: false }),
    )
    await expect
      .poll(() => sentBodies(ctx), { timeout: 30_000 })
      .toEqual(['Good morning reply.'])
    await expect.poll(async () => (await drafts(ctx.win)).length).toBe(0)
  })
})

test('E6.49 — the inbox Drafts filter, badge and Edit & approve', async () => {
  await withApp({}, async (ctx) => {
    stub.reply = 'Model wording.'
    await armBot(ctx.win, {
      ai: { approveBeforeSend: true },
      key: { setting: 'ai.apiKey', value: 'sk-stub' },
    })
    await connectDevice(ctx.win)
    inject(ctx, '+919800001109', 'Needs a person to check')
    inject(ctx, '+919800001110', 'Unrelated chat')
    await expect
      .poll(async () => (await drafts(ctx.win)).length, { timeout: 30_000 })
      .toBe(2)
    // Discard one so the filter has something to exclude.
    await ctx.win.evaluate(async () => {
      const list = await window.api.invoke('aiDraft:list', {})
      if (!list.ok) throw new Error('aiDraft:list failed')
      const other = list.data.find((d) => d.chatId.includes('919800001110'))!
      await window.api.invoke('aiDraft:discard', { id: other.id })
    })

    const win = ctx.win
    await win.getByTestId('nav-inbox').click()
    await expect(win.getByTestId('chat-item')).toHaveCount(2)
    await win.getByTestId('chat-filter-drafts').click()
    await expect(win.getByTestId('chat-item')).toHaveCount(1)
    await expect(win.getByTestId('drafts-badge')).toHaveText('1 draft')

    await win.getByTestId('chat-item').first().click()
    await expect(win.getByTestId('ai-draft')).toHaveCount(1)
    await expect(win.getByTestId('draft-text')).toHaveText('Model wording.')
    await win.getByTestId('draft-edit').click()
    await win.getByTestId('draft-edit-text').fill('Edited by a person.')
    await win.getByTestId('draft-save-approve').click()

    await expect
      .poll(() => sentBodies(ctx), { timeout: 15_000 })
      .toEqual(['Edited by a person.'])
    // The filtered list empties as the queue is worked through.
    await expect(win.getByTestId('chat-item')).toHaveCount(0)
    await win.getByTestId('chat-filter-all').click()
    await win.getByTestId('chat-item').filter({ hasText: '919800001109' }).click()
    await expect(
      win.getByTestId('message-bubble').filter({ hasText: 'Edited by a person.' }),
    ).toBeVisible()
    await expect(win.getByTestId('drafts-panel')).toHaveCount(0)
  })
})

test('E6.50 — provider configuration: defaults, key status, validation and the screen', async () => {
  await withApp({}, async (ctx) => {
    const win = ctx.win
    const initial = await win.evaluate(() => window.api.invoke('ai:getConfig'))
    if (!initial.ok) throw new Error('ai:getConfig failed')
    expect(initial.data.config).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      baseUrl: null,
      maxTokens: 500,
      temperature: 0.7,
      historyDepth: 10,
      dailyCapPerDevice: 500,
      dailyCapPerChat: 20,
      approveBeforeSend: false,
      coalesceSeconds: 5,
    })
    expect(Object.values(initial.data.keys)).toEqual([false, false, false, false])

    // A compatible endpoint is meaningless without a URL.
    const invalid = await win.evaluate(
      (config) =>
        window.api.invoke('ai:setConfig', {
          ...config,
          provider: 'compatible',
          model: 'llama',
        }),
      initial.data.config,
    )
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.error.code).toBe('VALIDATION_FAILED')

    // testKey per provider: missing, then a working key against the stub.
    const missing = await win.evaluate(() =>
      window.api.invoke('chatbot:testKey', { provider: 'anthropic' }),
    )
    expect(missing.ok && missing.data.detail).toContain('No API key')
    const probe = await win.evaluate(() =>
      window.api.invoke('chatbot:testKey', { provider: 'anthropic', apiKey: 'sk-ant-x' }),
    )
    expect(probe.ok && probe.data.valid).toBe(true)
    expect(stub.requests.at(-1)?.path).toBe('/v1/models')
    expect(stub.requests.at(-1)?.headers['x-api-key']).toBe('sk-ant-x')

    // The screen: switching provider re-defaults the model; keys show saved state.
    await win.getByTestId('nav-chatbot').click()
    await win.getByTestId('ai-provider').selectOption('anthropic')
    await expect(win.getByTestId('ai-model')).toHaveValue('claude-haiku-4-5')
    await win.getByTestId('ai-key').fill('sk-ant-saved')
    await win.getByTestId('save-ai-key').click()
    await expect(win.getByTestId('ai-key-status-anthropic')).toHaveAttribute(
      'data-saved',
      'true',
    )
    await expect(win.getByTestId('ai-key-status-gemini')).toHaveAttribute(
      'data-saved',
      'false',
    )
    await win.getByTestId('ai-cap-chat').fill('7')
    await win.getByTestId('ai-approve-before-send').check()
    await win.getByTestId('save-chatbot').click()
    await expect(
      win.getByTestId('toast').filter({ hasText: 'Chatbot configuration saved' }),
    ).toBeVisible()

    const after = await win.evaluate(() => window.api.invoke('ai:getConfig'))
    if (!after.ok) throw new Error('ai:getConfig failed')
    expect(after.data.config).toMatchObject({
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      dailyCapPerChat: 7,
      approveBeforeSend: true,
    })
    expect(after.data.keys.anthropic).toBe(true)
    // The key itself never comes back.
    expect(JSON.stringify(after.data)).not.toContain('sk-ant-saved')
  })
})
