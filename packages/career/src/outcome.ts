import { officerFor } from "@racer/sim/cast";
import type { OfficerId, RivalId } from "@racer/sim/cast";
import { distanceLeft, standings } from "@racer/sim/race";
import type {
  RaceEvent,
  RaceState,
  RiderState,
  WeaponKind,
} from "@racer/sim/state";

import type { CareerRaceSetup } from "./field.ts";
import type { ActiveRace, RacerId } from "./state.ts";
import { FIELD_SIZE, roads } from "./tables.ts";
import type { Level, RoadId } from "./tables.ts";

const PLAYER_RIDER = 0;
const WHEEL_TICKS = 30;
const WHEEL_METRES = 25;
const BLAME_METRES = 100;
const METRES_PER_KM = 1000;

export type RaceResult = "finished" | "busted" | "wrecked" | "quit";

export type Fate = "finished" | "racing" | "busted" | "wrecked";

export type BustWitness = "none" | "near" | "far";

export interface Placing {
  readonly racer: RacerId;
  readonly place: number;
  readonly fate: Fate;
  readonly finishTick: number;
  readonly metresLeft: number;
}

export interface RivalIncidents {
  readonly rival: RivalId;
  readonly knockedDownByPlayer: number;
  readonly knockdownKm: number;
  readonly knockedPlayerDown: number;
  readonly weaponTakenByPlayer: WeaponKind;
  readonly tookPlayerWeapon: WeaponKind;
  readonly tradedHits: boolean;
  readonly busted: BustWitness;
  readonly beatPlayerByAWheel: boolean;
  readonly lostToPlayerByAWheel: boolean;
}

export interface Arrest {
  readonly officer: OfficerId;
  readonly fine: number;
  readonly km: number;
  readonly weapon: WeaponKind;
}

export interface RaceOutcome {
  readonly roadId: RoadId;
  readonly level: Level;
  readonly seed: number;
  readonly result: RaceResult;
  readonly place: number;
  readonly tick: number;
  readonly finishTick: number;
  readonly weapon: WeaponKind;
  readonly weaponHits: number;
  readonly arrest: Arrest | null;
  readonly placings: readonly Placing[];
  readonly incidents: readonly RivalIncidents[];
}

interface Tally {
  knockedDownByPlayer: number;
  knockdownKm: number;
  knockedPlayerDown: number;
  weaponTakenByPlayer: WeaponKind;
  tookPlayerWeapon: WeaponKind;
  tradedHits: boolean;
  busted: BustWitness;
}

export interface RaceLog {
  readonly tallies: Tally[];
  heldWeapon: WeaponKind;
  weaponAtThrow: WeaponKind;
  bodyS: number;
  fine: number;
  outcome: RaceOutcome | null;
}

export const createRaceLog = (setup: CareerRaceSetup): RaceLog => ({
  bodyS: 0,
  fine: setup.police.fine,
  heldWeapon: setup.player.weaponHits > 0 ? setup.player.weapon : "none",
  outcome: null,
  tallies: setup.field.map(() => ({
    busted: "none",
    knockdownKm: 0,
    knockedDownByPlayer: 0,
    knockedPlayerDown: 0,
    tookPlayerWeapon: "none",
    tradedHits: false,
    weaponTakenByPlayer: "none",
  })),
  weaponAtThrow: "none",
});

const kmOf = (metres: number): number => Math.max(0, metres) / METRES_PER_KM;

const noteCrash = (
  log: RaceLog,
  state: RaceState,
  event: RaceEvent & { readonly kind: "crash" }
): void => {
  if (event.rider === PLAYER_RIDER) {
    log.weaponAtThrow = log.heldWeapon;
  }
  if (event.cause === "rider") {
    return;
  }
  const attacker = log.tallies[event.by - 1];
  if (event.rider === PLAYER_RIDER && attacker) {
    attacker.knockedPlayerDown += 1;
  }
  const victim = log.tallies[event.rider - 1];
  if (event.by === PLAYER_RIDER && victim) {
    victim.knockedDownByPlayer += 1;
    victim.knockdownKm = kmOf(state.riders[event.rider]?.s ?? 0);
  }
};

const noteEvent = (log: RaceLog, state: RaceState, event: RaceEvent): void => {
  if (event.kind === "crash") {
    noteCrash(log, state, event);
    return;
  }
  if (event.kind === "busted") {
    const tally = log.tallies[event.rider - 1];
    const rival = state.riders[event.rider];
    const player = state.riders[PLAYER_RIDER];
    if (event.rider === PLAYER_RIDER) {
      log.fine = event.fine;
    }
    if (tally && rival && player) {
      tally.busted =
        Math.abs(player.bodyS - rival.s) <= BLAME_METRES ? "near" : "far";
    }
    return;
  }
  if (event.kind !== "hit" && event.kind !== "weaponTaken") {
    return;
  }
  const struck = log.tallies[event.target - 1];
  const striker = log.tallies[event.rider - 1];
  if (event.rider === PLAYER_RIDER && struck) {
    struck.tradedHits = true;
    struck.weaponTakenByPlayer =
      event.kind === "weaponTaken" ? event.weapon : struck.weaponTakenByPlayer;
  }
  if (event.target === PLAYER_RIDER && striker) {
    striker.tradedHits = true;
    striker.tookPlayerWeapon =
      event.kind === "weaponTaken" ? event.weapon : striker.tookPlayerWeapon;
  }
};

const terminalOf = (events: readonly RaceEvent[]): RaceResult | null => {
  for (const event of events) {
    if (event.rider !== PLAYER_RIDER) {
      continue;
    }
    if (event.kind === "finish") {
      return "finished";
    }
    if (event.kind === "busted" || event.kind === "wrecked") {
      return event.kind;
    }
  }
  return null;
};

const fateOf = (rider: RiderState): Fate => {
  if (rider.finishTick >= 0) {
    return "finished";
  }
  return rider.mode === "busted" || rider.mode === "wrecked"
    ? rider.mode
    : "racing";
};

const isOut = (rider: RiderState | undefined): boolean =>
  rider?.mode === "busted" || rider?.mode === "wrecked";

const orderOf = (state: RaceState, result: RaceResult): number[] => {
  const order = standings(state);
  const player = state.riders[PLAYER_RIDER];
  if (result !== "quit" || !player) {
    return order;
  }
  const others = order.filter((index) => index !== PLAYER_RIDER);
  const behind = others.findIndex((index) => {
    const rider = state.riders[index];
    return isOut(rider) && (rider?.bodyS ?? 0) < player.bodyS;
  });
  const slot = behind === -1 ? others.length : behind;
  return [...others.slice(0, slot), PLAYER_RIDER, ...others.slice(slot)];
};

const byAWheelAhead = (player: RiderState, rival: RiderState): boolean =>
  player.finishTick >= 0 &&
  rival.finishTick >= 0 &&
  player.finishTick - rival.finishTick <= WHEEL_TICKS;

const byAWheelBehind = (player: RiderState, rival: RiderState): boolean => {
  if (player.finishTick < 0) {
    return false;
  }
  if (rival.finishTick >= 0) {
    return rival.finishTick === player.finishTick;
  }
  return rival.mode === "riding" && player.s - rival.s <= WHEEL_METRES;
};

const classify = (
  log: RaceLog,
  state: RaceState,
  setup: CareerRaceSetup,
  result: RaceResult
): RaceOutcome => {
  const order = orderOf(state, result);
  const player = state.riders[PLAYER_RIDER];
  const playerSpot = order.indexOf(PLAYER_RIDER);
  const racerOf = (index: number): RacerId =>
    setup.field[index - 1] ?? "player";
  const placings = order.flatMap((index, spot): Placing[] => {
    const rider = state.riders[index];
    if (!rider) {
      return [];
    }
    const quitter = index === PLAYER_RIDER && result === "quit";
    return [
      {
        fate: quitter ? "wrecked" : fateOf(rider),
        finishTick: rider.finishTick,
        metresLeft: distanceLeft(setup.track, rider),
        place: spot + 1,
        racer: racerOf(index),
      },
    ];
  });
  const incidents = setup.field.flatMap((rival, slot): RivalIncidents[] => {
    const tally = log.tallies[slot];
    const rider = state.riders[slot + 1];
    if (!(tally && rider && player)) {
      return [];
    }
    const ahead = order.indexOf(slot + 1) < playerSpot;
    return [
      {
        ...tally,
        beatPlayerByAWheel: ahead && byAWheelAhead(player, rider),
        lostToPlayerByAWheel: !ahead && byAWheelBehind(player, rider),
        rival,
      },
    ];
  });
  const finished = result === "finished";
  return {
    arrest:
      result === "busted"
        ? {
            fine: log.fine,
            km: kmOf(log.bodyS),
            officer: officerFor(roads[setup.roadId].region).id,
            weapon: log.weaponAtThrow,
          }
        : null,
    finishTick: player?.finishTick ?? -1,
    incidents,
    level: setup.level,
    place: playerSpot === -1 ? FIELD_SIZE : playerSpot + 1,
    placings,
    result,
    roadId: setup.roadId,
    seed: setup.seed,
    tick: state.tick,
    weapon: finished ? (player?.weapon ?? "none") : "none",
    weaponHits: finished ? (player?.weaponHits ?? 0) : 0,
  };
};

export const recordTick = (
  log: RaceLog,
  state: RaceState,
  setup: CareerRaceSetup
): void => {
  if (log.outcome) {
    return;
  }
  for (const event of state.events) {
    noteEvent(log, state, event);
  }
  const result = terminalOf(state.events);
  if (result) {
    log.outcome = classify(log, state, setup, result);
    return;
  }
  const player = state.riders[PLAYER_RIDER];
  if (player) {
    log.heldWeapon = player.weapon;
    log.bodyS = player.bodyS;
  }
};

export const outcomeOf = (
  state: RaceState,
  setup: CareerRaceSetup,
  log: RaceLog
): RaceOutcome => log.outcome ?? classify(log, state, setup, "quit");

export const abandonedOutcome = (race: ActiveRace): RaceOutcome => ({
  arrest: null,
  finishTick: -1,
  incidents: [],
  level: race.level,
  place: FIELD_SIZE,
  placings: [],
  result: "quit",
  roadId: race.roadId,
  seed: race.seed,
  tick: 0,
  weapon: "none",
  weaponHits: 0,
});
