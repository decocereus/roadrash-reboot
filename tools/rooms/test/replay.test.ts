import { seatedRace } from "@racer/career/room-race";
import { createRace } from "@racer/sim/race";
import { hexOfWords } from "@racer/sim/room-tape";
import { setupDigest } from "@racer/sim/snapshot-setup";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import { describe, expect, it } from "vitest";

import { main } from "../src/replay.ts";

const SEED = 7;
const SEATS = 2;

const endingAt = async (tick: number) => {
  const { setup } = seatedRace(SEED, SEATS);
  const end = JSON.stringify({ parts: 0, tick });
  const header = JSON.stringify({
    build: "test",
    digest: hexOfWords(setupDigest(createRace(setup), setup.track)),
    raceId: "race-a",
    road: "slag-row",
    seats: SEATS,
    seed: SEED,
    version: 1,
  });
  return await main(["--dir", "tape"]).pipe(
    Effect.provide(
      FileSystem.layerNoop({
        readFileString: (path) =>
          Effect.succeed(path === "tape/end.json" ? end : header),
      })
    ),
    Effect.exit,
    Effect.runPromise
  );
};

describe("replaying a tape", () => {
  it("fails when the tape stops before the race ended", async () => {
    expect(Exit.isFailure(await endingAt(120))).toBeTruthy();
  });

  it("succeeds when the tape reaches the race's last tick", async () => {
    expect(Exit.isSuccess(await endingAt(0))).toBeTruthy();
  });
});
