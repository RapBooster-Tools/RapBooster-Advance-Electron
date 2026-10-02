/**
 * AI provider configuration, usage and reply drafts (D89).
 */
import { AppError } from '../../../shared/errors'
import { getAiConfig, keyStatus, saveAiConfig } from '../services/ai/ai-config'
import { approveDraft, discardDraft, listDrafts } from '../services/ai/drafts'
import { usageReport } from '../services/ai/usage'
import { registerHandler } from './router'

export function registerAiHandlers(): void {
  registerHandler('ai:getConfig', async () => ({
    config: await getAiConfig(),
    keys: await keyStatus(),
  }))

  registerHandler('ai:setConfig', async (input) => {
    if (input.provider === 'compatible' && !input.baseUrl) {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'An OpenAI-compatible provider needs a base URL.',
      })
    }
    // The base URL only means something for `compatible`; keeping a stale one
    // around for another provider would be confusing on the next switch.
    return saveAiConfig({
      ...input,
      baseUrl: input.provider === 'compatible' ? input.baseUrl : null,
    })
  })

  registerHandler('ai:usage', () => usageReport())

  registerHandler('aiDraft:list', ({ chatId }) => listDrafts(chatId))

  registerHandler('aiDraft:approve', async ({ id, text }) => {
    await approveDraft(id, text)
    return { ok: true as const }
  })

  registerHandler('aiDraft:discard', async ({ id }) => {
    await discardDraft(id)
    return { ok: true as const }
  })
}
