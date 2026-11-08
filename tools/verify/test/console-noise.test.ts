import { describe, expect, it } from "vitest";

import { isError } from "../src/evidence.ts";

const networkError = (text: string) => ({
  kind: "log",
  level: "error",
  text: `network error: ${text}`,
});

describe("rv console errors and doctor", () => {
  it("ignores the browser blocking the game's event beacons", () => {
    expect(
      isError(
        networkError(
          "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT (http://127.0.0.1:1410/api/events)"
        )
      )
    ).toBeFalsy();
  });

  it("ignores the missing favicon", () => {
    expect(
      isError(
        networkError(
          "Failed to load resource: the server responded with a status of 404 (http://127.0.0.1:1410/favicon.ico)"
        )
      )
    ).toBeFalsy();
  });

  it("still counts any other blocked request", () => {
    expect(
      isError(
        networkError(
          "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT (http://127.0.0.1:1410/art/badge.webp)"
        )
      )
    ).toBeTruthy();
  });

  it("still counts a failed event beacon the browser did not block", () => {
    expect(
      isError(
        networkError(
          "Failed to load resource: the server responded with a status of 503 (http://127.0.0.1:1410/api/events)"
        )
      )
    ).toBeTruthy();
  });
});
