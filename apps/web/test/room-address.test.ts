import { afterEach, describe, expect, it, vi } from "vitest";

import { searchFor, showAddress } from "../src/components/room-url.ts";

const addressBar = (search: string) => {
  const page = { hash: "", pathname: "/", search };
  const moves: string[] = [];
  vi.stubGlobal("location", {
    ...page,
    assign: () => {
      throw new Error("A room move never loads a page.");
    },
    get search() {
      return page.search;
    },
  });
  vi.stubGlobal("history", {
    pushState: () => {
      throw new Error("A room move adds no history entry.");
    },
    replaceState: (_state: null, _title: string, url: string) => {
      moves.push(url);
      const at = url.indexOf("?");
      page.search = at === -1 ? "" : url.slice(at);
    },
    state: null,
  });
  return { moves, page };
};

describe("the address of a room", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the room and how the rider came, in place", () => {
    const { moves, page } = addressBar("");
    showAddress({ arrival: "made", roomId: "abcd1234" });
    expect(page.search).toBe("?room=abcd1234&via=made");
    expect(moves).toStrictEqual(["/?room=abcd1234&via=made"]);
  });

  it("keeps the arrival through the race and its results", () => {
    expect(
      searchFor("?room=abcd1234&via=queue", {
        arrival: null,
        roomId: "abcd1234",
      })
    ).toBe("?room=abcd1234&via=queue");
  });

  it("takes the room out when the rider goes home, and keeps every other flag", () => {
    const { page } = addressBar("?stress&room=abcd1234&via=link");
    showAddress(null);
    expect(page.search).toBe("?stress=");
  });

  it("writes nothing when the address already says it", () => {
    const { moves } = addressBar("?room=abcd1234&via=link");
    showAddress({ arrival: "link", roomId: "abcd1234" });
    showAddress({ arrival: null, roomId: "abcd1234" });
    expect(moves).toStrictEqual([]);
  });

  it("leaves an address with no room in it alone", () => {
    const { moves } = addressBar("?debug");
    showAddress(null);
    expect(moves).toStrictEqual([]);
  });
});
