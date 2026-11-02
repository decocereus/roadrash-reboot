import type { PedestrianView } from "@racer/sim/race-view";

const TICKS_PER_FRAME = 2;
const RUN_ABOVE = 2;
const WALK_STRIDE = 1.4;
const RUN_STRIDE = 1.98;

export const WALKER_OUTFITS = 8;

export const walkerClipLoops = {
  fall: false,
  flinch: false,
  get_up: false,
  lie: true,
  run: true,
  wait: true,
  walk: true,
} as const;

export type WalkerClipName = keyof typeof walkerClipLoops;

export interface WalkerClip {
  readonly start: number;
  readonly frames: number;
}

export type WalkerClips = Readonly<Record<WalkerClipName, WalkerClip>>;

export interface WalkerLook {
  readonly offset: number;
  readonly scale: number;
}

export const walkerBodies = [
  { height: 1.76, name: "pedestrian_man" },
  { height: 1.65, name: "pedestrian_woman" },
  { height: 1.74, name: "pedestrian_heavy" },
  { height: 1.68, name: "pedestrian_slim" },
  { height: 1.58, name: "pedestrian_older" },
  { height: 1.72, name: "pedestrian_sporty" },
] as const;

const once = (clip: WalkerClip, frame: number): number =>
  clip.start + Math.min(Math.max(frame, 0), clip.frames - 1);

const looped = (clip: WalkerClip, frame: number): number => {
  const inClip = Math.floor(frame) % clip.frames;
  return clip.start + (inClip < 0 ? inClip + clip.frames : inClip);
};

const stepping = (
  clip: WalkerClip,
  walker: PedestrianView,
  stride: number,
  look: WalkerLook
): number => {
  const travelled = walker.x * walker.across;
  return looped(
    clip,
    (travelled / (stride * look.scale) + look.offset) * clip.frames
  );
};

export const walkerFrameOf = (
  clips: WalkerClips,
  walker: PedestrianView,
  tick: number,
  fellAt: number,
  look: WalkerLook
): number => {
  const inTicks = (tick + look.offset * clips.wait.frames) / TICKS_PER_FRAME;
  switch (walker.mode) {
    case "walking": {
      return Math.abs(walker.drift) > RUN_ABOVE
        ? stepping(clips.run, walker, RUN_STRIDE, look)
        : stepping(clips.walk, walker, WALK_STRIDE, look);
    }
    case "flinching": {
      return once(
        clips.flinch,
        clips.flinch.frames -
          1 -
          Math.floor((walker.wait - 1) / TICKS_PER_FRAME)
      );
    }
    case "down": {
      const left = Math.floor((walker.wait - 1) / TICKS_PER_FRAME);
      if (left < clips.get_up.frames) {
        return once(clips.get_up, clips.get_up.frames - 1 - left);
      }
      const fallen = Math.floor((tick - fellAt) / TICKS_PER_FRAME);
      return fallen < clips.fall.frames
        ? once(clips.fall, fallen)
        : looped(clips.lie, inTicks);
    }
    case "waiting": {
      return looped(clips.wait, inTicks);
    }
    default: {
      return walker.mode satisfies never;
    }
  }
};
