import { describe, expect, it } from "vitest";
import {
  cardEntrance,
  DURATION_S,
  MAX_STAGGER_INDEX,
  STAGGER_STEP_S,
  staggerDelay,
  stepPresence,
} from "./motion";

describe("staggerDelay", () => {
  it("delays each card by one step, growing with the index", () => {
    expect(staggerDelay(0, false)).toBe(0);
    expect(staggerDelay(1, false)).toBeCloseTo(STAGGER_STEP_S);
    expect(staggerDelay(3, false)).toBeCloseTo(3 * STAGGER_STEP_S);
  });

  it("caps the delay so a long grid's last card still enters promptly", () => {
    expect(staggerDelay(50, false)).toBeCloseTo(MAX_STAGGER_INDEX * STAGGER_STEP_S);
  });

  it("uses a stagger step inside the PRD's 30–80ms band", () => {
    expect(STAGGER_STEP_S).toBeGreaterThanOrEqual(0.03);
    expect(STAGGER_STEP_S).toBeLessThanOrEqual(0.08);
  });

  it("is instant under reduced motion", () => {
    expect(staggerDelay(5, true)).toBe(0);
  });
});

describe("cardEntrance", () => {
  it("animates only opacity and transform, under the ~300ms budget", () => {
    const props = cardEntrance(2, false);
    // initial/animate touch only opacity + y (translateY = transform)
    expect(props.initial).toEqual({ opacity: 0, y: 8 });
    expect(props.animate).toEqual({ opacity: 1, y: 0 });
    expect(DURATION_S).toBeLessThan(0.3);
    expect(props.transition.duration).toBe(DURATION_S);
    expect(props.transition.delay).toBeCloseTo(2 * STAGGER_STEP_S);
  });

  it("renders the resting state immediately under reduced motion", () => {
    const props = cardEntrance(2, true);
    // `initial: false` tells framer-motion to skip the entry animation
    expect(props.initial).toBe(false);
    expect(props.animate).toEqual({ opacity: 1, y: 0 });
    expect(props.transition.duration).toBe(0);
  });
});

describe("stepPresence", () => {
  it("cross-fades with a gentle slide, only opacity + transform", () => {
    const props = stepPresence(false);
    expect(props.initial).toEqual({ opacity: 0, y: 8 });
    expect(props.animate).toEqual({ opacity: 1, y: 0 });
    expect(props.exit).toEqual({ opacity: 0, y: -8 });
    expect(props.transition.duration).toBe(DURATION_S);
  });

  it("collapses to a plain swap under reduced motion", () => {
    const props = stepPresence(true);
    expect(props.initial).toBe(false);
    expect(props.transition.duration).toBe(0);
  });
});
