import { describe, expect, it } from "vitest";

import { controlOf } from "./control.ts";
import { ROOM_LIMIT_TICKS, track } from "./race-fixtures.ts";
import { defaultSetup, neutralInput } from "./race.ts";
import { createRoomClient } from "./room-client.ts";
import { createTickFrame } from "./room-frame.ts";
import {
  createReadTick,
  MOST_REPAIRS,
  readRaceSnapshot,
  readRepair,
  readTick,
  REPAIR_PACKET_BYTES,
  tickCapacity,
  writeRaceSnapshot,
  writeTick,
} from "./room-wire.ts";
import { createRoom, HASH_EVERY, roomSetup } from "./room.ts";
import { PLAYER_RIDER, riderIdAt, riderOf } from "./state.ts";

const RIVAL = riderIdAt(1);
const LATENCY_TICKS = 6;
const LEAD_TICKS = 2 * LATENCY_TICKS + 4;
const MOST_PER_FRAME = 60;
const DRIFTED_AT = 100;

const weaving = (tick: number, every: number) =>
  controlOf({
    ...neutralInput,
    steer: Math.floor(tick / every) % 2 === 0 ? 0.4 : -0.4,
    throttle: 1,
  });

interface InFlight {
  readonly at: number;
  readonly bytes: Uint8Array;
}

const arrived = <Item extends { readonly at: number }>(
  queue: Item[],
  now: number
): readonly Item[] => {
  const waiting = queue.findIndex((item) => item.at > now);
  return queue.splice(0, waiting === -1 ? queue.length : waiting);
};

const raceWithDrift = (
  ticks: number,
  driftAt: readonly number[],
  answered: boolean
) => {
  const setup = roomSetup(defaultSetup(track, 3), [PLAYER_RIDER, RIVAL]);
  const room = createRoom(setup, ROOM_LIMIT_TICKS);
  const client = createRoomClient(setup, PLAYER_RIDER, ROOM_LIMIT_TICKS);
  const tickView = new DataView(new ArrayBuffer(tickCapacity(2)));
  const askView = new DataView(new ArrayBuffer(REPAIR_PACKET_BYTES));
  const read = createReadTick(createTickFrame());
  const down: InFlight[] = [];
  const up: { readonly at: number; readonly tick: number }[] = [];
  const asked: number[] = [];
  const answers: number[] = [];
  let fellBack = 0;
  for (let now = 1; now <= ticks; now += 1) {
    room.accept(RIVAL, now, [weaving(now, 7)]);
    room.step();
    const bytes = writeTick(
      tickView,
      room.frame,
      room.hashed ? room.hash : null
    );
    down.push({
      at: now + LATENCY_TICKS,
      bytes: new Uint8Array(tickView.buffer.slice(0, bytes)),
    });
    for (const ask of arrived(up, now)) {
      if (answered) {
        answers.push(ask.tick);
        down.push({
          at: now + LATENCY_TICKS,
          bytes: writeRaceSnapshot(room.snapshot()),
        });
      }
    }
    for (const { bytes: packet } of arrived(down, now)) {
      const view = new DataView(packet.buffer);
      const snapshot = readRaceSnapshot(view);
      const predictedBefore = client.predicted.tick;
      if (snapshot) {
        client.catchUpFrom(snapshot);
        fellBack = Math.max(fellBack, predictedBefore - client.predicted.tick);
      } else if (readTick(view, read)) {
        client.confirm(read.frame, read.hashed ? read.hash : null);
      }
    }
    if (driftAt.includes(client.confirmed.tick)) {
      const rival = riderOf(client.confirmed.riders, RIVAL);
      if (rival) {
        rival.s += 1;
      }
    }
    client.settle(MOST_PER_FRAME);
    while (client.predicted.tick < now + LEAD_TICKS - LATENCY_TICKS) {
      const tick = client.predicted.tick + 1;
      client.predict(weaving(tick, 25));
      room.accept(PLAYER_RIDER, tick, [weaving(tick, 25)]);
    }
    if (client.writeRepair(askView) > 0) {
      const tick = readRepair(askView);
      if (tick !== null) {
        asked.push(tick);
        up.push({ at: now + LATENCY_TICKS, tick });
      }
    }
  }
  client.settle();
  return { answers, asked, client, fellBack, room };
};

describe("a room client whose confirmed race drifts from the room's", () => {
  it("stays off the room's race at every later hash when nobody answers its ask", () => {
    const ticks = HASH_EVERY * 8;
    const { asked, client } = raceWithDrift(ticks, [DRIFTED_AT], false);
    const hashesAfter = Math.floor((ticks - LATENCY_TICKS) / HASH_EVERY) - 1;
    expect(client.stats.desyncs).toBe(hashesAfter);
    expect(asked).toHaveLength(hashesAfter);
    expect(client.stats.repairs).toBe(0);
  });

  it("asks once, takes one snapshot of the room's race and matches every hash after it, still predicting ahead", () => {
    const { answers, asked, client, fellBack, room } = raceWithDrift(
      HASH_EVERY * 8,
      [DRIFTED_AT],
      true
    );
    expect({
      answers,
      asked,
      confirmedTick: client.confirmed.tick,
      desyncs: client.stats.desyncs,
      fellBack,
      repairs: client.stats.repairs,
    }).toStrictEqual({
      answers: [HASH_EVERY * 2],
      asked: [HASH_EVERY * 2],
      confirmedTick: room.state.tick - LATENCY_TICKS,
      desyncs: 1,
      fellBack: 0,
      repairs: 1,
    });
    expect(client.predicted.tick).toBeGreaterThan(room.state.tick);
  });

  it("stops asking after its last repair when it keeps drifting", () => {
    const drifts = [DRIFTED_AT, 400, 700, 1000, 1300];
    const { asked, client } = raceWithDrift(HASH_EVERY * 25, drifts, true);
    expect(client.stats.repairs).toBe(MOST_REPAIRS);
    expect(asked).toHaveLength(MOST_REPAIRS);
    expect(client.stats.desyncs).toBeGreaterThan(MOST_REPAIRS);
  });
});
