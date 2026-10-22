import type { HudState } from "./game/hud.ts";

export const idleHud: HudState = {
  bikeName: "",
  condition: 1,
  copDistance: -1,
  countdown: 0,
  distanceLeft: 0,
  gear: 1,
  muted: false,
  notice: "",
  noticeDetail: "",
  offBike: false,
  phase: "attract",
  position: 1,
  progress: 0,
  riderCount: 1,
  rivalColour: "",
  rivalName: "",
  rivalStamina: 0,
  roadLength: 0,
  roadName: "",
  speech: "",
  speedKmh: 0,
  stamina: 1,
  weaponCapacity: 0,
  weaponHits: 0,
  weaponName: "",
};

export interface HudFeed {
  readonly read: () => HudState;
  readonly write: (hud: HudState) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export const createHudFeed = (): HudFeed => {
  let current = idleHud;
  const listeners = new Set<() => void>();
  return {
    read: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    write(hud) {
      current = hud;
      for (const listener of listeners) {
        listener();
      }
    },
  };
};
