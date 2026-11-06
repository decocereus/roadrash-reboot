import { seatedRace } from "@racer/career/room-race";
import type { RoomRule } from "@racer/career/room-race";
import { createRoom, firstRacers } from "@racer/sim/room";
import type { Room } from "@racer/sim/room";
import { createTapeWriter, hexOfWords } from "@racer/sim/room-tape";
import type { TapeWriter } from "@racer/sim/room-tape";
import { ROOM_PROTOCOL } from "@racer/sim/room-wire";
import { trackDigest } from "@racer/sim/snapshot-setup";
import { TICK_SECONDS } from "@racer/sim/state";

import type { RaceManifest } from "./manifest.ts";
import { WAKE_GAP_CEILINGS_MS } from "./notes.ts";
import type { RoomNote } from "./notes.ts";
import { rosterOf, seatFor } from "./race-seat.ts";
import type { Seat } from "./race-seat.ts";
import { msOf, ticksOf } from "./room-config.ts";
import type { RoomConfig } from "./room-config.ts";
import { TAPE_VERSION, tapeHeaderName, tapeKey, tapePartName } from "./tape.ts";

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
  readonly manifest: RaceManifest;
  readonly raceId: string;
  readonly riders: readonly Seat[];
  readonly room: Room;
  readonly since: number;
  readonly tape: TapeWriter;
  readonly trace: number[];
  readonly wakeGaps: Uint32Array;
}

type Sitter = Pick<Seat, "link" | "memberId" | "name">;

interface Gathering<Person extends Sitter> {
  readonly colourOf: (memberId: string) => number;
  readonly gathered: readonly Person[];
  readonly lobbyMs: number;
  readonly now: number;
  readonly rule: RoomRule;
  readonly tickBytes: number;
}

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
    manifest,
    raceId,
    riders,
    room,
    since: now,
    tape: createTapeWriter(tickBytes, (part, bytes) => {
      ports.saveTape(tapeKey(raceId, tapePartName(part)), bytes);
    }),
    trace: [],
    wakeGaps: new Uint32Array(WAKE_GAP_CEILINGS_MS.length + 1),
  };
  return { run, seated };
};
