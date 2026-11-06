import { roadIds } from "@racer/track/road";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { createHost } from "../src/host.ts";
import {
  launchRoomConfig,
  publicRuleFor,
  RoomConfigSchema,
} from "../src/room-config.ts";
import type { RoomConfig } from "../src/room-config.ts";
import {
  createClock,
  fakeSocket,
  lastLobby,
  nearby,
  readyAll,
  sameBuild,
  startedOf,
} from "./host-harness.ts";

const accepts = (config: RoomConfig): boolean =>
  Schema.is(RoomConfigSchema)(config);

describe("the room config", () => {
  it("holds the launch values inside every bound", () => {
    expect(accepts(launchRoomConfig)).toBeTruthy();
    expect(launchRoomConfig.publicRace.tier).toBe(2);
  });

  it("refuses a value outside its bounds, or a public race with no road", () => {
    expect(accepts({ ...launchRoomConfig, seatHoldSeconds: 600 })).toBeFalsy();
    expect(accepts({ ...launchRoomConfig, raceLimitSeconds: 30 })).toBeFalsy();
    expect(accepts({ ...launchRoomConfig, queueWaitSeconds: 2.5 })).toBeFalsy();
    const noRoads = {
      ...launchRoomConfig,
      publicRace: { ...launchRoomConfig.publicRace, roads: [] },
    };
    expect(Schema.is(RoomConfigSchema)(noRoads)).toBeFalsy();
  });

  it("lets the server pick any listed road for a public race, and only the road", () => {
    const { publicRace } = launchRoomConfig;
    const rules = Array.from({ length: publicRace.roads.length }, (_, seed) =>
      publicRuleFor(publicRace, seed)
    );
    expect(new Set(rules.map(({ roadId }) => roadId))).toStrictEqual(
      new Set(roadIds)
    );
    expect(
      new Set(rules.map(({ roadId: _road, ...rest }) => JSON.stringify(rest)))
        .size
    ).toBe(1);
  });
});

describe("a room run on an edited config", () => {
  it("starts its lobby on the config's clock and freezes the race's values into the manifest", () => {
    const edited: RoomConfig = {
      ...launchRoomConfig,
      customStartSeconds: 15,
      loadDeadlineSeconds: 8,
      raceLimitSeconds: 200,
      seatHoldSeconds: 12,
    };
    const host = createHost({ ...createClock(), config: edited });
    const [ann, bo] = [fakeSocket(), fakeSocket()];
    host.seat(ann, "Ann", nearby, sameBuild("ann"));
    host.seat(bo, "Bo", nearby, sameBuild("bo"));
    readyAll(host, [ann]);
    expect(lastLobby(bo).startsInMs).toBe(15_000);
    expect(lastLobby(bo).seatHoldSeconds).toBe(12);
    readyAll(host, [bo]);
    const { manifest } = startedOf(bo);
    expect({
      hold: manifest.reconnect.holdSeconds,
      limit: manifest.raceLimitSeconds,
      load: manifest.loadingDeadlineMs,
    }).toStrictEqual({ hold: 12, limit: 200, load: 8000 });
  });
});
