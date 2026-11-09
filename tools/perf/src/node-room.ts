import type { HeapProfiler } from "node:inspector";
import { Session } from "node:inspector/promises";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { serialize } from "node:v8";

import { UsageError } from "@racer/devtools/usage-error";
import type { RaceManifest } from "@racer/rooms/manifest";
import { rosterOf, seatFor, seatMemoryOf } from "@racer/rooms/race-seat";
import { createRaceTally } from "@racer/rooms/race-tally";
import {
  launchRoomConfig,
  publicRuleFor,
  ticksOf,
} from "@racer/rooms/room-config";
import {
  CHECKPOINT_TICKS,
  checkpointOf,
  MEMORY_VERSION,
} from "@racer/rooms/room-memory";
import type { RoomMemory } from "@racer/rooms/room-memory";
import { controlOf } from "@racer/sim/control";
import { createRoom, firstRacers, roomSetup } from "@racer/sim/room";
import { createRoomClient } from "@racer/sim/room-client";
import { clearFrame, createTickFrame, sameFrame } from "@racer/sim/room-frame";
import { createTapeWriter } from "@racer/sim/room-tape";
import {
  createReadTick,
  readTick,
  ROOM_PROTOCOL,
  tickCapacity,
  writeTick,
} from "@racer/sim/room-wire";
import { trackDigest } from "@racer/sim/snapshot-setup";
import type { Control, RiderId } from "@racer/sim/state";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { MeasurementFailed } from "./measurement-failed.ts";
import { runtimeOf } from "./node.ts";
import {
  benchStart,
  scenarioHash,
  scenarios,
  WINDOW_TICKS,
} from "./scenarios.ts";
import type { Scenario } from "./scenarios.ts";

const SEATS = 4;
const LEAD_TICKS = 6;
const STEER_PERIOD_TICKS = 29;
const PUNCH_EVERY_TICKS = 241;
const SAMPLING_BYTES = 4096;
const FRAME_REPEATS = 20;
const SAMPLED_WINDOWS = 3;
const BENCH_RACE = "bench-race";
const NO_LINK = { asn: null, colo: null, network: null, tcpRttMs: null };

const controlAt = (tick: number, seat: number): Control => {
  const phase = (tick + seat * STEER_PERIOD_TICKS) % (STEER_PERIOD_TICKS * 2);
  return controlOf({
    brake: 0,
    kick: false,
    punch: tick % PUNCH_EVERY_TICKS === 0,
    remount: tick % PUNCH_EVERY_TICKS === 0,
    steer: phase < STEER_PERIOD_TICKS ? 0.3 : -0.3,
    throttle: 1,
  });
};

const prepareRoom = (scenario: Scenario) => {
  const bench = benchStart(scenario.bench);
  const humans = firstRacers(bench, SEATS);
  const setup = roomSetup(bench, humans);
  const pilotFromTick = ticksOf(launchRoomConfig.raceLimitSeconds);
  const room = createRoom(setup, pilotFromTick);
  const [me] = humans;
  if (me === undefined) {
    throw new RangeError("A measured room seats at least one rider.");
  }
  const client = createRoomClient(setup, me, pilotFromTick);
  const out = new DataView(new ArrayBuffer(tickCapacity(SEATS)));
  let pendingPart: { readonly body: Uint8Array; readonly key: string } | null =
    null;
  const tape = createTapeWriter(tickCapacity(SEATS), (part, bytes) => {
    pendingPart = { body: bytes, key: `tapes/${BENCH_RACE}/${part}.bin` };
  });
  const read = createReadTick(createTickFrame());
  const one: Control[] = [];
  const seats = humans.map((rider, at) =>
    seatFor(
      { link: NO_LINK, memberId: `m${at + 1}`, name: `Rider ${at + 1}` },
      at,
      BENCH_RACE,
      rider
    )
  );
  const rule = publicRuleFor(launchRoomConfig.publicRace, 0);
  const manifest: RaceManifest = {
    build: "bench",
    contentHash: [...room.digest],
    loadingDeadlineMs: launchRoomConfig.loadDeadlineSeconds * 1000,
    protocol: ROOM_PROTOCOL,
    raceId: BENCH_RACE,
    raceLimitSeconds: launchRoomConfig.raceLimitSeconds,
    reconnect: { holdSeconds: launchRoomConfig.seatHoldSeconds },
    roster: rosterOf(room, firstRacers(setup, Number.POSITIVE_INFINITY), seats),
    rule,
    seed: 0,
    tickRate: 60,
    trackHash: [...trackDigest(setup.track)],
  };
  const memoryNow = (): RoomMemory => ({
    at: 0,
    build: "bench",
    lobby: {
      joined: seats.length,
      members: seats.map(({ colour, memberId, name }) => ({
        colour,
        id: memberId,
        key: memberId,
        name,
      })),
      rule,
    },
    lostRace: null,
    race: {
      checkpoint: checkpointOf(
        room,
        tape,
        seats.map((seat) => seatMemoryOf(seat))
      ),
      manifest,
      raceId: BENCH_RACE,
    },
    sim: "bench",
    unsaved: pendingPart === null ? [] : [pendingPart],
    version: MEMORY_VERSION,
  });
  const checkpoint: number[] = [];
  const checkpointBytes: number[] = [];
  const checkpointDue = (): void => {
    if (room.state.tick % CHECKPOINT_TICKS !== 0) {
      return;
    }
    const at = performance.now();
    const bytes = serialize(memoryNow());
    checkpoint.push(performance.now() - at);
    checkpointBytes.push(bytes.byteLength);
    pendingPart = null;
  };

  const serve = (rider: RiderId, seat: number, tick: number): void => {
    one[0] = controlAt(tick, seat);
    room.accept(rider, tick, one);
  };

  const stepRoom = (): DataView => {
    const tick = room.state.tick + 1;
    for (let seat = 0; seat < humans.length; seat += 1) {
      const rider = humans[seat];
      if (rider !== undefined) {
        serve(rider, seat, tick);
      }
    }
    room.step();
    const bytes = writeTick(out, room.frame, room.hashed ? room.hash : null);
    tape.add(new Uint8Array(out.buffer, 0, bytes));
    return new DataView(out.buffer, 0, bytes);
  };

  const predict = (): void => {
    const target = room.state.tick + LEAD_TICKS;
    while (client.predicted.tick < target) {
      client.predict(controlAt(client.predicted.tick + 1, 0));
    }
  };

  const confirm = (packet: DataView): void => {
    readTick(packet, read);
    client.confirm(read.frame, read.hashed ? read.hash : null);
    client.settle();
  };

  const warm = (): void => {
    while (room.state.tick < scenario.window.from - 1) {
      predict();
      confirm(stepRoom());
      checkpointDue();
    }
  };

  return {
    checkpoint,
    checkpointBytes,
    checkpointDue,
    client,
    confirm,
    predict,
    room,
    stepRoom,
    warm,
  };
};

type Prepared = ReturnType<typeof prepareRoom>;

const prepareWarmed = (scenario: Scenario): Prepared => {
  const prepared = prepareRoom(scenario);
  prepared.warm();
  return prepared;
};

const timedWindow = (scenario: Scenario) => {
  prepareWarmed(scenario);
  const prepared = prepareWarmed(scenario);
  const tick: number[] = [];
  const confirm: number[] = [];
  const rollback: number[] = [];
  const resimulated: number[] = [];
  for (let index = 0; index < WINDOW_TICKS; index += 1) {
    prepared.predict();
    const atStep = performance.now();
    const packet = prepared.stepRoom();
    tick.push(performance.now() - atStep);
    const before = prepared.client.stats.rollbacks;
    const resimBefore = prepared.client.stats.resimulatedTicks;
    const atConfirm = performance.now();
    prepared.confirm(packet);
    const took = performance.now() - atConfirm;
    if (prepared.client.stats.rollbacks === before) {
      confirm.push(took);
    } else {
      rollback.push(took);
      resimulated.push(prepared.client.stats.resimulatedTicks - resimBefore);
    }
    prepared.checkpointDue();
  }
  return {
    checkpoint: prepared.checkpoint,
    checkpointBytes: prepared.checkpointBytes,
    confirm,
    resimulated,
    rollback,
    tick,
  };
};

const inspector = (method: string) => (cause: unknown) =>
  new MeasurementFailed({
    cause,
    lane: "node",
    message: `The inspector refused ${method}.`,
  });

const sampledBytes = (node: HeapProfiler.SamplingHeapProfileNode): number =>
  node.children.reduce(
    (total, child) => total + sampledBytes(child),
    node.selfSize
  );

const sampled = Effect.fnUntraced(function* sampled(work: () => void) {
  const session = new Session();
  session.connect();
  yield* Effect.tryPromise({
    catch: inspector("HeapProfiler.enable"),
    try: async () => {
      await session.post("HeapProfiler.enable");
    },
  });
  yield* Effect.tryPromise({
    catch: inspector("HeapProfiler.startSampling"),
    try: async () => {
      await session.post("HeapProfiler.startSampling", {
        includeObjectsCollectedByMajorGC: true,
        includeObjectsCollectedByMinorGC: true,
        samplingInterval: SAMPLING_BYTES,
      });
    },
  });
  work();
  const { profile } = yield* Effect.tryPromise({
    catch: inspector("HeapProfiler.stopSampling"),
    try: async () => await session.post("HeapProfiler.stopSampling"),
  });
  session.disconnect();
  return sampledBytes(profile.head);
});

const leastSampled = Effect.fnUntraced(function* leastSampled(
  workOf: () => () => void
) {
  let least = Number.POSITIVE_INFINITY;
  for (let window = 0; window < SAMPLED_WINDOWS; window += 1) {
    least = Math.min(least, yield* sampled(workOf()));
  }
  return least;
});

const serverWork = (prepared: Prepared) => (): void => {
  for (let index = 0; index < WINDOW_TICKS; index += 1) {
    prepared.stepRoom();
  }
};

const recordedPackets = (prepared: Prepared): readonly DataView[] => {
  const packets: DataView[] = [];
  for (let index = 0; index < WINDOW_TICKS; index += 1) {
    const packet = prepared.stepRoom();
    packets.push(
      new DataView(
        packet.buffer.slice(
          packet.byteOffset,
          packet.byteOffset + packet.byteLength
        )
      )
    );
  }
  return packets;
};

const clientWork =
  (prepared: Prepared, packets: readonly DataView[]) => (): void => {
    const { client, confirm } = prepared;
    const from = client.confirmed.tick;
    for (let index = 0; index < packets.length; index += 1) {
      const packet = packets[index];
      const target = from + index + LEAD_TICKS;
      while (client.predicted.tick < target) {
        client.predict(controlAt(client.predicted.tick + 1, 0));
      }
      if (packet) {
        confirm(packet);
      }
    }
  };

const FRAME_MS = 16;
const frameTally = createRaceTally(true);

const frameWork = (): void => {
  const left = createTickFrame();
  const right = createTickFrame();
  const riders = firstRacers(benchStart("reference"), SEATS);
  for (let index = 0; index < WINDOW_TICKS * FRAME_REPEATS; index += 1) {
    clearFrame(left, index);
    clearFrame(right, index);
    for (let seat = 0; seat < riders.length; seat += 1) {
      const rider = riders[seat];
      if (rider !== undefined) {
        const control = controlAt(index, seat);
        left.controls.set(rider, control);
        right.controls.set(rider, control);
      }
    }
    sameFrame(left, right);
    frameTally.frameDrawn(index * FRAME_MS, 0, index);
  }
};

const allocationWindow = Effect.fnUntraced(function* allocationWindow(
  scenario: Scenario
) {
  const serverBytes = yield* leastSampled(() =>
    serverWork(prepareWarmed(scenario))
  );
  const packets = recordedPackets(prepareWarmed(scenario));
  const clientBytes = yield* leastSampled(() =>
    clientWork(prepareWarmed(scenario), packets)
  );
  const frameBytes = yield* sampled(frameWork);
  return {
    client: clientBytes / WINDOW_TICKS,
    frame: frameBytes / (WINDOW_TICKS * FRAME_REPEATS),
    server: serverBytes / WINDOW_TICKS,
  };
});

const usage = "Usage: node tools/perf/room.ts --scenario <id> --out <file>";

const readOptions = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) => new UsageError({ message: `${String(cause)}\n${usage}` }),
    try: () =>
      parseArgs({
        args: [...args],
        options: { out: { type: "string" }, scenario: { type: "string" } },
      }).values,
  });

export const roomChild = Effect.fn("node.room")(function* roomChild(
  args: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem;
  const values = yield* readOptions(args);
  const scenario = scenarios.find((each) => each.id === values.scenario);
  if (!scenario || values.out === undefined) {
    return yield* new UsageError({ message: usage });
  }
  const record = {
    room: {
      allocated: yield* allocationWindow(scenario),
      ...timedWindow(scenario),
    },
    runtime: runtimeOf(),
    scenario: scenario.id,
    scenarioHash: scenarioHash(scenario),
    task: "room",
  };
  return yield* fs.writeFileString(values.out, JSON.stringify(record));
});
