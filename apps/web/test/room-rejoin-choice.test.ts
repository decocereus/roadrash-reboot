import { afterEach, describe, expect, it, vi } from "vitest";

import { clearRejoinNo, rejoinOf } from "../src/components/room-url.ts";

const addressBar = (search: string) => {
  const location = { pathname: "/", search };
  vi.stubGlobal("location", location);
  vi.stubGlobal("history", {
    replaceState: (_state: null, _title: string, url: string) => {
      location.search = url.slice(url.indexOf("?"));
    },
    state: null,
  });
  return location;
};

describe("a rider who chose Back to the bar on Signal lost", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejoins with every seat after the room took them into the lobby, so a reopened or reloaded seat keeps the next race's bike", () => {
    const location = addressBar("?room=abcd1234&via=moved&rejoin=no");
    clearRejoinNo();
    expect(location.search).toBe("?room=abcd1234&via=moved");
    expect(rejoinOf(location.search)).toBeNull();
  });

  it("keeps any other choice in the address", () => {
    const location = addressBar("?room=abcd1234&via=moved&rejoin=try");
    clearRejoinNo();
    expect(location.search).toBe("?room=abcd1234&via=moved&rejoin=try");
  });
});
