import { useEffect, useReducer, useRef, useState } from 'react'
import { initialState } from './sim/initial'
import { apply, tick, type Action } from './sim/engine'
import { coach } from './sim/coach'
import { clearFaults, fireFault } from './sim/faults'
import { RECIPE_TARGETS } from './sim/procedures'
import type { FaultId, Recipe } from './sim/types'
import ReactorView from './ui/ReactorView'
import RigView from './ui/RigView'
import RenderedView from './ui/RenderedView'
import { FaultPanel, GasPanel, GeneratorPanel, PyrometerPanel, TunerPanel, UtilitiesPanel, VacuumPanel } from './ui/Panels'
import { Checklist, GrowthPanel, LogView } from './ui/SidePanels'

const DT = 0.1

export default function App() {
  const ref = useRef(initialState('CO2CH4'))
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [view, setView] = useState<'cutaway' | 'rendered' | 'photo'>('cutaway')

  useEffect(() => {
    const id = setInterval(() => {
      const s = ref.current
      const steps = Math.max(1, Math.round(s.speed))
      for (let i = 0; i < steps; i++) {
        tick(s, DT)
        coach(s, DT)
      }
      force()
    }, 100)
    return () => clearInterval(id)
  }, [])

  const s = ref.current
  const d = (a: Action) => {
    apply(ref.current, a)
    force()
  }
  const setRecipe = (r: Recipe) => {
    ref.current = initialState(r)
    force()
  }

  return (
    <div className="app">
      <header>
        <h1>MWCVD reactor trainer</h1>
        <div className="hgroup">
          {(['CO2CH4', 'H2CH4'] as Recipe[]).map((r) => (
            <button key={r} className={`tab ${s.recipe === r ? 'on' : ''}`} onClick={() => setRecipe(r)}>
              {RECIPE_TARGETS[r].label}
            </button>
          ))}
          <span className="clock">t = {s.t.toFixed(0)} s</span>
          <label className="speed">
            speed
            <select value={s.speed} onChange={(e) => d({ type: 'speed', value: Number(e.target.value) })}>
              <option value={1}>1x</option>
              <option value={4}>4x</option>
              <option value={10}>10x</option>
            </select>
          </label>
          <button className="ghost" onClick={() => setRecipe(s.recipe)}>
            Reset session
          </button>
        </div>
      </header>

      <p className="disclaimer">
        Familiarisation aid only. Setpoints are provisional and are not a substitute for the local standard operating
        procedure, risk assessment or induction.
      </p>

      <main>
        <div className="col left">
          <div className="view-tabs">
            {([['cutaway', 'Vector cutaway'], ['rendered', 'Rendered'], ['photo', 'Photographs']] as const).map(([k, label]) => (
              <button key={k} className={`tab ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>
                {label}
              </button>
            ))}
          </div>
          {view === 'photo' ? (
            <RigView s={s} d={d} />
          ) : (
            <div className="reactor-wrap">{view === 'rendered' ? <RenderedView s={s} /> : <ReactorView s={s} />}</div>
          )}
          <GrowthPanel s={s} />
        </div>

        <div className="col mid">
          <VacuumPanel s={s} d={d} />
          <GasPanel s={s} d={d} />
          <GeneratorPanel s={s} d={d} />
          <TunerPanel s={s} d={d} />
        </div>

        <div className="col right">
          <Checklist s={s} />
          <PyrometerPanel s={s} d={d} />
          <UtilitiesPanel s={s} d={d} />
          <FaultPanel
            s={s}
            d={d}
            fire={(id: FaultId) => {
              fireFault(ref.current, id)
              force()
            }}
            clear={() => {
              clearFaults(ref.current)
              force()
            }}
          />
          <LogView s={s} />
        </div>
      </main>
    </div>
  )
}
