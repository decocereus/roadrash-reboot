import { describe, expect, it, vi } from "vitest";

import type { Settings } from "../diagnostics/settings.ts";
import type { Desk, Level } from "./desk.ts";
import { createSound, GESTURES } from "./sound.ts";

const saved: Settings = {
  automaticUpload: false,
  device: "unspecified",
  effectsVolume: "low",
  frameRate: "60",
  muted: true,
  noticeSeen: true,
  overlay: false,
  raceData: true,
  recording: false,
};

const recordingDesk = (): Desk => ({
  hear: vi.fn<Desk["hear"]>(),
  heard: () => new Map(),
  hush: vi.fn<() => void>(),
  level: vi.fn<(level: Level) => void>(),
  play: vi.fn<Desk["play"]>(),
  prepare: vi.fn<Desk["prepare"]>(),
  ride: vi.fn<Desk["ride"]>(),
  shift: vi.fn<() => void>(),
  stats: () => ({
    busyMs: 0,
    longestSliceMs: 0,
    rendered: 0,
    slices: [],
    waitedMs: 0,
  }),
});

interface WaitingContext {
  readonly state: "suspended";
  readonly resume: () => Promise<void>;
}

const soundWithDesk = () => {
  const desk = recordingDesk();
  const opened = Promise.withResolvers<Desk>();
  const open = vi.fn<(context: WaitingContext, level: Level) => Promise<Desk>>(
    async () => await opened.promise
  );
  const unlocks = new Map<string, () => void>();
  const sound = createSound({
    context: () => ({
      resume: async () => {
        await Promise.resolve();
      },
      state: "suspended" as const,
    }),
    failed: vi.fn<(message: string) => void>(),
    listen: (gesture, unlock) => {
      unlocks.set(gesture, unlock);
    },
    open,
    settings: {
      change: vi.fn<() => void>(),
      read: () => saved,
      subscribe: () => vi.fn<() => void>(),
    },
  });
  const press = (gesture: string) => {
    unlocks.get(gesture)?.();
  };
  const ready = async () => {
    opened.resolve(desk);
    await opened.promise;
    await Promise.resolve();
  };
  return { desk, open, press, ready, sound, unlocks };
};

describe(createSound, () => {
  it("unlocks on every activation event the HTML standard lists, pen and touch included", () => {
    const { unlocks } = soundWithDesk();
    expect([...unlocks.keys()].toSorted()).toStrictEqual([
      "keydown",
      "mousedown",
      "pointerdown",
      "pointerup",
      "touchend",
    ]);
    expect(GESTURES).toHaveLength(unlocks.size);
  });

  it("opens the mixer at the saved volume and mute, so a muted first press stays silent", () => {
    const { open, press } = soundWithDesk();
    press("pointerup");
    expect(open.mock.calls.map(([, level]) => level)).toStrictEqual([
      { muted: true, volume: 0.25 },
    ]);
  });

  it("plays a cue asked for while the mixer loads with its own pan and gain", async () => {
    const { desk, press, ready, sound } = soundWithDesk();
    press("mousedown");
    sound.play("thump", 0.8, 0.2);
    await ready();
    expect(vi.mocked(desk.play).mock.calls).toStrictEqual([
      ["thump", 0.8, 0.2],
    ]);
  });

  it("builds the engine for a race prepared before the mixer loaded, as it loads", async () => {
    const { desk, press, ready, sound } = soundWithDesk();
    sound.prepare("heavyweight");
    press("keydown");
    await ready();
    expect(vi.mocked(desk.prepare).mock.calls).toStrictEqual([["heavyweight"]]);
  });
});
