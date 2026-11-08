import { defaultSetup } from "@racer/sim/race";
import { ROOM_LIMIT_TICKS, track } from "@racer/sim/race-fixtures";
import { roomSetup } from "@racer/sim/room";
import { createRoomClient } from "@racer/sim/room-client";
import { PLAYER_RIDER } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { createRaceTally } from "../src/race-tally.ts";
import {
  MOST_TRACE_ROWS,
  TRACE_ROW_FIELDS,
  TRACE_ROW_MS,
  TraceField,
} from "../src/tape.ts";

const setup = roomSetup(defaultSetup(track, 3), [PLAYER_RIDER]);
const client = createRoomClient(setup, PLAYER_RIDER, ROOM_LIMIT_TICKS);

describe("a rider's race tally", () => {
  it("counts the time the race ran slowed or stopped, and the frames a bike was drawn off its riding", () => {
    const tally = createRaceTally(true);
    tally.frameDrawn(1000, 0, 0, 1, 0, 0);
    tally.frameDrawn(1016, 0, 0, 0.9, 0, 0.2);
    tally.frameDrawn(1036, 0, 0, 0.2, 0.4, 0);
    tally.frameDrawn(1052, 0, 0, 1, 0.3, 0.03);
    tally.frameDrawn(1068, 0, 0, 1.1, 0.01, 0.1);
    expect(tally.read(client, 0)).toMatchObject({
      rivalsSurgedFrames: 2,
      slowedMs: 36,
      stoppedMs: 20,
      surgedFrames: 2,
      worstDrawnOffCm: 40,
    });
  });

  it("keeps the slowest frame and where on the road it happened", () => {
    const tally = createRaceTally(true);
    tally.frameDrawn(1000, 10, 0, 1, 0, 0);
    tally.frameDrawn(1080, 500, 0, 1, 0, 0);
    tally.frameDrawn(1096, 501, 0, 1, 0, 0);
    expect(tally.read(client, 0)).toMatchObject({
      slowFrames: 1,
      worstFrameMs: 80,
      worstFrameRoadMetres: 500,
    });
  });

  it("averages the round trips it heard and passes on the worst", () => {
    const tally = createRaceTally(true);
    tally.heardRtt(90);
    tally.heardRtt(110);
    expect(tally.read(client, 204)).toMatchObject({
      rttMeanMs: 100,
      rttWorstMs: 204,
    });
  });

  it("reports the rider's crashes and those a correction brought", () => {
    const crashed = createRoomClient(setup, PLAYER_RIDER, ROOM_LIMIT_TICKS);
    crashed.stats.crashesAfterCorrection = 1;
    crashed.mine.crashes = 3;
    expect(createRaceTally(true).read(crashed, 0)).toMatchObject({
      crashes: 3,
      crashesAfterCorrection: 1,
    });
  });

  it("counts frames and reads percentiles from every frame interval", () => {
    const tally = createRaceTally(true);
    let now = 1000;
    tally.frameDrawn(now, 0, 0, 1, 0, 0);
    for (let frame = 0; frame < 100; frame += 1) {
      now += frame < 90 ? 16 : 40;
      tally.frameDrawn(now, 0, 0, 1, 0, 0);
    }
    expect(tally.read(client, 0)).toMatchObject({
      frameCount: 100,
      frameP50Ms: 16,
      frameP95Ms: 40,
      frameP99Ms: 40,
    });
  });

  it("writes a row every quarter second with that moment's worst numbers", () => {
    const tally = createRaceTally(true);
    tally.frameDrawn(1000, 0, 10, 1, 0, 0);
    tally.heardTick(1010);
    tally.heardTick(1130);
    tally.heardRtt(90);
    tally.frameDrawn(1100, 0, 12, 0.5, 1, 0);
    tally.frameDrawn(1300, 0, 20, 1, 0, 0);
    const expected = Array.from({ length: TRACE_ROW_FIELDS }, () => 0);
    expected[TraceField.atMs] = 300;
    expected[TraceField.tick] = 20;
    expected[TraceField.frames] = 2;
    expected[TraceField.worstFrameMs] = 200;
    expected[TraceField.ticksHeard] = 2;
    expected[TraceField.worstTickGapMs] = 120;
    expected[TraceField.worstRttMs] = 90;
    expected[TraceField.slowedMs] = 100;
    expected[TraceField.surgedFrames] = 1;
    expect(tally.lastTraceRows()).toStrictEqual(expected);
  });

  it("hands over each row once, and only finished rows while riding", () => {
    const tally = createRaceTally(true);
    tally.frameDrawn(1000, 0, 0, 1, 0, 0);
    tally.frameDrawn(1000 + TRACE_ROW_MS, 0, 1, 1, 0, 0);
    tally.frameDrawn(1000 + TRACE_ROW_MS + 10, 0, 2, 1, 0, 0);
    expect(tally.closedTraceRows()).toHaveLength(TRACE_ROW_FIELDS);
    expect(tally.closedTraceRows()).toHaveLength(0);
    expect(tally.lastTraceRows()).toHaveLength(TRACE_ROW_FIELDS);
  });

  it("stops at the row limit instead of growing", () => {
    const tally = createRaceTally(true);
    for (let row = 0; row <= MOST_TRACE_ROWS + 1; row += 1) {
      tally.frameDrawn(1000 + row * TRACE_ROW_MS, 0, row, 1, 0, 0);
    }
    expect(tally.lastTraceRows()).toHaveLength(
      MOST_TRACE_ROWS * TRACE_ROW_FIELDS
    );
  });

  it("keeps the last unfinished row, so a stall just before the end still shows", () => {
    const tally = createRaceTally(true);
    tally.frameDrawn(1000, 0, 0, 1, 0, 0);
    tally.frameDrawn(1120, 0, 7, 1, 0, 0);
    const rows = tally.lastTraceRows();
    expect(rows).toHaveLength(TRACE_ROW_FIELDS);
    expect(rows?.[TraceField.worstFrameMs]).toBe(120);
    expect(rows?.[TraceField.tick]).toBe(7);
  });
});
