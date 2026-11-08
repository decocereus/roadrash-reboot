import { describe, expect, it } from "vitest";

import { controlOf } from "./control.ts";
import { ROOM_LIMIT_TICKS, track } from "./race-fixtures.ts";
import { defaultSetup, neutralInput } from "./race.ts";
import { createRoomClient } from "./room-client.ts";
import { createRoom, roomSetup } from "./room.ts";
import { PLAYER_RIDER, riderIdAt, riderOf } from "./state.ts";
import type { Control, RaceEvent, RiderId } from "./state.ts";
import { strikeOf } from "./weapons.ts";

const VICTIM = PLAYER_RIDER;
const ATTACKER = riderIdAt(1);
const RIDE_TICKS = 240;
const KICK = strikeOf("kick", "none");
const KICK_CONTACT = KICK.ticks - KICK.strikeTick;
const AFTER_TICKS = 60;
const riding = controlOf({ ...neutralInput, throttle: 1 });
const kicking = controlOf({ ...neutralInput, kick: true, throttle: 1 });
const punching = controlOf({ ...neutralInput, punch: true, throttle: 1 });

const SIDE_BY_SIDE_X = 1.6;
const ATTACKER_BEHIND_S = 2.6;

interface Heard {
  readonly event: RaceEvent;
  readonly tick: number;
}

const sideBySide = (me: RiderId = VICTIM, gapX = SIDE_BY_SIDE_X) => {
  const setup = roomSetup(defaultSetup(track, 3), [VICTIM, ATTACKER]);
  const room = createRoom(setup, ROOM_LIMIT_TICKS);
  const client = createRoomClient(setup, me, ROOM_LIMIT_TICKS);
  for (const state of [room.state, client.confirmed, client.predicted]) {
    const near = riderOf(state.riders, VICTIM);
    const far = riderOf(state.riders, ATTACKER);
    if (near && far) {
      far.s = near.s - ATTACKER_BEHIND_S;
      far.x = near.x - gapX;
    }
  }
  return { client, room };
};

const race = (lead: number, victim: Control, attacker: Control) => {
  const { client, room } = sideBySide();
  for (let tick = 0; tick < lead; tick += 1) {
    client.predict(riding);
  }
  const heard: Heard[] = [];
  const shown: number[] = [];
  for (let tick = 0; tick < RIDE_TICKS + AFTER_TICKS; tick += 1) {
    const fighting = tick === RIDE_TICKS;
    room.accept(VICTIM, room.state.tick + 1, [fighting ? victim : riding]);
    room.accept(ATTACKER, room.state.tick + 1, [fighting ? attacker : riding]);
    room.step();
    client.confirm(room.frame, null);
    client.predict(riding);
    for (const event of client.takeEvents()) {
      heard.push({ event, tick: room.state.tick });
    }
    const drawn = riderOf(client.predicted.riders, ATTACKER);
    if (drawn && drawn.attack !== "none") {
      shown.push(drawn.attackTicks);
    }
  }
  return { client, heard, shown };
};

const burst = (kickAfter: number) => {
  const { client, room } = sideBySide();
  const BURST_TICKS = 45;
  const kickAt = RIDE_TICKS + kickAfter;
  for (let tick = 1; tick <= RIDE_TICKS + BURST_TICKS; tick += 1) {
    room.accept(VICTIM, tick, [riding]);
    room.accept(ATTACKER, tick, [tick === kickAt ? kicking : riding]);
    room.step();
    if (tick <= RIDE_TICKS) {
      client.predict(riding);
    }
    client.confirm(room.frame, null);
    if (tick <= RIDE_TICKS) {
      client.takeFights();
    }
  }
  client.predict(riding);
  return {
    kickAt,
    taken: client.takeFights().map((heard) => ({
      kind: "refused" in heard ? "refused" : heard.event.kind,
      tick: heard.tick,
    })),
  };
};

const KICK_HELD_TICKS = 8;
const STEER_TICKS = 20;
const OWN_LEAD = 13;
const steerAway = controlOf({ ...neutralInput, steer: 1, throttle: 1 });
const steerIn = controlOf({ ...neutralInput, steer: -1, throttle: 1 });

interface Swing {
  readonly gapX: number;
  readonly roomMissesFirst?: number;
  readonly victim?: Control;
  readonly victimFrom?: number;
  readonly victimTicks?: number;
}

const attackerHears = ({
  gapX,
  roomMissesFirst = 0,
  victim = riding,
  victimFrom = 0,
  victimTicks = STEER_TICKS,
}: Swing) => {
  const { client, room } = sideBySide(ATTACKER, gapX);
  const own = (tick: number): Control =>
    tick >= RIDE_TICKS && tick < RIDE_TICKS + KICK_HELD_TICKS
      ? kicking
      : riding;
  const victimRides = (tick: number): Control =>
    tick >= victimFrom && tick < victimFrom + victimTicks ? victim : riding;
  const isOwnHit = (event: RaceEvent) =>
    event.kind === "hit" && event.rider === ATTACKER;
  for (let tick = 1; tick <= OWN_LEAD; tick += 1) {
    client.predict(own(tick));
  }
  const roomHits: number[] = [];
  const heardHits: number[] = [];
  const refused: number[] = [];
  for (let tick = 1; tick <= RIDE_TICKS + AFTER_TICKS; tick += 1) {
    const lost = tick < RIDE_TICKS + roomMissesFirst;
    room.accept(ATTACKER, tick, [lost ? riding : own(tick)]);
    room.accept(VICTIM, tick, [victimRides(tick)]);
    room.step();
    roomHits.push(...room.state.events.filter(isOwnHit).map(() => tick));
    client.confirm(room.frame, null);
    client.predict(own(tick + OWN_LEAD));
    heardHits.push(
      ...client
        .takeEvents()
        .filter(isOwnHit)
        .map(() => tick)
    );
    for (const heard of client.takeFights()) {
      if ("refused" in heard) {
        refused.push(heard.tick);
      }
    }
  }
  return { heardHits, refused, roomHits };
};

const EDGE_OF_REACH_X = 2.1;
const JUST_OUT_OF_REACH_X = 2.2;
const CONTACT_TICK = RIDE_TICKS + KICK_CONTACT;

describe("an attacker's own hits, reconciled with the room", () => {
  it("takes back a predicted hit the room refused", () => {
    const { heardHits, refused, roomHits } = attackerHears({
      gapX: EDGE_OF_REACH_X,
      victim: steerAway,
      victimFrom: RIDE_TICKS - KICK_HELD_TICKS,
    });
    expect({ guessed: heardHits.length, refused, roomHits }).toStrictEqual({
      guessed: 1,
      refused: [CONTACT_TICK],
      roomHits: [],
    });
  });

  it("hears a hit once when a rollback refuses it and a later one finds it again", () => {
    const { heardHits, roomHits } = attackerHears({
      gapX: EDGE_OF_REACH_X,
      victim: steerAway,
      victimFrom: RIDE_TICKS - 6,
      victimTicks: 2,
    });
    expect({ heard: heardHits.length, roomHits }).toStrictEqual({
      heard: 1,
      roomHits: [CONTACT_TICK],
    });
  });

  it("hears a hit the room granted and the guess missed, once, before the room lands it", () => {
    const { heardHits, refused, roomHits } = attackerHears({
      gapX: JUST_OUT_OF_REACH_X,
      victim: steerIn,
      victimFrom: RIDE_TICKS - 4,
    });
    expect({ refused, roomHits }).toStrictEqual({
      refused: [],
      roomHits: [CONTACT_TICK],
    });
    expect(heardHits).toHaveLength(1);
    expect(heardHits[0]).toBeLessThanOrEqual(CONTACT_TICK);
  });

  it("hears its hit once when the room starts the strike later than the guess", () => {
    for (const roomMissesFirst of [1, 2, 4]) {
      const { heardHits, refused, roomHits } = attackerHears({
        gapX: SIDE_BY_SIDE_X,
        roomMissesFirst,
      });
      expect({ heard: heardHits.length, refused, roomHits }).toStrictEqual({
        heard: 1,
        refused: [],
        roomHits: [CONTACT_TICK + roomMissesFirst],
      });
    }
  });
});

const kindsBy = (heard: readonly Heard[], kind: RaceEvent["kind"]) =>
  heard.filter(({ event }) => event.kind === kind);

describe("what a client hears of another rider's fight", () => {
  it("hears a kick and its hit once each, even when the kick is over in the prediction", () => {
    const { heard, shown } = race(20, riding, kicking);
    expect(shown).toStrictEqual([]);
    expect(kindsBy(heard, "attack")).toHaveLength(1);
    expect(kindsBy(heard, "hit")).toHaveLength(1);
  });

  it("hears the kick's start when the room ran it and the hit when it landed", () => {
    const { heard } = race(13, riding, kicking);
    const [attack] = kindsBy(heard, "attack");
    const [hit] = kindsBy(heard, "hit");
    expect(attack?.tick).toBe(RIDE_TICKS + 1);
    expect(hit?.tick).toBe(RIDE_TICKS + 5);
  });

  it("doesn't hear its own predicted kick a second time when the room confirms it", () => {
    const setup = roomSetup(defaultSetup(track, 3), [VICTIM, ATTACKER]);
    const room = createRoom(setup, ROOM_LIMIT_TICKS);
    const client = createRoomClient(setup, VICTIM, ROOM_LIMIT_TICKS);
    let attacks = 0;
    const count = (): void => {
      for (const event of client.takeEvents()) {
        attacks += event.kind === "attack" ? 1 : 0;
      }
    };
    client.predict(kicking);
    count();
    expect(attacks).toBe(1);
    room.accept(VICTIM, 1, [kicking]);
    room.accept(ATTACKER, 1, [riding]);
    room.step();
    client.confirm(room.frame, null);
    count();
    expect(attacks).toBe(1);
  });

  it("keeps what it heard when a correction rewinds the prediction before it is read", () => {
    const { client, room } = sideBySide();
    client.predict(kicking);
    room.accept(VICTIM, 1, [riding]);
    room.accept(ATTACKER, 1, [kicking]);
    room.step();
    client.confirm(room.frame, null);
    const attackers = client
      .takeEvents()
      .filter((event) => event.kind === "attack")
      .map((event) => event.rider);
    expect(attackers).toStrictEqual([VICTIM, ATTACKER]);
  });

  it("hands over every strike and hit in a burst at once, with the tick the room ran each", () => {
    for (const kickAfter of [1, 32, 36]) {
      const { kickAt, taken } = burst(kickAfter);
      expect(taken).toStrictEqual([
        { kind: "attack", tick: kickAt },
        { kind: "hit", tick: kickAt + KICK_CONTACT },
      ]);
    }
  });

  it("hears its own strike once when the room starts it later than the prediction did", () => {
    const { client, room } = sideBySide();
    const LEAD = 20;
    const PUNCHED_AT = 26;
    const PRESS_AT = 34;
    const own = (tick: number): Control =>
      tick >= PRESS_AT && tick < PRESS_AT + 12 ? punching : riding;
    const roomStarted: number[] = [];
    let ownAttacks = 0;
    for (let tick = 1; tick <= LEAD; tick += 1) {
      client.predict(own(tick));
    }
    for (let tick = 1; tick <= 120; tick += 1) {
      room.accept(VICTIM, tick, [own(tick)]);
      room.accept(ATTACKER, tick, [tick === PUNCHED_AT ? punching : riding]);
      room.step();
      for (const event of room.state.events) {
        if (event.kind === "attack" && event.rider === VICTIM) {
          roomStarted.push(tick);
        }
      }
      client.confirm(room.frame, null);
      client.predict(own(tick + LEAD));
      for (const event of client.takeEvents()) {
        ownAttacks += event.kind === "attack" && event.rider === VICTIM ? 1 : 0;
      }
    }
    expect(roomStarted).toHaveLength(1);
    expect(roomStarted[0]).toBeGreaterThan(PRESS_AT + 5);
    expect(ownAttacks).toBe(1);
  });

  it("hears nothing again once it has been read", () => {
    const { client } = race(8, riding, kicking);
    expect(client.takeEvents()).toStrictEqual([]);
  });
});

const steering = (lead: number) => {
  const setup = roomSetup(defaultSetup(track, 3), [VICTIM, ATTACKER]);
  const room = createRoom(setup, ROOM_LIMIT_TICKS);
  const client = createRoomClient(setup, VICTIM, ROOM_LIMIT_TICKS);
  const swerve = controlOf({ ...neutralInput, steer: 1, throttle: 1 });
  for (let tick = 0; tick < lead; tick += 1) {
    client.predict(riding);
  }
  const moved = new Map<RiderId, number>();
  for (let tick = 0; tick < RIDE_TICKS; tick += 1) {
    room.accept(VICTIM, room.state.tick + 1, [riding]);
    room.accept(ATTACKER, room.state.tick + 1, [
      tick >= RIDE_TICKS / 2 ? swerve : riding,
    ]);
    room.step();
    client.confirm(room.frame, null);
    client.predict(riding);
    for (const { rider, x } of client.takeCorrections()) {
      moved.set(rider, Math.max(moved.get(rider) ?? 0, Math.abs(x)));
    }
  }
  return moved;
};

describe("how far a correction moved another rider", () => {
  it("grows with the lead, because the guess ran longer", () => {
    const near = steering(4).get(ATTACKER) ?? 0;
    const far = steering(20).get(ATTACKER) ?? 0;
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near * 2);
  });

  it("names the client's own bike when the room rode it differently, so its own bike glides too", () => {
    const setup = roomSetup(defaultSetup(track, 3), [VICTIM, ATTACKER]);
    const room = createRoom(setup, ROOM_LIMIT_TICKS);
    const client = createRoomClient(setup, VICTIM, ROOM_LIMIT_TICKS);
    const swerve = controlOf({ ...neutralInput, steer: 1, throttle: 1 });
    let ownMoved = 0;
    for (let tick = 0; tick < RIDE_TICKS; tick += 1) {
      client.predict(tick >= RIDE_TICKS / 2 ? swerve : riding);
      room.accept(VICTIM, room.state.tick + 1, [riding]);
      room.accept(ATTACKER, room.state.tick + 1, [riding]);
      room.step();
      client.confirm(room.frame, null);
      for (const { rider, x } of client.takeCorrections()) {
        ownMoved =
          rider === VICTIM ? Math.max(ownMoved, Math.abs(x)) : ownMoved;
      }
    }
    expect(ownMoved).toBeGreaterThan(0);
  });

  it("names every bike when a stalled client falls behind the room, so the jump forward glides", () => {
    const setup = roomSetup(defaultSetup(track, 3), [VICTIM, ATTACKER]);
    const room = createRoom(setup, ROOM_LIMIT_TICKS);
    const client = createRoomClient(setup, VICTIM, ROOM_LIMIT_TICKS);
    for (let tick = 0; tick < 10; tick += 1) {
      client.predict(riding);
    }
    const along = new Map<RiderId, number>();
    for (let tick = 0; tick < 40; tick += 1) {
      room.accept(VICTIM, room.state.tick + 1, [riding]);
      room.accept(ATTACKER, room.state.tick + 1, [riding]);
      room.step();
      client.confirm(room.frame, null);
      for (const { rider, s: moved } of client.takeCorrections()) {
        along.set(rider, Math.max(along.get(rider) ?? 0, Math.abs(moved)));
      }
    }
    expect(along.get(VICTIM)).toBeGreaterThan(0);
    expect(along.get(ATTACKER)).toBeGreaterThan(0);
  });
});
