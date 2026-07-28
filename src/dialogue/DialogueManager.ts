import { DIALOGUES, type Dialogue } from './dialogues'
import type { SimState } from '../sim/types'

function getPath(obj: any, path: string) {
  const parts = path.split('.')
  let cur: any = obj
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

export type Emitted = { id: string; text: string; choices?: { text: string; action?: any }[] }

export class DialogueManager {
  dialogues: Dialogue[]
  played: Set<string>
  lastLogIndex: number
  lastValues: Map<string, any>

  constructor(dialogues: Dialogue[] = DIALOGUES) {
    this.dialogues = dialogues.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    this.played = new Set()
    this.lastLogIndex = 0
    this.lastValues = new Map()
  }

  // Process new logs, returning emitted dialogues
  processLogs(logs: { kind: string; text: string }[], startIndex: number) {
    const emitted: Emitted[] = []
    const newLogs = logs.slice(startIndex)
    for (const l of newLogs) {
      for (const d of this.dialogues) {
        if (d.trigger.type !== 'log') continue
        if (d.once && this.played.has(d.id)) continue
        const tk = d.trigger
        if (tk.type === 'log') {
          if (tk.kind && tk.kind !== l.kind) continue
          if (tk.contains && !l.text.includes(tk.contains)) continue
          for (const line of d.lines) {
            emitted.push({ id: d.id, text: line.text, choices: d.choices })
          }
          if (d.once) this.played.add(d.id)
        }
      }
    }
    return emitted
  }

  // Check for state changes (path becomes value)
  processState(s: SimState) {
    const emitted: Emitted[] = []
    for (const d of this.dialogues) {
      if (d.trigger.type !== 'stateChange') continue
      if (d.once && this.played.has(d.id)) continue
      const tk = d.trigger
      const prev = this.lastValues.get(tk.path)
      const cur = getPath(s, tk.path)
      if (prev === undefined) {
        // first time, store and optionally fire if becomes === cur and prev not set
        this.lastValues.set(tk.path, cur)
        if (tk.becomes === cur) {
          for (const line of d.lines) emitted.push({ id: d.id, text: line.text, choices: d.choices })
          if (d.once) this.played.add(d.id)
        }
      } else {
        if (prev !== cur && cur === tk.becomes) {
          for (const line of d.lines) emitted.push({ id: d.id, text: line.text, choices: d.choices })
          if (d.once) this.played.add(d.id)
        }
        this.lastValues.set(tk.path, cur)
      }
    }
    return emitted
  }
}
