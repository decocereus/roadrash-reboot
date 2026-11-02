import { afterEach, describe, expect, it, vi } from "vitest";

import { capWebSocketSends } from "../src/send-budget.ts";

const SEND_ATTEMPTS = 3;

class FakeSocket {
  static reached = 0;

  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  send(): void {
    FakeSocket.reached += this.url.length > 0 ? 1 : 0;
  }
}

describe("the send budget", () => {
  afterEach(() => {
    FakeSocket.reached = 0;
    vi.unstubAllGlobals();
  });

  it("refuses every send past the cap, on any socket", () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    const budget = capWebSocketSends(2);
    const sockets = [
      new globalThis.WebSocket("ws://rooms.test/one"),
      new globalThis.WebSocket("ws://rooms.test/two"),
    ];
    for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt += 1) {
      sockets[attempt % sockets.length]?.send("control");
    }
    expect(FakeSocket.reached).toBe(2);
    expect(budget.spent()).toBe(2);
    expect(budget.capped()).toBeTruthy();
  });

  it("is not capped while sends stay within it", () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    const budget = capWebSocketSends(1);
    new globalThis.WebSocket("ws://rooms.test/one").send("control");
    expect(budget.capped()).toBeFalsy();
  });
});
