import { createRandom } from "@racer/track/random";
import type { Random } from "@racer/track/random";
import { describe, expect, it } from "vitest";

import { coasting, controlOf } from "./control.ts";
import { riderAt, track } from "./race-fixtures.ts";
import { defaultSetup, neutralInput } from "./race.ts";
import { createRoomClient } from "./room-client.ts";
import type { RoomClient } from "./room-client.ts";
import { createScratch, createTickFrame, scratchFor } from "./room-frame.ts";
import type { TickFrame } from "./room-frame.ts";
import {
  createInputBatch,
  createReadTick,
  inputBytes,
  MOST_BATCHED_CONTROLS,
  readInput,
  readTick,
  tickBytes,
  writeInput,
  writeTick,
} from "./room-wire.ts";
import {
  AUTO_AFTER_TICKS,
  createRoom,
  HASH_EVERY,
  HOLD_TICKS,
  roomSetup,
} from "./room.ts";
import type { Room } from "./room.ts";
import { HASH_WORDS } from "./snapshot-bytes.ts";
import { setupDigest } from "./snapshot-setup.ts";
import { hashRace } from "./snapshot.ts";
import { PLAYER_RIDER, riderIdAt } from "./state.ts";
import type {
  Control,
  Controller,
  RaceState,
  RiderId,
  RiderInput,
} from "./state.ts";

const PACKET_BYTES = 512;
const RIVAL = riderIdAt(1);
const STRANGER = riderIdAt(4);

interface Packet {
  readonly at: number;
  readonly bytes: Uint8Array;
}

interface Link {
  readonly queue: Packet[];
  latest: number;
}

const linkOf = (): Link => ({ latest: 0, queue: [] });

const send = (link: Link, at: number, view: DataView, length: number) => {
  link.latest = Math.max(link.latest, at);
  link.queue.push({
    at: link.latest,
    bytes: new Uint8Array(view.buffer.slice(0, length)),
  });
};

const due = (link: Link, now: number): Uint8Array[] => {
  const arrived = link.queue.filter((packet) => packet.at <= now);
  link.queue.splice(0, arrived.length);
  return arrived.map((packet) => packet.bytes);
};

const viewOf = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

interface Rider {
  readonly id: RiderId;
  readonly latency: number;
  readonly jitter: number;
  readonly lead: number;
  readonly ride: (tick: number) => RiderInput;
  readonly silent?: readonly [number, number];
}

interface Seated extends Rider {
  readonly client: RoomClient;
  readonly up: Link;
  readonly down: Link;
}

interface Handover {
  readonly tick: number;
  readonly rider: RiderId;
  readonly to: Controller;
}

interface Session {
  readonly room: Room;
  readonly seated: readonly Seated[];
  readonly handovers: Handover[];
  readonly late: Map<RiderId, number>;
  readonly settled: Map<RiderId, boolean>;
}

const weave =
  (period: number, punchEvery: number) =>
  (tick: number): RiderInput => {
    const step = Math.floor(tick / 10);
    return {
      brake: step % 23 === 0 ? 0.6 : 0,
      kick: false,
      punch: step % punchEvery === 0,
      steer: ((step % period) - period / 2) / period,
      throttle: step % 23 === 0 ? 0 : 1,
    };
  };

const hashOf = (state: RaceState): readonly number[] => {
  const hash = new Uint32Array(HASH_WORDS);
  hashRace(
    state,
    setupDigest(state, track),
    scratchFor(createScratch(state), state),
    hash
  );
  return [...hash];
};

const sameRace = (left: RaceState, right: RaceState) =>
  hashOf(left).every((word, at) => word === hashOf(right)[at]);

const delay = (rider: Rider, random: Random) =>
  rider.latency + Math.floor(random() * (rider.jitter + 1));

const quiet = (rider: Rider, now: number) =>
  rider.silent !== undefined && now >= rider.silent[0] && now < rider.silent[1];

const race = (riders: readonly Rider[], ticks: number): Session => {
  const setup = roomSetup(
    defaultSetup(track, 7),
    riders.map((rider) => rider.id)
  );
  const room = createRoom(setup);
  const random = createRandom(11);
  const seated = riders.map((rider) => ({
    ...rider,
    client: createRoomClient(setup, rider.id),
    down: linkOf(),
    up: linkOf(),
  }));
  const handovers: Handover[] = [];
  const late = new Map(riders.map((rider) => [rider.id, 0]));
  const settled = new Map<RiderId, boolean>();
  const out = new DataView(new ArrayBuffer(PACKET_BYTES));
  const batch = createInputBatch();
  const read = createReadTick(createTickFrame());
  const drain = Math.max(
    ...riders.map((rider) => rider.latency + rider.jitter)
  );
  const countdown = Math.max(...riders.map((rider) => rider.lead));
  const last = ticks + countdown;
  for (let now = 1 - countdown; now <= last + drain; now += 1) {
    for (const rider of seated) {
      for (const bytes of due(rider.up, now)) {
        expect(readInput(viewOf(bytes), batch)).toBeTruthy();
        const tally = room.accept(rider.id, batch.firstTick, batch.controls);
        late.set(rider.id, (late.get(rider.id) ?? 0) + tally.late);
      }
    }
    if (now >= 1 && now <= last) {
      room.step();
      for (const [rider, to] of room.frame.handovers) {
        handovers.push({ rider, tick: room.frame.tick, to });
      }
      const length = writeTick(out, room.frame, room.hashed ? room.hash : null);
      expect(length).toBe(tickBytes(room.frame, room.hashed));
      for (const rider of seated) {
        send(rider.down, now + delay(rider, random), out, length);
      }
    }
    for (const rider of seated) {
      for (const bytes of due(rider.down, now)) {
        expect(readTick(viewOf(bytes), read)).toBeTruthy();
        const reached = rider.client.predicted.tick;
        rider.client.confirm(read.frame, read.hashed ? read.hash : null);
        expect(rider.client.predicted.tick).toBe(
          Math.max(reached, rider.client.confirmed.tick)
        );
      }
      const { confirmed, predicted } = rider.client;
      if (now > ticks) {
        if (confirmed.tick === predicted.tick && !settled.has(rider.id)) {
          settled.set(rider.id, sameRace(predicted, confirmed));
        }
        continue;
      }
      while (rider.client.predicted.tick < now + rider.lead) {
        const tick = rider.client.predicted.tick + 1;
        if (!rider.client.predict(controlOf(rider.ride(tick)))) {
          break;
        }
      }
      if (!quiet(rider, now)) {
        const length = rider.client.writeInputs(out);
        if (length > 0) {
          send(rider.up, now + delay(rider, random), out, length);
        }
      }
    }
  }
  return { handovers, late, room, seated, settled };
};

const expectAgreement = (session: Session) => {
  const { room, seated } = session;
  for (const rider of seated) {
    expect(session.settled.get(rider.id)).toBeTruthy();
    expect(rider.client.stats.desyncs).toBe(0);
    expect(rider.client.confirmed.tick).toBe(room.state.tick);
    expect(hashOf(rider.client.confirmed)).toStrictEqual(hashOf(room.state));
  }
};

const TWENTY_SECONDS = 1200;

const host: Rider = {
  id: PLAYER_RIDER,
  jitter: 2,
  latency: 3,
  lead: 6,
  ride: weave(9, 17),
};

const guest: Rider = {
  id: RIVAL,
  jitter: 3,
  latency: 6,
  lead: 10,
  ride: weave(13, 11),
};

describe("a race room", () => {
  it("two riders on lagged links race twenty seconds and both end on the room's race, hash for hash", () => {
    const session = race([host, guest], TWENTY_SECONDS);
    expectAgreement(session);
    expect(session.late.get(host.id)).toBe(0);
    expect(session.late.get(guest.id)).toBe(0);
    expect(session.handovers).toStrictEqual([]);
    for (const rider of session.seated) {
      const { resimulatedTicks, rollbacks } = rider.client.stats;
      expect(rollbacks).toBeGreaterThan(0);
      expect(resimulatedTicks / rollbacks).toBeLessThanOrEqual(
        rider.lead + rider.latency + rider.jitter
      );
    }
    expect(riderAt(session.room.state, PLAYER_RIDER).s).toBeGreaterThan(400);
    expect(riderAt(session.room.state, RIVAL).s).toBeGreaterThan(400);
  });

  it("riders who hold their controls are predicted exactly, roll back once for the start and once for a change, and their predicted race is the room's", () => {
    const steady = { ...neutralInput, steer: 0.2, throttle: 1 };
    const turning = (tick: number) =>
      tick < 300 ? steady : { ...steady, steer: -0.4 };
    const session = race(
      [
        { ...host, ride: () => steady },
        { ...guest, ride: turning },
      ],
      600
    );
    expectAgreement(session);
    expect(
      session.seated.map((rider) => rider.client.stats.rollbacks)
    ).toStrictEqual([2, 1]);
  });

  it("a rider whose inputs stop is held, then coasts, then handed to the pilot, and takes the bike back when they return", () => {
    const silent: Rider = { ...guest, jitter: 0, silent: [300, 420] };
    const session = race([host, silent], 600);
    expectAgreement(session);
    const lastHeard = 299 + silent.lead;
    expect(session.handovers).toStrictEqual([
      { rider: RIVAL, tick: lastHeard + 1 + AUTO_AFTER_TICKS, to: "pilot" },
      { rider: RIVAL, tick: 420 + silent.latency, to: "human" },
    ]);
    expect(riderAt(session.room.state, RIVAL).controller).toBe("human");
  });

  it("a rider who runs behind their own latency loses their inputs to the pilot and still ends on the room's race", () => {
    const behind: Rider = { ...guest, jitter: 0, latency: 8, lead: 2 };
    const session = race([host, behind], 600);
    expectAgreement(session);
    expect(session.late.get(RIVAL)).toBeGreaterThan(0);
    expect(session.handovers).toContainEqual({
      rider: RIVAL,
      tick: AUTO_AFTER_TICKS + 1,
      to: "pilot",
    });
    const stats = session.seated[1]?.client.stats;
    expect(stats?.rollbacks).toBeGreaterThan(500);
  });

  it("a silent seat holds its last steer and pedals without the buttons, then coasts, then goes to the pilot", () => {
    const room = createRoom(roomSetup(defaultSetup(track, 3), [PLAYER_RIDER]));
    const punching = controlOf({
      ...neutralInput,
      punch: true,
      steer: 0.5,
      throttle: 1,
    });
    room.accept(PLAYER_RIDER, 1, [punching]);
    const seen: (Control | Controller | undefined)[] = [];
    for (let tick = 1; tick <= AUTO_AFTER_TICKS + 2; tick += 1) {
      room.step();
      seen.push(
        room.frame.handovers.get(PLAYER_RIDER) ??
          room.frame.controls.get(PLAYER_RIDER)
      );
    }
    expect(seen).toStrictEqual([
      punching,
      ...Array.from({ length: HOLD_TICKS }, () =>
        controlOf({ ...neutralInput, steer: 0.5, throttle: 1 })
      ),
      ...Array.from({ length: AUTO_AFTER_TICKS - HOLD_TICKS }, () => coasting),
      "pilot",
    ]);
  });

  it("a rider who leaves is handed to the pilot on the next tick and later inputs change nothing", () => {
    const setup = roomSetup(defaultSetup(track, 3), [PLAYER_RIDER, RIVAL]);
    const room = createRoom(setup);
    const full = controlOf({ ...neutralInput, throttle: 1 });
    room.accept(PLAYER_RIDER, 1, [full, full]);
    room.accept(RIVAL, 1, [full, full]);
    room.step();
    room.leave(RIVAL);
    expect(room.accept(RIVAL, 3, [full]).accepted).toBe(0);
    room.step();
    expect([...room.frame.handovers]).toStrictEqual([[RIVAL, "pilot"]]);
    expect([...room.frame.controls.keys()]).toStrictEqual([PLAYER_RIDER]);
    room.step();
    expect(room.frame.handovers.size).toBe(0);
  });

  it("an input for a tick already ridden is late, one past the horizon is ahead, and the first input for a tick wins", () => {
    const room = createRoom(roomSetup(defaultSetup(track, 3), [PLAYER_RIDER]));
    const full = controlOf({ ...neutralInput, throttle: 1 });
    const brake = controlOf({ ...neutralInput, brake: 1 });
    room.step();
    expect({ ...room.accept(PLAYER_RIDER, 1, [full, full]) }).toStrictEqual({
      accepted: 1,
      ahead: 0,
      late: 1,
    });
    expect({ ...room.accept(PLAYER_RIDER, 2, [brake]) }).toStrictEqual({
      accepted: 0,
      ahead: 0,
      late: 0,
    });
    expect({ ...room.accept(PLAYER_RIDER, 34, [full]) }).toStrictEqual({
      accepted: 0,
      ahead: 1,
      late: 0,
    });
    room.step();
    expect(room.frame.controls.get(PLAYER_RIDER)).toBe(full);
  });

  it("hashes the race every second of ticks", () => {
    const room = createRoom(roomSetup(defaultSetup(track, 3), [PLAYER_RIDER]));
    const hashed: number[] = [];
    for (let tick = 1; tick <= HASH_EVERY * 3; tick += 1) {
      room.step();
      if (room.hashed) {
        hashed.push(room.frame.tick);
      }
    }
    expect(hashed).toStrictEqual([HASH_EVERY, HASH_EVERY * 2, HASH_EVERY * 3]);
  });

  it.each([
    ["no riders", []],
    ["nine riders", Array.from({ length: 9 }, (_, at) => riderIdAt(at))],
    ["the same rider twice", [PLAYER_RIDER, PLAYER_RIDER]],
    ["a police officer", [riderIdAt(defaultSetup(track, 1).rivals.length + 1)]],
  ])("a room is not set up for %s", (_, humans) => {
    expect(() => roomSetup(defaultSetup(track, 1), humans)).toThrow(RangeError);
  });

  it("a room setup rides its seats as humans, every other racer on the pilot, with no pacing", () => {
    const setup = roomSetup(defaultSetup(track, 1), [RIVAL, STRANGER]);
    expect(setup.player.controller).toBe("pilot");
    expect(setup.rivals.map((rival) => rival.controller)).toStrictEqual(
      setup.rivals.map((_, at) => (at === 0 || at === 3 ? "human" : "pilot"))
    );
    expect(setup.pacing).toStrictEqual({ catchUp: 0, leadEase: 0 });
  });
});

const wired = (frame: TickFrame, hash: Uint32Array | null) => {
  const view = new DataView(new ArrayBuffer(PACKET_BYTES));
  const length = writeTick(view, frame, hash);
  const read = createReadTick(createTickFrame());
  const readable = readTick(new DataView(view.buffer, 0, length), read);
  return { length, read, readable };
};

describe("the room's wire", () => {
  const full = controlOf({
    ...neutralInput,
    punch: true,
    steer: -1,
    throttle: 1,
  });

  it("an input packet is six bytes and four per control, and reads back what was written", () => {
    const view = new DataView(new ArrayBuffer(PACKET_BYTES));
    const controls: Control[] = [full, controlOf(neutralInput), full];
    const length = writeInput(view, 4321, controls);
    expect(length).toBe(6 + 4 * 3);
    expect(length).toBe(inputBytes(3));
    const batch = createInputBatch();
    expect(readInput(new DataView(view.buffer, 0, length), batch)).toBeTruthy();
    expect(batch).toStrictEqual({ controls, firstTick: 4321 });
  });

  it("refuses to write an empty input packet or one with more than eight controls", () => {
    const view = new DataView(new ArrayBuffer(PACKET_BYTES));
    expect(() => writeInput(view, 1, [])).toThrow(RangeError);
    expect(() =>
      writeInput(
        view,
        1,
        Array.from({ length: MOST_BATCHED_CONTROLS + 1 }, () => full)
      )
    ).toThrow(RangeError);
  });

  it.each([
    ["is cut short", (view: DataView) => new DataView(view.buffer, 0, 9)],
    [
      "has a byte left over",
      (view: DataView) => new DataView(view.buffer, 0, 11),
    ],
    [
      "is a tick packet",
      (view: DataView) => {
        view.setUint8(0, 2);
        return new DataView(view.buffer, 0, 10);
      },
    ],
    [
      "carries no controls",
      (view: DataView) => {
        view.setUint8(5, 0);
        return new DataView(view.buffer, 0, 6);
      },
    ],
    [
      "carries a steer byte of -128",
      (view: DataView) => {
        view.setUint8(6, 128);
        return new DataView(view.buffer, 0, 10);
      },
    ],
  ])("an input packet that %s is not read", (_, spoil) => {
    const view = new DataView(new ArrayBuffer(PACKET_BYTES));
    writeInput(view, 7, [full]);
    expect(readInput(spoil(view), createInputBatch())).toBeFalsy();
  });

  const sample = () => {
    const frame = createTickFrame();
    frame.tick = 60;
    frame.handovers.set(RIVAL, "pilot");
    frame.handovers.set(STRANGER, "human");
    frame.controls.set(PLAYER_RIDER, full);
    frame.controls.set(STRANGER, controlOf(neutralInput));
    return frame;
  };

  it("a tick packet carries the tick, its handovers, its controls and the hash, and reads back the same frame", () => {
    const hash = Uint32Array.of(1, 2, 3, 0xff_ff_ff_ff);
    expect(wired(sample(), hash)).toStrictEqual({
      length: 1 + 4 + 1 + 2 * 2 + 1 + 2 * 5 + 1 + 16,
      read: { frame: sample(), hash, hashed: true },
      readable: true,
    });
  });

  it("a tick packet without a hash is sixteen bytes shorter and reads back unhashed", () => {
    const { length, read, readable } = wired(sample(), null);
    expect({ hashed: read.hashed, length, readable }).toStrictEqual({
      hashed: false,
      length: 1 + 4 + 1 + 2 * 2 + 1 + 2 * 5 + 1,
      readable: true,
    });
  });

  it.each([
    ["is cut short", 14],
    ["has a byte left over", 16],
  ])("a tick packet that %s is not read", (_, length) => {
    const frame = createTickFrame();
    frame.tick = 9;
    frame.controls.set(PLAYER_RIDER, full);
    frame.handovers.set(RIVAL, "human");
    const view = new DataView(new ArrayBuffer(PACKET_BYTES));
    expect(writeTick(view, frame, null)).toBe(15);
    expect(
      readTick(
        new DataView(view.buffer, 0, length),
        createReadTick(createTickFrame())
      )
    ).toBeFalsy();
  });

  it.each([
    ["hands a rider to a third controller", 7, 2],
    ["names one rider's control twice", 14, 0],
    ["carries a hash flag of two", 19, 2],
  ])("a tick packet that %s is not read", (_, at, value) => {
    const frame = createTickFrame();
    frame.tick = 9;
    frame.handovers.set(RIVAL, "human");
    frame.controls.set(PLAYER_RIDER, full);
    frame.controls.set(RIVAL, full);
    const view = new DataView(new ArrayBuffer(PACKET_BYTES));
    const length = writeTick(view, frame, null);
    view.setUint8(at, value);
    expect(
      readTick(
        new DataView(view.buffer, 0, length),
        createReadTick(createTickFrame())
      )
    ).toBeFalsy();
  });
});
