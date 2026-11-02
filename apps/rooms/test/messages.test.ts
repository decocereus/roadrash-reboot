import { describe, expect, it } from "vitest";

import {
  cleanGuestName,
  isRequeuedRoom,
  nextRoomId,
  RACE_ID_PATTERN,
  rematchRoomId,
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

describe("a rematch room", () => {
  it("is the same for every seat, counts up, and waits like a first lobby", () => {
    expect(rematchRoomId("friday-ride")).toBe("friday-ride-m1");
    expect(rematchRoomId("friday-ride-m1")).toBe("friday-ride-m2");
    expect(rematchRoomId("friday-ride-m1-r2")).toBe("friday-ride-m2");
    expect(isRequeuedRoom(rematchRoomId("friday-ride-r2"))).toBeFalsy();
  });

  it("stays a valid race id from the longest id there is", () => {
    const longest = "a".repeat(40);
    expect(RACE_ID_PATTERN.test(rematchRoomId(longest))).toBeTruthy();
    expect(
      RACE_ID_PATTERN.test(nextRoomId(rematchRoomId(longest)))
    ).toBeTruthy();
  });
});

describe("a guest's name", () => {
  it("keeps letters from any language, digits and plain marks", () => {
    expect(cleanGuestName("  Amartya_07 ")).toBe("Amartya_07");
    expect(cleanGuestName("अमर्त्य")).toBe("अमर्त्य");
  });

  it("drops anything else and holds to 12 characters", () => {
    expect(cleanGuestName("<b>Ann</b>")).toBe("bAnnb");
    expect(cleanGuestName("a".repeat(30))).toBe("a".repeat(12));
  });

  it("still names a rider when nothing is left", () => {
    expect(cleanGuestName("<>")).toBe("Rider");
    expect(cleanGuestName("")).toBe("Rider");
  });
});
