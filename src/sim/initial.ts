import { GAS_IDS, type GasId } from './gases'
import type { CylinderState, MfcState, SimState, Recipe } from './types'

function cylinders(): Record<GasId, CylinderState> {
  const o = {} as Record<GasId, CylinderState>
  for (const g of GAS_IDS) o[g] = { valveOpen: false, contents: 1 }
  return o
}

function valves(): Record<GasId, boolean> {
  const o = {} as Record<GasId, boolean>
  for (const g of GAS_IDS) o[g] = false
  return o
}

function mfcs(): Record<GasId, MfcState> {
  const o = {} as Record<GasId, MfcState>
  for (const g of GAS_IDS) o[g] = { setpoint: 0, actual: 0, channelOn: false }
  return o
}

export function initialState(recipe: Recipe = 'CO2CH4'): SimState {
  return {
    t: 0,
    running: true,
    speed: 1,
    recipe,

    utilities: { mains: true, coolingWater: true, waterFlow: 3.1, extraction: true },
    cylinders: cylinders(),
    panelValves: valves(),
    mfc: mfcs(),

    pumpOn: false,
    throttleMode: 'closed',
    throttlePosition: 0,
    pressureSetpoint: 20,

    chamber: {
      jack: 0,
      sealed: false,
      pressure: 760,
      leakRate: 0,
      sampleLoaded: false,
      ventOpen: false,
    },

    generator: {
      poweredUp: false,
      standby: false,
      running: false,
      setpoint: 0,
      forward: 0,
      reflected: 0,
      rpLimit: 1000,
    },

    tuner: { stub1: 0.5, stub2: 0.5, slidingShort: 0.5 },

    plasma: {
      lit: false,
      ballRadius: 0,
      ballCentreHeight: 0,
      colour: [255, 255, 255],
      stability: 0,
      litSince: 0,
    },

    thermal: {
      substrate: 20,
      stage: 20,
      pyrometerEmissivity: 0.19,
      pyrometerReading: 0,
      trueEmissivity: 0.19,
    },

    growth: { elapsed: 0, thickness: 0, quality: 0, regime: 'idle', ternary: { C: 0, H: 0, O: 0 } },

    interlocks: {
      waterFlowOk: true,
      reflectedPowerOk: true,
      chamberClosedOk: false,
      extractionOk: true,
      overTemperatureOk: true,
      tripped: false,
      trippedBy: null,
    },

    windowHealth: 1,
    windowCracked: false,

    faultMode: 'manual',
    faultChance: 0.55,
    nextFaultCheck: 45,
    faults: [],
    stuck: { attempts: {}, hinted: [], currentStep: '', timeOnStep: 0, strikeAttemptStarted: null },
    log: [{ t: 0, kind: 'ok', text: 'Session started. Rig cold, chamber at atmosphere.' }],
    score: { stepsCompleted: [], violations: [], timeOutsideEnvelope: 0 },
  }
}
