import type { Lobby } from "./lobby.ts";
import { raceMemoryOf } from "./race-build.ts";
import type { RacePorts, Run } from "./race-build.ts";
import { seatMemoryOf } from "./race-seat.ts";
import { checkpointOf, MEMORY_VERSION } from "./room-memory.ts";
import type { RoomMemory } from "./room-memory.ts";

const MOST_ENDED = 8;

export interface MemoryPorts {
  readonly build: string;
  readonly endRace: (ended: readonly string[]) => void;
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
  readonly ended: readonly string[];
  readonly lobby: Lobby;
  readonly lostRace: () => string | null;
  readonly run: () => Run | null;
}

export const createMemory = (
  ports: MemoryPorts,
  { ended, lobby, lostRace, run }: Remembered
) => {
  const endedRaces = [...ended];
  const markEnded = (raceId: string): void => {
    endedRaces.push(raceId);
    if (endedRaces.length > MOST_ENDED) {
      endedRaces.splice(0, endedRaces.length - MOST_ENDED);
    }
    ports.endRace(endedRaces);
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
  return { checkpoint, endedRaces, markEnded, remember, saveTape };
};
