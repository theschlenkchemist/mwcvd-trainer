import { describe, expect, it } from 'vitest'
import { initialState } from './initial'
import { apply, tick, type Action } from './engine'
import { ignitionThreshold, optimumTuning } from './physics'
import type { SimState } from './types'

function run(s: SimState, seconds: number) {
  for (let i = 0; i < seconds * 10; i++) tick(s, 0.1)
}
function act(s: SimState, ...as: Action[]) {
  for (const a of as) apply(s, a)
}
function match(s: SimState) {
  const o = optimumTuning(s.chamber.pressure, s.plasma.lit)
  act(s, { type: 'tuner', key: 'stub1', value: o.stub1 }, { type: 'tuner', key: 'stub2', value: o.stub2 }, { type: 'tuner', key: 'slidingShort', value: o.slidingShort })
}

describe('CO2/CH4 run', () => {
  it('pumps down, strikes, ramps and grows diamond', () => {
    const s = initialState('CO2CH4')
    act(s, { type: 'loadSample' }, { type: 'jack', value: 1 })
    expect(s.chamber.sealed).toBe(true)

    act(s, { type: 'throttleMode', mode: 'open' }, { type: 'pump', on: true })
    run(s, 60)
    expect(s.chamber.pressure).toBeLessThan(0.1)

    act(
      s,
      { type: 'cylinder', gas: 'CH4', open: true },
      { type: 'panelValve', gas: 'CH4', open: true },
      { type: 'mfcChannel', gas: 'CH4', on: true },
      { type: 'mfcSetpoint', gas: 'CH4', value: 52 },
      { type: 'cylinder', gas: 'CO2', open: true },
      { type: 'panelValve', gas: 'CO2', open: true },
      { type: 'mfcChannel', gas: 'CO2', on: true },
      { type: 'mfcSetpoint', gas: 'CO2', value: 48 },
      { type: 'throttleMode', mode: 'auto' },
      { type: 'pressureSetpoint', value: 15 },
    )
    // Filling 4.5 litres to 15 Torr at about 100 sccm takes over a minute.
    run(s, 110)
    expect(s.chamber.pressure).toBeGreaterThan(11)
    expect(s.chamber.pressure).toBeLessThan(20)

    match(s)
    act(s, { type: 'genPower', on: true }, { type: 'genStandby', on: true }, { type: 'genSetpoint', value: 500 }, { type: 'genRun', on: true })
    run(s, 10)
    expect(s.plasma.lit).toBe(true)

    // ramp in steps, retuning
    for (const [p, w] of [[20, 550], [30, 650], [45, 700]] as [number, number][]) {
      act(s, { type: 'pressureSetpoint', value: p }, { type: 'genSetpoint', value: w })
      run(s, 30)
      match(s)
      run(s, 20)
      expect(s.plasma.lit).toBe(true)
    }
    run(s, 600)

    expect(s.windowCracked).toBe(false)
    expect(s.thermal.substrate).toBeGreaterThan(400)
    expect(s.thermal.substrate).toBeLessThan(700)
    expect(s.growth.ternary.C - s.growth.ternary.O).toBeGreaterThan(0)
    expect(s.growth.thickness).toBeGreaterThan(0)
    expect(s.growth.regime).toMatch(/diamond/)
  })
})

describe('safety behaviours', () => {
  it('trips the interlock when cooling water is lost', () => {
    const s = initialState('H2CH4')
    act(s, { type: 'loadSample' }, { type: 'jack', value: 1 }, { type: 'throttleMode', mode: 'open' }, { type: 'pump', on: true })
    run(s, 40)
    act(
      s,
      { type: 'cylinder', gas: 'H2', open: true },
      { type: 'panelValve', gas: 'H2', open: true },
      { type: 'mfcChannel', gas: 'H2', on: true },
      { type: 'mfcSetpoint', gas: 'H2', value: 300 },
      { type: 'throttleMode', mode: 'auto' },
      { type: 'pressureSetpoint', value: 20 },
    )
    run(s, 60)
    match(s)
    act(s, { type: 'genPower', on: true }, { type: 'genStandby', on: true }, { type: 'genSetpoint', value: 750 }, { type: 'genRun', on: true })
    run(s, 10)
    expect(s.plasma.lit).toBe(true)

    act(s, { type: 'utility', key: 'coolingWater', on: false })
    run(s, 2)
    expect(s.interlocks.tripped).toBe(true)
    expect(s.plasma.lit).toBe(false)
    expect(s.generator.running).toBe(false)
  })

  it('will not seal or pump down with the jack part raised', () => {
    const s = initialState('H2CH4')
    act(s, { type: 'jack', value: 0.8 }, { type: 'throttleMode', mode: 'open' }, { type: 'pump', on: true })
    run(s, 60)
    expect(s.chamber.sealed).toBe(false)
    expect(s.chamber.pressure).toBeGreaterThan(700)
  })

  it('cracks the quartz window if the ball rides high', () => {
    const s = initialState('H2CH4')
    act(s, { type: 'loadSample' }, { type: 'jack', value: 1 }, { type: 'throttleMode', mode: 'open' }, { type: 'pump', on: true })
    run(s, 40)
    act(
      s,
      { type: 'cylinder', gas: 'H2', open: true },
      { type: 'panelValve', gas: 'H2', open: true },
      { type: 'mfcChannel', gas: 'H2', on: true },
      { type: 'mfcSetpoint', gas: 'H2', value: 300 },
      { type: 'throttleMode', mode: 'auto' },
      { type: 'pressureSetpoint', value: 18 },
    )
    run(s, 60)
    match(s)
    act(s, { type: 'genPower', on: true }, { type: 'genStandby', on: true }, { type: 'genSetpoint', value: 700 }, { type: 'genRun', on: true })
    run(s, 10)
    expect(s.plasma.lit).toBe(true)
    // now do the wrong thing: drop pressure hard while winding power up
    act(s, { type: 'pressureSetpoint', value: 6 }, { type: 'genSetpoint', value: 2000 })
    run(s, 120)
    expect(s.windowCracked).toBe(true)
  })
})


describe('venting and opening up', () => {
  it('cannot move the jack under vacuum, but can after venting', () => {
    const s = initialState('CO2CH4')
    act(s, { type: 'loadSample' }, { type: 'jack', value: 1 }, { type: 'throttleMode', mode: 'open' }, { type: 'pump', on: true })
    run(s, 60)
    expect(s.chamber.pressure).toBeLessThan(1)

    // jack refuses while evacuated
    act(s, { type: 'jack', value: 0 })
    expect(s.chamber.jack).toBe(1)

    // stop the pump and vent
    act(s, { type: 'pump', on: false }, { type: 'vent', open: true })
    run(s, 40)
    expect(s.chamber.pressure).toBeGreaterThan(750)

    // now it moves
    act(s, { type: 'jack', value: 0 })
    expect(s.chamber.jack).toBe(0)
    act(s, { type: 'loadSample' })
    expect(s.chamber.sampleLoaded).toBe(false)
  })

  it('will not vent while the microwave is running', () => {
    const s = initialState('H2CH4')
    act(s, { type: 'loadSample' }, { type: 'jack', value: 1 }, { type: 'throttleMode', mode: 'open' }, { type: 'pump', on: true })
    run(s, 40)
    act(
      s,
      { type: 'cylinder', gas: 'H2', open: true },
      { type: 'panelValve', gas: 'H2', open: true },
      { type: 'mfcChannel', gas: 'H2', on: true },
      { type: 'mfcSetpoint', gas: 'H2', value: 300 },
      { type: 'throttleMode', mode: 'auto' },
      { type: 'pressureSetpoint', value: 20 },
    )
    run(s, 60)
    match(s)
    act(s, { type: 'genPower', on: true }, { type: 'genStandby', on: true }, { type: 'genSetpoint', value: 800 }, { type: 'genRun', on: true })
    run(s, 10)
    expect(s.plasma.lit).toBe(true)
    act(s, { type: 'vent', open: true })
    expect(s.chamber.ventOpen).toBe(false)
  })
})

describe('chemistry difficulty', () => {
  it('CO2/CH4 needs less power to strike than H2/CH4', () => {
    const co2 = initialState('CO2CH4')
    act(co2, { type: 'loadSample' }, { type: 'jack', value: 1 }, { type: 'throttleMode', mode: 'open' }, { type: 'pump', on: true })
    run(co2, 40)
    act(
      co2,
      { type: 'cylinder', gas: 'CH4', open: true }, { type: 'panelValve', gas: 'CH4', open: true },
      { type: 'mfcChannel', gas: 'CH4', on: true }, { type: 'mfcSetpoint', gas: 'CH4', value: 52 },
      { type: 'cylinder', gas: 'CO2', open: true }, { type: 'panelValve', gas: 'CO2', open: true },
      { type: 'mfcChannel', gas: 'CO2', on: true }, { type: 'mfcSetpoint', gas: 'CO2', value: 48 },
      { type: 'throttleMode', mode: 'auto' }, { type: 'pressureSetpoint', value: 15 },
    )
    run(co2, 110)

    const h2 = initialState('H2CH4')
    act(h2, { type: 'loadSample' }, { type: 'jack', value: 1 }, { type: 'throttleMode', mode: 'open' }, { type: 'pump', on: true })
    run(h2, 40)
    act(
      h2,
      { type: 'cylinder', gas: 'H2', open: true }, { type: 'panelValve', gas: 'H2', open: true },
      { type: 'mfcChannel', gas: 'H2', on: true }, { type: 'mfcSetpoint', gas: 'H2', value: 300 },
      { type: 'throttleMode', mode: 'auto' }, { type: 'pressureSetpoint', value: 15 },
    )
    run(h2, 110)

    expect(ignitionThreshold(co2)).toBeLessThan(ignitionThreshold(h2))
  })
})

describe('coaching', () => {
  it('offers a remedy after three blocked attempts at the same thing', () => {
    const s = initialState('CO2CH4')
    act(s, { type: 'loadSample' }, { type: 'jack', value: 1 }, { type: 'throttleMode', mode: 'open' }, { type: 'pump', on: true })
    run(s, 60)
    for (let i = 0; i < 3; i++) act(s, { type: 'jack', value: 0 })
    const hints = s.log.filter((l) => l.kind === 'hint')
    expect(hints.length).toBeGreaterThan(0)
    expect(hints.some((h) => /vent/i.test(h.text))).toBe(true)
  })
})
