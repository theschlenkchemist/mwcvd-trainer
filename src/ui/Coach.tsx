import React, { useEffect, useRef, useState } from 'react'
import type { SimState } from '../sim/types'
import { DialogueManager } from '../dialogue/DialogueManager'
import { DIALOGUES } from '../dialogue/dialogues'
import type { Action } from '../sim/engine'

export default function Coach({ s, d }: { s: SimState; d: (a: Action) => void }) {
  const dmRef = useRef<DialogueManager | null>(null)
  const [messages, setMessages] = useState<{ id: string; text: string; choices?: any[] }[]>([])
  const lastLogLen = useRef(0)

  if (!dmRef.current) dmRef.current = new DialogueManager(DIALOGUES)

  useEffect(() => {
    const dm = dmRef.current!
    // process new logs
    if (s.log.length > lastLogLen.current) {
      const emitted = dm.processLogs(s.log as any, lastLogLen.current)
      lastLogLen.current = s.log.length
      if (emitted.length) setMessages((m) => [...m, ...emitted.map((e) => ({ id: e.id, text: e.text, choices: e.choices }))])
    }
    // process state changes
    const emitted2 = dm.processState(s)
    if (emitted2.length) setMessages((m) => [...m, ...emitted2.map((e) => ({ id: e.id, text: e.text, choices: e.choices }))])
  }, [s.t])

  function handleChoice(choice: any) {
    if (choice.action) d(choice.action as Action)
  }

  return (
    <div className="coach">
      <div className="coach-header">
        <strong>Coach</strong>
      </div>
      <div className="coach-body">
        {messages.slice(-6).map((m, i) => (
          <div key={i} className="coach-msg">
            <div className="coach-text">{m.text}</div>
            {m.choices && (
              <div className="coach-choices">
                {m.choices.map((c: any, j: number) => (
                  <button key={j} onClick={() => handleChoice(c)} className="coach-choice">
                    {c.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
