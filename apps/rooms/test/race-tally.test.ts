import { defaultSetup } from "@racer/sim/race";
import { track } from "@racer/sim/race-fixtures";
import { roomSetup } from "@racer/sim/room";
import { createRoomClient } from "@racer/sim/room-client";
import { PLAYER_RIDER } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { createRaceTally } from "../src/race-tally.ts";

const setup = roomSetup(defaultSetup(track, 3), [PLAYER_RIDER]);
const client = createRoomClient(setup, PLAYER_RIDER);

describe("a rider's race tally", () => {
  it("counts the frames the clock held the bike or moved it more than once", () => {
    const tally = createRaceTally();
    tally.stepped(1);
    tally.stepped(0);
    tally.stepped(4);
    tally.stepped(2);
    expect(tally.read(client, 0)).toMatchObject({
      doubledSteps: 2,
      heldSteps: 1,
      mostSteps: 4,
    });
  });

  it("keeps the slowest frame and where on the road it happened", () => {
    const tally = createRaceTally();
    tally.frameDrawn(1000, 10);
    tally.frameDrawn(1080, 500);
    tally.frameDrawn(1096, 501);
    expect(tally.read(client, 0)).toMatchObject({
      slowFrames: 1,
      worstFrameMs: 80,
      worstFrameRoadMetres: 500,
    });
  });

  it("averages the round trips it heard and passes on the worst", () => {
    const tally = createRaceTally();
    tally.heardRtt(90);
    tally.heardRtt(110);
    expect(tally.read(client, 204)).toMatchObject({
      rttMeanMs: 100,
      rttWorstMs: 204,
    });
  });

  it("reports the rider's crashes and those a correction brought", () => {
    const crashed = createRoomClient(setup, PLAYER_RIDER);
    crashed.stats.crashesAfterCorrection = 1;
    crashed.mine.crashes = 3;
    expect(createRaceTally().read(crashed, 0)).toMatchObject({
      crashes: 3,
      crashesAfterCorrection: 1,
    });
  });
});
