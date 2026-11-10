import { SLOT_BYTES } from "@racer/sim/room";
import { createTickFrame } from "@racer/sim/room-frame";
import { readTapePart, TICKS_IN_PART } from "@racer/sim/room-tape";
import { createReadTick } from "@racer/sim/room-wire";
import { describe, expect, it } from "vitest";

import { createHost } from "../src/host.ts";
import { SEAT_LEFT, SEAT_QUIT } from "../src/messages.ts";
import { CHECKPOINT_TICKS } from "../src/room-memory.ts";
import type { RoomMemory } from "../src/room-memory.ts";
import {
  advanceHearing,
  clientOf,
  createClock,
  fakeSocket,
  followTicks,
  HOLD_MS,
  lastLobby,
  nearby,
  pingPacket,
  readyAll,
  readyPacket,
  room,
  sameBuild,
  START_DELAY_MS,
  startedOf,
  TICK_MS,
} from "./host-harness.ts";
import type { Clock, FakeSocket } from "./host-harness.ts";

const RACED_MS = 10_000;
const RACED_TICKS = (RACED_MS / 1000) * 60;
const RESTART_GAP_MS = 3000;
const RIDE_ON_MS = 5000;
const LEFT_FLAG_AT = 1 + 4 + 4 + 4;
const SEAT_HEAD_BYTES = LEFT_FLAG_AT + 1 + 4;

const notesOf = (clock: Clock, ...kinds: readonly string[]) =>
  clock.notes.filter((note) => kinds.includes(note.kind));

const kindsHeard = (socket: FakeSocket): readonly string[] =>
  socket.messages.map(({ kind }) => kind);

const remembered = (clock: Clock): RoomMemory => {
  const memory = clock.memories.at(-1);
  if (!memory) {
    throw new Error("The room remembered nothing.");
  }
  return memory;
};

const racingRoom = () => {
  const { clock, host, seated } = room();
  const ann = seated("ann", "Ann");
  const bo = seated("bo", "Bo");
  readyAll(host, [ann, bo]);
  host.message(ann, readyPacket(ann));
  host.message(bo, readyPacket(bo));
  clock.advance(START_DELAY_MS);
  advanceHearing(host, clock, [ann, bo], RACED_MS);
  const stayed = clientOf(bo);
  followTicks(bo, stayed);
  return { ann, bo, clock, host, stayed };
};

const restartedRoom = (
  clock: Clock,
  gapMs: number,
  memory: RoomMemory = remembered(clock),
  ended = 0
) => {
  const later = createClock(clock.now() + gapMs);
  const host = createHost(later, "custom", memory, ended);
  const seated = (key: string, name: string): FakeSocket => {
    const socket = fakeSocket();
    host.seat(socket, name, nearby, sameBuild(key));
    host.message(socket, pingPacket());
    return socket;
  };
  return { host, later, seated };
};

const ridersBack = () => {
  const { clock, stayed } = racingRoom();
  const { host, later, seated } = restartedRoom(clock, RESTART_GAP_MS);
  later.advance(1000);
  const annBack = seated("ann", "Ann");
  const boBack = seated("bo", "Bo");
  const ann = clientOf(annBack);
  const bo = clientOf(boBack);
  followTicks(annBack, ann);
  followTicks(boBack, bo);
  return { ann, annBack, bo, boBack, host, later, stayed };
};

describe("a room that restarts while a race runs", () => {
  it("checkpoints the race at the start moment and then every checkpoint interval", () => {
    const { clock } = racingRoom();
    const ticks = clock.memories.flatMap((memory) =>
      memory?.race?.checkpoint ? [memory.race.checkpoint.tick] : []
    );
    expect(ticks).toStrictEqual([0, CHECKPOINT_TICKS, 2 * CHECKPOINT_TICKS]);
  });

  it("picks the race up from the last checkpoint and holds every seat", () => {
    const { clock } = racingRoom();
    const { host, later } = restartedRoom(clock, RESTART_GAP_MS);
    expect(notesOf(later, "restored", "held", "lost")).toMatchObject([
      { closeCode: null, kind: "held", rider: 0, tick: RACED_TICKS },
      { closeCode: null, kind: "held", rider: 1, tick: RACED_TICKS },
      {
        afterMs: RESTART_GAP_MS,
        kind: "restored",
        raceId: "race-1",
        tick: RACED_TICKS,
      },
    ]);
    expect(host.status()).toMatchObject({
      hostPhase: "racing",
      raceId: "race-1",
      tick: RACED_TICKS,
      waiting: 0,
    });
  });

  it("puts a returning rider back on at the room's tick, from the snapshot", () => {
    const { ann, annBack, host, stayed } = ridersBack();
    expect(startedOf(annBack)).toMatchObject({ awayMs: 1000, you: 0 });
    expect(kindsHeard(annBack)).toStrictEqual(["started", "countdown"]);
    expect(ann.confirmed.tick).toBe(host.status().tick);
    expect(ann.confirmed.tick).toBeGreaterThanOrEqual(RACED_TICKS);
    expect(stayed.confirmed.tick).toBe(RACED_TICKS);
  });

  it("rides the riders on together, in step with the room", () => {
    const { ann, annBack, bo, boBack, host, later } = ridersBack();
    advanceHearing(host, later, [annBack, boBack], RIDE_ON_MS);
    followTicks(annBack, ann);
    followTicks(boBack, bo);
    expect([ann.stats.desyncs, bo.stats.desyncs]).toStrictEqual([0, 0]);
    expect(ann.confirmed.tick).toBe(bo.confirmed.tick);
    expect(ann.confirmed.riders).toStrictEqual(bo.confirmed.riders);
    expect(notesOf(later, "rejoined")).toHaveLength(2);
  });

  it("writes one whole tape across the restart, so a fresh client replays it hash for hash", () => {
    const { clock } = racingRoom();
    const { host, later, seated } = restartedRoom(clock, RESTART_GAP_MS);
    const annBack = seated("ann", "Ann");
    const boBack = seated("bo", "Bo");
    advanceHearing(
      host,
      later,
      [annBack, boBack],
      (TICKS_IN_PART - RACED_TICKS) * TICK_MS + 1000
    );
    const part = later.tape.get("tapes/race-1/00000.bin");
    if (!(part instanceof Uint8Array)) {
      throw new Error("The restarted room saved no first tape part.");
    }
    const fresh = clientOf(annBack);
    const read = createReadTick(createTickFrame());
    let ticks = 0;
    const result = readTapePart(
      new DataView(part.buffer, part.byteOffset, part.byteLength),
      read,
      (tick) => {
        ticks += 1;
        fresh.confirm(tick.frame, tick.hashed ? tick.hash : null);
        return null;
      }
    );
    expect(result).toStrictEqual({ kind: "read" });
    expect(ticks).toBe(TICKS_IN_PART);
    expect(fresh.stats.desyncs).toBe(0);
    expect(fresh.confirmed.tick).toBe(TICKS_IN_PART);
  });

  it("loses the race when nobody comes back within the hold, and says so in the lobby", () => {
    const { clock } = racingRoom();
    const { host, later, seated } = restartedRoom(clock, HOLD_MS + 1);
    expect(notesOf(later, "restored", "held", "lost")).toMatchObject([
      {
        afterMs: HOLD_MS + 1,
        kind: "lost",
        raceId: "race-1",
        reason: "pastHold",
        tick: RACED_TICKS,
      },
    ]);
    expect(host.status()).toMatchObject({
      hostPhase: "waiting",
      raceId: null,
    });
    const back = seated("ann", "Ann");
    expect(kindsHeard(back)).toStrictEqual(["lobby"]);
    const lobby = lastLobby(back);
    expect(lobby).toMatchObject({
      hostId: lobby.you,
      lostRace: "race-1",
      members: [
        { here: true, name: "Ann" },
        { here: false, name: "Bo" },
      ],
    });
  });
});

const unsavedKeys = (clock: Clock): readonly string[] =>
  remembered(clock).unsaved.map(({ key }) => key);

describe("a room that restarts before R2 acknowledged a tape part", () => {
  it("saves the part again from its memory, so the tape stays whole", () => {
    const { ann, bo, clock, host } = racingRoom();
    clock.holdSaves = true;
    advanceHearing(
      host,
      clock,
      [ann, bo],
      (TICKS_IN_PART - RACED_TICKS) * TICK_MS + 1000
    );
    expect(clock.tape.has("tapes/race-1/00000.bin")).toBeFalsy();
    expect(unsavedKeys(clock)).toStrictEqual(["tapes/race-1/00000.bin"]);
    const { later } = restartedRoom(clock, RESTART_GAP_MS);
    expect(later.tape.has("tapes/race-1/00000.bin")).toBeTruthy();
    later.advance(CHECKPOINT_TICKS * TICK_MS + 100);
    expect(unsavedKeys(later)).toStrictEqual([]);
  });
});

describe("a room that restarts right after its race ended", () => {
  it("saves the race's final tape files again from its memory", () => {
    const { ann, bo, clock, host } = racingRoom();
    clock.holdSaves = true;
    host.gone(ann, SEAT_QUIT);
    host.gone(bo, SEAT_QUIT);
    clock.advance(TICK_MS * 2);
    expect(notesOf(clock, "ended")).toHaveLength(1);
    expect(unsavedKeys(clock)).toStrictEqual([
      "tapes/race-1/00000.bin",
      "tapes/race-1/room-trace.json",
      "tapes/race-1/end.json",
    ]);
    const { later } = restartedRoom(clock, RESTART_GAP_MS);
    expect([...later.tape.keys()]).toStrictEqual([
      "tapes/race-1/00000.bin",
      "tapes/race-1/room-trace.json",
      "tapes/race-1/end.json",
    ]);
    expect(later.memories.at(-1)?.unsaved).toStrictEqual([]);
  });

  it("keeps the record of an empty lobby until R2 acknowledges, then forgets it", () => {
    const { ann, bo, clock, host } = racingRoom();
    clock.holdSaves = true;
    host.gone(ann, SEAT_LEFT);
    host.gone(bo, SEAT_LEFT);
    clock.advance(TICK_MS * 2);
    expect(remembered(clock)).toMatchObject({ race: null });
    expect(remembered(clock).lobby.members).toStrictEqual([]);
    clock.releaseSaves();
    expect(clock.memories.at(-1)).toBeNull();
  });
});

describe("a room that restarts with a race it must not restore", () => {
  it("refuses a race it recorded as ended, and says why", () => {
    const { clock } = racingRoom();
    const { host, later } = restartedRoom(
      clock,
      RESTART_GAP_MS,
      remembered(clock),
      1
    );
    expect(notesOf(later, "lost", "restored")).toMatchObject([
      { kind: "lost", raceId: "race-1", reason: "ended" },
    ]);
    expect(host.status().hostPhase).toBe("waiting");
  });

  it("refuses a race whose sequence the end marker has passed, however many races later", () => {
    const { clock } = racingRoom();
    expect(remembered(clock).race?.sequence).toBe(1);
    const { later } = restartedRoom(
      clock,
      RESTART_GAP_MS,
      remembered(clock),
      9
    );
    expect(notesOf(later, "lost", "restored")).toMatchObject([
      { kind: "lost", raceId: "race-1", reason: "ended" },
    ]);
  });

  it("records the race's end as the highest sequence ended, before it forgets the race", () => {
    const clock = createClock();
    const host = createHost(clock, "custom", null, 3);
    const ann = fakeSocket();
    const bo = fakeSocket();
    host.seat(ann, "Ann", nearby, sameBuild("ann"));
    host.seat(bo, "Bo", nearby, sameBuild("bo"));
    readyAll(host, [ann, bo]);
    host.message(ann, readyPacket(ann));
    host.message(bo, readyPacket(bo));
    clock.advance(START_DELAY_MS + TICK_MS);
    host.gone(ann, SEAT_QUIT);
    host.gone(bo, SEAT_QUIT);
    clock.advance(TICK_MS * 2);
    expect(clock.endings).toStrictEqual([4]);
    expect(remembered(clock)).toMatchObject({ race: null, races: 4 });
  });

  it("ends a restored race at once when every rider had already finished or left, with no second result", () => {
    const { clock } = racingRoom();
    const memory = remembered(clock);
    const checkpoint = memory.race?.checkpoint;
    if (!checkpoint) {
      throw new Error("The room remembered no checkpoint.");
    }
    const controls = new Uint8Array(checkpoint.controls);
    const view = new DataView(controls.buffer);
    let at = 1;
    for (let seat = 0; seat < 2; seat += 1) {
      controls[at + LEFT_FLAG_AT] = 1;
      const queued = view.getUint32(at + LEFT_FLAG_AT + 1, true);
      at += SEAT_HEAD_BYTES + queued * SLOT_BYTES;
    }
    const { race } = memory;
    if (race === null) {
      throw new Error("The room remembered no race.");
    }
    const { host, later } = restartedRoom(clock, RESTART_GAP_MS, {
      ...memory,
      race: { ...race, checkpoint: { ...checkpoint, controls } },
    });
    expect(notesOf(later, "restored", "ended", "lost")).toStrictEqual([]);
    expect(later.endings).toStrictEqual([1]);
    expect(remembered(later).race).toBeNull();
    expect(host.status()).toMatchObject({ hostPhase: "waiting", raceId: null });
  });

  it("refuses a checkpoint another simulation build wrote", () => {
    const { clock } = racingRoom();
    const { later } = restartedRoom(clock, RESTART_GAP_MS, {
      ...remembered(clock),
      sim: "another-sim",
    });
    const [lost] = notesOf(later, "lost");
    expect(lost).toMatchObject({
      kind: "lost",
      raceId: "race-1",
      reason: "newSim",
    });
    expect(lost?.kind === "lost" ? lost.detail : null).toContain("another-sim");
  });

  it("refuses a checkpoint from another wire protocol", () => {
    const { clock } = racingRoom();
    const memory = remembered(clock);
    const { race } = memory;
    if (race === null) {
      throw new Error("The room remembered no race.");
    }
    const { later } = restartedRoom(clock, RESTART_GAP_MS, {
      ...memory,
      race: { ...race, manifest: { ...race.manifest, protocol: 999 } },
    });
    expect(notesOf(later, "lost")).toMatchObject([
      { kind: "lost", reason: "newSim" },
    ]);
  });
});

describe("a room that restarts after a rider left since the checkpoint", () => {
  it("restores the seats as the checkpoint had them, so that rider is held and can come back", () => {
    const { ann, bo, clock, host } = racingRoom();
    advanceHearing(host, clock, [ann, bo], 1000);
    host.gone(ann, SEAT_QUIT);
    expect(notesOf(clock, "left")).toHaveLength(1);
    const { host: next, later, seated } = restartedRoom(clock, RESTART_GAP_MS);
    expect(notesOf(later, "held")).toHaveLength(2);
    expect(next.status()).toMatchObject({
      hostPhase: "racing",
      raceId: "race-1",
    });
    expect(kindsHeard(seated("ann", "Ann"))).toStrictEqual([
      "started",
      "countdown",
    ]);
  });
});

describe("a room that restarts while the road loads", () => {
  it("loses the race it had not checkpointed and keeps the lobby's members, rule and host", () => {
    const { clock, host, seated } = room();
    const ann = seated("ann", "Ann");
    const bo = seated("bo", "Bo");
    host.message(ann, JSON.stringify({ choice: { tier: 3 }, kind: "choose" }));
    readyAll(host, [ann, bo]);
    const before = lastLobby(bo);
    expect(remembered(clock).race).toMatchObject({
      checkpoint: null,
      raceId: "race-1",
    });
    const {
      host: next,
      later,
      seated: seatedAgain,
    } = restartedRoom(clock, RESTART_GAP_MS);
    expect(notesOf(later, "lost")).toMatchObject([
      { kind: "lost", raceId: "race-1", reason: "noCheckpoint", tick: 0 },
    ]);
    const boBack = seatedAgain("bo", "Bo");
    expect(lastLobby(boBack).hostId).toBe(lastLobby(boBack).you);
    const annBack = seatedAgain("ann", "Ann");
    expect(lastLobby(annBack)).toMatchObject({
      hostId: before.hostId,
      lostRace: "race-1",
      members: before.members.map(({ colour, id, name }) => ({
        colour,
        id,
        name,
      })),
      rule: { ...before.rule, tier: 3 },
    });
    expect(next.status().hostPhase).toBe("waiting");
  });
});

describe("a lobby that lost its race", () => {
  it("still says so after another restart", () => {
    const { clock } = racingRoom();
    const { later } = restartedRoom(clock, HOLD_MS + 1);
    expect(remembered(later).lostRace).toBe("race-1");
    const { seated } = restartedRoom(later, RESTART_GAP_MS);
    expect(lastLobby(seated("ann", "Ann")).lostRace).toBe("race-1");
  });
});

describe("what a room remembers", () => {
  it("forgets a lobby everyone has left", () => {
    const { clock, host, seated } = room();
    const ann = seated("ann", "Ann");
    expect(remembered(clock).lobby.members).toHaveLength(1);
    host.gone(ann, SEAT_LEFT);
    expect(clock.memories.at(-1)).toBeNull();
  });

  it("keeps the lobby without the race once the race has ended", () => {
    const { ann, bo, clock, host } = racingRoom();
    host.gone(ann, 1006);
    host.gone(bo, 1006);
    clock.advance(HOLD_MS + 1000);
    expect(notesOf(clock, "ended")).toHaveLength(1);
    expect(remembered(clock).race).toBeNull();
    expect(
      remembered(clock).lobby.members.map(({ name }) => name)
    ).toStrictEqual(["Ann", "Bo"]);
  });
});
