import type { PedestrianView } from "@racer/sim/race-view";
import { describe, expect, it } from "vitest";

import { crowdModes, walkerFrameOf } from "../src/game/walker-clips.ts";
import type { WalkerClips } from "../src/game/walker-clips.ts";

const clips: WalkerClips = {
  browse: { frames: 90, start: 900 },
  fall: { frames: 22, start: 200 },
  flinch: { frames: 16, start: 300 },
  get_up: { frames: 38, start: 400 },
  haggle: { frames: 90, start: 1000 },
  lie: { frames: 60, start: 500 },
  run: { frames: 20, start: 600 },
  serve: { frames: 90, start: 1100 },
  wait: { frames: 90, start: 700 },
  walk: { frames: 30, start: 800 },
};

const walker = (over: Partial<PedestrianView>): PedestrianView => ({
  across: 1,
  command: null,
  crossing: 0,
  dice: 0,
  drift: 0,
  halfLength: 0.3,
  halfWidth: 0.3,
  height: 1.7,
  id: "site#0",
  kind: "pedestrian",
  mode: "waiting",
  s: 0,
  wait: 0,
  walkKind: "zebra",
  x: 0,
  ...over,
});

const frameOf = (over: Partial<PedestrianView>, tick = 0, fellAt = 0): number =>
  walkerFrameOf(clips, walker(over), tick, fellAt, { offset: 0, scale: 1 });

const inClipOf = (name: keyof WalkerClips, frame: number): number => {
  const clip = clips[name];
  expect(frame).toBeGreaterThanOrEqual(clip.start);
  expect(frame).toBeLessThan(clip.start + clip.frames);
  return frame - clip.start;
};

const walkFrameAt = (x: number): number =>
  inClipOf("walk", frameOf({ drift: 1.4, mode: "walking", x }));

const downFrame = (wait: number, tick: number): number =>
  frameOf({ mode: "down", wait }, tick, 100);

describe("which frame a walker shows", () => {
  it("steps by the distance walked, one full cycle per stride, so feet never slide", () => {
    expect(walkFrameAt(0)).toBe(0);
    expect(walkFrameAt(0.7)).toBe(15);
    expect(walkFrameAt(1.4)).toBe(0);
  });

  it("takes a shorter stride on a shorter body, so its feet do not slide either", () => {
    const scale = 0.93;
    const walking = walker({ drift: 1.4, mode: "walking", x: 0.7 * scale });
    expect(
      inClipOf(
        "walk",
        walkerFrameOf(clips, walking, 0, 0, { offset: 0, scale })
      )
    ).toBe(15);
  });

  it("steps backwards along the road the same way when crossing the other way", () => {
    expect(
      inClipOf(
        "walk",
        frameOf({ across: -1, drift: -1.4, mode: "walking", x: -0.7 })
      )
    ).toBe(15);
    expect(
      inClipOf(
        "walk",
        frameOf({ across: -1, drift: -1.4, mode: "walking", x: 0.7 })
      )
    ).toBe(15);
  });

  it("runs at running pace", () => {
    expect(
      inClipOf("run", frameOf({ drift: 3, mode: "walking", x: 0.99 }))
    ).toBe(10);
  });

  it("plays the whole flinch over the thirty ticks the sim gives it", () => {
    const first = inClipOf("flinch", frameOf({ mode: "flinching", wait: 30 }));
    const last = inClipOf("flinch", frameOf({ mode: "flinching", wait: 1 }));
    expect(first).toBe(1);
    expect(last).toBe(15);
  });

  it("falls, then lies, then gets up and finishes on the last frame just as the sim walks them on", () => {
    expect(inClipOf("fall", downFrame(200, 100))).toBe(0);
    expect(inClipOf("fall", downFrame(170, 130))).toBe(15);
    expect(inClipOf("lie", downFrame(120, 180))).toBeGreaterThanOrEqual(0);
    expect(inClipOf("get_up", downFrame(70, 230))).toBe(3);
    expect(inClipOf("get_up", downFrame(1, 299))).toBe(37);
  });

  it("gets up instead of finishing the fall on the shortest stay the sim allows", () => {
    expect(
      inClipOf("get_up", frameOf({ mode: "down", wait: 76 }, 145, 100))
    ).toBe(0);
  });

  it("gives two waiting walkers with different offsets different poses", () => {
    const standing = walker({ mode: "waiting" });
    expect(
      walkerFrameOf(clips, standing, 40, 0, { offset: 0, scale: 1 })
    ).not.toBe(
      walkerFrameOf(clips, standing, 40, 0, { offset: 0.5, scale: 1 })
    );
  });
});

describe("the frame a stall's crowd stands on", () => {
  const look = { offset: 0.25, scale: 1 };

  it("plays each mode's own clip, from the person's own offset", () => {
    for (const mode of crowdModes) {
      const clip = clips[mode];
      const frame = walkerFrameOf(clips, { mode }, 0, 0, look);
      expect(frame).toBe(clip.start + Math.floor(look.offset * clip.frames));
    }
  });

  it("advances one frame every two ticks, and loops inside its clip", () => {
    for (const mode of crowdModes) {
      const clip = clips[mode];
      const first = walkerFrameOf(clips, { mode }, 1000, 0, look);
      const next = walkerFrameOf(clips, { mode }, 1002, 0, look);
      const around = walkerFrameOf(
        clips,
        { mode },
        1000 + clip.frames * 2,
        0,
        look
      );
      expect(next - first === 1 || next === clip.start).toBeTruthy();
      expect(around).toBe(first);
      expect(first).toBeGreaterThanOrEqual(clip.start);
      expect(first).toBeLessThan(clip.start + clip.frames);
    }
  });
});
