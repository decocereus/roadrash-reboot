const HUD_INTERVAL = 1 / 15;

interface HudClock {
  hudClock: number;
}

export const advanceHud = (
  clock: HudClock,
  seconds: number,
  report: () => void
): void => {
  clock.hudClock += seconds;
  if (clock.hudClock >= HUD_INTERVAL) {
    clock.hudClock = 0;
    report();
  }
};
