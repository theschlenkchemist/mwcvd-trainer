import { GASES, GAS_IDS, type GasId } from './gases'
import {
  CAVITY,
  THERMAL,
  absorbedPower,
  ballGeometry,
  growthVerdict,
  heatLoss,
  heatingFraction,
  ignitionDrive,
  ignitionThreshold,
  optimumTuning,
  plasmaColour,
  pyrometerReading,
  reflectionCoefficient,
  sustainThreshold,
  ternary,
  totalFlow,
  windowClearance,
} from './physics'
import type { FaultMode, LogEntry, SimState, ThrottleMode } from './types'

export function log(s: SimState, kind: LogEntry['kind'], text: string) {
  s.log.push({ t: s.t, kind, text })
  if (s.log.length > 400) s.log.shift()
}

/** Number of times something must go wrong before the trainer offers the answer. */
export const HINT_THRESHOLD = 3

/**
 * Log a blocked or failed action. The message is shown every time, but the
 * remedy is withheld until the trainee has run into the same wall
 * HINT_THRESHOLD times. The idea is to let people work it out, then help.
 */
export function note(s: SimState, reason: string, message: string, remedy: string) {
  const n = (s.stuck.attempts[reason] ?? 0) + 1
  s.stuck.attempts[reason] = n
  log(s, 'warning', message)
  if (n >= HINT_THRESHOLD && !s.stuck.hinted.includes(reason)) {
    s.stuck.hinted.push(reason)
    log(s, 'hint', `Stuck? ${remedy}`)
  }
}

/** Offer a remedy once, without needing repeated failures. */
export function hintOnce(s: SimState, reason: string, remedy: string) {
  if (s.stuck.hinted.includes(reason)) return
  s.stuck.hinted.push(reason)
  log(s, 'hint', `Stuck? ${remedy}`)
}

// ---------------------------------------------------------------------------
// Actions. Everything the operator can do goes through here so it can be
// logged and later replayed or assessed.
// ---------------------------------------------------------------------------
export type Action =
  | { type: 'jack'; value: number }
  | { type: 'vent'; open: boolean }
  | { type: 'faultMode'; mode: FaultMode }
  | { type: 'loadSample' }
  | { type: 'pump'; on: boolean }
  | { type: 'throttleMode'; mode: ThrottleMode }
  | { type: 'pressureSetpoint'; value: number }
  | { type: 'cylinder'; gas: GasId; open: boolean }
  | { type: 'panelValve'; gas: GasId; open: boolean }
  | { type: 'mfcChannel'; gas: GasId; on: boolean }
  | { type: 'mfcSetpoint'; gas: GasId; value: number }
  | { type: 'genPower'; on: boolean }
  | { type: 'genStandby'; on: boolean }
  | { type: 'genRun'; on: boolean }
  | { type: 'genSetpoint'; value: number }
  | { type: 'tuner'; key: 'stub1' | 'stub2' | 'slidingShort'; value: number }
  | { type: 'emissivity'; value: number }
  | { type: 'autoTune' }
  | { type: 'resetInterlock' }
  | { type: 'speed'; value: number }
  | { type: 'utility'; key: 'mains' | 'coolingWater' | 'extraction'; on: boolean }

export function apply(s: SimState, a: Action) {
  switch (a.type) {
    case 'jack': {
      if (s.chamber.pressure < 700) {
        note(
          s,
          'jack_locked',
          'Jack will not move. Atmospheric pressure is clamping the base flange against the cavity with a force of well over a hundred kilograms.',
          'Vent the chamber to atmosphere first. Stop the pump, then open the vent valve and wait for the pressure to reach 760 Torr.',
        )
        return
      }
      if (s.generator.running) {
        note(s, 'jack_live', 'Jack refused. The microwave generator is still running.', 'Press STOP on the generator before opening the chamber.')
        return
      }
      s.chamber.jack = a.value
      s.chamber.sealed = a.value >= 0.98
      if (a.value >= 0.99) log(s, 'action', 'Jack raised fully. Base flange seated against the cavity.')
      else if (a.value <= 0.01) log(s, 'action', 'Jack lowered. Base flange clear for sample change.')
      break
    }
    case 'loadSample': {
      if (s.chamber.jack > 0.05) {
        note(s, 'sample_jack_up', 'Cannot reach the stage with the chamber closed.', 'Lower the jack fully before loading or removing a substrate.')
        return
      }
      s.chamber.sampleLoaded = !s.chamber.sampleLoaded
      log(s, 'action', s.chamber.sampleLoaded ? 'Substrate placed on the stage.' : 'Substrate removed.')
      break
    }
    case 'vent': {
      if (a.open && s.generator.running) {
        note(s, 'vent_live', 'Vent refused. The microwave is still on.', 'Take the generator to STOP before venting.')
        return
      }
      if (a.open && s.pumpOn) {
        log(s, 'warning', 'Venting with the pump still running. Stop the pump, you are pushing air straight through it.')
      }
      s.chamber.ventOpen = a.open
      log(s, 'action', a.open ? 'Vent valve opened. Chamber backfilling to atmosphere.' : 'Vent valve closed.')
      break
    }
    case 'faultMode': {
      s.faultMode = a.mode
      s.nextFaultCheck = s.t + 45
      log(s, 'action', `Fault injection set to ${a.mode}.`)
      break
    }
    case 'pump': {
      if (a.on && s.chamber.ventOpen) {
        note(s, 'pump_vented', 'Pump started with the vent still open.', 'Close the vent valve, otherwise you will never pull a vacuum.')
      }
      s.pumpOn = a.on
      log(s, 'action', a.on ? 'Rotary pump started.' : 'Rotary pump stopped.')
      break
    }
    case 'throttleMode': {
      s.throttleMode = a.mode
      log(s, 'action', `Exhaust valve set to ${a.mode.toUpperCase()}.`)
      break
    }
    case 'pressureSetpoint': {
      s.pressureSetpoint = a.value
      log(s, 'action', `Pressure setpoint ${a.value.toFixed(0)} Torr.`)
      break
    }
    case 'cylinder': {
      s.cylinders[a.gas].valveOpen = a.open
      log(s, 'action', `${GASES[a.gas].label} cylinder valve ${a.open ? 'opened' : 'closed'}.`)
      break
    }
    case 'panelValve': {
      s.panelValves[a.gas] = a.open
      log(s, 'action', `${GASES[a.gas].label} panel isolation valve ${a.open ? 'ON' : 'OFF'}.`)
      break
    }
    case 'mfcChannel': {
      s.mfc[a.gas].channelOn = a.on
      log(s, 'action', `647C channel ${GASES[a.gas].channel} (${GASES[a.gas].label}) ${a.on ? 'on' : 'off'}.`)
      break
    }
    case 'mfcSetpoint': {
      s.mfc[a.gas].setpoint = Math.max(0, Math.min(GASES[a.gas].fullScale, a.value))
      break
    }
    case 'genPower': {
      s.generator.poweredUp = a.on
      if (!a.on) {
        s.generator.standby = false
        s.generator.running = false
      }
      log(s, 'action', `Microwave generator rack power ${a.on ? 'on' : 'off'}.`)
      break
    }
    case 'genStandby': {
      if (!s.generator.poweredUp) return
      s.generator.standby = a.on
      log(s, 'action', `Generator ${a.on ? 'in standby, magnetron filament warming' : 'out of standby'}.`)
      break
    }
    case 'genRun': {
      if (a.on) {
        if (!s.generator.standby) {
          note(s, 'start_no_standby', 'Generator refused START.', 'Press STAND BY first, then START. The magnetron filament has to warm before power can be applied.')
          return
        }
        if (s.interlocks.tripped) {
          note(
            s,
            'start_interlocked',
            `START blocked by interlock: ${s.interlocks.trippedBy}.`,
            'Clear the condition that tripped the chain, then press Reset chain in the Services panel before trying START again.',
          )
          return
        }
        if (s.generator.setpoint < 50) {
          note(s, 'start_no_power', 'START pressed with the power setpoint at zero.', 'Set a power setpoint before pressing START. Around 700 W is a sensible strike value.')
          return
        }
        s.stuck.strikeAttemptStarted = s.t
        s.generator.running = true
        log(s, 'action', 'Microwave power ON.')
      } else {
        s.generator.running = false
        log(s, 'action', 'Microwave power OFF.')
      }
      break
    }
    case 'genSetpoint': {
      s.generator.setpoint = Math.max(0, Math.min(2000, a.value))
      break
    }
    case 'tuner': {
      s.tuner[a.key] = Math.max(0, Math.min(1, a.value))
      break
    }
    case 'emissivity': {
      s.thermal.pyrometerEmissivity = Math.max(0.05, Math.min(1, a.value))
      log(s, 'action', `Pyrometer emissivity set to ${s.thermal.pyrometerEmissivity.toFixed(2)}.`)
      break
    }
    case 'autoTune': {
      // Training aid, not present on the real rig. Nudges the stubs toward match.
      const opt = optimumTuning(s.chamber.pressure, s.plasma.lit)
      s.tuner.stub1 += (opt.stub1 - s.tuner.stub1) * 0.6
      s.tuner.stub2 += (opt.stub2 - s.tuner.stub2) * 0.6
      s.tuner.slidingShort += (opt.slidingShort - s.tuner.slidingShort) * 0.6
      log(s, 'action', 'Assisted tune applied.')
      break
    }
    case 'resetInterlock': {
      if (s.utilities.coolingWater && s.utilities.extraction && s.utilities.mains) {
        s.interlocks.tripped = false
        s.interlocks.trippedBy = null
        log(s, 'ok', 'Interlock chain reset.')
      } else {
        log(s, 'warning', 'Reset refused. The originating condition is still present.')
      }
      break
    }
    case 'speed': {
      s.speed = a.value
      break
    }
    case 'utility': {
      s.utilities[a.key] = a.on
      log(s, a.on ? 'ok' : 'alarm', `${a.key} ${a.on ? 'restored' : 'lost'}.`)
      break
    }
  }
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------
export function tick(s: SimState, dt: number) {
  s.t += dt

  // --- utilities -----------------------------------------------------------
  if (!s.utilities.mains) {
    s.generator.poweredUp = false
    s.generator.standby = false
    s.generator.running = false
    s.pumpOn = false
  }
  s.utilities.waterFlow = s.utilities.coolingWater ? 3.1 : 0

  // --- gas delivery --------------------------------------------------------
  for (const g of GAS_IDS) {
    const m = s.mfc[g]
    const supplied =
      s.cylinders[g].valveOpen && s.cylinders[g].contents > 0.001 && s.panelValves[g] && m.channelOn
    const target = supplied ? m.setpoint : 0
    // First order lag, roughly 1.5 s time constant on these MFCs.
    m.actual += (target - m.actual) * Math.min(1, dt / 1.5)
    if (m.actual < 0.02) m.actual = 0
    if (supplied) {
      s.cylinders[g].contents = Math.max(0, s.cylinders[g].contents - (m.actual * dt) / 4.0e6)
    }
  }

  // --- chamber seal and pressure ------------------------------------------
  const closed = s.chamber.jack >= 0.98
  s.chamber.sealed = closed
  s.interlocks.chamberClosedOk = closed && s.chamber.pressure < 100

  const Q = totalFlow(s) // sccm true
  const V = CAVITY.chamberVolume

  if (!closed || s.chamber.ventOpen) {
    // Either the flange is not seated, or the vent is open to atmosphere.
    // Backfilling is quick but not instant.
    const tau = closed ? 6 : 3
    s.chamber.pressure += (760 - s.chamber.pressure) * Math.min(1, dt / tau)
    if (s.chamber.pressure > 758) s.chamber.pressure = 760
    s.throttlePosition += ((s.throttleMode === 'open' ? 1 : 0) - s.throttlePosition) * Math.min(1, dt / 1.5)
  } else {
    // Throttle position
    if (s.throttleMode === 'closed') s.throttlePosition += (0 - s.throttlePosition) * Math.min(1, dt / 1.5)
    else if (s.throttleMode === 'open') s.throttlePosition += (1 - s.throttlePosition) * Math.min(1, dt / 1.5)
    else {
      // Closed loop on the butterfly. Gain scaled by setpoint so the loop
      // settles at a similar rate whether you are at 10 Torr or 60.
      const err = s.chamber.pressure - s.pressureSetpoint
      const gain = 0.09 / Math.max(4, s.pressureSetpoint)
      s.throttlePosition = Math.max(0, Math.min(1, s.throttlePosition + err * gain * dt))
    }

    const S = s.pumpOn ? 6.0 * s.throttlePosition + 0.02 : 0 // effective pumping speed, litres per second
    const inflow = (Q / 60) * (760 / 1000) // Torr litre per second, sccm to Torr L/s
    const leak = s.chamber.leakRate
    const dp = (inflow + leak - S * s.chamber.pressure) / V
    s.chamber.pressure = Math.max(CAVITY.basePressure, s.chamber.pressure + dp * dt)
    if (!s.pumpOn && Q === 0) {
      s.chamber.pressure += (leak / V) * dt
    }
  }

  // --- microwave -----------------------------------------------------------
  const targetFwd = s.generator.running && s.generator.poweredUp && !s.interlocks.tripped ? s.generator.setpoint : 0
  s.generator.forward += (targetFwd - s.generator.forward) * Math.min(1, dt / 0.8)
  if (s.generator.forward < 1) s.generator.forward = 0
  const rc = reflectionCoefficient(s)
  s.generator.reflected = s.generator.forward * rc

  // --- ignition and sustain ------------------------------------------------
  const Pabs = absorbedPower(s)
  const hasGas = Q > 0.5
  if (!s.plasma.lit) {
    if (hasGas && s.generator.forward > 0 && ignitionDrive(s) > ignitionThreshold(s) && closed) {
      s.plasma.lit = true
      s.plasma.litSince = s.t
      log(s, 'ok', `Plasma struck at ${s.chamber.pressure.toFixed(1)} Torr, ${s.generator.forward.toFixed(0)} W forward.`)
    }
  } else {
    if (!hasGas || Pabs < sustainThreshold(s) || !closed || s.generator.forward === 0) {
      s.plasma.lit = false
      log(s, 'warning', 'Plasma extinguished.')
    }
  }

  // --- plasma geometry, colour, stability ---------------------------------
  if (s.plasma.lit) {
    const g = ballGeometry(s)
    s.plasma.ballRadius = g.radius
    s.plasma.ballCentreHeight = g.centre
    s.plasma.colour = plasmaColour(s)
    const margin = Math.max(0, Math.min(1, (Pabs - sustainThreshold(s)) / 400))
    const tune = 1 - Math.min(1, rc * 6)
    s.plasma.stability = Math.max(0, Math.min(1, 0.35 + 0.35 * margin + 0.30 * tune))
  } else {
    s.plasma.ballRadius = 0
    s.plasma.stability = 0
  }

  // --- quartz window -------------------------------------------------------
  if (s.plasma.lit) {
    const clearance = windowClearance(s)
    if (clearance < CAVITY.windowSafeMargin) {
      const severity = (CAVITY.windowSafeMargin - clearance) / CAVITY.windowSafeMargin
      s.windowHealth -= severity * 0.012 * dt
      if (s.windowHealth < 0.75 && s.windowHealth + severity * 0.012 * dt >= 0.75) {
        log(s, 'warning', 'Plasma ball is riding high toward the quartz window. Raise pressure or drop power.')
      }
      if (s.windowHealth <= 0 && !s.windowCracked) {
        s.windowCracked = true
        s.generator.running = false
        s.plasma.lit = false
        s.score.violations.push('Quartz window cracked')
        log(s, 'alarm', 'QUARTZ WINDOW CRACKED. Run aborted. Chamber vented to atmosphere through the fracture.')
      }
    }
  }

  // --- thermal -------------------------------------------------------------
  const heatIn = s.plasma.lit ? Pabs * heatingFraction(s) : 0
  const heatOut = heatLoss(s.thermal.substrate, s.utilities.coolingWater)
  s.thermal.substrate += ((heatIn - heatOut) / THERMAL.heatCapacity) * dt
  s.thermal.substrate = Math.max(15, s.thermal.substrate)
  s.thermal.stage = THERMAL.coolantTemp + (s.thermal.substrate - THERMAL.coolantTemp) * 0.35
  s.thermal.pyrometerReading = pyrometerReading(
    s.thermal.substrate,
    s.thermal.pyrometerEmissivity,
    s.thermal.trueEmissivity,
  )

  // --- interlocks ----------------------------------------------------------
  s.interlocks.waterFlowOk = s.utilities.waterFlow > 1.5
  s.interlocks.reflectedPowerOk = s.generator.reflected < s.generator.rpLimit
  s.interlocks.extractionOk = s.utilities.extraction
  s.interlocks.overTemperatureOk = s.thermal.substrate < 1150

  const chain: [boolean, string][] = [
    [s.interlocks.waterFlowOk, 'cooling water flow'],
    [s.interlocks.reflectedPowerOk, 'reflected power limit'],
    [s.interlocks.extractionOk, 'extraction'],
    [s.interlocks.overTemperatureOk, 'stage over temperature'],
  ]
  for (const [ok, name] of chain) {
    if (!ok && !s.interlocks.tripped) {
      s.interlocks.tripped = true
      s.interlocks.trippedBy = name
      s.generator.running = false
      s.plasma.lit = false
      log(s, 'alarm', `INTERLOCK TRIP: ${name}. Microwave power removed.`)
    }
  }

  // --- growth --------------------------------------------------------------
  s.growth.ternary = ternary(s)
  const v = growthVerdict(s)
  s.growth.regime = s.plasma.lit ? v.regime : 'idle'
  if (s.plasma.lit && v.rate > 0) {
    s.growth.elapsed += dt
    s.growth.thickness += (v.rate / 3600) * dt
    s.growth.quality += (v.quality - s.growth.quality) * Math.min(1, dt / 30)
  }

  // --- envelope monitoring for the debrief --------------------------------
  if (s.generator.reflected > 150 && s.generator.forward > 0) {
    s.score.timeOutsideEnvelope += dt
  }

  // --- stuck detection -----------------------------------------------------
  updateStuck(s, dt)

  // --- random fault injection ---------------------------------------------
  if (s.faultMode === 'random' && s.t > s.nextFaultCheck) {
    s.nextFaultCheck = s.t + 60 + Math.random() * 120
    // Only fire once per session, and only once the rig is actually doing
    // something, so the trainee is not ambushed on a cold reactor.
    const alreadyFired = s.faults.some((f) => f.firedAt !== null)
    const engaged = s.pumpOn && s.chamber.sealed
    if (!alreadyFired && engaged && Math.random() < s.faultChance) {
      maybeFireRandomFault(s)
    }
  }
}

/** Set by faults.ts at import time to avoid a circular import. */
export let maybeFireRandomFault: (s: SimState) => void = () => {}
export function setRandomFaultHandler(fn: (s: SimState) => void) {
  maybeFireRandomFault = fn
}

/**
 * Watches for the classic places people get stuck and offers a way forward.
 * Two triggers: sitting on the same procedure step for a long time, and
 * applying microwave power for a while without the discharge lighting.
 */
function updateStuck(s: SimState, dt: number) {
  // Failed strike: power applied, no plasma, for long enough to be deliberate.
  if (s.stuck.strikeAttemptStarted !== null) {
    if (s.plasma.lit) {
      s.stuck.strikeAttemptStarted = null
      s.stuck.attempts['no_strike'] = 0
    } else if (!s.generator.running) {
      const held = s.t - s.stuck.strikeAttemptStarted
      s.stuck.strikeAttemptStarted = null
      if (held > 4) {
        const n = (s.stuck.attempts['no_strike'] ?? 0) + 1
        s.stuck.attempts['no_strike'] = n
        if (n >= HINT_THRESHOLD && !s.stuck.hinted.includes('no_strike')) {
          s.stuck.hinted.push('no_strike')
          log(
            s,
            'hint',
            `Stuck? Three failed strikes. Check in this order: is gas actually flowing (cylinder, panel valve and channel all on), is the pressure in the 10 to 20 Torr window, and is the reflected power low before you press START. An unlit cavity reflects most of the power, so the tuners matter more at strike than at any other time.`,
          )
        }
      }
    } else if (s.t - s.stuck.strikeAttemptStarted > 25) {
      hintOnce(
        s,
        'long_strike',
        'You have held power into an unlit cavity for 25 seconds. Press STOP. Sitting at high forward power with high reflected power stresses the magnetron and will not make it light. Drop the pressure a few Torr, retune, and try again.',
      )
      s.stuck.strikeAttemptStarted = s.t
    }
  }
}
