export type GamePhase = "attract" | "countdown" | "racing" | "finished";

export type Notice = "" | "wipeout" | "close" | "air";

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
}

export const idleHud: HudState = {
  countdown: 0,
  crashes: 0,
  muted: false,
  notice: "",
  noticeDetail: "",
  phase: "attract",
  progress: 0,
  seconds: 0,
  speedKmh: 0,
  topSpeedKmh: 0,
};

export interface GameHandle {
  startRace: () => void;
  toggleMute: () => void;
  dispose: () => void;
}
