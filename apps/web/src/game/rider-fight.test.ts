import { HIT_STUN_TICKS } from "@racer/sim/combat";
import { controlOf } from "@racer/sim/control";
import { defaultSetup, neutralInput } from "@racer/sim/race";
import { ROOM_LIMIT_TICKS, track } from "@racer/sim/race-fixtures";
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
const GROUNDED = false;

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

const fighters = () => [{ fight: quietFight() }, { fight: quietFight() }];

const played = (
  heard: readonly HeardFight[],
  drawnTick: number,
  ticks: number
) => {
  const cast = fighters();
  for (const one of heard) {
    fightHeard(cast, one, drawnTick);
  }
  const striker = cast[1]?.fight ?? quietFight();
  const reaches: number[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    reaches.push(reachOf(striker));
    fightTick(striker, GROUNDED, drawnTick + tick + 1);
  }
  return { reaches, striker };
};

const strikesOf = (heard: readonly HeardFight[]) => {
  const { reaches } = played(heard, 140, 60);
  return reaches.filter(
    (reach, at) => reach >= 0 && (reaches[at - 1] ?? -1) < 0
  ).length;
};

const struckBy = (rider: RiderId) => ({
  attack: "kick" as const,
  kind: "hit" as const,
  rider,
  target: STRIKER,
  weapon: "none" as const,
});

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

  it("cuts the strike a hit lands in, queued or playing, and keeps the rest", () => {
    const later = 136;
    expect([
      strikesOf([kickAt(100), kickAt(later)]),
      strikesOf([kickAt(100), kickAt(later), hitOnStriker(later + 2)]),
      strikesOf([kickAt(100), kickAt(later), hitOnStriker(102)]),
    ]).toStrictEqual([2, 1, 1]);
  });

  it("plays a strike once when the drawn race and the room both report it", () => {
    const once = played([kickAt(100)], 120, 0).striker;
    for (const again of [kickAt(100), kickAt(101)]) {
      const { striker } = played([kickAt(100), again], 120, 0);
      expect(striker.queued).toStrictEqual(once.queued);
    }
  });

  it("stops a strike when the rider leaves the ground", () => {
    const { striker } = played([kickAt(100)], 100, 2);
    fightTick(striker, true, 103);
    expect(reachOf(striker)).toBe(-1);
  });

  it("keeps another rider's flinch running when one striker's hit on the same target is refused", () => {
    const guessed = riderIdAt(2);
    const real = PLAYER_RIDER;
    const cast = [
      { fight: quietFight() },
      { fight: quietFight() },
      { fight: quietFight() },
    ];
    const struck = cast[1]?.fight ?? quietFight();
    const HIT_AT = 84;
    const DRAWN_AT = 80;
    fightHeard(cast, { event: struckBy(guessed), tick: HIT_AT }, DRAWN_AT);
    fightHeard(cast, { event: struckBy(real), tick: HIT_AT }, DRAWN_AT);
    fightHeard(cast, { refused: struckBy(guessed), tick: HIT_AT }, DRAWN_AT);
    const afterRefusal = fightFlinch(struck, 0, 0);
    const later = 4;
    for (let tick = 1; tick <= later; tick += 1) {
      fightTick(struck, GROUNDED, DRAWN_AT + tick);
    }
    fightHeard(cast, { event: struckBy(real), tick: HIT_AT }, HIT_AT);
    expect([afterRefusal, fightFlinch(struck, 0, 0)]).toStrictEqual([
      1,
      (HIT_STUN_TICKS - later) / HIT_STUN_TICKS,
    ]);
  });

  it("doesn't flinch again when an older hit is confirmed after a newer one", () => {
    const cast = fighters();
    const struck = cast[1]?.fight ?? quietFight();
    const FIRST = 244;
    const SECOND = 260;
    const CONFIRMED_AT = 276;
    fightHeard(cast, hitOnStriker(FIRST), FIRST);
    for (let tick = FIRST + 1; tick <= SECOND; tick += 1) {
      fightTick(struck, GROUNDED, tick);
    }
    fightHeard(cast, hitOnStriker(SECOND), SECOND);
    for (let tick = SECOND + 1; tick <= CONFIRMED_AT; tick += 1) {
      fightTick(struck, GROUNDED, tick);
    }
    fightHeard(cast, hitOnStriker(FIRST), CONFIRMED_AT);
    expect(fightFlinch(struck, 0, 0)).toBe(0);
  });

  it("flinches in full on a shown hit, not again when a correction moves it a tick", () => {
    const cast = fighters();
    const struck = cast[1]?.fight ?? quietFight();
    fightHeard(cast, hitOnStriker(50), 50);
    const first = fightFlinch(struck, 0, 0);
    fightTick(struck, GROUNDED, 51);
    fightHeard(cast, hitOnStriker(51), 51);
    expect([first, fightFlinch(struck, 0, 0)]).toStrictEqual([
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
const AI_FIGHTS_UNTIL = 1200;
const rideOn = controlOf({ ...neutralInput, throttle: 1 });
const kicking = controlOf({ ...neutralInput, kick: true, throttle: 1 });

type Plan = (rider: RiderId, tick: number) => Control;

interface Drawn {
  readonly attackerReach: number;
  readonly attackerLastHit: number;
  readonly victimBumpedAt: number;
  readonly victimFlinch: number;
}

interface Watching {
  readonly behind?: number;
  readonly gapX?: number;
  readonly seats?: readonly RiderId[];
  readonly stepsPerFrame?: readonly [number, ...number[]];
  readonly until?: number;
}

const raceSeenBy = (
  me: RiderId,
  bunch: number,
  plan: Plan,
  {
    behind = ATTACKER_BEHIND_S,
    gapX = SIDE_BY_SIDE_X,
    seats = SEATS,
    stepsPerFrame = [1],
    until = KICK_AT + AFTER_TICKS,
  }: Watching = {}
) => {
  const setup = roomSetup(defaultSetup(track, 3), [...seats]);
  const room = createRoom(setup, ROOM_LIMIT_TICKS);
  const client = createRoomClient(setup, me, ROOM_LIMIT_TICKS);
  for (const state of [room.state, client.confirmed, client.predicted]) {
    const victim = riderOf(state.riders, VICTIM);
    const attacker = riderOf(state.riders, ATTACKER);
    const observer = riderOf(state.riders, OBSERVER);
    if (victim && attacker && observer) {
      attacker.s = victim.s - behind;
      attacker.x = victim.x - gapX;
      observer.s = victim.s + OBSERVER_AHEAD_S;
    }
  }
  const cast = client.predicted.riders.map(() => ({ fight: quietFight() }));
  const drawn: Drawn[] = [];
  const roomHits: number[] = [];
  let frame = 0;
  const drawFrame = (steps: number) => {
    for (let step = 0; step < steps; step += 1) {
      client.predict(plan(me, client.predicted.tick + 1));
      for (const seat of SEATS) {
        const view = riderOf(cast, seat);
        const rider = riderOf(client.predicted.riders, seat);
        if (view && rider) {
          fightTick(view.fight, rider.airborne, client.predicted.tick);
        }
      }
    }
    const { riders, tick } = client.predicted;
    for (const heard of client.takeFights()) {
      fightHeard(cast, heard, tick);
    }
    const attacker = riderOf(cast, ATTACKER)?.fight ?? quietFight();
    const victim = riderOf(riders, VICTIM);
    drawn.push({
      attackerLastHit: Math.max(
        -1,
        ...riders
          .filter(({ lastHitBy }) => lastHitBy === ATTACKER)
          .map(({ lastHitTick }) => lastHitTick)
      ),
      attackerReach: reachOf(attacker),
      victimBumpedAt: victim?.lastHitTick ?? 0,
      victimFlinch: fightFlinch(
        riderOf(cast, VICTIM)?.fight ?? quietFight(),
        victim?.hitStun ?? 0,
        0
      ),
    });
  };
  const drawTicks = (ticks: number) => {
    let left = ticks;
    while (left > 0) {
      const steps = Math.min(
        left,
        stepsPerFrame[frame % stepsPerFrame.length] ?? 1
      );
      frame += 1;
      drawFrame(steps);
      left -= steps;
    }
  };
  drawTicks(LEAD);
  for (let tick = 1; tick <= until; tick += bunch) {
    for (let step = tick; step < tick + bunch; step += 1) {
      for (const seat of seats) {
        room.accept(seat, step, [plan(seat, step)]);
      }
      room.step();
      for (const event of room.state.events) {
        if (event.kind === "hit" && event.rider === ATTACKER) {
          roomHits.push(room.state.tick);
        }
      }
      client.confirm(room.frame, null);
    }
    drawTicks(bunch);
  }
  return {
    drawn,
    roomHits,
    shoves: roomHits.map((hit) =>
      drawn.find(({ attackerLastHit }) => attackerLastHit >= hit)
    ),
  };
};

const attackerKicksAt =
  (...ticks: readonly number[]): Plan =>
  (rider, tick) =>
    rider === ATTACKER && ticks.includes(tick) ? kicking : rideOn;

const shoveFrame = (seen: ReturnType<typeof raceSeenBy>) => seen.shoves[0];

describe("another rider's strike in a real race", () => {
  it("shows the leg at contact and the full flinch on the frame of the shove when a burst starts with the kick", () => {
    const firstOfBurst = KICK_AT + 1;
    const shove = shoveFrame(
      raceSeenBy(VICTIM, BURST, attackerKicksAt(firstOfBurst))
    );
    expect([shove?.attackerReach, shove?.victimFlinch]).toStrictEqual([1, 1]);
  });

  it("shows the leg and the flinch with the shove on a frame drawn between ticks", () => {
    const shove = shoveFrame(
      raceSeenBy(VICTIM, BURST, attackerKicksAt(KICK_AT + 1), {
        stepsPerFrame: [0, 1],
      })
    );
    expect([shove?.attackerReach, shove?.victimFlinch]).toStrictEqual([1, 1]);
  });

  it("draws a strike heard in a catch-up frame at its contact pose, not past it", () => {
    const catchUp = 4;
    const shove = shoveFrame(
      raceSeenBy(VICTIM, catchUp, attackerKicksAt(KICK_AT + 1), {
        stepsPerFrame: [catchUp],
      })
    );
    expect([shove?.attackerReach, shove?.victimFlinch]).toStrictEqual([1, 1]);
  });

  it("shows an AI rider's strike out on every frame its hit lands", () => {
    const { shoves } = raceSeenBy(VICTIM, 1, () => rideOn, {
      behind: 0,
      seats: [VICTIM, OBSERVER],
      until: AI_FIGHTS_UNTIL,
    });
    expect(shoves.length).toBeGreaterThan(0);
    expect(shoves.map((shove) => shove?.attackerReach)).toStrictEqual(
      shoves.map(() => 1)
    );
  });

  it("plays both of one rider's strikes from one burst", () => {
    const first = KICK_AT + 1;
    const second = first + KICK.cooldown + 1;
    const { drawn } = raceSeenBy(
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
      raceSeenBy(OBSERVER, 1, plan).drawn.filter(
        (one) => one.attackerReach >= 0
      ).length;
    expect(legOut(struckFirst)).toBeLessThan(legOut(attackerKicksAt(KICK_AT)));
  });

  it("doesn't flinch a rider who was only bumped", () => {
    const steerIn = controlOf({ ...neutralInput, steer: 1, throttle: 1 });
    const bumping: Plan = (rider) => (rider === ATTACKER ? steerIn : rideOn);
    const { drawn } = raceSeenBy(OBSERVER, 1, bumping, { behind: 0 });
    const bumped = new Set(drawn.map(({ victimBumpedAt }) => victimBumpedAt));
    const flinched = drawn.filter(({ victimFlinch }) => victimFlinch > 0);
    expect([bumped.size > 1, flinched]).toStrictEqual([true, []]);
  });

  it("ends the target's flinch on the attacker's screen early when the room refuses the hit", () => {
    const KICK_HELD = 8;
    const STEER_TICKS = 20;
    const EDGE_OF_REACH_X = 2.1;
    const steerAway = controlOf({ ...neutralInput, steer: 1, throttle: 1 });
    const dodged: Plan = (rider, tick) => {
      if (rider === ATTACKER && tick >= KICK_AT && tick < KICK_AT + KICK_HELD) {
        return kicking;
      }
      const steerFrom = KICK_AT - KICK_HELD;
      return rider === VICTIM &&
        tick >= steerFrom &&
        tick < steerFrom + STEER_TICKS
        ? steerAway
        : rideOn;
    };
    const { drawn, roomHits } = raceSeenBy(ATTACKER, 1, dodged, {
      gapX: EDGE_OF_REACH_X,
    });
    const flinched = drawn.filter(({ victimFlinch }) => victimFlinch > 0);
    expect(roomHits).toStrictEqual([]);
    expect(flinched.length).toBeGreaterThan(0);
    expect(flinched.length).toBeLessThan(HIT_STUN_TICKS);
  });
});
