export type Trigger =
  | { type: 'log'; kind: string; contains?: string }
  | { type: 'stateChange'; path: string; becomes: any }
  | { type: 'predicate'; expr: string } // expr not evaluated with eval in this simple prototype

export interface Choice {
  text: string
  action?: any
}

export interface Dialogue {
  id: string
  priority?: number
  trigger: Trigger
  once?: boolean
  lines: { text: string }[]
  choices?: Choice[]
}

// A single coach persona: concise, instructive, non-judgemental.
// Triggers used: log (kind), stateChange (path becomes), predicate (unused here but reserved).

export const DIALOGUES: Dialogue[] = [
  {
    id: 'plasma_struck',
    priority: 20,
    trigger: { type: 'stateChange', path: 'plasma.lit', becomes: true },
    once: false,
    lines: [
      { text: 'Plasma struck. Good — check reflected power and tune the stubs to reduce it.' },
    ],
  },
  {
    id: 'no_strike_hint',
    priority: 10,
    trigger: { type: 'log', kind: 'hint', contains: 'Three failed strikes' },
    once: false,
    lines: [
      { text: 'Stuck on striking? Verify that the cylinder and panel valves are open and that channel is enabled, then verify pressure is in the 10 to 25 Torr window.' },
    ],
  },
  {
    id: 'high_reflection',
    priority: 15,
    trigger: { type: 'log', kind: 'alarm', contains: 'INTERLOCK TRIP' },
    once: false,
    lines: [
      { text: 'An interlock tripped and the microwave was removed. Check the indicated cause in the interlocks panel and address it before resetting.' },
    ],
  },
  {
    id: 'window_cracked',
    priority: 25,
    trigger: { type: 'stateChange', path: 'windowCracked', becomes: true },
    once: true,
    lines: [
      { text: 'QUARTZ WINDOW CRACKED. The run aborted. This is a critical safety incident; review the debrief and consult your supervisor.' },
    ],
  },
  {
    id: 'offer_autotune',
    priority: 8,
    trigger: { type: 'log', kind: 'warning', contains: 'Plasma extinguished.' },
    once: false,
    lines: [
      { text: 'The plasma has extinguished. Would you like an assisted tune to help re-strike, or try manual tuning?' },
    ],
    choices: [
      { text: 'Assisted tune', action: { type: 'autoTune' } },
      { text: 'I will tune manually' },
    ],
  },
]
