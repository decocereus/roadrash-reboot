import type { Lobby } from "./lobby.ts";
import { raceMemoryOf } from "./race-build.ts";
import type { RacePorts, Run } from "./race-build.ts";
import { seatMemoryOf } from "./race-seat.ts";
import { checkpointOf, MEMORY_VERSION } from "./room-memory.ts";
import type { RoomMemory } from "./room-memory.ts";

export interface MemoryPorts {
  readonly build: string;
  readonly now: () => number;
  readonly remember: (memory: RoomMemory | null) => void;
  readonly saveTape: (
    key: string,
    body: string | Uint8Array,
    saved: () => void
  ) => void;
}

interface Remembered {
  readonly lobby: Lobby;
  readonly lostRace: () => string | null;
  readonly run: () => Run | null;
}

export const createMemory = (
  ports: MemoryPorts,
  { lobby, lostRace, run }: Remembered
) => {
  const unsaved = new Map<string, string | Uint8Array>();
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
            unsaved: [...unsaved].map(([key, body]) => ({ body, key })),
            version: MEMORY_VERSION,
          }
    );
  };
  const saveTape: RacePorts["saveTape"] = (key, body) => {
    unsaved.set(key, body);
    ports.saveTape(key, body, () => {
      if (unsaved.delete(key) && unsaved.size === 0) {
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
  return { checkpoint, remember, saveTape };
};
