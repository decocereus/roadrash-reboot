import { describe, expect, it } from "vitest";

import { controlOf } from "./control.ts";
import { track } from "./race-fixtures.ts";
import { defaultSetup, neutralInput } from "./race.ts";
import { createRoomClient } from "./room-client.ts";
import { createRoom, roomSetup } from "./room.ts";
import { PLAYER_RIDER, riderIdAt, riderOf } from "./state.ts";
import type { Control, RaceEvent } from "./state.ts";

const VICTIM = PLAYER_RIDER;
const ATTACKER = riderIdAt(1);
const RIDE_TICKS = 240;
const AFTER_TICKS = 60;
const riding = controlOf({ ...neutralInput, throttle: 1 });
const kicking = controlOf({ ...neutralInput, kick: true, throttle: 1 });

const SIDE_BY_SIDE_X = 1.6;
const ATTACKER_BEHIND_S = 2.6;

interface Heard {
  readonly event: RaceEvent;
  readonly tick: number;
}

const race = (lead: number, victim: Control, attacker: Control) => {
  const setup = roomSetup(defaultSetup(track, 3), [VICTIM, ATTACKER]);
  const room = createRoom(setup);
  const client = createRoomClient(setup, VICTIM);
  for (const state of [room.state, client.confirmed, client.predicted]) {
    const near = riderOf(state.riders, VICTIM);
    const far = riderOf(state.riders, ATTACKER);
    if (near && far) {
      far.s = near.s - ATTACKER_BEHIND_S;
      far.x = near.x - SIDE_BY_SIDE_X;
    }
  }
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
    const room = createRoom(setup);
    const client = createRoomClient(setup, VICTIM);
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

  it("hears nothing again once it has been read", () => {
    const { client } = race(8, riding, kicking);
    expect(client.takeEvents()).toStrictEqual([]);
  });
});
