/**
 * The builder's test panel: a whole conversation, run through the same
 * `runStep` the engine uses, with nothing sent and nothing stored.
 */
import type { IpcResponse } from '../../../../shared/ipc'
import type { FlowGraph } from '../../../../shared/flow'
import { outputAsText, runStep, type FlowVars } from './run'

type Simulation = IpcResponse<'flow:simulate'>

/** Stand-in contact fields, so {{Name}} reads naturally in a test. */
const SAMPLE_VALUES = { Name: 'Customer' }

export function simulateFlow(graph: FlowGraph, replies: string[]): Simulation {
  const transcript: Simulation['transcript'] = []
  const say = (texts: string[]) => {
    for (const text of texts) if (text !== '') transcript.push({ from: 'bot', text })
  }

  let result = runStep(graph, null, {}, null, SAMPLE_VALUES)
  say(result.messages.map(outputAsText))
  if (result.handoffText) say([result.handoffText])

  let nodeId = result.nextNodeId
  let vars: FlowVars = result.vars
  for (const reply of replies) {
    transcript.push({ from: 'customer', text: reply })
    // Like a real chat after the flow ends: later messages get no flow answer.
    if (nodeId === null) continue
    result = runStep(graph, nodeId, vars, reply, SAMPLE_VALUES)
    say(result.messages.map(outputAsText))
    if (result.handoffText) say([result.handoffText])
    nodeId = result.nextNodeId
    vars = result.vars
  }

  return { transcript, ended: nodeId === null, handoff: result.handoff }
}
