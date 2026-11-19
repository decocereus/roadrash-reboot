import type { EngineCharacter } from "./characters.ts";
import { gainGlide, pitchGlide } from "./glide.ts";
import type { Param } from "./glide.ts";

const SHIFT_SECONDS = 0.12;

export interface EngineControl {
  readonly drive: (
    on: boolean,
    revs: number,
    throttle: number,
    now: number
  ) => void;
  readonly dip: (now: number) => void;
}

export interface EngineParams {
  readonly saw: Param;
  readonly square: Param;
  readonly growl: Param;
  readonly fifth: Param;
  readonly level: Param;
  readonly tone: Param;
  readonly shift: Param;
}

export const engineControl = (
  character: EngineCharacter,
  params: EngineParams
): EngineControl => {
  const glides = {
    fifth: pitchGlide(params.fifth, character.glide),
    growl: pitchGlide(params.growl, character.glide),
    level: gainGlide(params.level, 0.06),
    saw: pitchGlide(params.saw, character.glide),
    square: pitchGlide(params.square, character.glide),
    tone: pitchGlide(params.tone, 0.08),
  };
  return {
    dip(now) {
      params.shift.cancelScheduledValues(now);
      params.shift.setValueAtTime(0.25, now);
      params.shift.linearRampToValueAtTime(1, now + SHIFT_SECONDS);
    },
    drive(on, revs, throttle, now) {
      const hertz =
        character.idle + (character.redline - character.idle) * revs ** 1.1;
      glides.saw.to(hertz, now);
      glides.square.to(hertz, now);
      glides.growl.to(hertz / 2, now);
      glides.fifth.to((hertz * 2) / 3, now);
      glides.level.to(on ? 0.06 + throttle * 0.1 + revs * 0.03 : 0, now);
      glides.tone.to(character.tone + throttle * 1500 + revs * 1200, now);
    },
  };
};
