export type GamePhase = "attract" | "countdown" | "racing" | "finished";

export type Notice = "" | "wipeout" | "close" | "air" | "hit" | "knockdown";

export interface Placing {
  readonly name: string;
  readonly seconds: number;
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
  readonly placings: readonly Placing[];
}

export const idleHud: HudState = {
  countdown: 0,
  crashes: 0,
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
};

export interface GameHandle {
  startRace: () => void;
  toggleMute: () => void;
  dispose: () => void;
}
