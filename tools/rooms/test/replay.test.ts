import { seatedRace } from "@racer/career/room-race";
import { launchRoomConfig, publicRuleFor } from "@racer/rooms/room-config";
import { TAPE_VERSION } from "@racer/rooms/tape";
import { createRace } from "@racer/sim/race";
import { createRoom } from "@racer/sim/room";
import { hexOfWords } from "@racer/sim/room-tape";
import { setupDigest } from "@racer/sim/snapshot-setup";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import { describe, expect, it } from "vitest";

import { main } from "../src/replay.ts";

const SEED = 7;
const SEATS = 2;
const RULE = publicRuleFor(launchRoomConfig.publicRace, 0);

const { setup } = seatedRace(SEED, SEATS, RULE);
const startHash = hexOfWords(createRoom(setup, 0).hashNow());

const endingAt = async (tick: number, hash = startHash) => {
  const end = JSON.stringify({ hash, parts: 0, tick });
  const header = JSON.stringify({
    build: "test",
    digest: hexOfWords(setupDigest(createRace(setup), setup.track)),
    raceId: "race-a",
    road: "slag-row",
    rule: RULE,
    seats: SEATS,
    seed: SEED,
    version: TAPE_VERSION,
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

  it("fails when the race ended on a state the tape does not reach", async () => {
    expect(
      Exit.isFailure(await endingAt(0, "0".repeat(startHash.length)))
    ).toBeTruthy();
  });

  it("succeeds when the tape reaches the race's last tick and state", async () => {
    expect(Exit.isSuccess(await endingAt(0))).toBeTruthy();
  });
});
