import type { Transition } from "framer-motion";

/**
 * Shared animation config (PRD "Animation policy", per emil-design-eng &
 * make-interfaces-feel-better). Every helper here is a pure, reduced-motion-aware
 * function so components stay declarative and the timing is testable at a seam
 * that needs no DOM. The policy in force:
 *
 * - animate only `transform`/`opacity` (never layout-affecting props);
 * - custom ease-out curve, under the ~300ms budget so motion never lingers;
 * - gentle staggered card entrances (30–80ms per item);
 * - `initial: false` collapses to the resting state (no entry animation) when
 *   the user prefers reduced motion.
 *
 * Callers read the OS preference with framer-motion's `useReducedMotion()` and
 * pass the boolean in, keeping these helpers free of React/hook context.
 */

/** Custom ease-out curve; deceleration-heavy so entrances settle softly. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Entrance/transition duration, in seconds — under the ~300ms budget. */
export const DURATION_S = 0.24;

/** Per-item stagger step, in seconds (50ms — within the PRD's 30–80ms band). */
export const STAGGER_STEP_S = 0.05;

/**
 * Cap on the staggered index so a long grid's last card still enters promptly
 * (without it, item 50 would wait 2.5s before appearing).
 */
export const MAX_STAGGER_INDEX = 8;

/** The resting (settled) state every entrance/presence helper animates to. */
const REST = { opacity: 1, y: 0 };

/**
 * Entry-motion props for a framer-motion element: `initial`/`animate` touch only
 * `opacity` and `y` (translateY = transform), plus the timing `transition`.
 */
export interface EntranceProps {
  initial: { opacity: number; y: number } | false;
  animate: { opacity: number; y: number };
  transition: Transition;
}

/** Presence props (adds `exit`) for elements swapped under `AnimatePresence`. */
export interface PresenceProps extends EntranceProps {
  exit: { opacity: number; y: number };
}

/**
 * The entrance delay for the card at `index`, in seconds. Staggering the grid
 * gives a gentle cascade rather than a single pop; the delay is capped
 * ({@link MAX_STAGGER_INDEX}) and collapses to `0` under reduced motion.
 */
export function staggerDelay(index: number, reducedMotion: boolean): number {
  if (reducedMotion || index <= 0) return 0;
  return Math.min(index, MAX_STAGGER_INDEX) * STAGGER_STEP_S;
}

/**
 * Motion props for a staggered card entrance (issuer grid). Under reduced motion
 * the card renders directly in its resting state (`initial: false`, zero
 * duration) so nothing moves.
 */
export function cardEntrance(index: number, reducedMotion: boolean): EntranceProps {
  if (reducedMotion) {
    return {
      initial: false,
      animate: REST,
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: 8 },
    animate: REST,
    transition: {
      duration: DURATION_S,
      ease: EASE_OUT,
      delay: staggerDelay(index, false),
    },
  };
}

/**
 * Presence props for a wizard step swapped under `AnimatePresence`: the incoming
 * step fades up, the outgoing one fades away upward. Under reduced motion the
 * swap is instant (`initial: false`, zero duration).
 */
export function stepPresence(reducedMotion: boolean): PresenceProps {
  if (reducedMotion) {
    return {
      initial: false,
      animate: REST,
      exit: { opacity: 0, y: 0 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: 8 },
    animate: REST,
    exit: { opacity: 0, y: -8 },
    transition: { duration: DURATION_S, ease: EASE_OUT },
  };
}
