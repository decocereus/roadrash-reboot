import { controlOf } from "@racer/sim/control";
import { defaultSetup, neutralInput } from "@racer/sim/race";
import { track } from "@racer/sim/race-fixtures";
import { createRoom, roomSetup } from "@racer/sim/room";
import { createRoomClient } from "@racer/sim/room-client";
import { PLAYER_RIDER, riderIdAt, riderOf } from "@racer/sim/state";
import type { Control, HeardFight, RiderId } from "@racer/sim/state";
import { strikeOf } from "@racer/sim/weapons";
import { describe, expect, it } from "vitest";

import {
  fightFlinch,
  fightHeard,
  fightTick,
  quietFight,
  strikeFrame,
} from "./rider-fight.ts";
import type { RiderFight, StrikeFrame } from "./rider-fight.ts";

const KICK = strikeOf("kick", "none");
const CONTACT = KICK.ticks - KICK.strikeTick;
const STRIKER = riderIdAt(1);
const riding = { airborne: false, lastHitTick: -1 };

const kickAt = (tick: number): HeardFight => ({
  event: {
    attack: "kick",
    kind: "attack",
    rider: STRIKER,
    side: -1,
    weapon: "none",
  },
  tick,
});

const hitOnStriker = (tick: number): HeardFight => ({
  event: {
    attack: "punch",
    kind: "hit",
    rider: PLAYER_RIDER,
    target: STRIKER,
    weapon: "none",
  },
  tick,
});

const reachOf = (fight: RiderFight): number => {
  const frame: StrikeFrame = { pose: "seated", reach: 0, rise: 0 };
  return strikeFrame(fight, 0, frame) ? frame.reach : -1;
};

const fighters = () => [{ fight: quietFight(-1) }, { fight: quietFight(-1) }];

const played = (
  heard: readonly HeardFight[],
  drawnTick: number,
  ticks: number
) => {
  const cast = fighters();
  for (const one of heard) {
    fightHeard(cast, one, drawnTick);
  }
  const striker = cast[1]?.fight ?? quietFight(-1);
  const reaches: number[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    reaches.push(reachOf(striker));
    fightTick(striker, riding, drawnTick + tick + 1);
  }
  return { reaches, striker };
};

describe("how a rider's strike track plays what it hears", () => {
  it("plays a strike heard on its own tick from the first frame", () => {
    const { reaches } = played([kickAt(100)], 100, KICK.ticks + 1);
    expect([reaches[0], reaches[CONTACT], reaches.at(-1)]).toStrictEqual([
      0, 1, -1,
    ]);
  });

  it("starts a strike heard late at its contact pose, never past it", () => {
    for (const late of [CONTACT, CONTACT + 1, 30]) {
      const { striker } = played([kickAt(100)], 100 + late, 0);
      expect(striker.elapsed).toBe(CONTACT);
    }
  });

  it("plays a second strike after the first instead of dropping it", () => {
    const second = 100 + KICK.cooldown;
    const { reaches } = played([kickAt(100), kickAt(second)], 140, 40);
    const starts = reaches.filter(
      (reach, at) => reach >= 0 && (reaches[at - 1] ?? -1) < 0
    );
    expect(starts).toStrictEqual([1, 1]);
  });

  it("clears a strike when its rider is hit after it started", () => {
    const { striker } = played([kickAt(100), hitOnStriker(102)], 120, 0);
    expect(striker.attack).toBe("none");
  });

  it("keeps a strike that started after the hit on its rider", () => {
    const { striker } = played([hitOnStriker(99), kickAt(100)], 120, 0);
    expect(striker.attack).toBe("kick");
  });

  it("stops a strike when the rider leaves the ground", () => {
    const { striker } = played([kickAt(100)], 100, 2);
    fightTick(striker, { ...riding, airborne: true }, 103);
    expect(reachOf(striker)).toBe(-1);
  });

  it("flinches in full once for each new hit the guessed race shows", () => {
    const fight = quietFight(-1);
    fightTick(fight, { ...riding, lastHitTick: 50 }, 60);
    const first = fightFlinch(fight, 0, 0);
    fightTick(fight, { ...riding, lastHitTick: 50 }, 61);
    expect([first, fightFlinch(fight, 0, 0)]).toStrictEqual([
      1,
      expect.closeTo(0.9),
    ]);
  });
});

const VICTIM = PLAYER_RIDER;
const ATTACKER = riderIdAt(1);
const OBSERVER = riderIdAt(2);
const SEATS = [VICTIM, ATTACKER, OBSERVER] as const;
const KICK_AT = 240;
const BURST = 20;
const TWO_KICK_BURST = 40;
const AFTER_TICKS = 60;
const SIDE_BY_SIDE_X = 1.6;
const ATTACKER_BEHIND_S = 2.6;
const OBSERVER_AHEAD_S = 40;
const LEAD = 13;
const rideOn = controlOf({ ...neutralInput, throttle: 1 });
const kicking = controlOf({ ...neutralInput, kick: true, throttle: 1 });

type Plan = (rider: RiderId, tick: number) => Control;

interface Drawn {
  readonly attackerReach: number;
  readonly victimFlinch: number;
  readonly victimHitTick: number;
}

const raceSeenBy = (me: RiderId, bunch: number, plan: Plan) => {
  const setup = roomSetup(defaultSetup(track, 3), [...SEATS]);
  const room = createRoom(setup);
  const client = createRoomClient(setup, me);
  for (const state of [room.state, client.confirmed, client.predicted]) {
    const victim = riderOf(state.riders, VICTIM);
    const attacker = riderOf(state.riders, ATTACKER);
    const observer = riderOf(state.riders, OBSERVER);
    if (victim && attacker && observer) {
      attacker.s = victim.s - ATTACKER_BEHIND_S;
      attacker.x = victim.x - SIDE_BY_SIDE_X;
      observer.s = victim.s + OBSERVER_AHEAD_S;
    }
  }
  const cast = client.predicted.riders.map((rider) => ({
    fight: quietFight(rider.lastHitTick),
  }));
  const drawn: Drawn[] = [];
  const drawOne = () => {
    client.predict(plan(me, client.predicted.tick + 1));
    const { riders, tick } = client.predicted;
    for (const seat of SEATS) {
      const view = riderOf(cast, seat);
      const rider = riderOf(riders, seat);
      if (view && rider) {
        fightTick(view.fight, rider, tick);
      }
    }
    for (const heard of client.takeFights()) {
      fightHeard(cast, heard, tick);
    }
    const attacker = riderOf(cast, ATTACKER)?.fight ?? quietFight(-1);
    const victim = riderOf(riders, VICTIM);
    drawn.push({
      attackerReach: reachOf(attacker),
      victimFlinch: fightFlinch(
        riderOf(cast, VICTIM)?.fight ?? quietFight(-1),
        victim?.hitStun ?? 0,
        0
      ),
      victimHitTick: victim?.lastHitTick ?? -1,
    });
  };
  for (let tick = 0; tick < LEAD; tick += 1) {
    drawOne();
  }
  for (let tick = 1; tick <= KICK_AT + AFTER_TICKS; tick += bunch) {
    for (let step = tick; step < tick + bunch; step += 1) {
      for (const seat of SEATS) {
        room.accept(seat, step, [plan(seat, step)]);
      }
      room.step();
      client.confirm(room.frame, null);
    }
    for (let step = 0; step < bunch; step += 1) {
      drawOne();
    }
  }
  return drawn;
};

const attackerKicksAt =
  (...ticks: readonly number[]): Plan =>
  (rider, tick) =>
    rider === ATTACKER && ticks.includes(tick) ? kicking : rideOn;

const shoveFrame = (drawn: readonly Drawn[]) =>
  drawn.find(
    (one, at) =>
      at > 0 && one.victimHitTick > (drawn[at - 1]?.victimHitTick ?? 0)
  );

describe("another rider's strike in a real race", () => {
  it("shows the leg at contact and the full flinch on the frame of the shove when a burst starts with the kick", () => {
    const firstOfBurst = KICK_AT + 1;
    const shove = shoveFrame(
      raceSeenBy(VICTIM, BURST, attackerKicksAt(firstOfBurst))
    );
    expect([shove?.attackerReach, shove?.victimFlinch]).toStrictEqual([1, 1]);
  });

  it("plays both of one rider's strikes from one burst", () => {
    const first = KICK_AT + 1;
    const second = first + KICK.cooldown + 1;
    const drawn = raceSeenBy(
      OBSERVER,
      TWO_KICK_BURST,
      attackerKicksAt(first, second)
    );
    const strikes = drawn.filter(
      (one, at) =>
        one.attackerReach >= 0 && (drawn[at - 1]?.attackerReach ?? -1) < 0
    );
    expect(strikes).toHaveLength(2);
  });

  it("clears the leg of a striker hit before contact", () => {
    const struckFirst: Plan = (rider, tick) =>
      (rider === VICTIM && tick === KICK_AT - 2) ||
      (rider === ATTACKER && tick === KICK_AT)
        ? kicking
        : rideOn;
    const legOut = (plan: Plan) =>
      raceSeenBy(OBSERVER, 1, plan).filter((one) => one.attackerReach >= 0)
        .length;
    expect(legOut(struckFirst)).toBeLessThan(legOut(attackerKicksAt(KICK_AT)));
  });
});
