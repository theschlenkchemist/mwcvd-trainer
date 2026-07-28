import { log, setRandomFaultHandler } from './engine'
import type { FaultId, SimState } from './types'
import type { GasId } from './gases'

export interface FaultSpec {
  id: FaultId
  label: string
  symptom: string
  correctResponse: string
  /** Relative likelihood when faults are fired at random. */
  weight: number
  /** Only offered at random when this returns true. */
  plausible?: (s: SimState) => boolean
  apply: (s: SimState) => void
}

export const FAULTS: FaultSpec[] = [
  {
    id: 'no_strike',
    weight: 3,
    plausible: (s) => !s.plasma.lit,
    label: 'Plasma will not strike',
    symptom: 'Forward power applied, reflected power high, no glow in the viewport.',
    correctResponse:
      'Do not wind the power up. Drop the pressure toward 10 to 12 Torr, re-check gas flows are actually reaching the chamber, reposition the stubs, and try again. Stop applying power into a mismatched cavity.',
    apply: (s) => {
      log(s, 'event', 'The discharge is refusing to light.')
    },
  },
  {
    id: 'cylinder_empty',
    weight: 3,
    plausible: (s) => s.plasma.lit,
    label: 'Cylinder runs empty',
    symptom:
      'One channel on the 647C shows a flow error, the indicated actual falls away from setpoint, and the plasma colour shifts.',
    correctResponse:
      'Recognise the chemistry has changed. In CO2/CH4 losing either component takes you straight off the tie line, so the film is ruined. Take the microwave down cleanly rather than continuing.',
    apply: (s) => {
      const candidates: GasId[] = (['CH4', 'CO2', 'H2'] as GasId[]).filter((g) => s.mfc[g].actual > 1)
      const g = candidates[Math.floor(Math.random() * candidates.length)] ?? 'CH4'
      s.cylinders[g].contents = 0
      log(s, 'alarm', `${g} supply has failed. Channel showing flow error.`)
    },
  },
  {
    id: 'mains_loss',
    weight: 1,
    label: 'Mains supply lost',
    symptom: 'Everything goes dark. Generator, pump and controllers all drop out.',
    correctResponse:
      'Do not simply switch everything back on. Establish that the microwave is off and the gases are secured, confirm cooling water, then restart in order: pump, gases, generator.',
    apply: (s) => {
      s.utilities.mains = false
      log(s, 'alarm', 'MAINS SUPPLY LOST.')
    },
  },
  {
    id: 'water_loss',
    weight: 2,
    plausible: (s) => s.plasma.lit,
    label: 'Cooling water lost',
    symptom: 'Water flow drops to zero, interlock trips, stage temperature begins to climb.',
    correctResponse:
      'Confirm the microwave has actually gone off. Do not defeat or bypass the interlock. Let the stage cool under gas flow before touching anything.',
    apply: (s) => {
      s.utilities.coolingWater = false
      log(s, 'alarm', 'COOLING WATER FLOW LOST.')
    },
  },
  {
    id: 'arcing',
    weight: 2,
    plausible: (s) => s.plasma.lit,
    label: 'Arcing in the waveguide',
    symptom: 'Reflected power spikes and jumps around, the plasma flickers, there may be an audible crack.',
    correctResponse:
      'Take the power down immediately. Do not try to tune through it. Investigate before restarting.',
    apply: (s) => {
      log(s, 'alarm', 'Arcing detected. Reflected power unstable.')
    },
  },
  {
    id: 'chamber_leak',
    weight: 2,
    plausible: (s) => s.chamber.pressure < 5 && !s.plasma.lit,
    label: 'Virtual leak on the base seal',
    symptom: 'Pump down stalls, base pressure will not go below about 0.5 Torr, pressure creeps when the pump is valved off.',
    correctResponse:
      'Do not commit process gas. Check the jack is fully raised and the flange is seated, then leak check before proceeding.',
    apply: (s) => {
      s.chamber.leakRate = 0.9
      log(s, 'event', 'Base pressure is not coming down as it should.')
    },
  },
  {
    id: 'mfc_stuck',
    weight: 2,
    plausible: (s) => s.mfc.CO2.channelOn && s.mfc.CO2.actual > 1,
    label: 'MFC stuck at zero',
    symptom: 'A channel shows setpoint but no actual flow, and the total pressure is lower than expected.',
    correctResponse:
      'Cross-check the panel valve and cylinder before blaming the controller. If it truly is the MFC, abandon the run rather than guessing the composition.',
    apply: (s) => {
      s.mfc.CO2.channelOn = false
      log(s, 'event', 'CO2 channel is not responding to setpoint.')
    },
  },
]

export function fireFault(s: SimState, id: FaultId) {
  const spec = FAULTS.find((f) => f.id === id)
  if (!spec) return
  spec.apply(s)
  s.faults.push({ id, label: spec.label, armedAt: s.t, firedAt: s.t, acknowledged: false })
}

export function clearFaults(s: SimState) {
  s.faults = []
  s.chamber.leakRate = 0
  for (const g of Object.keys(s.cylinders) as GasId[]) s.cylinders[g].contents = 1
  log(s, 'ok', 'All injected faults cleared.')
}


/**
 * Pick a fault that makes sense given what the rig is currently doing, weighted
 * so the common ones come up more often. Returns silently if nothing fits.
 */
export function fireRandomFault(s: SimState) {
  const eligible = FAULTS.filter((f) => (f.plausible ? f.plausible(s) : true))
  if (eligible.length === 0) return
  const total = eligible.reduce((a, f) => a + f.weight, 0)
  let roll = Math.random() * total
  for (const f of eligible) {
    roll -= f.weight
    if (roll <= 0) {
      fireFault(s, f.id)
      return
    }
  }
}

// Registered here rather than imported by engine.ts, to keep the module graph acyclic.
setRandomFaultHandler(fireRandomFault)
