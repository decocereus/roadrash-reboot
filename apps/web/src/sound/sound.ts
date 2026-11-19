import { diagnostics } from "../diagnostics/hub.ts";
import type { EffectsVolume } from "../diagnostics/settings.ts";
import type { Cue } from "./cues.ts";
import type { Desk } from "./desk.ts";

const GESTURES = ["pointerdown", "keydown", "touchend"] as const;

const effectsGain = {
  full: 1,
  high: 0.75,
  low: 0.25,
  mid: 0.5,
} as const satisfies Record<EffectsVolume, number>;

export interface Sound {
  readonly play: (cue: Cue, pan?: number, gain?: number) => void;
  readonly ride: (
    on: boolean,
    speed: number,
    throttle: number,
    revs: number,
    offRoad: boolean
  ) => void;
  readonly shift: () => void;
  readonly toggleMute: () => void;
  readonly muted: () => boolean;
  readonly desk: () => Desk | null;
}

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const createSound = (): Sound => {
  const { recorder, settings } = diagnostics();
  let context: AudioContext | null = null;
  let desk: Desk | null = null;
  let early: Cue | null = null;
  let { muted } = settings.read();

  const apply = (): void => {
    const { effectsVolume, muted: silent } = settings.read();
    muted = silent;
    desk?.level(effectsGain[effectsVolume], silent);
  };

  const failed = (message: string): void => {
    recorder.fault("rejection", message, "sound");
  };

  const resumed = async (audio: AudioContext): Promise<void> => {
    try {
      await audio.resume();
    } catch (error) {
      failed(messageOf(error));
    }
  };

  const load = async (audio: AudioContext): Promise<void> => {
    try {
      const { openDesk } = await import("./desk.ts");
      desk = openDesk(audio, failed);
      apply();
      if (early !== null) {
        desk.play(early, 0, 1);
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
      context = new AudioContext({ latencyHint: "interactive" });
    } catch {
      return;
    }
    void resumed(context);
    void load(context);
  };

  for (const gesture of GESTURES) {
    globalThis.addEventListener(gesture, unlock, { capture: true });
  }
  settings.subscribe(apply);

  return {
    desk: () => desk,
    muted: () => muted,
    play(cue, pan = 0, gain = 1) {
      if (desk) {
        desk.play(cue, pan, gain);
      } else if (context) {
        early = cue;
      }
    },
    ride(on, speed, throttle, revs, offRoad) {
      desk?.ride(on, speed, throttle, revs, offRoad);
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
  instance ??= createSound();
  return instance;
};
