import { RACE_STATS_PACKET_BYTES, writeRaceStats } from "@racer/sim/room-wire";
import { describe, expect, it } from "vitest";

import { createHost } from "../src/host.ts";
import { SEAT_QUIT } from "../src/messages.ts";
import { MOST_TRACE_CHARS, TRACE_VERSION } from "../src/tape.ts";
import {
  advanceHearing,
  AWAY_MS,
  createClock,
  fakeSocket,
  HOLD_MS,
  loadingRace,
  nearby,
  race,
  readyPacket,
  sameBuild,
  someRaceStats,
  START_DELAY_MS,
  startedOf,
} from "./host-harness.ts";

const packetOf = (rollbacks: number): ArrayBuffer => {
  const packet = new ArrayBuffer(RACE_STATS_PACKET_BYTES);
  writeRaceStats(new DataView(packet), { ...someRaceStats, rollbacks });
  return packet;
};

describe("the room's notes", () => {
  it("says how long the countdown waited, and for whom", () => {
    const { clock, far, host, near } = loadingRace();
    host.message(near, readyPacket(near));
    clock.advance(6000);
    host.message(far, readyPacket(far));
    expect(clock.notes.map((note) => note.kind)).toStrictEqual([
      "started",
      "countdown",
    ]);
    expect(clock.notes[0]).toMatchObject({ roomColo: "SIN" });
    expect(clock.notes[1]).toMatchObject({
      stillLoading: [],
      waitedMs: 6000,
    });
  });

  it("names who the countdown gave up on", () => {
    const { clock, far, host, near } = loadingRace();
    host.message(near, readyPacket(near));
    advanceHearing(host, clock, [far, near], 20_000);
    expect(clock.notes[1]).toMatchObject({
      raceId: "race-1",
      stillLoading: [1],
      waitedMs: 20_000,
    });
  });

  it("says who left and who was refused", () => {
    const { clock, far, host } = loadingRace();
    host.gone(far, SEAT_QUIT);
    host.seat(fakeSocket(), "Stale", nearby, {
      ...sameBuild(),
      build: "old-build",
    });
    expect(clock.notes).toContainEqual({
      kind: "refused",
      reason: "build",
    });
    expect(clock.notes).toContainEqual(
      expect.objectContaining({
        kind: "left",
        raceId: "race-1",
        seatsLeft: 1,
        tally: { accepted: 0, ahead: 0, late: 0, missed: 0, rider: 1 },
      })
    );
  });

  it("keeps a seat's latest stats and logs them once, when its socket dies", () => {
    const { clock, host, near } = loadingRace();
    host.message(near, packetOf(3));
    host.message(near, packetOf(7));
    expect(clock.notes.some((note) => note.kind === "stats")).toBeFalsy();
    host.gone(near, 1006);
    clock.advance(HOLD_MS);
    const stats = clock.notes.filter((note) => note.kind === "stats");
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      raceId: "race-1",
      rider: 0,
      stats: { rollbacks: 7, worstOwnControlCm: 88 },
    });
    expect(clock.notes).toContainEqual(
      expect.objectContaining({ closeCode: 1006, kind: "left" })
    );
  });

  it("saves every whole row a seat sent before its socket died, with no extra fields", () => {
    const { clock, host, near } = loadingRace();
    const trace = {
      build: "abc",
      extra: "a name",
      gpu: "Test GPU",
      graphics: "quality rung 1",
      rows: [0, 0, 1, 0, 60, 2, 16, 90, 17],
      version: TRACE_VERSION,
    };
    host.message(near, JSON.stringify(trace));
    host.message(near, JSON.stringify({ ...trace, rows: [250] }));
    host.message(
      near,
      JSON.stringify({ ...trace, rows: [-1, 0, 1, 0, 60, 2, 16, 90, 17] })
    );
    host.message(
      near,
      JSON.stringify({ ...trace, rows: [0.5, 0, 1, 0, 60, 2, 16, 90, 17] })
    );
    host.gone(near, 1006);
    clock.advance(HOLD_MS);
    expect(clock.notes.filter((note) => note.kind === "browser")).toStrictEqual(
      [
        {
          build: "abc",
          gpu: "Test GPU",
          graphics: "quality rung 1",
          kind: "browser",
          raceId: "race-1",
          rider: 0,
        },
      ]
    );
    const saved = clock.tape.get("tapes/race-1/rider-0.trace.json");
    expect(saved).toContain('"connections":[[0,0,1,0,60,2,16,90,17]]');
    expect(saved).toContain(`"version":${TRACE_VERSION}`);
    expect(saved).not.toContain("a name");
  });

  it("refuses a browser trace that is not one, comes from a build with other columns, or is too long", () => {
    const { clock, host, near } = loadingRace();
    host.message(near, "not json");
    host.message(
      near,
      JSON.stringify({ build: "abc", gpu: "g", graphics: "q", rows: [] })
    );
    host.gone(near, 1006);
    clock.advance(HOLD_MS);
    expect(clock.tape.has("tapes/race-1/rider-0.trace.json")).toBeFalsy();
    const { clock: other, host: otherHost, near: otherNear } = loadingRace();
    otherHost.message(otherNear, "x".repeat(MOST_TRACE_CHARS + 1));
    otherHost.message(
      otherNear,
      JSON.stringify({
        build: "abc",
        gpu: "g",
        graphics: "q",
        rows: [],
        version: TRACE_VERSION,
      })
    );
    otherHost.gone(otherNear, 1006);
    other.advance(HOLD_MS);
    expect(other.tape.has("tapes/race-1/rider-0.trace.json")).toBeTruthy();
  });

  it("logs a place behind the start line as zero, not a huge number", () => {
    const { clock, host, near } = loadingRace();
    const packet = new ArrayBuffer(RACE_STATS_PACKET_BYTES);
    writeRaceStats(new DataView(packet), {
      ...someRaceStats,
      worstFrameRoadMetres: -23,
    });
    host.message(near, packet);
    host.gone(near, 1006);
    clock.advance(HOLD_MS);
    expect(clock.notes.find((note) => note.kind === "stats")).toMatchObject({
      stats: { worstFrameRoadMetres: 0 },
    });
  });

  it("gives each race its own ID, even in the same room", () => {
    const clock = createClock();
    const host = createHost(clock);
    const first = [fakeSocket(), fakeSocket()];
    race(host, clock, first);
    expect(startedOf(first[0] ?? fakeSocket()).manifest.raceId).toBe("race-1");
    expect(startedOf(first[1] ?? fakeSocket()).manifest.raceId).toBe("race-1");
    expect(host.status().raceId).toBe("race-1");
    for (const socket of first) {
      host.gone(socket, SEAT_QUIT);
    }
    clock.advance(1000);
    expect(host.status().raceId).toBeNull();
    clock.advance(AWAY_MS + 1000);
    const second = [fakeSocket()];
    race(host, clock, second);
    expect(startedOf(second[0] ?? fakeSocket()).manifest.raceId).toBe("race-2");
  });

  it("keeps names out of every note", () => {
    const { clock, far, host, near } = loadingRace();
    const packet = new ArrayBuffer(RACE_STATS_PACKET_BYTES);
    writeRaceStats(new DataView(packet), someRaceStats);
    host.message(near, packet);
    host.gone(far, SEAT_QUIT);
    host.gone(near, SEAT_QUIT);
    host.seat(fakeSocket(), "Late", nearby, sameBuild());
    clock.advance(40_000);
    const written = JSON.stringify(clock.notes);
    expect(written).toContain('"kind":"ended"');
    for (const name of ["Near", "Far", "Late"]) {
      expect(written).not.toContain(name);
    }
  });

  it("sums up every rider who started, including who left", () => {
    const { clock, far, host, near } = loadingRace();
    clock.advance(1500);
    host.message(near, readyPacket(near));
    clock.advance(1500);
    host.message(far, readyPacket(far));
    clock.advance(START_DELAY_MS + 5000);
    const packet = new ArrayBuffer(RACE_STATS_PACKET_BYTES);
    writeRaceStats(new DataView(packet), someRaceStats);
    host.message(near, packet);
    host.gone(near, SEAT_QUIT);
    host.gone(far, SEAT_QUIT);
    clock.advance(1000);
    const ended = clock.notes.find((note) => note.kind === "ended");
    expect(ended).toMatchObject({
      raceId: "race-1",
      seats: [
        expect.objectContaining({
          asn: 64_512,
          colo: "DEL",
          network: "Test Net",
          readyMs: 1500,
          reported: true,
          rider: 0,
          tcpRttMs: 8,
        }),
        expect.objectContaining({ readyMs: 3000, reported: false, rider: 1 }),
      ],
    });
  });

  it("sorts the gaps between wakes into the summary's buckets", () => {
    const { clock, far, host, near } = loadingRace();
    host.message(near, readyPacket(near));
    host.message(far, readyPacket(far));
    clock.advance(START_DELAY_MS + 1000);
    clock.stall(70);
    clock.wakeOnce();
    host.gone(near, SEAT_QUIT);
    host.gone(far, SEAT_QUIT);
    clock.advance(1000);
    const ended = clock.notes.find((note) => note.kind === "ended");
    if (ended?.kind !== "ended") {
      throw new Error("The race never ended.");
    }
    expect(ended.wakeGaps).toHaveLength(5);
    expect(ended.wakeGaps[0]).toBeGreaterThan(30);
    expect(ended.wakeGaps[3]).toBeGreaterThanOrEqual(1);
  });

  it("writes one note per race event, none per tick", () => {
    const { clock, far, host, near } = loadingRace();
    host.message(near, readyPacket(near));
    host.message(far, readyPacket(far));
    clock.advance(START_DELAY_MS + 5000);
    expect(clock.notes).toHaveLength(2);
  });
});
