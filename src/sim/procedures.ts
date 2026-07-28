import type { Recipe, SimState } from './types'

// ---------------------------------------------------------------------------
// PROVISIONAL PROCEDURES.
// These are a reasoned first pass, not a Bristol SOP. Every setpoint is to be
// confirmed by the Bristol group before this is used for any real training.
// Edit this file and docs/PROCEDURES.md together.
// ---------------------------------------------------------------------------

export interface Step {
  id: string
  title: string
  detail: string
  /** Returns true when the state satisfies this step. */
  done: (s: SimState) => boolean
  /** Optional warning shown if the trainee is about to do this out of order. */
  hint?: string
}

const gasesReady = (s: SimState, list: ('H2' | 'CH4' | 'CO2')[]) =>
  list.every((g) => s.cylinders[g].valveOpen && s.panelValves[g] && s.mfc[g].channelOn)

const common: Step[] = [
  {
    id: 'utilities',
    title: 'Confirm services',
    detail:
      'Cooling water flowing above 1.5 L/min, extraction running, mains healthy. Check the water panel shows a sensible pressure and the reflected power display reads zero.',
    done: (s) => s.utilities.coolingWater && s.utilities.extraction && s.utilities.mains,
    hint: 'In the Services and interlocks panel, make sure Mains, Water and Extraction are all lit green.',
  },
  {
    id: 'load',
    title: 'Load the substrate',
    detail:
      'Lower the jack, place the substrate centrally on the water cooled stage, then raise the jack fully. The jack is used only for sample change. If it is not fully raised the base flange will not seat and the chamber will never pull down.',
    done: (s) => s.chamber.sampleLoaded && s.chamber.jack >= 0.98,
    hint: 'Raise the jack fully. A partly raised jack means no seal, and the vacuum cannot pull the flange closed on its own.',
  },
  {
    id: 'pumpdown',
    title: 'Pump down',
    detail:
      'Exhaust valve to OPEN, start the rotary pump, and pump to base pressure. Watch the rate of fall. A pump down that stalls above about 0.1 Torr means a leak or a badly seated flange.',
    done: (s) => s.pumpOn && s.chamber.pressure < 0.1,
    hint: 'Exhaust valve to OPEN, vent valve CLOSED, then start the rotary pump. If the pressure will not fall, check the jack is fully raised and the vent is shut.',
  },
]

const strikeH2CH4: Step[] = [
  {
    id: 'h2on',
    title: 'Admit hydrogen',
    detail:
      'Open the H2 cylinder, open the panel isolation valve, enable channel 1 and set 300 sccm. Let the flow settle.',
    done: (s) => gasesReady(s, ['H2']) && s.mfc.H2.actual > 250,
  },
  {
    id: 'strikepressure',
    title: 'Set strike pressure',
    detail: 'Exhaust valve to AUTO, pressure setpoint 20 Torr. Wait for the reading to settle.',
    done: (s) => s.throttleMode === 'auto' && s.chamber.pressure > 15 && s.chamber.pressure < 25,
  },
  {
    id: 'genstandby',
    title: 'Generator to standby',
    detail: 'Rack power on, then STAND BY. Allow the magnetron filament to warm.',
    done: (s) => s.generator.poweredUp && s.generator.standby,
  },
  {
    id: 'strike',
    title: 'Strike the plasma',
    detail:
      'Set 700 W, press START. In hydrogen at 20 Torr the discharge should light within a couple of seconds. If it does not, drop to 15 Torr and retune rather than winding the power up.',
    done: (s) => s.plasma.lit,
  },
  {
    id: 'tune',
    title: 'Minimise reflected power',
    detail:
      'Adjust the stubs and the sliding short until reflected power is below about 20 W. Work one control at a time and go back over them, because they interact.',
    done: (s) => s.plasma.lit && s.generator.reflected < 20,
  },
  {
    id: 'ramp',
    title: 'Ramp to run condition',
    detail:
      'Take pressure and power up together in steps of roughly 5 Torr and 50 W, retuning at each step. Target 40 to 60 Torr and 800 to 1000 W. Never raise power far ahead of pressure, or the ball expands upward toward the quartz window.',
    done: (s) => s.plasma.lit && s.chamber.pressure > 38 && s.generator.forward > 750,
  },
  {
    id: 'temp',
    title: 'Confirm substrate temperature',
    detail:
      'Read the pyrometer. Target roughly 750 to 900 degrees C for standard microcrystalline growth. Check the emissivity setting matches the substrate.',
    done: (s) => s.thermal.substrate > 700,
  },
  {
    id: 'ch4',
    title: 'Admit methane',
    detail:
      'Open the CH4 cylinder and panel valve, enable channel 2 and set 3 sccm, giving about 1 percent in hydrogen. The plasma should take on a green cast from the C2 Swan bands.',
    done: (s) => gasesReady(s, ['CH4']) && s.mfc.CH4.actual > 2,
  },
]

const strikeCO2CH4: Step[] = [
  {
    id: 'premix',
    title: 'Establish the CO2 and CH4 flows',
    detail:
      'Open both cylinders and panel valves. Set CH4 to 52 sccm on channel 2 and CO2 to 48 sccm on channel 3. Remember the MFCs are nitrogen calibrated, so the indicated ratio is not the true ratio. The true mixture must sit just on the carbon rich side of the CO tie line, near 51 to 55 percent CH4.',
    done: (s) => gasesReady(s, ['CH4', 'CO2']) && s.mfc.CH4.actual > 20 && s.mfc.CO2.actual > 20,
    hint: 'Each gas needs three things on before it flows: the cylinder valve, the panel isolation valve, and the 647C channel. Check all three columns in the gas panel.',
  },
  {
    id: 'lowstrike',
    title: 'Set the strike pressure',
    detail:
      'Exhaust valve to AUTO, setpoint 15 Torr. This mixture lights more readily than hydrogen: CO2 has a lower ionisation potential and, with no H2 in the gas, none of the dissociation and thermal conduction losses that make a hydrogen discharge so power hungry.',
    done: (s) => s.throttleMode === 'auto' && s.chamber.pressure > 11 && s.chamber.pressure < 20,
    hint: 'Set the exhaust valve to AUTO and the pressure setpoint to 15 Torr, then wait for the reading to settle before applying power.',
  },
  {
    id: 'genstandby2',
    title: 'Generator to standby',
    detail: 'Rack power on, then STAND BY.',
    done: (s) => s.generator.poweredUp && s.generator.standby,
    hint: 'Rack power first, then STAND BY. START will refuse until the generator is in standby.',
  },
  {
    id: 'strike2',
    title: 'Strike the plasma',
    detail:
      'Pre-position the stubs near the unlit match, set 500 W, press START. This mixture should light readily and at noticeably lower power than H2/CH4. If it will not light within about ten seconds, stop, drop a few Torr, retune, and try again rather than winding the power up.',
    done: (s) => s.plasma.lit,
    hint: 'Set the power setpoint to about 500 W, make sure the generator is in STAND BY, then press START.',
  },
  {
    id: 'tune2',
    title: 'Retune immediately',
    detail:
      'The load changes sharply the instant the discharge lights. Bring reflected power under 20 W quickly. In this chemistry the plasma is smaller and less forgiving than hydrogen.',
    done: (s) => s.plasma.lit && s.generator.reflected < 20,
  },
  {
    id: 'ramp2',
    title: 'Ramp to run condition',
    detail:
      'Raise pressure and power together to roughly 40 to 55 Torr and 600 to 800 W. The discharge should be white to blue white from CO band emission. Watch the ball position, because there is no hydrogen buffer and it can sit high.',
    done: (s) => s.plasma.lit && s.chamber.pressure > 38 && s.generator.forward > 550,
    hint: 'Go up in steps of about 5 Torr and 50 W, retuning the stubs each time. Do not raise power ahead of pressure.',
  },
  {
    id: 'temp2',
    title: 'Settle the substrate temperature',
    detail:
      'For the low temperature work aim for roughly 450 to 650 degrees C. Trim with power rather than pressure once the match is good.',
    done: (s) => s.thermal.substrate > 400,
  },
  {
    id: 'ratio',
    title: 'Trim the ratio into the diamond window',
    detail:
      'Check the ternary readout. You want carbon just above oxygen, an excess of a little over one percent atomic. Oxygen rich means you are etching, not growing. Carbon rich means soot.',
    done: (s) => s.growth.ternary.C - s.growth.ternary.O > 0.002 && s.growth.ternary.C - s.growth.ternary.O < 0.05,
  },
]

const shutdown: Step[] = [
  {
    id: 'carbonoff',
    title: 'Close the carbon source',
    detail:
      'Take the hydrocarbon to zero first, and hold the plasma for a short hydrogen or CO2 termination if the recipe calls for it.',
    done: (s) => s.mfc.CH4.actual < 0.5,
  },
  {
    id: 'rampdown',
    title: 'Ramp power and pressure down together',
    detail:
      'Come down in steps the way you went up. Do not simply hit STOP at run condition, and do not drop pressure while leaving power high.',
    done: (s) => !s.plasma.lit || (s.chamber.pressure < 25 && s.generator.forward < 600),
  },
  {
    id: 'mwoff',
    title: 'Microwave off',
    detail: 'STOP, then out of standby, then rack power off.',
    done: (s) => !s.generator.running,
  },
  {
    id: 'cool',
    title: 'Cool under gas flow',
    detail: 'Leave the gas flowing and the cooling water running until the stage is near ambient.',
    done: (s) => s.thermal.substrate < 60,
  },
  {
    id: 'gasoff',
    title: 'Secure the gases',
    detail: 'Channels off, panel valves off, cylinder valves closed. Pump out the lines.',
    done: (s) => !s.panelValves.CH4 && !s.panelValves.CO2 && !s.panelValves.H2,
    hint: 'Turn off the 647C channels, then the panel isolation valves, then the cylinder valves, in that order.',
  },
  {
    id: 'ventup',
    title: 'Vent the chamber',
    detail:
      'Stop the rotary pump, then open the vent valve. The chamber backfills to 760 Torr. Until it does, atmospheric pressure holds the base flange shut with a force of well over a hundred kilograms and the jack will not move.',
    done: (s) => s.chamber.pressure > 750,
    hint: 'Stop the pump first, then open the vent valve in the Vacuum and chamber panel. Wait for the pressure to read 760 Torr.',
  },
  {
    id: 'openup',
    title: 'Lower the jack and recover the sample',
    detail: 'With the chamber at atmosphere, lower the jack fully and lift the substrate off the stage.',
    done: (s) => s.chamber.jack < 0.05,
    hint: 'The jack only moves once the chamber is at atmospheric pressure. If it refuses, check the vent is open and the pressure has reached 760 Torr.',
  },
]

export function procedureFor(recipe: Recipe): Step[] {
  return recipe === 'CO2CH4'
    ? [...common, ...strikeCO2CH4, ...shutdown]
    : [...common, ...strikeH2CH4, ...shutdown]
}

export const RECIPE_TARGETS: Record<Recipe, { label: string; text: string }> = {
  CO2CH4: {
    label: 'CO\u2082 / CH\u2084 low temperature',
    text: 'CH4 52 sccm, CO2 48 sccm, strike 12 Torr at 1000 W, run 45 Torr at 1000 W, substrate 450 to 650 C, plasma white to blue white.',
  },
  H2CH4: {
    label: 'H\u2082 / CH\u2084 standard',
    text: 'H2 300 sccm, CH4 3 sccm, strike 20 Torr at 700 W, run 45 Torr at 900 W, substrate 750 to 900 C, plasma pink shifting green.',
  },
}
