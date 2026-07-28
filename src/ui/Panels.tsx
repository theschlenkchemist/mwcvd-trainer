import { GASES, GAS_IDS, type GasId } from '../sim/gases'
import { FAULTS } from '../sim/faults'
import { absorbedPower, ignitionThreshold, optimumTuning, trueFlow } from '../sim/physics'
import type { SimState } from '../sim/types'
import type { Action } from '../sim/engine'

type D = (a: Action) => void

function Toggle({ on, label, onClick, danger }: { on: boolean; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button className={`tog ${on ? 'on' : ''} ${danger ? 'danger' : ''}`} onClick={onClick}>
      <span className="led" />
      {label}
    </button>
  )
}

export function GasPanel({ s, d }: { s: SimState; d: D }) {
  return (
    <section className="panel">
      <h3>Gas panel</h3>
      <p className="sub">Cylinder head valve, then panel isolation valve, then the 647C channel. All three or nothing flows.</p>
      <table className="grid">
        <thead>
          <tr>
            <th>Gas</th>
            <th>Cyl</th>
            <th>Panel</th>
            <th>Ch</th>
            <th>Setpoint</th>
            <th>Actual</th>
            <th>True</th>
          </tr>
        </thead>
        <tbody>
          {GAS_IDS.map((g) => {
            const spec = GASES[g]
            const m = s.mfc[g]
            return (
              <tr key={g}>
                <td dangerouslySetInnerHTML={{ __html: spec.label }} />
                <td>
                  <Toggle on={s.cylinders[g].valveOpen} label="" onClick={() => d({ type: 'cylinder', gas: g, open: !s.cylinders[g].valveOpen })} />
                </td>
                <td>
                  <Toggle on={s.panelValves[g]} label="" onClick={() => d({ type: 'panelValve', gas: g, open: !s.panelValves[g] })} />
                </td>
                <td>
                  <Toggle on={m.channelOn} label={String(spec.channel)} onClick={() => d({ type: 'mfcChannel', gas: g, on: !m.channelOn })} />
                </td>
                <td>
                  <input
                    type="number"
                    value={Math.round(m.setpoint)}
                    min={0}
                    max={spec.fullScale}
                    step={1}
                    onChange={(e) => d({ type: 'mfcSetpoint', gas: g, value: Number(e.target.value) })}
                  />
                </td>
                <td className={`num ${m.channelOn && m.setpoint > 0 && m.actual < m.setpoint * 0.5 ? 'bad' : ''}`}>{m.actual.toFixed(1)}</td>
                <td className="num dim">{trueFlow(g, m.actual).toFixed(1)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="sub">Setpoint and actual are indicated sccm on nitrogen calibration. The true column applies the gas correction factor.</p>
    </section>
  )
}

export function VacuumPanel({ s, d }: { s: SimState; d: D }) {
  return (
    <section className="panel">
      <h3>Vacuum and chamber</h3>
      <div className="row">
        <Toggle on={s.pumpOn} label="Rotary pump" onClick={() => d({ type: 'pump', on: !s.pumpOn })} />
        <Toggle on={s.chamber.ventOpen} label="Vent to air" danger onClick={() => d({ type: 'vent', open: !s.chamber.ventOpen })} />
        <Toggle on={s.chamber.sampleLoaded} label="Substrate on stage" onClick={() => d({ type: 'loadSample' })} />
      </div>
      <div className="row">
        <label className="stack">
          Jack
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={s.chamber.jack}
            onChange={(e) => d({ type: 'jack', value: Number(e.target.value) })}
          />
          <span className="num">
            {(s.chamber.jack * 100).toFixed(0)} % raised {s.chamber.sealed ? '(seated)' : '(not seated)'}
            {s.chamber.pressure < 700 && ' \u2014 locked by vacuum'}
          </span>
        </label>
      </div>
      <div className="row">
        {(['closed', 'auto', 'open'] as const).map((m) => (
          <button key={m} className={`tog ${s.throttleMode === m ? 'on' : ''}`} onClick={() => d({ type: 'throttleMode', mode: m })}>
            <span className="led" />
            {m}
          </button>
        ))}
      </div>
      <label className="stack">
        Pressure setpoint {s.pressureSetpoint.toFixed(0)} Torr
        <input type="range" min={1} max={120} step={1} value={s.pressureSetpoint} onChange={(e) => d({ type: 'pressureSetpoint', value: Number(e.target.value) })} />
      </label>
      <div className="readout big">
        {s.chamber.pressure < 1 ? s.chamber.pressure.toExponential(2) : s.chamber.pressure.toFixed(2)} <span>Torr</span>
      </div>
      <div className="sub">Exhaust valve position {(s.throttlePosition * 100).toFixed(0)} %</div>
    </section>
  )
}

export function GeneratorPanel({ s, d }: { s: SimState; d: D }) {
  const need = ignitionThreshold(s)
  const have = absorbedPower(s)
  return (
    <section className="panel sairem">
      <h3>SAIREM microwave generator, 2.45 GHz</h3>
      <div className="lcd">
        <div>
          SET POINT <b>{(s.generator.setpoint / 1000).toFixed(2)}</b> kW
        </div>
        <div>
          FP <b>{(s.generator.forward / 1000).toFixed(2)}</b> kW &nbsp; RP <b className={s.generator.reflected > 150 ? 'bad' : ''}>{(s.generator.reflected / 1000).toFixed(2)}</b> kW
        </div>
        <div className="tiny">RP LIMIT {s.generator.rpLimit} W</div>
      </div>
      <div className="row">
        <Toggle on={s.generator.poweredUp} label="Rack power" onClick={() => d({ type: 'genPower', on: !s.generator.poweredUp })} />
        <Toggle on={s.generator.standby} label="Stand by" onClick={() => d({ type: 'genStandby', on: !s.generator.standby })} />
        <Toggle on={s.generator.running} label="START" danger onClick={() => d({ type: 'genRun', on: !s.generator.running })} />
      </div>
      <label className="stack">
        Power setpoint {s.generator.setpoint} W
        <input type="range" min={0} max={2000} step={10} value={s.generator.setpoint} onChange={(e) => d({ type: 'genSetpoint', value: Number(e.target.value) })} />
      </label>
      <div className="sub">
        Absorbed {have.toFixed(0)} W. Breakdown needs about {need.toFixed(0)} W at this pressure and mixture.
      </div>
    </section>
  )
}

export function TunerPanel({ s, d }: { s: SimState; d: D }) {
  const opt = optimumTuning(s.chamber.pressure, s.plasma.lit)
  const keys: ['stub1', 'stub2', 'slidingShort'] = ['stub1', 'stub2', 'slidingShort']
  const names = { stub1: 'Stub 1', stub2: 'Stub 2', slidingShort: 'Sliding short' }
  return (
    <section className="panel">
      <h3>Impedance match</h3>
      {keys.map((k) => (
        <label key={k} className="stack">
          {names[k]} {(s.tuner[k] * 100).toFixed(0)}
          <input type="range" min={0} max={1} step={0.005} value={s.tuner[k]} onChange={(e) => d({ type: 'tuner', key: k, value: Number(e.target.value) })} />
        </label>
      ))}
      <div className="bar">
        <div className="fill" style={{ width: `${Math.min(100, (s.generator.reflected / 400) * 100)}%` }} />
      </div>
      <div className="sub">Reflected {s.generator.reflected.toFixed(0)} W. Target below 20 W.</div>
      <button className="ghost" onClick={() => d({ type: 'autoTune' })}>
        Assisted tune (training aid, not on the real rig)
      </button>
      <details>
        <summary>Reveal optimum</summary>
        <div className="sub">
          {opt.stub1.toFixed(2)} / {opt.stub2.toFixed(2)} / {opt.slidingShort.toFixed(2)}
        </div>
      </details>
    </section>
  )
}

export function PyrometerPanel({ s, d }: { s: SimState; d: D }) {
  return (
    <section className="panel">
      <h3>Thermopoint pyrometer</h3>
      <div className="readout big">
        {s.thermal.pyrometerReading > 0 ? s.thermal.pyrometerReading.toFixed(0) : '---'} <span>&deg;C</span>
      </div>
      <label className="stack">
        EMS {s.thermal.pyrometerEmissivity.toFixed(2)}
        <input type="range" min={0.05} max={1} step={0.01} value={s.thermal.pyrometerEmissivity} onChange={(e) => d({ type: 'emissivity', value: Number(e.target.value) })} />
      </label>
      <div className="sub">True substrate temperature {s.thermal.substrate.toFixed(0)} &deg;C (debug view, hidden in assessed mode)</div>
    </section>
  )
}

export function UtilitiesPanel({ s, d }: { s: SimState; d: D }) {
  const il = s.interlocks
  const items: [string, boolean][] = [
    ['cooling water', il.waterFlowOk],
    ['reflected power', il.reflectedPowerOk],
    ['chamber closed', il.chamberClosedOk],
    ['extraction', il.extractionOk],
    ['over temperature', il.overTemperatureOk],
  ]
  return (
    <section className="panel">
      <h3>Services and interlocks</h3>
      <div className="row">
        <Toggle on={s.utilities.mains} label="Mains" onClick={() => d({ type: 'utility', key: 'mains', on: !s.utilities.mains })} />
        <Toggle on={s.utilities.coolingWater} label="Water" onClick={() => d({ type: 'utility', key: 'coolingWater', on: !s.utilities.coolingWater })} />
        <Toggle on={s.utilities.extraction} label="Extraction" onClick={() => d({ type: 'utility', key: 'extraction', on: !s.utilities.extraction })} />
      </div>
      <ul className="chain">
        {items.map(([n, ok]) => (
          <li key={n} className={ok ? 'ok' : 'bad'}>
            {n}
          </li>
        ))}
      </ul>
      {il.tripped && (
        <div className="alarm">
          TRIPPED: {il.trippedBy}
          <button className="ghost" onClick={() => d({ type: 'resetInterlock' })}>
            Reset chain
          </button>
        </div>
      )}
    </section>
  )
}

export function FaultPanel({ s, d, fire, clear }: { s: SimState; d: D; fire: (id: any) => void; clear: () => void }) {
  const modes: [SimState['faultMode'], string, string][] = [
    ['off', 'Off', 'Nothing will go wrong. Use this while learning the sequence.'],
    ['manual', 'Manual', 'Nothing fires by itself. Press a fault below to inject it.'],
    ['random', 'Random', 'At most one fault per run, at an unpredictable moment, chosen to suit what the rig is doing. It may not happen at all.'],
  ]
  const active = modes.find((m) => m[0] === s.faultMode)!
  return (
    <section className="panel">
      <h3>Faults</h3>
      <div className="row wrap">
        {modes.map(([mode, label]) => (
          <button key={mode} className={`tog ${s.faultMode === mode ? 'on' : ''}`} onClick={() => d({ type: 'faultMode', mode })}>
            <span className="led" />
            {label}
          </button>
        ))}
      </div>
      <p className="sub">{active[2]}</p>
      {s.faultMode === 'random' && (
        <label className="stack">
          Chance of a fault this run {(s.faultChance * 100).toFixed(0)} %
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.faultChance}
            onChange={(e) => {
              s.faultChance = Number(e.target.value)
              d({ type: 'speed', value: s.speed })
            }}
          />
        </label>
      )}
      <div className="row wrap" style={{ opacity: s.faultMode === 'manual' ? 1 : 0.45 }}>
        {FAULTS.map((f) => (
          <button key={f.id} className="ghost small" disabled={s.faultMode !== 'manual'} onClick={() => fire(f.id)}>
            {f.label}
          </button>
        ))}
        <button className="ghost small" onClick={clear}>
          Clear all
        </button>
      </div>
      {s.faults.length > 0 && (
        <ul className="sub">
          {s.faults.map((f, i) => (
            <li key={i}>
              {f.label} at t = {f.firedAt?.toFixed(0)} s
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
