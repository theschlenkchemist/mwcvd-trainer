import { GASES, GAS_IDS, type GasId } from './gases'
import type { SimState } from './types'

// ---------------------------------------------------------------------------
// Geometry constants for the cavity. PROVISIONAL. Measure these at Bristol.
// ---------------------------------------------------------------------------
export const CAVITY = {
  substrateToWindow: 62, // mm, vertical gap from substrate surface to quartz window
  windowSafeMargin: 6, // mm, minimum clearance before the window starts heating
  chamberVolume: 4.5, // litres
  basePressure: 5e-3, // Torr achievable by the rotary pump
}

// ---------------------------------------------------------------------------
// Flows. The MFCs are calibrated on nitrogen, so the indicated flow and the
// true flow differ by the gas correction factor. Trainees who ignore this get
// the wrong carbon to oxygen ratio.
// ---------------------------------------------------------------------------
export function trueFlow(gas: GasId, indicated: number): number {
  return indicated * GASES[gas].gcf
}

export function flows(s: SimState): Record<GasId, number> {
  const out = {} as Record<GasId, number>
  for (const g of GAS_IDS) out[g] = trueFlow(g, s.mfc[g].actual)
  return out
}

export function totalFlow(s: SimState): number {
  const f = flows(s)
  return GAS_IDS.reduce((a, g) => a + f[g], 0)
}

export function moleFractions(s: SimState): Record<GasId, number> {
  const f = flows(s)
  const tot = GAS_IDS.reduce((a, g) => a + f[g], 0)
  const out = {} as Record<GasId, number>
  for (const g of GAS_IDS) out[g] = tot > 0 ? f[g] / tot : 0
  return out
}

// ---------------------------------------------------------------------------
// Microwave coupling. Two stub tuners and a sliding short. The optimum
// positions shift with pressure and with the plasma load, so a match found at
// strike condition will not hold at run condition. That is the point of the
// exercise.
// ---------------------------------------------------------------------------
export function optimumTuning(pressure: number, lit: boolean) {
  const p = Math.max(0, Math.min(200, pressure))
  return {
    stub1: 0.30 + 0.0035 * p + (lit ? 0.10 : 0),
    stub2: 0.55 - 0.0020 * p + (lit ? 0.06 : 0),
    slidingShort: 0.45 + 0.0015 * p + (lit ? 0.12 : 0),
  }
}

/** How far the tuners are from a match, 0 = matched, 1 = hopeless. */
export function tuneMismatch(s: SimState): number {
  const opt = optimumTuning(s.chamber.pressure, s.plasma.lit)
  const d =
    Math.abs(s.tuner.stub1 - opt.stub1) * 1.0 +
    Math.abs(s.tuner.stub2 - opt.stub2) * 0.8 +
    Math.abs(s.tuner.slidingShort - opt.slidingShort) * 1.2
  return Math.min(1, Math.pow(d * 1.6, 1.4))
}

export function reflectionCoefficient(s: SimState): number {
  // An unlit cavity has nothing to absorb the power, so almost all of it comes
  // straight back even when the tuners are well placed.
  const floor = s.plasma.lit ? 0.004 : 0.55
  const r = floor + (1 - floor) * tuneMismatch(s)
  const arc = s.faults.some((f) => f.id === 'arcing' && f.firedAt !== null) ? 0.28 : 0
  return Math.min(0.98, r + arc)
}

/**
 * Field strength available to initiate breakdown. Before the discharge lights
 * there is no load, so what matters is how well the cavity is tuned to build a
 * standing wave, not how much power is being absorbed.
 */
export function ignitionDrive(s: SimState): number {
  return s.generator.forward * (1 - tuneMismatch(s))
}

export function absorbedPower(s: SimState): number {
  return s.generator.forward * (1 - reflectionCoefficient(s))
}

// ---------------------------------------------------------------------------
// Ignition. Breakdown is easiest in a pressure window around 10 to 25 Torr.
// Below that the mean free path is long and the field cannot cascade; above it
// collisional losses dominate and you need far more power. Electronegative
// gases such as CO2 raise the threshold substantially.
// ---------------------------------------------------------------------------
export function breakdownFactor(s: SimState): number {
  const x = moleFractions(s)
  let d = 0
  let w = 0
  for (const g of GAS_IDS) {
    d += x[g] * GASES[g].breakdown
    w += x[g]
  }
  return w > 0 ? d / w : 1
}

/** Power required at the substrate to initiate breakdown, in watts. */
export function ignitionThreshold(s: SimState): number {
  const p = s.chamber.pressure
  const d = breakdownFactor(s)
  const base = 550 + 1.25 * Math.pow(p - 18, 2)
  const boost = s.faults.some((f) => f.id === 'no_strike' && f.firedAt !== null) ? 1.9 : 1
  return d * base * boost
}

/** Power required to keep an existing discharge alive, in watts. */
export function sustainThreshold(s: SimState): number {
  const p = s.chamber.pressure
  const d = breakdownFactor(s)
  return d * (140 + 2.6 * p)
}

// ---------------------------------------------------------------------------
// Plasma ball geometry. The ball grows with absorbed power and shrinks and
// sinks as pressure rises. At low pressure and high power it expands upward
// toward the quartz window, which is how windows get cracked.
// ---------------------------------------------------------------------------
export function ballGeometry(s: SimState) {
  const P = Math.max(1, absorbedPower(s))
  const p = Math.max(1, s.chamber.pressure)
  const radius = 11 * Math.sqrt(P / 800) * Math.pow(40 / p, 0.38)
  const centre = radius * 0.72 + 24 * Math.pow(20 / p, 0.45)
  return { radius, centre }
}

export function windowClearance(s: SimState): number {
  const g = ballGeometry(s)
  return CAVITY.substrateToWindow - (g.centre + g.radius)
}

// ---------------------------------------------------------------------------
// Plasma colour. Blend the species emission rather than using a lookup table,
// so intermediate mixtures look plausible.
// ---------------------------------------------------------------------------
export function plasmaColour(s: SimState): [number, number, number] {
  const x = moleFractions(s)
  const t = ternary(s)
  // C2 Swan emission only appears when there is carbon in excess of the oxygen.
  // Sitting exactly on the CO tie line, as CO2/CH4 nearly does, kills the green
  // and leaves the blue white CO bands, which is why that discharge looks white.
  const excessC = Math.max(0, t.C - t.O)
  const swan = Math.max(0.12, Math.min(1.6, 0.12 + excessC / 0.03))
  let r = 0
  let g = 0
  let b = 0
  let w = 0
  for (const id of GAS_IDS) {
    const spec = GASES[id]
    // Square root weighting, because a trace of a strongly emitting species is
    // visually obvious long before it matters chemically.
    const weight = Math.sqrt(x[id]) * spec.emission * (id === 'CH4' ? swan : 1)
    r += spec.colour[0] * weight
    g += spec.colour[1] * weight
    b += spec.colour[2] * weight
    w += weight
  }
  if (w <= 0) return [255, 255, 255]
  // Hot cores wash out toward white.
  const wash = Math.min(0.55, absorbedPower(s) / 3000)
  const mix = (c: number) => Math.round(Math.min(255, (c / w) * (1 - wash) + 255 * wash))
  return [mix(r), mix(g), mix(b)]
}

// ---------------------------------------------------------------------------
// Thermal. Absorbed microwave power heats the substrate; the water cooled
// stage carries it away. The pyrometer reading depends on the emissivity the
// operator has dialled in, which is a classic source of error.
// ---------------------------------------------------------------------------
export const THERMAL = {
  heatCapacity: 120, // J per K, lumped stage plus substrate
  conductance: 0.204, // W per K, conduction to the water cooled stage
  /**
   * Radiative loss coefficient, effectively emissivity times area times the
   * Stefan Boltzmann constant. Corresponds to about 24 cm squared of radiating
   * surface. Including this matters: radiation scales as the fourth power of
   * temperature, so it compresses the top of the range and stops a hydrogen
   * discharge running away to implausible temperatures.
   */
  radiative: 1.36e-10, // W per K^4
  coolantTemp: 18,
}

/** Total heat leaving the substrate and stage, in watts. */
export function heatLoss(substrateC: number, waterOn: boolean): number {
  const Tk = substrateC + 273.15
  const Ck = THERMAL.coolantTemp + 273.15
  const conduction = THERMAL.conductance * (substrateC - THERMAL.coolantTemp) * (waterOn ? 1 : 0.06)
  const radiation = THERMAL.radiative * (Math.pow(Tk, 4) - Math.pow(Ck, 4))
  return conduction + radiation
}

/**
 * Fraction of absorbed microwave power that ends up in the substrate.
 * Hydrogen rich plasmas heat far more effectively, because atomic hydrogen
 * recombining on the surface delivers a large heat flux. This is why an
 * oxygen containing chemistry can run several hundred degrees cooler at the
 * same power, which is the whole point of the CO2/CH4 route.
 */
export function heatingFraction(s: SimState): number {
  const t = ternary(s)
  return 0.10 + 0.28 * t.H
}

export function pyrometerReading(trueT: number, epsSet: number, epsTrue: number): number {
  if (trueT < 250) return 0 // below the instrument range it reads nothing useful
  const k = Math.pow(epsTrue / Math.max(0.01, epsSet), 0.25)
  return trueT * k
}

// ---------------------------------------------------------------------------
// Growth. Bachmann C-H-O ternary. The diamond domain is a narrow band just on
// the carbon rich side of the CO tie line. Oxygen rich means etching or no
// growth, carbon rich means graphitic or sooty deposit.
// ---------------------------------------------------------------------------
export function ternary(s: SimState) {
  const f = flows(s)
  let C = 0
  let H = 0
  let O = 0
  for (const g of GAS_IDS) {
    const a = GASES[g].atoms
    C += f[g] * a.C
    H += f[g] * a.H
    O += f[g] * a.O
  }
  const tot = C + H + O
  if (tot <= 0) return { C: 0, H: 0, O: 0 }
  return { C: C / tot, H: H / tot, O: O / tot }
}

export interface GrowthVerdict {
  rate: number // micrometres per hour
  quality: number // 0 to 1
  regime: string
}

export function growthVerdict(s: SimState): GrowthVerdict {
  if (!s.plasma.lit) return { rate: 0, quality: 0, regime: 'no plasma' }
  const t = ternary(s)
  const excessC = t.C - t.O // distance from the CO tie line
  const T = s.thermal.substrate

  if (t.C + t.O < 1e-4) {
    return { rate: 0, quality: 0, regime: 'no carbon source, hydrogen etch only' }
  }
  if (excessC < -0.002) {
    return { rate: 0, quality: 0, regime: 'oxygen rich, etching not growing' }
  }
  if (excessC > 0.055) {
    return { rate: 2.5, quality: 0.05, regime: 'carbon rich, sooty non diamond deposit' }
  }

  // Best quality just off the tie line.
  const optimum = 0.012
  const width = 0.020
  const chem = Math.exp(-Math.pow((excessC - optimum) / width, 2))

  // Temperature window. Oxygen containing chemistries extend the window down.
  const oxy = t.O > 0.05
  const Topt = oxy ? 620 : 830
  const Twidth = oxy ? 240 : 180
  const thermalQ = Math.exp(-Math.pow((T - Topt) / Twidth, 2))

  const stability = s.plasma.stability
  const quality = Math.max(0, Math.min(1, chem * thermalQ * (0.5 + 0.5 * stability)))
  const rate = 0.9 * (excessC / 0.012) * (absorbedPower(s) / 800) * Math.max(0.15, thermalQ)

  let regime = 'microcrystalline diamond'
  if (quality < 0.25) regime = 'poor quality, mixed phase'
  else if (quality < 0.55) regime = 'nanocrystalline diamond'
  else if (T < 500) regime = 'low temperature diamond'

  return { rate: Math.max(0, rate), quality, regime }
}
