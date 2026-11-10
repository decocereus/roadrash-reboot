import type { Lobby } from "./lobby.ts";
import { raceMemoryOf } from "./race-build.ts";
import type { RacePorts, Run } from "./race-build.ts";
import { seatMemoryOf } from "./race-seat.ts";
import { checkpointOf, MEMORY_VERSION } from "./room-memory.ts";
import type { RoomMemory } from "./room-memory.ts";

export interface MemoryPorts {
  readonly build: string;
  readonly endRace: (endedThrough: number) => void;
  readonly now: () => number;
  readonly remember: (memory: RoomMemory | null) => void;
  readonly sim: string;
  readonly saveTape: (
    key: string,
    body: string | Uint8Array,
    saved: () => void
  ) => void;
}

interface Remembered {
  readonly ended: number;
  readonly lobby: Lobby;
  readonly lostRace: () => string | null;
  readonly races: number;
  readonly run: () => Run | null;
}

export const createMemory = (
  ports: MemoryPorts,
  { ended, lobby, lostRace, races: built, run }: Remembered
) => {
  let endedThrough = ended;
  let races = Math.max(built, ended);
  const markEnded = (sequence: number): void => {
    endedThrough = Math.max(endedThrough, sequence);
    ports.endRace(endedThrough);
  };
  const nextSequence = (): number => {
    races += 1;
    return races;
  };
  const unsaved = new Map<
    string,
    { readonly body: string | Uint8Array; readonly sequence: number }
  >();
  let sequence = 0;
  const remember = (): void => {
    const current = run();
    ports.remember(
      current === null && lobby.size() === 0 && unsaved.size === 0
        ? null
        : {
            at: ports.now(),
            build: ports.build,
            lobby: lobby.memory(),
            lostRace: lostRace(),
            race: current === null ? null : raceMemoryOf(current),
            races,
            sim: ports.sim,
            unsaved: [...unsaved].map(([key, { body }]) => ({ body, key })),
            version: MEMORY_VERSION,
          }
    );
  };
  const saveTape: RacePorts["saveTape"] = (key, body) => {
    sequence += 1;
    const written = sequence;
    unsaved.set(key, { body, sequence: written });
    ports.saveTape(key, body, () => {
      if (unsaved.get(key)?.sequence !== written) {
        return;
      }
      unsaved.delete(key);
      if (unsaved.size === 0) {
        remember();
      }
    });
  };
  const checkpoint = (current: Run): void => {
    current.checkpoint = checkpointOf(
      current.room,
      current.tape,
      current.riders.map((seat) => seatMemoryOf(seat))
    );
    remember();
  };
  return {
    checkpoint,
    endedThrough: () => endedThrough,
    markEnded,
    nextSequence,
    remember,
    saveTape,
  };
};
