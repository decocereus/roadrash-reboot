const PITCH_STEP = 0.005;
const GAIN_STEP = 0.002;
const SETTLE = 10;

export interface Param {
  readonly cancelScheduledValues: (cancelTime: number) => Param;
  readonly setValueAtTime: (value: number, startTime: number) => Param;
  readonly setTargetAtTime: (
    target: number,
    startTime: number,
    timeConstant: number
  ) => Param;
  readonly linearRampToValueAtTime: (value: number, endTime: number) => Param;
}

export interface Glide {
  readonly to: (target: number, now: number) => void;
  readonly set: (value: number, at: number) => void;
}

const glide = (
  param: Param,
  seconds: number,
  heard: (from: number, to: number) => boolean
): Glide => {
  let last = Number.NaN;
  return {
    set(value, at) {
      last = value;
      param.cancelScheduledValues(at);
      param.setValueAtTime(value, at);
    },
    to(target, now) {
      if (!Number.isNaN(last) && !heard(last, target)) {
        return;
      }
      last = target;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(target, now, seconds);
      if (target === 0) {
        param.setValueAtTime(0, now + seconds * SETTLE);
      }
    },
  };
};

const pitchMoved = (from: number, to: number): boolean =>
  Math.abs(to - from) > Math.abs(from) * PITCH_STEP;

const gainMoved = (from: number, to: number): boolean =>
  Math.abs(to - from) > GAIN_STEP;

export const pitchGlide = (param: Param, seconds: number): Glide =>
  glide(param, seconds, pitchMoved);

export const gainGlide = (param: Param, seconds: number): Glide =>
  glide(param, seconds, gainMoved);
