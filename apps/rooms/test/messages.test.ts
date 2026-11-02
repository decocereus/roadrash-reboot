import { describe, expect, it } from "vitest";

import {
  isRequeuedRoom,
  nextRoomId,
  RACE_ID_PATTERN,
} from "../src/messages.ts";

describe("the room after a dead one", () => {
  it("is the same for every seat, and counts up", () => {
    expect(nextRoomId("friday-ride")).toBe("friday-ride-r1");
    expect(nextRoomId("friday-ride-r1")).toBe("friday-ride-r2");
    expect(nextRoomId("friday-ride-r9")).toBe("friday-ride-r10");
  });

  it("stays a valid race id from the longest id there is", () => {
    const longest = "a".repeat(40);
    expect(RACE_ID_PATTERN.test(nextRoomId(longest))).toBeTruthy();
    expect(RACE_ID_PATTERN.test(nextRoomId(nextRoomId(longest)))).toBeTruthy();
  });

  it("is known by its name", () => {
    expect(isRequeuedRoom("friday-ride")).toBeFalsy();
    expect(isRequeuedRoom(nextRoomId("friday-ride"))).toBeTruthy();
  });
});
