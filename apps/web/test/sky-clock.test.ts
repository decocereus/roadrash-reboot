import type * as THREE from "three";
import { describe, expect, it } from "vitest";

import { lookOf, night, sunset } from "../src/game/looks.ts";
import {
  airOf,
  compose,
  hourOf,
  hourPinOf,
  skyClock,
} from "../src/game/sky-clock.ts";

const hexOf = (colour: THREE.Color): string => `#${colour.getHexString()}`;

describe("the race clock", () => {
  it("runs from evening at the green light to the road's night tick, then holds", () => {
    const { nightTick } = lookOf("salt-coast");
    expect(hourOf(nightTick, 0)).toBe(0);
    expect(hourOf(nightTick, nightTick / 2)).toBe(0.5);
    expect(hourOf(nightTick, nightTick * 3)).toBe(1);
  });

  it("starts each road on its own look and sets the sun near 40% of the way to night", () => {
    const clock = skyClock(lookOf("salt-coast"));
    clock.at(0);
    expect(hexOf(clock.hour.fog)).toBe(lookOf("salt-coast").fog);
    clock.at(0.4);
    expect(hexOf(clock.hour.fog)).toBe(sunset.fog);
    expect(clock.hour.sunElevation).toBeCloseTo(sunset.sunElevation, 6);
  });

  it("reaches full night by 85% and holds it", () => {
    for (const region of ["salt-coast", "stonepeak"] as const) {
      const clock = skyClock(lookOf(region));
      clock.at(0.85);
      expect(hexOf(clock.hour.ink)).toBe(night.ink);
      expect(clock.hour.night).toBe(1);
      clock.at(1);
      expect(hexOf(clock.hour.ink)).toBe(night.ink);
    }
  });

  it("only ever sinks the sun and deepens the night", () => {
    const clock = skyClock(lookOf("salt-coast"));
    let sun = Number.POSITIVE_INFINITY;
    let dark = 0;
    for (let step = 0; step <= 40; step += 1) {
      clock.at(step / 40);
      expect(clock.hour.sunElevation).toBeLessThanOrEqual(sun + 1e-9);
      expect(clock.hour.night).toBeGreaterThanOrEqual(dark - 1e-9);
      sun = clock.hour.sunElevation;
      dark = clock.hour.night;
    }
  });

  it("shows every player the same sky at the same tick, and only recomputes on a new step", () => {
    const look = lookOf("lowtown");
    const first = skyClock(look);
    const second = skyClock(look);
    const time = hourOf(look.nightTick, 6123);
    expect(first.at(time)).toBeTruthy();
    expect(first.at(time)).toBeFalsy();
    second.at(hourOf(look.nightTick, 100));
    second.at(time);
    expect(first.hour).toStrictEqual(second.hour);
  });

  it("lets a place's haze tint the hour's fog, and clear air leave it alone", () => {
    const clock = skyClock(lookOf("salt-coast"));
    clock.at(0.5);
    const fog = hexOf(clock.hour.fog);
    compose(clock.hour, airOf({ haze: "#ff0000", hazeShare: 0 }));
    expect(hexOf(clock.hour.fog)).toBe(fog);
    compose(clock.hour, airOf({ haze: "#ff0000", hazeShare: 1 }));
    expect(hexOf(clock.hour.fog)).toBe("#ff0000");
  });

  it("pins the clock only to a number, clamped to the race", () => {
    expect(hourPinOf("?hour=0.5")).toBe(0.5);
    expect(hourPinOf("?hour=3")).toBe(1);
    expect(hourPinOf("?hour=dusk")).toBeNull();
    expect(hourPinOf("?ride=slag-row")).toBeNull();
  });
});
