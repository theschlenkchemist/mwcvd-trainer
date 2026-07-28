import { log } from './engine'
import { procedureFor } from './procedures'
import type { SimState } from './types'

/** Seconds on a single procedure step before the trainer offers a nudge. */
const NUDGE_AFTER = 90
/** Seconds before it gives the answer outright. */
const TELL_AFTER = 180

/**
 * Watches which procedure step the trainee is on. If they sit on the same step
 * for a long time, it first nudges, then gives the step detail outright.
 *
 * Kept separate from the plant model on purpose: the model must not depend on
 * the procedure content, or the headless tests stop being a test of physics.
 */
export function coach(s: SimState, dt: number) {
  const steps = procedureFor(s.recipe)
  const current = steps.find((st) => !st.done(s))

  if (!current) {
    s.stuck.currentStep = ''
    s.stuck.timeOnStep = 0
    return
  }

  if (current.id !== s.stuck.currentStep) {
    s.stuck.currentStep = current.id
    s.stuck.timeOnStep = 0
    return
  }

  const before = s.stuck.timeOnStep
  s.stuck.timeOnStep += dt
  const after = s.stuck.timeOnStep

  if (before < NUDGE_AFTER && after >= NUDGE_AFTER) {
    log(s, 'hint', `Still on "${current.title}". ${current.hint ?? 'Read the highlighted step in the procedure panel and check each precondition in turn.'}`)
  }
  if (before < TELL_AFTER && after >= TELL_AFTER) {
    log(s, 'hint', `Stuck on "${current.title}". Do this: ${current.detail}`)
  }
}
