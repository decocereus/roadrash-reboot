const HUD_INTERVAL = 1 / 15;

interface HudClock {
  hudClock: number;
  hudStalled: boolean;
}

export const advanceHud = (
  clock: HudClock,
  seconds: number,
  stalled: boolean,
  report: () => void
): void => {
  clock.hudClock += seconds;
  if (clock.hudClock >= HUD_INTERVAL || stalled !== clock.hudStalled) {
    clock.hudClock = 0;
    clock.hudStalled = stalled;
    report();
  }
};
