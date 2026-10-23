import { TICK_SECONDS } from "@racer/sim/state";

interface FixedClock {
  accumulator: number;
  clockReset: boolean;
}

export const createFixedTick = (
  clock: FixedClock,
  halted: () => boolean,
  tick: () => void
): ((seconds: number) => number) => {
  const advance = (seconds: number): number => {
    if (clock.clockReset) {
      clock.accumulator = 0;
      clock.clockReset = false;
    }
    clock.accumulator += seconds;
    let ticks = 0;
    while (clock.accumulator >= TICK_SECONDS && !halted()) {
      tick();
      ticks += 1;
      clock.accumulator -= TICK_SECONDS;
      if (clock.clockReset) {
        break;
      }
    }
    return ticks;
  };
  return advance;
};
