const PITCH_STEP = 0.005;
const GAIN_STEP = 0.002;

export type Glide = (target: number, now: number) => void;

const glide = (
  param: AudioParam,
  seconds: number,
  heard: (from: number, to: number) => boolean
): Glide => {
  let last = Number.NaN;
  return (target, now) => {
    if (!Number.isNaN(last) && !heard(last, target)) {
      return;
    }
    last = target;
    param.setTargetAtTime(target, now, seconds);
  };
};

const pitchMoved = (from: number, to: number): boolean =>
  Math.abs(to - from) > Math.abs(from) * PITCH_STEP;

const gainMoved = (from: number, to: number): boolean =>
  Math.abs(to - from) > GAIN_STEP;

export const pitchGlide = (param: AudioParam, seconds: number): Glide =>
  glide(param, seconds, pitchMoved);

export const gainGlide = (param: AudioParam, seconds: number): Glide =>
  glide(param, seconds, gainMoved);
