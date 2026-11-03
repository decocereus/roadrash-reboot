import { defaultSetup } from "@racer/sim/race";
import { track } from "@racer/sim/race-fixtures";
import { roomSetup } from "@racer/sim/room";
import { createRoomClient } from "@racer/sim/room-client";
import { PLAYER_RIDER } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { createRaceTally } from "../src/race-tally.ts";

const client = createRoomClient(
  roomSetup(defaultSetup(track, 3), [PLAYER_RIDER]),
  PLAYER_RIDER
);

describe("a rider's race tally", () => {
  it("counts the frames the clock held the bike or moved it more than once", () => {
    const tally = createRaceTally();
    tally.stepped(1000, 1, 10);
    tally.stepped(1016, 0, 10);
    tally.stepped(1032, 4, 12);
    tally.stepped(1048, 2, 13);
    expect(tally.read(client, 0)).toMatchObject({
      doubledSteps: 2,
      heldSteps: 1,
      mostSteps: 4,
    });
  });

  it("keeps the slowest frame and where on the road it happened", () => {
    const tally = createRaceTally();
    tally.stepped(1000, 1, 10);
    tally.stepped(1080, 1, 500);
    tally.stepped(1096, 1, 501);
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
});
