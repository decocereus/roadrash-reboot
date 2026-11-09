import { controlOf } from "@racer/sim/control";
import {
  inputBytes,
  MOST_BATCHED_CONTROLS,
  RACE_STATS_PACKET_BYTES,
  writeRaceStats,
} from "@racer/sim/room-wire";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import {
  PING_EVERY_MS,
  PINGS_PER_REPORT,
  SILENT_SEAT_MS,
} from "../src/heartbeat.ts";
import {
  encodeLobbyCommand,
  MOST_COMMAND_CHARS,
  SEAT_FLOODED,
} from "../src/messages.ts";
import {
  CUT_AFTER_DROPS,
  MOST_PACKET_BYTES,
  socketAllowances,
} from "../src/socket-budget.ts";
import { RiderTraceSchema, TRACE_ROW_FIELDS } from "../src/tape.ts";
import {
  clientOf,
  followTicks,
  lastLobby,
  pingPacket,
  readyAll,
  readyPacket,
  room,
  someRaceStats,
  START_DELAY_MS,
  TICK_MS,
} from "./host-harness.ts";
import type { FakeSocket } from "./host-harness.ts";

const walkAt = (x: number): string =>
  encodeLobbyCommand({
    heading: 1.5,
    kind: "walk",
    lean: 0,
    pace: 4.4,
    place: "foot",
    pose: null,
    x,
    z: -3,
  });

const traceOf = (rows: number): string =>
  JSON.stringify({
    build: "abc",
    gpu: "Test GPU",
    graphics: "quality rung 1",
    rows: Array.from({ length: rows * TRACE_ROW_FIELDS }, () => 1_000_000),
  });

const statsPacket = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(RACE_STATS_PACKET_BYTES);
  writeRaceStats(new DataView(buffer), someRaceStats);
  return buffer;
};

const decodeRiderTrace = Schema.decodeUnknownSync(
  Schema.fromJsonString(RiderTraceSchema)
);

const walksOn = (socket: FakeSocket): number =>
  socket.messages.filter(({ kind }) => kind === "walk").length;

const refusedOn = (socket: FakeSocket) =>
  socket.messages.flatMap((message) =>
    message.kind === "refused" ? [message.reason] : []
  );

const racing = () => {
  const lobby = room();
  const { clock, host } = lobby;
  const rider = lobby.seated("rider");
  const friend = lobby.seated("friend");
  readyAll(host, [rider, friend]);
  host.message(rider, readyPacket(rider));
  host.message(friend, readyPacket(friend));
  clock.advance(START_DELAY_MS);
  return { ...lobby, friend, rider };
};

describe("a socket's message budget", () => {
  it("relays a walk flood only up to its allowance, then cuts the socket and counts each drop", () => {
    const { clock, host, seated } = room();
    const flooder = seated("flooder");
    const other = seated("other");
    for (let sent = 0; sent < 10_000; sent += 1) {
      host.message(flooder, walkAt(sent));
    }
    expect({
      closed: flooder.closed,
      dropped: host.status().dropped,
      refused: refusedOn(flooder),
      relayed: walksOn(other),
    }).toStrictEqual({
      closed: SEAT_FLOODED,
      dropped: CUT_AFTER_DROPS,
      refused: ["flooded"],
      relayed: socketAllowances.command.burst,
    });
    expect(clock.notes).toContainEqual({ kind: "refused", reason: "flooded" });
    expect(lastLobby(other).members.map(({ here }) => here)).toStrictEqual([
      false,
      true,
    ]);
  });

  it("cuts a racing seat that floods packets and hands its bike to the pilot", () => {
    const { clock, host, rider } = racing();
    rider.pongs.length = 0;
    for (let sent = 0; sent < 10_000; sent += 1) {
      host.message(rider, pingPacket());
    }
    expect(rider.pongs.length).toBeLessThanOrEqual(
      socketAllowances.packet.burst
    );
    expect(rider.closed).toBe(SEAT_FLOODED);
    expect(clock.notes).toContainEqual(
      expect.objectContaining({ closeCode: SEAT_FLOODED, kind: "left" })
    );
    expect(host.status().roles).toStrictEqual(["seated"]);
  });

  it("decodes a trace flood only up to its allowance", () => {
    const { clock, host, rider } = racing();
    const trace = traceOf(20);
    expect(trace.length).toBeGreaterThan(MOST_COMMAND_CHARS);
    for (let sent = 0; sent < 100; sent += 1) {
      host.message(rider, trace);
    }
    expect(rider.closed).toBe(SEAT_FLOODED);
    const saved = decodeRiderTrace(
      clock.tape.get("tapes/race-1/rider-0.trace.json")
    );
    expect(saved.connections.map((rows) => rows.length)).toStrictEqual([
      socketAllowances.trace.burst * 20 * TRACE_ROW_FIELDS,
    ]);
  });

  it("drops a binary message longer than any packet a client sends, unread", () => {
    const { host, rider } = racing();
    rider.pongs.length = 0;
    const padded = new Uint8Array(MOST_PACKET_BYTES + 1);
    padded.set(new Uint8Array(pingPacket()));
    host.message(rider, padded.buffer);
    host.message(rider, new ArrayBuffer(1024 * 1024));
    expect({
      closed: rider.closed,
      dropped: host.status().dropped,
      pongs: rider.pongs.length,
    }).toStrictEqual({ closed: null, dropped: 2, pongs: 0 });
  });

  it("ignores a lobby command padded past the longest real one", () => {
    const { host, seated } = room();
    const walker = seated("walker");
    const other = seated("other");
    host.message(walker, walkAt(1).padEnd(MOST_COMMAND_CHARS + 1, " "));
    expect(walksOn(other)).toBe(0);
    expect(walker.closed).toBeNull();
  });

  it("drops nothing from a rider at the paces the budget assumes, even the burst after a stalled link or a frozen tab", () => {
    const lobby = room();
    const { clock, host } = lobby;
    const rider = lobby.seated("rider");
    const friend = lobby.seated("friend");
    const outbox: (string | ArrayBuffer)[] = [];
    let stalled = false;
    const send = (data: string | ArrayBuffer): void => {
      if (stalled) {
        outbox.push(data);
      } else {
        host.message(rider, data);
      }
    };
    const deliver = (): void => {
      stalled = false;
      for (const data of outbox.splice(0)) {
        host.message(rider, data);
      }
    };
    const stallMs = SILENT_SEAT_MS - PING_EVERY_MS;
    const target = lastLobby(friend).you;
    const stepMs = 25;
    for (let at = 0; at < 20_000; at += stepMs) {
      stalled = at >= 5000 && at < 5000 + stallMs;
      if (at === 5000 + stallMs) {
        deliver();
      }
      if (at % 125 === 0) {
        send(walkAt(at));
      }
      if (at % 100 === 0) {
        send(encodeLobbyCommand({ act: "greet", kind: "act", target }));
      }
      if (at % PING_EVERY_MS === 0) {
        send(pingPacket());
        host.message(friend, pingPacket());
      }
      clock.advance(stepMs);
    }
    readyAll(host, [rider, friend]);
    host.message(rider, readyPacket(rider));
    host.message(friend, readyPacket(friend));
    clock.advance(START_DELAY_MS);

    const client = clientOf(rider);
    const buffer = new ArrayBuffer(inputBytes(MOST_BATCHED_CONTROLS));
    const view = new DataView(buffer);
    const throttle = controlOf({
      brake: 0,
      kick: false,
      punch: false,
      remount: false,
      steer: 0,
      throttle: 1,
    });
    const leadTicks = 8;
    const mostStepsPerFrame = 4;
    const pingEveryTicks = Math.round(PING_EVERY_MS / TICK_MS);
    const stallFrom = 450;
    const stallUntil = stallFrom + Math.round(stallMs / TICK_MS);
    const frozenFrom = stallUntil + 60;
    const frozenUntil = frozenFrom + 120;
    for (let frame = 0; frame < frozenUntil + 120; frame += 1) {
      stalled = frame >= stallFrom && frame < stallUntil;
      if (frame === stallUntil) {
        deliver();
      }
      const frozen = frame >= frozenFrom && frame < frozenUntil;
      if (!frozen) {
        followTicks(rider, client);
        for (
          let steps = 0;
          steps < mostStepsPerFrame &&
          client.predicted.tick < client.confirmed.tick + leadTicks;
          steps += 1
        ) {
          client.predict(throttle);
        }
        for (
          let bytes = client.writeInputs(view);
          bytes > 0;
          bytes = client.writeInputs(view)
        ) {
          send(buffer.slice(0, bytes));
        }
        if (frame % pingEveryTicks === 0) {
          send(pingPacket());
        }
        if (frame > 0 && frame % (pingEveryTicks * PINGS_PER_REPORT) === 0) {
          send(statsPacket());
          send(traceOf(60));
        }
      }
      if (frame % pingEveryTicks === 0) {
        host.message(friend, pingPacket());
      }
      clock.advance(TICK_MS);
    }
    const status = host.status();
    expect({
      closed: rider.closed,
      dropped: status.dropped,
      refused: refusedOn(rider),
      refusedNotes: clock.notes.filter(({ kind }) => kind === "refused"),
      roles: status.roles,
    }).toStrictEqual({
      closed: null,
      dropped: 0,
      refused: [],
      refusedNotes: [],
      roles: ["seated", "seated"],
    });
    expect(status.seats[0]?.late).toBeGreaterThan(0);
  }, 60_000);
});
