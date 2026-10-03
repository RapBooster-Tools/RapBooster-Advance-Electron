import { getPrisma } from '../db/client'
import { invalidateBotSettings, parseKeywords } from '../services/ai/ai-config'
import { testKey } from '../services/ai/responder'
import { registerHandler } from './router'

/** Created on first read so the screen always has something to render. */
async function loadOrCreate() {
  const existing = await getPrisma().chatbotConfig.findUnique({
    where: { id: 'singleton' },
  })
  if (existing) return existing
  const created = await getPrisma().chatbotConfig.create({ data: { id: 'singleton' } })
  // The responder may have cached "no configuration yet".
  invalidateBotSettings()
  return created
}

export function registerChatbotHandlers(): void {
  registerHandler('chatbot:get', async () => {
    const config = await loadOrCreate()
    return {
      enabled: config.enabled,
      systemInstructions: config.systemInstructions,
      businessName: config.businessName,
      businessEmail: config.businessEmail,
      businessPhone: config.businessPhone,
      responseDelay: config.responseDelay,
      tone: config.tone,
      industry: config.industry,
      primaryGoal: config.primaryGoal,
      responseStyle: config.responseStyle,
      language: config.language,
      escalationTrigger: config.escalationTrigger,
      escalationKeywords: parseKeywords(config.escalationKeywords),
      escalationMessage: config.escalationMessage,
      confidenceThreshold: config.confidenceThreshold,
      escalateAfterMessages: config.escalateAfterMessages,
      escalateAfterMinutes: config.escalateAfterMinutes,
      products: config.products,
      knowledgeBase: config.knowledgeBase,
    }
  })

  registerHandler('chatbot:save', async (input) => {
    await loadOrCreate()
    const saved = await getPrisma().chatbotConfig.update({
      where: { id: 'singleton' },
      data: {
        enabled: input.enabled,
        systemInstructions: input.systemInstructions,
        businessName: input.businessName,
        businessEmail: input.businessEmail,
        businessPhone: input.businessPhone,
        responseDelay: input.responseDelay,
        tone: input.tone,
        industry: input.industry,
        primaryGoal: input.primaryGoal,
        responseStyle: input.responseStyle,
        language: input.language,
        escalationTrigger: input.escalationTrigger,
        escalationKeywords: JSON.stringify(input.escalationKeywords),
        escalationMessage: input.escalationMessage,
        confidenceThreshold: input.confidenceThreshold,
        escalateAfterMessages: input.escalateAfterMessages,
        escalateAfterMinutes: input.escalateAfterMinutes,
        products: input.products,
        knowledgeBase: input.knowledgeBase,
      },
    })
    invalidateBotSettings()

    return {
      ...input,
      escalationKeywords: parseKeywords(saved.escalationKeywords),
    }
  })

  registerHandler('chatbot:testKey', async ({ apiKey, provider }) =>
    testKey(apiKey, provider),
  )
}
