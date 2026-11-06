import { seatedRace } from "@racer/career/room-race";
import { replayTape } from "@racer/sim/room-tape";
import { PING_PACKET_BYTES, writePing } from "@racer/sim/room-wire";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { createHost } from "../src/host.ts";
import { SEAT_QUIT } from "../src/messages.ts";
import { TapeEndSchema, TapeHeaderSchema } from "../src/tape.ts";
import { createClock, fakeSocket, race } from "./host-harness.ts";

const decodeHeader = Schema.decodeUnknownSync(
  Schema.fromJsonString(TapeHeaderSchema)
);
const decodeEnd = Schema.decodeUnknownSync(
  Schema.fromJsonString(TapeEndSchema)
);
const RACE_MS = 35_000;
const PING_EVERY_MS = 5000;

const pingPacket = (): ArrayBuffer => {
  const view = new DataView(new ArrayBuffer(PING_PACKET_BYTES));
  writePing(view, 1);
  return view.buffer;
};

const recorded = () => {
  const clock = createClock();
  const host = createHost(clock);
  const sockets = [fakeSocket(), fakeSocket()];
  race(host, clock, sockets);
  for (let at = 0; at < RACE_MS; at += PING_EVERY_MS) {
    for (const socket of sockets) {
      host.message(socket, pingPacket());
    }
    clock.advance(PING_EVERY_MS);
  }
  for (const socket of sockets) {
    host.gone(socket, SEAT_QUIT);
  }
  clock.advance(1000);
  const parts = [...clock.tape.entries()]
    .filter(([key]) => key.endsWith(".bin"))
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([, body]) => (body instanceof Uint8Array ? [body] : []));
  const header = decodeHeader(clock.tape.get("tapes/race-1/header.json"));
  const end = decodeEnd(clock.tape.get("tapes/race-1/end.json"));
  return { end, header, parts };
};

const setupOf = (seed: number, seats: number) => seatedRace(seed, seats).setup;

describe("a race's tape", () => {
  it("replays to the same state hashes the room sent", () => {
    const { end, header, parts } = recorded();
    const replay = replayTape(
      setupOf(header.seed, header.seats),
      header.digest,
      parts
    );
    expect(replay).toMatchObject({ kind: "matched" });
    expect(replay.kind === "matched" && replay.state.tick).toBe(end.tick);
    expect(parts).toHaveLength(end.parts);
    expect(end.parts).toBeGreaterThan(1);
  });

  it("names the tick where a changed control leaves the race", () => {
    const { header, parts } = recorded();
    const changed = parts.map((part) => Uint8Array.from(part));
    const first = changed[0] ?? new Uint8Array();
    const CONTROL_AT = 100;
    first[CONTROL_AT] = (first[CONTROL_AT] ?? 0) + 40;
    const replay = replayTape(
      setupOf(header.seed, header.seats),
      header.digest,
      changed
    );
    expect(["diverged", "unreadable", "gap"]).toContain(replay.kind);
  });

  it("refuses a tape recorded on another setup", () => {
    const { header, parts } = recorded();
    const replay = replayTape(
      setupOf(header.seed + 1, header.seats),
      header.digest,
      parts
    );
    expect(replay.kind).toBe("wrongSetup");
  });

  it("finds a missing part", () => {
    const { header, parts } = recorded();
    const replay = replayTape(
      setupOf(header.seed, header.seats),
      header.digest,
      parts.slice(1)
    );
    expect(replay.kind).toBe("gap");
  });
});
