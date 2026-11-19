import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import type { Sound } from "../sound/sound.ts";
import { createBarSounds, footfalls } from "./bar-sounds.ts";

const OWN = 3;

const heardBy = () => {
  const play = vi.fn<Sound["play"]>();
  const loop = vi.fn<Sound["loop"]>();
  const sounds = createBarSounds({ loop, play });
  const camera = new THREE.PerspectiveCamera();
  sounds.listen(0, 0, camera, OWN);
  return { loop, play, sounds };
};

describe(footfalls, () => {
  it("lands a foot at every half cycle of the stride", () => {
    expect(footfalls(0.1, 0.4)).toBe(0);
    expect(footfalls(0.4, 0.6)).toBe(1);
    expect(footfalls(0.9, 1.1)).toBe(1);
    expect(footfalls(0.4, 1.6)).toBe(3);
  });
});

describe("footsteps in the bar", () => {
  it("plays the rider's own step in the middle at full level", () => {
    const { play, sounds } = heardBy();
    sounds.foot(OWN, 0, 0, 1, 3);
    sounds.flush();
    expect(play.mock.calls).toStrictEqual([["walkStep", 0, 1]]);
  });

  it("runs above a jog", () => {
    const { play, sounds } = heardBy();
    sounds.foot(OWN, 0, 0, 1, 7);
    sounds.flush();
    expect(play.mock.calls[0]?.[0]).toBe("runStep");
  });

  it("plays only the two nearest others, quieter than the rider and faded by distance", () => {
    const { play, sounds } = heardBy();
    sounds.foot(null, 6, 0, 1, 1.3);
    sounds.foot(1, 2, 0, 1, 3);
    sounds.foot(null, 4, 0, 1, 1.3);
    sounds.flush();
    const levels = play.mock.calls.map((call) => call[2] ?? 1);
    expect(play).toHaveBeenCalledTimes(2);
    expect(levels[0]).toBeLessThan(0.5);
    expect(levels[1]).toBeLessThan(levels[0] ?? 0);
  });

  it("measures no one on a frame where no foot lands, however full the bar", () => {
    const { play, sounds } = heardBy();
    const hypot = vi.spyOn(Math, "hypot");
    for (let slot = 0; slot < 8; slot += 1) {
      sounds.foot(slot, slot + 1, 0, 0, 3);
    }
    sounds.flush();
    expect(hypot).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    hypot.mockRestore();
  });

  it("hears a farther walker's step past nearer ones caught mid-stride", () => {
    const { play, sounds } = heardBy();
    sounds.foot(1, 1, 0, 0, 3);
    sounds.foot(2, 2, 0, 0, 3);
    sounds.foot(null, 5, 0, 1, 1.3);
    sounds.flush();
    expect(play).toHaveBeenCalledOnce();
  });

  it("pans another rider's step to their side of the screen", () => {
    const { play, sounds } = heardBy();
    sounds.foot(1, 3, 0, 1, 3);
    sounds.flush();
    expect(play.mock.calls[0]?.[1]).toBeGreaterThan(0);
  });

  it("hears nothing from across the room", () => {
    const { play, sounds } = heardBy();
    sounds.near("greet", 30, 0);
    expect(play).not.toHaveBeenCalled();
  });
});

describe("the room bed", () => {
  it("plays under the bar, lowers as the door lifts and stops when the bar closes", () => {
    const { loop, sounds } = heardBy();
    sounds.bed(1);
    sounds.bed(0.5);
    sounds.close();
    expect(loop.mock.calls).toStrictEqual([
      ["roomBed", 0.5],
      ["roomBed", 0.25],
      ["roomBed", 0],
    ]);
  });
});
