export type RacePhase = "ready" | "racing" | "finished" | "aborted";

export type RiderId = "player" | "violet" | "amber" | "mint";

export interface RiderSnapshot {
  id: RiderId;
  name: string;
  lane: number;
  progress: number;
  speed: number;
  health: number;
  crashed: boolean;
  attackFlash: number;
  color: number;
  place?: number;
}

export interface TrafficSnapshot {
  lane: number;
  progress: number;
  speed: number;
  color: number;
}

export interface RaceSnapshot {
  phase: RacePhase;
  elapsed: number;
  distance: number;
  player: RiderSnapshot;
  riders: RiderSnapshot[];
  traffic: TrafficSnapshot[];
  position: number;
  finishOrder: RiderId[];
}

export interface RiderInput {
  steer: -1 | 0 | 1;
  throttle: boolean;
  brake: boolean;
  attack: boolean;
}

export const RACE_DISTANCE = 1_800;

export const riderRoster: readonly RiderSnapshot[] = [
  {
    id: "player",
    name: "YOU",
    lane: 1,
    progress: 0,
    speed: 0,
    health: 100,
    crashed: false,
    attackFlash: 0,
    color: 0xff4f72,
  },
  {
    id: "violet",
    name: "VEX",
    lane: 2,
    progress: -7,
    speed: 0,
    health: 100,
    crashed: false,
    attackFlash: 0,
    color: 0xb66cff,
  },
  {
    id: "amber",
    name: "RUNE",
    lane: 0,
    progress: -14,
    speed: 0,
    health: 100,
    crashed: false,
    attackFlash: 0,
    color: 0xffbd4a,
  },
  {
    id: "mint",
    name: "KITE",
    lane: 3,
    progress: -21,
    speed: 0,
    health: 100,
    crashed: false,
    attackFlash: 0,
    color: 0x46e3bd,
  },
];

const cloneRider = (rider: RiderSnapshot): RiderSnapshot => ({ ...rider });

export function createRaceSnapshot(): RaceSnapshot {
  return {
    phase: "ready",
    elapsed: 0,
    distance: RACE_DISTANCE,
    player: cloneRider(riderRoster[0]),
    riders: riderRoster.map(cloneRider),
    traffic: [
      { lane: 0, progress: 120, speed: 22, color: 0x4e6573 },
      { lane: 3, progress: 215, speed: 28, color: 0xd68550 },
      { lane: 2, progress: 390, speed: 24, color: 0x647899 },
      { lane: 1, progress: 560, speed: 31, color: 0x9f586a },
      { lane: 0, progress: 740, speed: 26, color: 0xc3a153 },
      { lane: 3, progress: 910, speed: 21, color: 0x5d8c91 },
      { lane: 2, progress: 1_080, speed: 27, color: 0x78648a },
    ],
    position: 4,
    finishOrder: [],
  };
}
