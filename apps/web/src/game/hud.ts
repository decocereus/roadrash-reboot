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
  | "busted";

export interface Placing {
  readonly name: string;
  readonly seconds: number;
  readonly busted: boolean;
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
  readonly copChasing: boolean;
  readonly busted: boolean;
  readonly fine: number;
  readonly placings: readonly Placing[];
}

export const idleHud: HudState = {
  busted: false,
  copChasing: false,
  countdown: 0,
  crashes: 0,
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
  seconds: 0,
  speedKmh: 0,
  stamina: 100,
  topSpeedKmh: 0,
  weaponHits: 0,
  weaponName: "",
};

export interface GameHandle {
  startRace: () => void;
  toggleMute: () => void;
  dispose: () => void;
}
