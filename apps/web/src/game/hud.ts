import type { CareerRaceSetup } from "@racer/career/field";
import type { RaceOutcome } from "@racer/career/outcome";
import type { RaceRules } from "@racer/career/rules";
import type { BikeId } from "@racer/sim/bikes";

import type { PrepareOutcome } from "./preparation.ts";

export type GamePhase = "attract" | "idle" | "countdown" | "racing" | "settled";

export type RaceMode = "career" | "quick";

export interface RacePlan {
  readonly mode: RaceMode;
  readonly bikeId: BikeId;
  readonly rules: RaceRules;
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

export interface GameEvents {
  readonly onHud: (hud: HudState) => void;
  readonly onStart: (plan: RacePlan) => void;
  readonly onSettle: (plan: RacePlan, outcome: RaceOutcome) => void;
  readonly onOver: (plan: RacePlan, outcome: RaceOutcome) => void;
}

export interface GameHandle {
  readonly sleep: () => void;
  readonly prepare: (plan: RacePlan) => Promise<PrepareOutcome>;
  readonly startRace: (plan: RacePlan) => void;
  readonly pause: () => boolean;
  readonly resume: () => void;
  readonly quit: () => RaceOutcome | null;
  readonly toggleMute: () => void;
  readonly followRival: (tag: HTMLElement | null) => void;
  readonly dispose: () => void;
}
