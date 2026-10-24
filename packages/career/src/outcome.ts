import { officerFor } from "@racer/sim/cast";
import type { OfficerId, RivalId } from "@racer/sim/cast";
import { distanceLeft, standings } from "@racer/sim/race";
import type { RaceView, RiderView } from "@racer/sim/race-view";
import { PLAYER_RIDER } from "@racer/sim/state";
import type { RaceEvent, WeaponKind } from "@racer/sim/state";

import type { CareerRaceSetup } from "./field.ts";
import type { RaceRules } from "./rules.ts";
import type { ActiveRace, RacerId } from "./state.ts";
import { roads } from "./tables.ts";
import type { Level, RoadId } from "./tables.ts";

const WHEEL_TICKS = 30;
const WHEEL_METRES = 25;
const BLAME_METRES = 100;
const METRES_PER_KM = 1000;

export const raceResults = ["finished", "busted", "wrecked", "quit"] as const;

export type RaceResult = (typeof raceResults)[number];

export const fates = ["finished", "racing", "busted", "wrecked"] as const;

type Fate = (typeof fates)[number];

export const witnesses = ["none", "near", "far"] as const;

type BustWitness = (typeof witnesses)[number];

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
  readonly knockdownTick: number;
  readonly knockedPlayerDown: number;
  readonly knockedPlayerDownKm: number;
  readonly knockedPlayerDownTick: number;
  readonly weaponTakenByPlayer: WeaponKind;
  readonly weaponTakenTick: number;
  readonly tookPlayerWeapon: WeaponKind;
  readonly tradedHits: boolean;
  readonly busted: BustWitness;
  readonly bustedTick: number;
  readonly beatPlayerByAWheel: boolean;
  readonly lostToPlayerByAWheel: boolean;
}

interface Arrest {
  readonly officer: OfficerId;
  readonly fine: number;
  readonly km: number;
  readonly x: number;
  readonly weapon: WeaponKind;
}

export interface RaceOutcome {
  readonly raceId: number;
  readonly roadId: RoadId;
  readonly level: Level;
  readonly seed: number;
  readonly result: RaceResult;
  readonly place: number;
  readonly tick: number;
  readonly finishTick: number;
  readonly km: number;
  readonly weapon: WeaponKind;
  readonly weaponHits: number;
  readonly arrest: Arrest | null;
  readonly placings: readonly Placing[];
  readonly incidents: readonly RivalIncidents[];
}

interface Tally {
  knockedDownByPlayer: number;
  knockdownKm: number;
  knockdownTick: number;
  knockedPlayerDown: number;
  knockedPlayerDownKm: number;
  knockedPlayerDownTick: number;
  weaponTakenByPlayer: WeaponKind;
  weaponTakenTick: number;
  tookPlayerWeapon: WeaponKind;
  tradedHits: boolean;
  busted: BustWitness;
  bustedTick: number;
}

export interface RaceLog {
  readonly raceId: number;
  readonly tallies: Tally[];
  outcome: RaceOutcome | null;
}

export const createRaceLog = (setup: CareerRaceSetup): RaceLog => ({
  outcome: null,
  raceId: setup.raceId,
  tallies: setup.field.map(() => ({
    busted: "none",
    bustedTick: 0,
    knockdownKm: 0,
    knockdownTick: 0,
    knockedDownByPlayer: 0,
    knockedPlayerDown: 0,
    knockedPlayerDownKm: 0,
    knockedPlayerDownTick: 0,
    tookPlayerWeapon: "none",
    tradedHits: false,
    weaponTakenByPlayer: "none",
    weaponTakenTick: 0,
  })),
});

const kmOf = (metres: number): number => Math.max(0, metres) / METRES_PER_KM;

type Bust = RaceEvent & { readonly kind: "busted" };

const bustOf = (state: RaceView, riderIndex: number): Bust | undefined => {
  for (const event of state.events) {
    if (event.kind === "busted" && event.rider === riderIndex) {
      return event;
    }
  }
  return undefined;
};

const bodyOf = (state: RaceView, riderIndex: number): number =>
  bustOf(state, riderIndex)?.s ?? state.riders[riderIndex]?.bodyS ?? 0;

const noteCrash = (
  log: RaceLog,
  state: RaceView,
  event: RaceEvent & { readonly kind: "crash" }
): void => {
  if (event.cause === "rider") {
    return;
  }
  const km = kmOf(bodyOf(state, event.rider));
  const attacker = log.tallies[event.by - 1];
  if (event.rider === PLAYER_RIDER && attacker) {
    attacker.knockedPlayerDown += 1;
    attacker.knockedPlayerDownKm = km;
    attacker.knockedPlayerDownTick = state.tick;
  }
  const victim = log.tallies[event.rider - 1];
  if (event.by === PLAYER_RIDER && victim) {
    victim.knockedDownByPlayer += 1;
    victim.knockdownKm = km;
    victim.knockdownTick = state.tick;
  }
};

const noteEvent = (log: RaceLog, state: RaceView, event: RaceEvent): void => {
  if (event.kind === "crash") {
    noteCrash(log, state, event);
    return;
  }
  if (event.kind === "busted") {
    const tally = log.tallies[event.rider - 1];
    if (tally) {
      tally.busted =
        Math.abs(bodyOf(state, PLAYER_RIDER) - event.s) <= BLAME_METRES
          ? "near"
          : "far";
      tally.bustedTick = state.tick;
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
    if (event.kind === "weaponTaken") {
      struck.weaponTakenByPlayer = event.weapon;
      struck.weaponTakenTick = state.tick;
    }
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

const fateOf = (rider: RiderView): Fate => {
  if (rider.finishTick >= 0) {
    return "finished";
  }
  return rider.mode === "busted" || rider.mode === "wrecked"
    ? rider.mode
    : "racing";
};

const isOut = (rider: RiderView | undefined): boolean =>
  rider?.mode === "busted" || rider?.mode === "wrecked";

const orderOf = (state: RaceView, result: RaceResult): number[] => {
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

const beatByAWheel = (player: RiderView, rival: RiderView): boolean =>
  player.finishTick >= 0 &&
  rival.finishTick >= 0 &&
  player.finishTick - rival.finishTick <= WHEEL_TICKS;

const lostByAWheel = (player: RiderView, rival: RiderView): boolean => {
  if (player.finishTick < 0) {
    return false;
  }
  if (rival.finishTick >= 0) {
    return rival.finishTick - player.finishTick <= WHEEL_TICKS;
  }
  return rival.mode === "riding" && player.s - rival.s <= WHEEL_METRES;
};

const arrestOf = (state: RaceView, setup: CareerRaceSetup): Arrest | null => {
  const bust = bustOf(state, PLAYER_RIDER);
  return bust
    ? {
        fine: bust.fine,
        km: kmOf(bust.s),
        officer: officerFor(roads[setup.roadId].region).id,
        weapon: bust.weapon,
        x: bust.x,
      }
    : null;
};

const classify = (
  log: RaceLog,
  state: RaceView,
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
        beatPlayerByAWheel: ahead && beatByAWheel(player, rider),
        lostToPlayerByAWheel: !ahead && lostByAWheel(player, rider),
        rival,
      },
    ];
  });
  const finished = result === "finished";
  return {
    arrest: result === "busted" ? arrestOf(state, setup) : null,
    finishTick: player?.finishTick ?? -1,
    incidents,
    km: kmOf(bodyOf(state, PLAYER_RIDER)),
    level: setup.level,
    place: playerSpot === -1 ? setup.field.length + 1 : playerSpot + 1,
    placings,
    raceId: log.raceId,
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
  state: RaceView,
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
  }
};

export const outcomeOf = (
  state: RaceView,
  setup: CareerRaceSetup,
  log: RaceLog
): RaceOutcome => log.outcome ?? classify(log, state, setup, "quit");

export const abandonedOutcome = (
  rules: RaceRules,
  race: ActiveRace
): RaceOutcome => ({
  arrest: null,
  finishTick: -1,
  incidents: [],
  km: 0,
  level: race.level,
  place: rules.fieldSize,
  placings: [],
  raceId: race.raceId,
  result: "quit",
  roadId: race.roadId,
  seed: race.seed,
  tick: 0,
  weapon: "none",
  weaponHits: 0,
});
