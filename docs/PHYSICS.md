# Physics assumptions

Every number here is provisional. The purpose of this file is that when someone at Bristol
says a value is wrong, it can be found and changed in one place.

## Status of each model

| Model | Confidence | Where |
|---|---|---|
| Gas correction factors | High, standard MKS values | `gases.ts` |
| Bachmann C-H-O growth domain | High, well established literature | `physics.ts`, `growthVerdict` |
| Pump down and pressure control | Medium, generic conductance model | `engine.ts` |
| Plasma colour blending | Medium, qualitative but defensible | `physics.ts`, `plasmaColour` |
| Ignition thresholds | Low, fitted to plausible behaviour | `physics.ts`, `ignitionThreshold` |
| Ball geometry and window risk | Low, invented scaling | `physics.ts`, `ballGeometry` |
| Tuner response | Low, entirely invented | `physics.ts`, `optimumTuning` |
| Thermal model | Low, calibrated to give sensible temperatures | `physics.ts`, `THERMAL` |

## Flows

The MKS mass flow controllers are calibrated on nitrogen. Indicated flow times the gas
correction factor gives true flow. Values used, relative to N2 at 1.00:

| Gas | GCF |
|---|---|
| H2 | 1.01 |
| CH4 | 0.72 |
| CO2 | 0.74 |
| Ar | 1.39 |
| N2 | 1.00 |

This matters. Setting 50 and 50 on the CH4 and CO2 channels does not give a 50:50 mixture,
it gives roughly 49:51 by true flow, which shifts you across the CO tie line in the wrong
direction. The trainer surfaces both indicated and true flow so this becomes visible.

## Breakdown and ignition

Breakdown is modelled as a threshold in cavity drive power:

```
required = D * (550 + 1.25 * (p - 18)^2)   watts
```

where `p` is chamber pressure in Torr and `D` is a mixture weighted difficulty factor.
The quadratic gives a minimum near 18 Torr, which reflects the usual behaviour that there is
a pressure window for easy breakdown: too low and the field cannot cascade, too high and
collisional losses dominate.

Difficulty factors:

| Gas | D | Reason |
|---|---|---|
| Ar | 0.55 | Low ionisation energy, metastables, easiest |
| H2 | 1.00 | Reference |
| CH4 | 1.15 | Slightly harder |
| N2 | 1.20 | |
| CO2 | 1.75 | Electronegative, attaches free electrons, markedly harder |

The drive power available for breakdown is the forward power reduced by the tuner mismatch
only, **not** by the full reflection coefficient. Before the discharge lights there is no load
to absorb power, so almost all of it returns to the generator, yet the standing wave in the
cavity is what actually causes breakdown. Treating ignition as depending on absorbed power
makes it impossible to ever light the plasma, which is wrong.

Once lit, the discharge is sustained on a lower threshold:

```
sustain = D * (140 + 2.6 * p)   watts
```

## Coupling

Two stub tuners and a sliding short. The optimum positions are modelled as smooth functions
of pressure, with an offset that appears the moment the plasma lights, because the load
changes. This is a caricature. The real behaviour is that positions are found by hand and
remembered. If someone at Bristol can supply typical positions against pressure, the model
becomes much more useful.

## Plasma ball

```
radius = 11 * sqrt(P_abs / 800) * (40 / p)^0.38          mm
centre = 0.72 * radius + 24 * (20 / p)^0.45              mm above the substrate
```

Higher pressure gives a smaller, denser, lower ball. Lower pressure at the same power gives a
larger, more diffuse ball that sits higher.

## Quartz window

The window sits 62 mm above the substrate surface in the model. If the top of the plasma ball
comes within 6 mm of it, the window starts accumulating damage at a rate proportional to how
far inside that margin it is. At zero health the window cracks, the run aborts and the
chamber vents.

This is the mechanism the trainer is teaching: **do not raise power ahead of pressure, and do
not drop pressure while leaving power high.** Both push the ball upward into the window.

Consequences of the current numbers, worth checking against reality:

- H2 strike at 20 Torr and 700 W leaves about 19 mm clearance, comfortably safe.
- CO2/CH4 strikes at the same low pressure and power as the H2 route, so strike-condition
  clearance is comfortable; the window risk comes from dropping pressure with power still high.
- Normal run condition, 45 Torr at 1000 W, leaves about 26 mm clearance.

**Open question for Bristol:** is window failure actually caused by the ball touching or
approaching the window, by thermal shock on a cold window, by deposition on the window
absorbing microwave power, or by something else? The mechanism modelled here is a guess.

## Thermal

```
dT/dt = (P_abs * f - k * (T - T_coolant)) / C
f = 0.10 + 0.28 * X_H          hydrogen atom fraction of the gas mixture
k = 0.40 W/K
C = 120 J/K
T_coolant = 18 C
```

The heating fraction depends on hydrogen content because atomic hydrogen recombining on the
substrate surface is a large heat source. This is the physical reason an oxygen containing
chemistry can run cooler than a hydrogen discharge at the same delivered power.

With these constants:

- H2/CH4 at 900 W absorbed settles near 780 C
- CO2/CH4 at 1000 W absorbed settles near 520 C

Both are in the right region, which is why these constants were chosen. They are not measured.

### Pyrometer

```
reading = T_true * (eps_true / eps_set)^0.25
```

A quarter power law, which is the Stefan Boltzmann relation rearranged. The rig photograph
shows the Thermopoint set to EMS 0.19. If a trainee changes it, the reading moves while the
substrate does not, which is a useful lesson.

## Growth chemistry

Atomic C, H and O fractions are computed from true flows and placed on the Bachmann ternary.
The controlling quantity is the carbon excess over oxygen:

```
excess = X_C - X_O
```

| excess | Outcome |
|---|---|
| below 0 | Oxygen rich, etching rather than growing |
| 0 to about 0.055 | Diamond domain |
| above 0.055 | Carbon rich, sooty non diamond deposit |

Best quality is modelled at an excess near 0.012, with a Gaussian falling off either side.
Quality is then multiplied by a temperature factor centred at 830 C for hydrogen chemistries
and 620 C for oxygen containing ones, and by plasma stability.

Worked examples:

- H2 300 sccm with CH4 3 sccm gives excess 0.0035, inside the domain, forgiving.
- A slightly carbon-rich CO2/CH4 mix (a little more CH4 than CO2 by true flow) sits just
  inside the diamond domain. These are illustrative values, not real process conditions.
- Tip the balance oxygen-rich and the excess goes negative, so the film etches, not grows.

That asymmetry is the single most important thing the CO2/CH4 exercise teaches. The window is
narrow in a way that H2/CH4 is not.
