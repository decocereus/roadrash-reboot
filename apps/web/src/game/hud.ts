export type GamePhase = "attract" | "countdown" | "racing" | "finished";

export type Notice =
  | ""
  | "wipeout"
  | "close"
  | "air"
  | "hit"
  | "knockdown"
  | "armed"
  | "disarmed"
  | "broken"
  | "police"
  | "busted"
  | "wrecked";

export interface Placing {
  readonly name: string;
  readonly seconds: number;
  readonly busted: boolean;
  readonly wrecked: boolean;
  readonly you: boolean;
}

export interface HudState {
  readonly phase: GamePhase;
  readonly countdown: number;
  readonly speedKmh: number;
  readonly seconds: number;
  readonly progress: number;
  readonly crashes: number;
  readonly topSpeedKmh: number;
  readonly notice: Notice;
  readonly noticeDetail: string;
  readonly muted: boolean;
  readonly position: number;
  readonly riderCount: number;
  readonly stamina: number;
  readonly rivalName: string;
  readonly rivalStamina: number;
  readonly weaponName: string;
  readonly weaponHits: number;
  readonly bikeName: string;
  readonly condition: number;
  readonly copDistance: number;
  readonly distanceLeft: number;
  readonly roadName: string;
  readonly roadLength: number;
  readonly busted: boolean;
  readonly wrecked: boolean;
  readonly fine: number;
  readonly placings: readonly Placing[];
}

export const idleHud: HudState = {
  bikeName: "",
  busted: false,
  condition: 1,
  copDistance: -1,
  countdown: 0,
  crashes: 0,
  distanceLeft: 0,
  fine: 0,
  muted: false,
  notice: "",
  noticeDetail: "",
  phase: "attract",
  placings: [],
  position: 1,
  progress: 0,
  riderCount: 1,
  rivalName: "",
  rivalStamina: 0,
  roadLength: 0,
  roadName: "",
  seconds: 0,
  speedKmh: 0,
  stamina: 100,
  topSpeedKmh: 0,
  weaponHits: 0,
  weaponName: "",
  wrecked: false,
};

export interface GameHandle {
  startRace: () => void;
  toggleMute: () => void;
  dispose: () => void;
}
