import { controlOf } from "@racer/sim/control";
import {
  inputBytes,
  RACE_STATS_PACKET_BYTES,
  writeInput,
  writeRaceStats,
} from "@racer/sim/room-wire";
import { describe, expect, it } from "vitest";

import {
  encodeLobbyCommand,
  SEAT_CLOSED,
  SEAT_QUIT,
  SEAT_SILENT,
} from "../src/messages.ts";
import {
  advanceHearing,
  AWAY_MS,
  countdownsOn,
  CUSTOM_START_MS,
  HOLD_MS,
  lastLobby,
  pingPacket,
  readyAll,
  readyPacket,
  room,
  someRaceStats,
  START_DELAY_MS,
  startedOf,
  TICK_MS,
} from "./host-harness.ts";
import type { Clock, FakeSocket } from "./host-harness.ts";

const REPORT_GRACE_MS = 5000;
const SILENT_SEAT_MS = 10_000;
const RIDE_STEP_MS = 1000;
const FULL_RIDE_TIMEOUT_MS = 60_000;
const TRACE = JSON.stringify({
  build: "abc",
  gpu: "g",
  graphics: "q",
  rows: [1],
});
const WALK = {
  heading: 1.5,
  lean: 0,
  pace: 4.4,
  place: "foot",
  pose: null,
  x: 2,
  z: -3,
} as const;
const walkCommand = encodeLobbyCommand({ ...WALK, kind: "walk" });

const statsPacket = (rollbacks: number): ArrayBuffer => {
  const packet = new ArrayBuffer(RACE_STATS_PACKET_BYTES);
  writeRaceStats(new DataView(packet), { ...someRaceStats, rollbacks });
  return packet;
};

const inputPacket = (firstTick: number): ArrayBuffer => {
  const buffer = new ArrayBuffer(inputBytes(1));
  writeInput(new DataView(buffer), firstTick, [
    controlOf({
      brake: 0,
      kick: false,
      punch: false,
      remount: false,
      steer: 0,
      throttle: 1,
    }),
  ]);
  return buffer;
};

const kindsOf = (
  clock: Clock,
  ...kinds: readonly string[]
): readonly string[] =>
  clock.notes.map((note) => note.kind).filter((kind) => kinds.includes(kind));

const rollbacksOf = (clock: Clock, rider: number) =>
  clock.notes.flatMap((note) =>
    note.kind === "stats" && note.rider === rider ? [note.stats.rollbacks] : []
  );

const walksOn = (socket: FakeSocket) =>
  socket.messages.filter(({ kind }) => kind === "walk");

const heardKinds = (socket: FakeSocket, from: number): readonly string[] =>
  socket.messages.slice(from).map(({ kind }) => kind);

const ridingRoom = () => {
  const { clock, host, seated } = room();
  const first = seated("first", "Ann");
  const second = seated("second", "Bo");
  readyAll(host, [first, second]);
  host.message(first, readyPacket(first));
  host.message(second, readyPacket(second));
  clock.advance(START_DELAY_MS + TICK_MS * 10);
  return { clock, first, host, seated, second };
};

const pilotRide = (
  { clock, host }: Pick<ReturnType<typeof room>, "clock" | "host">,
  sockets: readonly FakeSocket[],
  heard: (socket: FakeSocket, tick: number) => boolean = () => true
): void => {
  while (host.status().hostPhase === "racing") {
    const { tick } = host.status();
    clock.advance(RIDE_STEP_MS);
    for (const socket of sockets) {
      if (heard(socket, tick)) {
        host.message(socket, pingPacket());
      }
      socket.ticks.length = 0;
      socket.pongs.length = 0;
    }
  }
};

const finishedRoom = () => {
  const riding = ridingRoom();
  pilotRide(riding, [riding.first, riding.second]);
  return riding;
};

describe("a socket replaced by the same member's newer one", () => {
  it("hands the rider's race to the newer socket", () => {
    const { clock, first, host, seated, second } = ridingRoom();
    const back = seated("first", "Ann");
    expect({
      closed: first.closed,
      last: first.messages.at(-1),
      notes: kindsOf(clock, "held", "rejoined", "left"),
    }).toStrictEqual({
      closed: SEAT_CLOSED,
      last: { kind: "refused", reason: "replaced" },
      notes: ["held", "rejoined"],
    });
    expect(host.status()).toMatchObject({
      names: ["Bo", "Ann"],
      roles: ["seated", "seated"],
      seats: [{ rider: 1 }, { rider: 0 }],
    });
    expect(heardKinds(back, 0)).toStrictEqual(["started", "countdown"]);
    expect(startedOf(back).you).toBe(0);
    const heard = [first, back, second].map((socket) => socket.ticks.length);
    clock.advance(TICK_MS * 5);
    expect(
      [first, back, second].map(
        ({ ticks }, at) => ticks.length > (heard[at] ?? 0)
      )
    ).toStrictEqual([false, true, true]);
  });

  it("does not make the member away when the old socket's close arrives later", () => {
    const { first, host, seated, second } = ridingRoom();
    const back = seated("first", "Ann");
    const heard = [back.messages.length, second.messages.length];
    host.gone(first, SEAT_CLOSED);
    expect([back.messages.length, second.messages.length]).toStrictEqual(heard);
    expect(host.status().names).toStrictEqual(["Bo", "Ann"]);
  });

  it("ignores everything the old socket still sends", () => {
    const { clock, first, host, seated } = ridingRoom();
    seated("first", "Ann");
    const pongsBefore = first.pongs.length;
    host.message(first, inputPacket(10_000));
    host.message(first, statsPacket(1));
    host.message(first, TRACE);
    host.message(first, pingPacket());
    expect({
      accepted: host.status().seats.map((seat) => seat.accepted),
      pongs: first.pongs.length - pongsBefore,
      reports: rollbacksOf(clock, 0),
    }).toStrictEqual({ accepted: [0, 0], pongs: 0, reports: [] });
  });

  it("logs a replaced rider's report, and stops the race waiting for it to load", () => {
    const { clock, host, seated } = room();
    const first = seated("first", "Ann");
    const second = seated("second", "Bo");
    readyAll(host, [first, second]);
    host.message(second, readyPacket(second));
    host.message(first, statsPacket(3));
    expect(countdownsOn(second)).toBe(0);
    seated("first", "Ann");
    expect(countdownsOn(second)).toBe(1);
    expect(rollbacksOf(clock, 0)).toStrictEqual([3]);
  });

  it("keeps a lobby member's ready, colour and walk, and notes only the refusal", () => {
    const { clock, host, seated } = room();
    const first = seated("first", "Ann");
    const second = seated("second", "Bo");
    host.message(
      first,
      encodeLobbyCommand({
        edition: lastLobby(first).edition,
        kind: "ready",
        ready: true,
      })
    );
    host.message(first, walkCommand);
    const back = seated("first", "Annie");
    expect({ closed: first.closed, last: first.messages.at(-1) }).toStrictEqual(
      { closed: SEAT_CLOSED, last: { kind: "refused", reason: "replaced" } }
    );
    expect(lastLobby(back)).toMatchObject({
      members: [
        { colour: 0, here: true, id: "m1", name: "Annie", ready: true },
        { colour: 1, here: true, id: "m2", name: "Bo", ready: false },
      ],
      phase: "gathering",
      you: "m1",
    });
    expect(lastLobby(second).members[0]).toMatchObject({
      name: "Annie",
      ready: true,
    });
    expect(walksOn(back)).toStrictEqual([]);
    expect({
      late: walksOn(seated("late")),
      names: host.status().names,
      notes: clock.notes,
    }).toStrictEqual({
      late: [{ ...WALK, kind: "walk", member: "m1" }],
      names: ["Bo", "Annie", "Guest"],
      notes: [{ kind: "refused", reason: "replaced" }],
    });
  });

  it("starts the race with the newer socket when a lobby seat was replaced mid-gather", () => {
    const { host, seated } = room();
    const first = seated("first", "Ann");
    const second = seated("second", "Bo");
    const back = seated("first", "Ann");
    readyAll(host, [second, back]);
    expect([startedOf(second).you, startedOf(back).you]).toStrictEqual([0, 1]);
    expect(first.messages.some(({ kind }) => kind === "started")).toBeFalsy();
    expect(host.status().seats).toHaveLength(2);
  });
});

describe("a socket that drops", () => {
  it("in the lobby marks its member away, forgets its walk and writes no notes", () => {
    const { clock, host, seated } = room();
    const walker = seated("walker", "Ann");
    const here = seated("here", "Bo");
    host.message(walker, walkCommand);
    host.gone(walker, 1006);
    expect(host.status().names).toStrictEqual(["Bo"]);
    expect(lastLobby(here).members[0]).toMatchObject({ here: false, id: "m1" });
    expect(clock.notes).toStrictEqual([]);
    expect(walksOn(seated("late"))).toStrictEqual([]);
  });

  it("in a race holds the bike, leaves once the hold runs out, and the others ride on", () => {
    const { clock, first, host, second } = ridingRoom();
    host.message(first, statsPacket(4));
    host.gone(first, 1006);
    host.gone(first, 1006);
    expect(kindsOf(clock, "held", "left", "stats")).toStrictEqual([
      "held",
      "stats",
    ]);
    advanceHearing(host, clock, [second], HOLD_MS - 1000);
    expect(kindsOf(clock, "left")).toStrictEqual([]);
    advanceHearing(host, clock, [second], 1000);
    expect({
      left: clock.notes.find((note) => note.kind === "left"),
      notes: kindsOf(clock, "held", "left", "stats"),
    }).toMatchObject({
      left: { closeCode: 1006, seatsLeft: 1 },
      notes: ["held", "stats", "left"],
    });
    expect(host.status()).toMatchObject({
      names: ["Bo"],
      seats: [{ rider: 1 }],
    });
    const heard = second.ticks.length;
    clock.advance(TICK_MS * 5);
    expect(second.ticks.length).toBeGreaterThan(heard);
  });

  it("as silence while a race runs is held once, even when its close arrives", () => {
    const { clock, first, host, second } = ridingRoom();
    advanceHearing(host, clock, [second], SILENT_SEAT_MS + 2000);
    expect(first.closed).toBe(SEAT_SILENT);
    host.gone(first, SEAT_SILENT);
    advanceHearing(host, clock, [second], HOLD_MS);
    expect(kindsOf(clock, "held", "left")).toStrictEqual(["held", "left"]);
  });

  it(
    "inside the grace settles its report, and the grace does not settle it again",
    () => {
      const { clock, first, host, seated, second } = finishedRoom();
      host.message(first, statsPacket(9));
      host.message(first, TRACE);
      host.message(second, statsPacket(5));
      expect(rollbacksOf(clock, 0)).toStrictEqual([]);
      const back = seated("first", "Ann");
      host.gone(second, 1006);
      expect({
        closed: [first.closed, second.closed],
        lastOnFirst: first.messages.at(-1),
        leftNotes: kindsOf(clock, "left"),
        names: host.status().names,
        reports: [rollbacksOf(clock, 0), rollbacksOf(clock, 1)],
        traced: clock.tape.has("tapes/race-1/rider-0.trace.json"),
      }).toStrictEqual({
        closed: [SEAT_CLOSED, null],
        lastOnFirst: { kind: "refused", reason: "replaced" },
        leftNotes: [],
        names: ["Ann"],
        reports: [[9], [5]],
        traced: true,
      });
      expect(lastLobby(back).phase).toBe("gathering");
      clock.advance(REPORT_GRACE_MS);
      expect({
        closed: [first.closed, second.closed, back.closed],
        reports: [rollbacksOf(clock, 0), rollbacksOf(clock, 1)],
      }).toStrictEqual({
        closed: [SEAT_CLOSED, null, null],
        reports: [[9], [5]],
      });
    },
    FULL_RIDE_TIMEOUT_MS
  );

  it(
    "while reporting is still watched for silence, because a report is not a sign of life",
    () => {
      const dryRun = finishedRoom();
      const ended = dryRun.clock.notes.find((note) => note.kind === "ended");
      if (ended?.kind !== "ended") {
        throw new Error("The race never ended.");
      }
      const riding = ridingRoom();
      const { clock, first, host, second } = riding;
      const lastHeardTick = ended.tick - 8 * 60;
      pilotRide(
        riding,
        [first, second],
        (socket, tick) => socket !== first || tick <= lastHeardTick
      );
      host.message(first, statsPacket(6));
      expect(first.closed).toBeNull();
      clock.advance(REPORT_GRACE_MS - RIDE_STEP_MS - 100);
      expect({
        closed: [first.closed, second.closed],
        names: host.status().names,
        reports: rollbacksOf(clock, 0),
      }).toStrictEqual({
        closed: [SEAT_SILENT, null],
        names: ["Bo"],
        reports: [6],
      });
      clock.advance(RIDE_STEP_MS + 100);
      expect({
        closed: [first.closed, second.closed],
        reports: rollbacksOf(clock, 0),
      }).toStrictEqual({ closed: [SEAT_SILENT, SEAT_CLOSED], reports: [6] });
    },
    FULL_RIDE_TIMEOUT_MS
  );
});

describe("a finished rider's report", () => {
  it(
    "keeps the socket quiet for the grace, writes the report as it runs out, and drops one that comes later",
    () => {
      const { clock, first, host, second } = finishedRoom();
      expect(first.messages.at(-1)?.kind).toBe("ended");
      const heard = first.messages.length;
      host.message(first, pingPacket());
      host.message(first, statsPacket(8));
      host.message(second, walkCommand);
      expect({
        closed: first.closed,
        heard: heardKinds(first, heard),
        pongs: first.pongs.length,
        reports: rollbacksOf(clock, 0),
        status: host.status(),
      }).toMatchObject({
        closed: null,
        heard: [],
        pongs: 0,
        reports: [],
        status: {
          hostPhase: "waiting",
          names: ["Ann", "Bo"],
          seats: [],
          waiting: 2,
        },
      });
      clock.advance(REPORT_GRACE_MS);
      host.message(first, statsPacket(2));
      host.message(first, TRACE);
      expect({
        closed: first.closed,
        names: host.status().names,
        reports: rollbacksOf(clock, 0),
        traced: clock.tape.has("tapes/race-1/rider-0.trace.json"),
      }).toStrictEqual({
        closed: SEAT_CLOSED,
        names: ["Ann", "Bo"],
        reports: [8],
        traced: false,
      });
      const lobbyFrom = first.messages.length;
      host.gone(second, 1000);
      host.message(first, pingPacket());
      expect({
        heard: heardKinds(first, lobbyFrom),
        here: lastLobby(first).members.map(({ here }) => here),
        pongs: first.pongs.length,
      }).toStrictEqual({
        heard: ["lobby"],
        here: [true, false],
        pongs: 1,
      });
      host.gone(first, SEAT_CLOSED);
      expect({
        names: host.status().names,
        reports: rollbacksOf(clock, 0),
      }).toStrictEqual({ names: [], reports: [8] });
    },
    FULL_RIDE_TIMEOUT_MS
  );
});

describe("a rider who leaves and rejoins", () => {
  it(
    "comes back as the same member, waits out the race, and rides the next one alone",
    () => {
      const riding = ridingRoom();
      const { clock, first, host, seated, second } = riding;
      const id = lastLobby(first).you;
      host.gone(first, SEAT_QUIT);
      const back = seated("first", "Ann");
      expect(lastLobby(back)).toMatchObject({
        members: [{ here: true, id }, { id: "m2" }],
        phase: "racing",
        you: id,
      });
      host.message(back, inputPacket(10_000));
      expect({ status: host.status(), ticks: back.ticks }).toMatchObject({
        status: { seats: [{ accepted: 0, rider: 1 }] },
        ticks: [],
      });
      pilotRide(riding, [back, second]);
      expect({
        backEnded: back.messages.some(({ kind }) => kind === "ended"),
        backPhase: lastLobby(back).phase,
        secondLast: second.messages.at(-1)?.kind,
      }).toStrictEqual({
        backEnded: false,
        backPhase: "gathering",
        secondLast: "ended",
      });
      clock.advance(REPORT_GRACE_MS);
      host.gone(second, SEAT_CLOSED);
      readyAll(host, [back]);
      expect(host.status().hostPhase).toBe("waiting");
      advanceHearing(host, clock, [back], CUSTOM_START_MS + 1000);
      expect({
        seats: host.status().seats.map((seat) => seat.rider),
        secondStarts: second.messages.filter(({ kind }) => kind === "started")
          .length,
        started: startedOf(back),
      }).toMatchObject({
        seats: [0],
        secondStarts: 1,
        started: { manifest: { raceId: "race-2" }, you: 0 },
      });
    },
    FULL_RIDE_TIMEOUT_MS
  );

  it("keeps its member and colour when it returns inside the away window", () => {
    const { host, seated } = room();
    const walker = seated("walker", "Ann");
    const other = seated("other", "Bo");
    host.gone(walker, 1000);
    expect(lastLobby(other).members[0]?.here).toBeFalsy();
    const back = seated("walker", "Ann");
    expect(lastLobby(back).you).toBe("m1");
    expect(lastLobby(other).members[0]).toMatchObject({
      colour: 0,
      here: true,
      id: "m1",
    });
  });

  it("is a new member once the away window has swept it", () => {
    const { clock, host, seated } = room();
    const walker = seated("walker", "Ann");
    const other = seated("other", "Bo");
    host.gone(walker, 1000);
    advanceHearing(host, clock, [other], AWAY_MS + 2000);
    const back = seated("walker", "Ann");
    expect(lastLobby(back)).toMatchObject({
      members: [{ id: "m2" }, { id: "m3" }],
      you: "m3",
    });
  });
});

describe("who hears what", () => {
  it("sends ticks and race messages to riders, and lobby messages to everyone else", () => {
    const { clock, first, host, seated, second } = ridingRoom();
    const walker = seated("walker", "Cy");
    const heard = [first.messages.length, second.messages.length];
    clock.advance(TICK_MS * 5);
    host.gone(second, 1000);
    expect({
      riders: [first.messages.length, second.messages.length],
      walker: walker.messages.map(({ kind }) => kind),
      walkerTicks: walker.ticks,
    }).toStrictEqual({
      riders: heard,
      walker: ["lobby", "lobby"],
      walkerTicks: [],
    });
  });

  it("carries a walk a rider sent as the race began to a late arrival", () => {
    const { first, host, seated } = ridingRoom();
    host.message(first, walkCommand);
    expect(walksOn(seated("late"))).toStrictEqual([
      { ...WALK, kind: "walk", member: "m1" },
    ]);
  });

  it("forgets where everyone stood when a race starts", () => {
    const { host, seated } = room();
    const walker = seated("walker");
    host.message(walker, walkCommand);
    readyAll(host, [walker]);
    expect(walksOn(seated("late"))).toStrictEqual([]);
  });
});

describe("each socket's role on the status route", () => {
  it(
    "reads lobby, seated and reporting in the order of names, through a replacement, a drop and the grace",
    () => {
      const riding = ridingRoom();
      const { clock, host, seated, second } = riding;
      const walker = seated("walker", "Cy");
      const read = () => {
        const { names, roles } = host.status();
        return names.map((name, at) => `${name}:${roles[at] ?? "none"}`);
      };
      const steps = [read()];
      const back = seated("first", "Ann");
      steps.push(read());
      pilotRide(riding, [second, walker, back]);
      steps.push(read());
      clock.advance(REPORT_GRACE_MS);
      steps.push(read());
      host.gone(walker, 1000);
      steps.push(read());
      expect(steps).toStrictEqual([
        ["Ann:seated", "Bo:seated", "Cy:lobby"],
        ["Bo:seated", "Cy:lobby", "Ann:seated"],
        ["Bo:reporting", "Cy:lobby", "Ann:reporting"],
        ["Bo:lobby", "Cy:lobby", "Ann:lobby"],
        ["Bo:lobby", "Ann:lobby"],
      ]);
    },
    FULL_RIDE_TIMEOUT_MS
  );
});
