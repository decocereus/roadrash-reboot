import type { CareerRaceSetup } from "@racer/career/field";
import type { RaceOutcome } from "@racer/career/outcome";
import type { BikeId } from "@racer/sim/bikes";

export type GamePhase = "attract" | "idle" | "countdown" | "racing" | "settled";

export type RaceMode = "career" | "quick";

export interface RacePlan {
  readonly mode: RaceMode;
  readonly bikeId: BikeId;
  readonly setup: CareerRaceSetup;
}

export type Notice =
  | ""
  | "wipeout"
  | "knockdown"
  | "armed"
  | "disarmed"
  | "broken"
  | "police"
  | "lastKm"
  | "marked";

export interface HudState {
  readonly phase: GamePhase;
  readonly countdown: number;
  readonly speedKmh: number;
  readonly gear: number;
  readonly offBike: boolean;
  readonly progress: number;
  readonly notice: Notice;
  readonly noticeDetail: string;
  readonly muted: boolean;
  readonly position: number;
  readonly riderCount: number;
  readonly stamina: number;
  readonly rivalName: string;
  readonly rivalStamina: number;
  readonly rivalColour: string;
  readonly speech: string;
  readonly weaponName: string;
  readonly weaponHits: number;
  readonly weaponCapacity: number;
  readonly bikeName: string;
  readonly condition: number;
  readonly copDistance: number;
  readonly distanceLeft: number;
  readonly roadName: string;
  readonly roadLength: number;
}

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

export interface GameEvents {
  readonly onHud: (hud: HudState) => void;
  readonly onStart: (plan: RacePlan) => void;
  readonly onSettle: (plan: RacePlan, outcome: RaceOutcome) => void;
  readonly onOver: (plan: RacePlan, outcome: RaceOutcome) => void;
}

export interface GameHandle {
  readonly attract: () => void;
  readonly sleep: () => void;
  readonly startRace: (plan: RacePlan) => void;
  readonly pause: () => boolean;
  readonly resume: () => void;
  readonly quit: () => RaceOutcome | null;
  readonly toggleMute: () => void;
  readonly followRival: (tag: HTMLElement | null) => void;
  readonly dispose: () => void;
}

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
