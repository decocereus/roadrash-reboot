import { describe, expect, it } from "vitest";

import { createMemory } from "../src/host-memory.ts";
import { createLobby } from "../src/lobby.ts";
import { launchRoomConfig, publicRuleFor } from "../src/room-config.ts";
import type { RoomMemory } from "../src/room-memory.ts";

const memoryWithHeldSaves = (ended = 0, races = 0) => {
  const saves: { readonly key: string; readonly saved: () => void }[] = [];
  const written: (RoomMemory | null)[] = [];
  const endings: number[] = [];
  const lobby = createLobby(0, "custom", launchRoomConfig, () =>
    publicRuleFor(launchRoomConfig.publicRace, 0)
  );
  lobby.join("ann", "Ann", 0);
  const memory = createMemory(
    {
      build: "test-build",
      endRace: (through) => {
        endings.push(through);
      },
      now: () => 0,
      remember: (record) => {
        written.push(record);
      },
      saveTape: (key, _body, saved) => {
        saves.push({ key, saved });
      },
      sim: "test-sim",
    },
    { ended, lobby, lostRace: () => null, races, run: () => null }
  );
  return { endings, memory, saves, written };
};

const unsavedOf = (record: RoomMemory | null | undefined) =>
  (record?.unsaved ?? []).map(({ body, key }) => `${key}=${String(body)}`);

describe("what a room keeps unsaved", () => {
  it("keeps the newer write to a key when an older write's acknowledgement arrives", () => {
    const { memory, saves, written } = memoryWithHeldSaves();
    memory.saveTape("tapes/race-1/rider-0.trace.json", "first");
    memory.saveTape("tapes/race-1/rider-0.trace.json", "second");
    memory.remember();
    expect(unsavedOf(written.at(-1))).toStrictEqual([
      "tapes/race-1/rider-0.trace.json=second",
    ]);
    saves[0]?.saved();
    memory.remember();
    expect(unsavedOf(written.at(-1))).toStrictEqual([
      "tapes/race-1/rider-0.trace.json=second",
    ]);
    saves[1]?.saved();
    expect(unsavedOf(written.at(-1))).toStrictEqual([]);
  });

  it("marks the highest sequence ended and never lets it fall", () => {
    const { endings, memory } = memoryWithHeldSaves();
    memory.markEnded(3);
    memory.markEnded(2);
    expect(endings).toStrictEqual([3, 3]);
    expect(memory.endedThrough()).toBe(3);
  });

  it("numbers the next race above both the races it built and the marker, so a lost record write never refuses a new race", () => {
    expect(memoryWithHeldSaves().memory.nextSequence()).toBe(1);
    expect(memoryWithHeldSaves(5, 4).memory.nextSequence()).toBe(6);
  });
});
