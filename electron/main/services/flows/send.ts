/**
 * Turning a flow step's output into WhatsApp messages, sent through the
 * throttle like every other automated reply (CLAUDE.md §2.5).
 */
import { MAX_REPLY_BUTTONS } from '../../../../shared/types'
import type { WaOutgoing } from '../../../../shared/wa-protocol'
import { sendBotMessage } from '../ai/bot-send'
import { menuAsText, type FlowOutput } from './run'

const LIST_BUTTON_TEXT = 'Choose an option'

/**
 * The wire form of one output.
 *
 * Buttons and list rows carry the option's id, so a tapped choice comes back
 * as an id `matchOption` recognises. WhatsApp allows three reply buttons; a
 * longer menu in the buttons style goes out as a list instead.
 */
export function toWaMessage(output: FlowOutput): WaOutgoing {
  if (output.kind === 'text') return { kind: 'text', body: output.text }
  const { text, options, style } = output
  if (style === 'buttons' && options.length <= MAX_REPLY_BUTTONS) {
    return {
      kind: 'buttons',
      body: text,
      buttons: options.map((o) => ({ type: 'reply', id: o.id, label: o.label })),
    }
  }
  if (style === 'buttons' || style === 'list') {
    return {
      kind: 'list',
      body: text,
      buttonText: LIST_BUTTON_TEXT,
      rows: options.map((o) => ({ id: o.id, title: o.label })),
    }
  }
  return { kind: 'text', body: menuAsText(text, options) }
}

/**
 * Send outputs in order. Throws on the first failure — including a parking
 * error — so the caller can leave the session where it was.
 */
export async function sendOutputs(
  deviceId: string,
  chatId: string,
  outputs: FlowOutput[],
): Promise<void> {
  for (const output of outputs) {
    await sendBotMessage(deviceId, chatId, toWaMessage(output))
  }
}
