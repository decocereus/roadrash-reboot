import type { RaceView } from "@racer/sim/race-view";
import type { BikeClass, RiderId } from "@racer/sim/state";

import { diagnostics } from "../diagnostics/hub.ts";
import type { EffectsVolume, SettingsStore } from "../diagnostics/settings.ts";
import type { Cue } from "./cues.ts";
import type { Desk, Level } from "./desk.ts";
import type { Ride } from "./race-mix.ts";

export const GESTURES = [
  "keydown",
  "mousedown",
  "pointerdown",
  "pointerup",
  "touchend",
] as const;

type Gesture = (typeof GESTURES)[number];

const effectsGain = {
  full: 1,
  high: 0.75,
  low: 0.25,
  mid: 0.5,
} as const satisfies Record<EffectsVolume, number>;

export interface Sound {
  readonly play: (cue: Cue, pan?: number, gain?: number) => void;
  readonly prepare: (bikeClass: BikeClass) => void;
  readonly ride: (ride: Ride) => void;
  readonly hear: (view: RaceView, me: RiderId) => void;
  readonly hush: () => void;
  readonly shift: () => void;
  readonly toggleMute: () => void;
  readonly muted: () => boolean;
  readonly desk: () => Desk | null;
}

interface Unlockable {
  readonly state: AudioContextState;
  readonly resume: () => Promise<void>;
}

export interface SoundParts<Context extends Unlockable> {
  readonly settings: Pick<SettingsStore, "change" | "read" | "subscribe">;
  readonly failed: (message: string) => void;
  readonly listen: (gesture: Gesture, unlock: () => void) => void;
  readonly context: () => Context;
  readonly open: (context: Context, level: Level) => Promise<Desk>;
}

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

export const createSound = <Context extends Unlockable>({
  context: contextOf,
  failed,
  listen,
  open,
  settings,
}: SoundParts<Context>): Sound => {
  let context: Context | null = null;
  let desk: Desk | null = null;
  let early: Cue | null = null;
  let earlyPan = 0;
  let earlyGain = 1;
  let prepared: BikeClass | null = null;
  let { muted } = settings.read();

  const levelOf = (): Level => {
    const { effectsVolume, muted: silent } = settings.read();
    return { muted: silent, volume: effectsGain[effectsVolume] };
  };

  const apply = (): void => {
    const level = levelOf();
    ({ muted } = level);
    desk?.level(level);
  };

  const resumed = async (audio: Context): Promise<void> => {
    try {
      await audio.resume();
    } catch (error) {
      failed(messageOf(error));
    }
  };

  const load = async (audio: Context): Promise<void> => {
    try {
      desk = await open(audio, levelOf());
      if (prepared !== null) {
        desk.prepare(prepared);
      }
      if (early !== null) {
        desk.play(early, earlyPan, earlyGain);
        early = null;
      }
    } catch (error) {
      failed(messageOf(error));
    }
  };

  const unlock = (): void => {
    if (context) {
      if (context.state !== "running") {
        void resumed(context);
      }
      return;
    }
    try {
      context = contextOf();
    } catch {
      return;
    }
    void resumed(context);
    void load(context);
  };

  for (const gesture of GESTURES) {
    listen(gesture, unlock);
  }
  settings.subscribe(apply);

  return {
    desk: () => desk,
    hear(view, me) {
      desk?.hear(view, me);
    },
    hush() {
      desk?.hush();
    },
    muted: () => muted,
    play(cue, pan = 0, gain = 1) {
      if (desk) {
        desk.play(cue, pan, gain);
      } else if (context) {
        early = cue;
        earlyPan = pan;
        earlyGain = gain;
      }
    },
    prepare(bikeClass) {
      prepared = bikeClass;
      desk?.prepare(bikeClass);
    },
    ride(ride) {
      desk?.ride(ride);
    },
    shift() {
      desk?.shift();
    },
    toggleMute() {
      settings.change({ muted: !settings.read().muted });
    },
  };
};

let instance: Sound | null = null;

export const sound = (): Sound => {
  if (instance) {
    return instance;
  }
  const { recorder, settings } = diagnostics();
  const failed = (message: string): void => {
    recorder.fault("rejection", message, "sound");
  };
  instance = createSound({
    context: () => new AudioContext({ latencyHint: "interactive" }),
    failed,
    listen: (gesture, unlock) => {
      globalThis.addEventListener(gesture, unlock, { capture: true });
    },
    open: async (context, level) => {
      const { openDesk } = await import("./desk.ts");
      return openDesk(context, failed, level);
    },
    settings,
  });
  return instance;
};
