// Gas properties for the Bristol 2.45 GHz microwave plasma CVD rig.
// PROVISIONAL VALUES. Every number in this file is a placeholder pending
// confirmation by the Bristol group. See docs/PHYSICS.md.

export type GasId = 'H2' | 'CH4' | 'CO2' | 'Ar' | 'N2'

export interface GasSpec {
  id: GasId
  label: string
  channel: number // MKS 647C channel number
  fullScale: number // sccm, N2 equivalent full scale of the MFC
  gcf: number // gas correction factor relative to N2 = 1.00
  atoms: { C: number; H: number; O: number }
  // Relative difficulty of electrical breakdown and of sustaining the
  // discharge. Ar is easiest. Hydrogen is the expensive one: its dissociation
  // energy and high thermal conductivity drain power out of the discharge, so
  // an H2 rich plasma needs noticeably more forward power than a CO2/CH4 one.
  breakdown: number
  // Emission colour of the dominant band system, and how bright it is per unit
  // mole fraction. Used to blend the plasma colour.
  colour: [number, number, number]
  emission: number
  note: string
}

export const GASES: Record<GasId, GasSpec> = {
  H2: {
    id: 'H2',
    label: 'H\u2082',
    channel: 1,
    fullScale: 1000,
    gcf: 1.01,
    atoms: { C: 0, H: 2, O: 0 },
    breakdown: 1.0,
    colour: [226, 150, 255],
    emission: 0.9,
    note: 'Balmer series, pink to violet. Main source of atomic hydrogen. Power hungry: dissociation and thermal conduction losses are large.',
  },
  CH4: {
    id: 'CH4',
    label: 'CH\u2084',
    channel: 2,
    fullScale: 100,
    gcf: 0.72,
    atoms: { C: 1, H: 4, O: 0 },
    breakdown: 0.92,
    colour: [150, 255, 170],
    emission: 3.0,
    note: 'C\u2082 Swan bands, strong green. Bright even at low fraction.',
  },
  CO2: {
    id: 'CO2',
    label: 'CO\u2082',
    channel: 3,
    fullScale: 200,
    gcf: 0.74,
    atoms: { C: 1, H: 0, O: 2 },
    breakdown: 0.72,
    colour: [225, 240, 255],
    emission: 2.2,
    note: 'CO Angstrom and third positive bands, blue white. Lower ionisation potential than H2 and far smaller dissociation losses, so it lights and runs at lower power. Confirmed against Bristol lab practice.',
  },
  Ar: {
    id: 'Ar',
    label: 'Ar',
    channel: 4,
    fullScale: 500,
    gcf: 1.39,
    atoms: { C: 0, H: 0, O: 0 },
    breakdown: 0.55,
    colour: [205, 175, 255],
    emission: 0.7,
    note: 'Lilac. Striking aid only, not used in the CO\u2082/CH\u2084 recipe.',
  },
  N2: {
    id: 'N2',
    label: 'N\u2082',
    channel: 5,
    fullScale: 100,
    gcf: 1.0,
    atoms: { C: 0, H: 0, O: 0 },
    breakdown: 1.2,
    colour: [255, 170, 140],
    emission: 1.8,
    note: 'CN violet and orange. Trace additions change morphology strongly.',
  },
}

export const GAS_IDS: GasId[] = ['H2', 'CH4', 'CO2', 'Ar', 'N2']
