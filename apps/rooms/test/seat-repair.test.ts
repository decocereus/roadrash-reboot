import { STARTING_BIKE } from "@racer/career/tables";
import { controlOf } from "@racer/sim/control";
import { neutralInput } from "@racer/sim/race";
import { createRoom } from "@racer/sim/room";
import {
  tickCapacity,
  writeRaceSnapshot,
  writeTick,
} from "@racer/sim/room-wire";
import { riderIdAt, riderOf } from "@racer/sim/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeRoomMessage } from "../src/messages.ts";
import { ticksOf } from "../src/room-config.ts";
import { FakeSocket, newSeat, startedMessage } from "./seat-socket.ts";

const VICTIM = riderIdAt(0);
const ATTACKER = riderIdAt(1);
const KICK_AT = 240;
const PREDICTED_TO = 270;
const SNAPSHOT_AT = 250;
const RIDE_TO = 290;

const riding = controlOf({ ...neutralInput, throttle: 1 });
const kicking = controlOf({ ...neutralInput, kick: true, throttle: 1 });
const own = (tick: number) => (tick === KICK_AT ? kicking : riding);

const humanAt = (rider: number, name: string) => ({
  bikeId: STARTING_BIKE,
  colour: rider,
  kind: "human" as const,
  name,
  rider,
});

const twoRiders = encodeRoomMessage({
  ...startedMessage,
  manifest: {
    ...startedMessage.manifest,
    roster: [humanAt(0, "Near"), humanAt(1, "Far")],
  },
  you: 1,
});

const kickedDuringRepair = () => {
  const { seat, socket } = newSeat();
  socket.hear(twoRiders);
  const race = seat.race();
  if (!race) {
    throw new Error("The seat has no race.");
  }
  const { client } = race;
  const room = createRoom(
    race.setup,
    ticksOf(startedMessage.manifest.raceLimitSeconds)
  );
  for (const state of [room.state, client.confirmed, client.predicted]) {
    const victim = riderOf(state.riders, VICTIM);
    const attacker = riderOf(state.riders, ATTACKER);
    if (victim && attacker) {
      attacker.s = victim.s - 1.5;
      attacker.x = victim.x - 1.6;
    }
  }
  for (let tick = 1; tick <= PREDICTED_TO; tick += 1) {
    client.predict(own(tick));
    room.accept(ATTACKER, tick, [own(tick)]);
  }
  const shown = client.takeEvents().filter(({ kind }) => kind === "hit");
  client.takeFights();
  const view = new DataView(new ArrayBuffer(tickCapacity(2)));
  const landed: number[] = [];
  const stepRoom = (tick: number): ArrayBuffer => {
    room.accept(VICTIM, tick, [riding]);
    room.step();
    landed.push(
      ...(room.state.events.some(({ kind }) => kind === "hit") ? [tick] : [])
    );
    return view.buffer.slice(
      0,
      writeTick(view, room.frame, room.hashed ? room.hash : null)
    );
  };
  seat.frameDrawn(0, 0);
  for (let tick = 1; tick <= SNAPSHOT_AT; tick += 1) {
    socket.hear(stepRoom(tick));
  }
  const heldAtSnapshot = SNAPSHOT_AT - client.confirmed.tick;
  socket.hear(new Uint8Array(writeRaceSnapshot(room.snapshot())).buffer);
  for (let tick = SNAPSHOT_AT + 1; tick <= RIDE_TO; tick += 1) {
    socket.hear(stepRoom(tick));
  }
  for (
    let frame = 0;
    frame < 20 && client.confirmed.tick < RIDE_TO;
    frame += 1
  ) {
    seat.frameDrawn(0, 0);
  }
  return { client, heldAtSnapshot, landed, shown };
};

describe("a seat whose repair snapshot arrives behind ticks it still holds", () => {
  beforeEach(() => {
    FakeSocket.opened = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("confirms the held ticks first, so a hit the room landed in them is never taken back", () => {
    const { client, heldAtSnapshot, landed, shown } = kickedDuringRepair();
    const refused = client
      .takeFights()
      .flatMap((fight) => ("refused" in fight ? [fight.tick] : []));
    expect({
      confirmed: client.confirmed.tick,
      landed,
      refused,
      shown: shown.length,
    }).toStrictEqual({
      confirmed: RIDE_TO,
      landed: [KICK_AT + 4],
      refused: [],
      shown: 1,
    });
    expect(heldAtSnapshot).toBeGreaterThan(SNAPSHOT_AT - KICK_AT);
  });
});
