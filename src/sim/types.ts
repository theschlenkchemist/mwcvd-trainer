import type { GasId } from './gases'

export type ThrottleMode = 'closed' | 'open' | 'auto'
export type Recipe = 'H2CH4' | 'CO2CH4'

export interface Utilities {
  mains: boolean
  coolingWater: boolean
  waterFlow: number // litres per minute
  extraction: boolean
}

export interface CylinderState {
  valveOpen: boolean // cylinder head valve
  contents: number // fraction remaining, 0 to 1
}

export interface MfcState {
  setpoint: number // sccm, indicated
  actual: number // sccm, indicated
  channelOn: boolean
}

export interface GeneratorState {
  poweredUp: boolean // rack power on
  standby: boolean // STAND BY lamp
  running: boolean // MW ON
  setpoint: number // watts requested
  forward: number // watts
  reflected: number // watts
  rpLimit: number // watts, trip threshold
}

export interface TunerState {
  stub1: number // 0 to 1, normalised penetration
  stub2: number
  slidingShort: number
}

export interface PlasmaState {
  lit: boolean
  ballRadius: number // mm
  ballCentreHeight: number // mm above the substrate surface
  colour: [number, number, number]
  stability: number // 0 to 1
  litSince: number // sim seconds
}

export interface ChamberState {
  jack: number // 0 = fully lowered, 1 = fully raised and closed
  sealed: boolean
  pressure: number // Torr
  leakRate: number // Torr litre per second, virtual leak
  sampleLoaded: boolean
  ventOpen: boolean // manual vent to atmosphere
}

export interface ThermalState {
  substrate: number // true substrate temperature, deg C
  stage: number // deg C
  pyrometerEmissivity: number // as set on the Thermopoint
  pyrometerReading: number // deg C, what the operator sees
  trueEmissivity: number
}

export interface GrowthState {
  elapsed: number // seconds of growth accumulated
  thickness: number // micrometres
  quality: number // 0 to 1 running average
  regime: string
  ternary: { C: number; H: number; O: number }
}

export interface InterlockState {
  waterFlowOk: boolean
  reflectedPowerOk: boolean
  chamberClosedOk: boolean
  extractionOk: boolean
  overTemperatureOk: boolean
  tripped: boolean
  trippedBy: string | null
}

export type FaultMode = 'off' | 'manual' | 'random'

export type FaultId =
  | 'none'
  | 'no_strike'
  | 'cylinder_empty'
  | 'mains_loss'
  | 'water_loss'
  | 'arcing'
  | 'chamber_leak'
  | 'mfc_stuck'

export interface ActiveFault {
  id: FaultId
  label: string
  armedAt: number
  firedAt: number | null
  target?: GasId
  acknowledged: boolean
}

export interface LogEntry {
  t: number
  kind: 'action' | 'event' | 'warning' | 'alarm' | 'ok' | 'hint'
  text: string
}

/** Tracks repeated failures so the trainer can offer help when someone is stuck. */
export interface StuckState {
  /** Count of blocked or failed attempts, keyed by a reason string. */
  attempts: Record<string, number>
  /** Reasons a hint has already been given for, so it is not repeated. */
  hinted: string[]
  /** Procedure step the trainee is currently on, and how long they have been there. */
  currentStep: string
  timeOnStep: number
  /** True while microwave power is applied but the discharge has not lit. */
  strikeAttemptStarted: number | null
}

export interface SimState {
  t: number // simulation seconds
  running: boolean
  speed: number
  recipe: Recipe

  utilities: Utilities
  cylinders: Record<GasId, CylinderState>
  panelValves: Record<GasId, boolean> // manual isolation valve on the gas panel
  mfc: Record<GasId, MfcState>

  pumpOn: boolean
  throttleMode: ThrottleMode
  throttlePosition: number // 0 closed, 1 open
  pressureSetpoint: number // Torr

  chamber: ChamberState
  generator: GeneratorState
  tuner: TunerState
  plasma: PlasmaState
  thermal: ThermalState
  growth: GrowthState
  interlocks: InterlockState

  windowHealth: number // 1 = pristine, 0 = cracked
  windowCracked: boolean

  faultMode: FaultMode
  faultChance: number // expected faults per run when in random mode, 0 to 1
  nextFaultCheck: number
  faults: ActiveFault[]
  stuck: StuckState
  log: LogEntry[]
  score: {
    stepsCompleted: string[]
    violations: string[]
    timeOutsideEnvelope: number
  }
}
