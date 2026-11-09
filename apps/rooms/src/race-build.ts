import { seatedRace } from "@racer/career/room-race";
import type { RoomRule } from "@racer/career/room-race";
import { createRoom, firstRacers } from "@racer/sim/room";
import type { Room } from "@racer/sim/room";
import { createTapeWriter, hexOfWords } from "@racer/sim/room-tape";
import type { TapeResume, TapeWriter } from "@racer/sim/room-tape";
import { ROOM_PROTOCOL } from "@racer/sim/room-wire";
import { restoreInto } from "@racer/sim/snapshot";
import { trackDigest } from "@racer/sim/snapshot-setup";
import { TICK_SECONDS } from "@racer/sim/state";

import { seatedCount } from "./manifest.ts";
import type { RaceManifest } from "./manifest.ts";
import { WAKE_GAP_CEILINGS_MS } from "./notes.ts";
import type { RoomNote } from "./notes.ts";
import {
  restoredSeat,
  rosterOf,
  seatFor,
  seatMemoryOf,
  traceSeats,
} from "./race-seat.ts";
import type { Seat } from "./race-seat.ts";
import { msOf, ticksOf } from "./room-config.ts";
import type { RoomConfig } from "./room-config.ts";
import type { Checkpoint, RaceMemory } from "./room-memory.ts";
import {
  roomTraceName,
  TAPE_VERSION,
  tapeEndName,
  tapeHeaderName,
  tapeKey,
  tapePartName,
} from "./tape.ts";
import type { RoomTrace, TapeEnd } from "./tape.ts";

const tapeEndOf = (room: Room, parts: number): string =>
  JSON.stringify({
    hash: hexOfWords(room.hashNow()),
    parts,
    tick: room.state.tick,
  } satisfies TapeEnd);

export interface RacePorts {
  readonly build: string;
  readonly config: RoomConfig;
  readonly note: (note: RoomNote) => void;
  readonly raceId: () => string;
  readonly roomColo: () => string | null;
  readonly saveTape: (key: string, body: string | Uint8Array) => void;
  readonly seed: () => number;
}

export interface Run {
  readonly base: Uint8Array | null;
  readonly manifest: RaceManifest;
  readonly raceId: string;
  readonly riders: readonly Seat[];
  readonly room: Room;
  readonly since: number;
  readonly tape: TapeWriter;
  readonly trace: number[];
  readonly wakeGaps: Uint32Array;
  checkpoint: Checkpoint | null;
}

export const raceMemoryOf = ({
  checkpoint,
  manifest,
  raceId,
  riders,
}: Run): RaceMemory => ({
  checkpoint,
  manifest,
  raceId,
  seats: riders.map((seat) => seatMemoryOf(seat)),
});

const freshGaps = (): Uint32Array =>
  new Uint32Array(WAKE_GAP_CEILINGS_MS.length + 1);

const tapeFor = (
  ports: RacePorts,
  raceId: string,
  tickBytes: number,
  resume: TapeResume | null
): TapeWriter =>
  createTapeWriter(
    tickBytes,
    (part, bytes) => {
      ports.saveTape(tapeKey(raceId, tapePartName(part)), bytes);
    },
    resume
  );

export const restoreRace = (
  ports: RacePorts,
  { checkpoint, manifest, raceId, seats }: RaceMemory,
  tickBytes: number,
  now: number
): Run | null => {
  if (checkpoint === null) {
    return null;
  }
  const { setup } = seatedRace(
    manifest.seed,
    seatedCount(manifest),
    manifest.rule
  );
  const room = createRoom(setup, ticksOf(manifest.raceLimitSeconds));
  const { snapshot } = checkpoint;
  try {
    restoreInto(
      room.state,
      room.digest,
      new DataView(snapshot.buffer, snapshot.byteOffset, snapshot.byteLength),
      setup.track
    );
  } catch {
    return null;
  }
  const riders = seats.map((seat) => restoredSeat(seat, raceId));
  for (const seat of riders) {
    if (seat.presence.kind === "left") {
      room.leave(seat.rider);
    }
  }
  return {
    base: snapshot,
    checkpoint,
    manifest,
    raceId,
    riders,
    room,
    since: now,
    tape: tapeFor(ports, raceId, tickBytes, checkpoint.tape),
    trace: [],
    wakeGaps: freshGaps(),
  };
};

type Sitter = Pick<Seat, "link" | "memberId" | "name">;

interface Gathering<Person extends Sitter> {
  readonly colourOf: (memberId: string) => number;
  readonly gathered: readonly Person[];
  readonly lobbyMs: number;
  readonly now: number;
  readonly rule: RoomRule;
  readonly tickBytes: number;
}

export const finishTape = (
  { raceId, riders, room, tape, trace }: Run,
  saveTape: RacePorts["saveTape"]
): void => {
  traceSeats(riders, room, trace);
  tape.finish();
  saveTape(
    tapeKey(raceId, roomTraceName),
    JSON.stringify({ rows: trace } satisfies RoomTrace)
  );
  saveTape(tapeKey(raceId, tapeEndName), tapeEndOf(room, tape.parts()));
};

export const buildRace = <Person extends Sitter>(
  ports: RacePorts,
  { colourOf, gathered, lobbyMs, now, rule, tickBytes }: Gathering<Person>
) => {
  const seed = ports.seed();
  const raceId = ports.raceId();
  const { humans, road, setup } = seatedRace(seed, gathered.length, rule);
  const { loadDeadlineSeconds, raceLimitSeconds, seatHoldSeconds } =
    ports.config;
  const room = createRoom(setup, ticksOf(raceLimitSeconds));
  const digest = hexOfWords(room.digest);
  ports.saveTape(
    tapeKey(raceId, tapeHeaderName),
    JSON.stringify({
      build: ports.build,
      digest,
      raceId,
      road,
      rule,
      seats: humans.length,
      seed,
      version: TAPE_VERSION,
    })
  );
  const seated = humans.flatMap((rider, at) => {
    const person = gathered[at];
    return person
      ? [
          {
            person,
            seat: seatFor(person, colourOf(person.memberId), raceId, rider),
          },
        ]
      : [];
  });
  const riders = seated.map(({ seat }) => seat);
  const trackHash = trackDigest(setup.track);
  const manifest: RaceManifest = {
    build: ports.build,
    contentHash: [...room.digest],
    loadingDeadlineMs: msOf(loadDeadlineSeconds),
    protocol: ROOM_PROTOCOL,
    raceId,
    raceLimitSeconds,
    reconnect: { holdSeconds: seatHoldSeconds },
    roster: rosterOf(
      room,
      firstRacers(setup, Number.POSITIVE_INFINITY),
      riders
    ),
    rule,
    seed,
    tickRate: Math.round(1 / TICK_SECONDS),
    trackHash: [...trackHash],
  };
  ports.note({
    at: now,
    build: ports.build,
    digest,
    kind: "started",
    lobbyMs,
    police: rule.police,
    protocol: ROOM_PROTOCOL,
    raceId,
    road,
    roomColo: ports.roomColo(),
    seats: humans.length,
    seed,
    tier: rule.tier,
    trackHash: hexOfWords(trackHash),
    traffic: rule.traffic,
  });
  const run: Run = {
    base: null,
    checkpoint: null,
    manifest,
    raceId,
    riders,
    room,
    since: now,
    tape: tapeFor(ports, raceId, tickBytes, null),
    trace: [],
    wakeGaps: freshGaps(),
  };
  return { run, seated };
};
