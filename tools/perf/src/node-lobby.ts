import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";

import { UsageError } from "@racer/devtools/usage-error";
import {
  createLobbyRider,
  sendRiderTo,
  stepAsideAtSpawn,
  stepLobbyRider,
} from "@racer/sim/lobby";
import type { LobbyRider } from "@racer/sim/lobby";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { LOBBY_BENCH } from "./lobby-bench.ts";
import { runtimeOf } from "./node.ts";
import { digestOf } from "./result.ts";
import { WINDOW_TICKS } from "./scenarios.ts";

const NO_CONTROL = { forward: 0, right: 0, sprint: false };
const MOVING_SPEED = 0.1;

const stopAt = (turn: number) =>
  LOBBY_BENCH.stops[turn % LOBBY_BENCH.stops.length] ?? LOBBY_BENCH.stops[0];

const riderAt = (slot: number): LobbyRider => {
  const rider = createLobbyRider();
  stepAsideAtSpawn(rider, slot);
  const stop = stopAt(slot);
  sendRiderTo(rider, stop.x, stop.z);
  return rider;
};

const measuredWindow = () => {
  const placed = Array.from({ length: LOBBY_BENCH.riders }, (_, turn) => ({
    rider: riderAt(turn),
    turn,
  }));
  const riders = placed.map(({ rider }) => rider);
  const seats = placed.map((seat) => ({
    ...seat,
    others: riders.filter((other) => other !== seat.rider),
  }));
  const durations = new Float64Array(WINDOW_TICKS);
  let routed = 0;
  let fewestMoving = Number.POSITIVE_INFINITY;
  for (let index = 0; index < WINDOW_TICKS; index += 1) {
    const stop = stopAt(index);
    const turn = index % LOBBY_BENCH.riders;
    const started = performance.now();
    for (const seat of seats) {
      if (seat.turn === turn) {
        sendRiderTo(seat.rider, stop.x, stop.z);
        routed += seat.rider.target === null ? 0 : 1;
      }
      stepLobbyRider(seat.rider, NO_CONTROL, 0, seat.others);
    }
    durations[index] = performance.now() - started;
    let moving = 0;
    for (const rider of riders) {
      if (rider.pace > MOVING_SPEED) {
        moving += 1;
      }
    }
    fewestMoving = Math.min(fewestMoving, moving);
  }
  return {
    durations: [...durations],
    lobby: { fewestMoving, routed },
  };
};

const usage = "Usage: node tools/perf/lobby.ts --scenario <id> --out <file>";

const readOptions = (args: readonly string[]) =>
  Effect.try({
    catch: (cause) => new UsageError({ message: `${String(cause)}\n${usage}` }),
    try: () =>
      parseArgs({
        args: [...args],
        options: { out: { type: "string" }, scenario: { type: "string" } },
      }).values,
  });

export const lobbyChild = Effect.fn("node.lobby")(function* lobbyChild(
  args: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem;
  const values = yield* readOptions(args);
  if (values.scenario !== LOBBY_BENCH.id || values.out === undefined) {
    return yield* new UsageError({ message: usage });
  }
  measuredWindow();
  const record = {
    ...measuredWindow(),
    runtime: runtimeOf(),
    scenario: LOBBY_BENCH.id,
    scenarioHash: digestOf(LOBBY_BENCH),
    task: "lobby",
  };
  return yield* fs.writeFileString(values.out, JSON.stringify(record));
});
