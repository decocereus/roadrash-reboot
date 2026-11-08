import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEAD_AFTER_MS, PING_EVERY_MS } from "../src/heartbeat.ts";
import { encodeQueueMessage } from "../src/queue-messages.ts";
import { enterQueue, queueUrl } from "../src/queue-client.ts";
import { FakeSocket } from "./seat-socket.ts";

const ticket = () => {
  const onLost = vi.fn<() => void>();
  enterQueue("http://rooms.test", "test-build", "member-a", {
    onLost,
    onMessage: vi.fn<() => void>(),
  });
  const socket = FakeSocket.opened.at(-1);
  if (socket === undefined) {
    throw new Error("enterQueue opened no socket.");
  }
  socket.open();
  return { onLost, socket };
};

describe("a queue ticket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.opened = [];
    vi.stubGlobal("WebSocket", FakeSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("names its member in the queue's address", () => {
    expect(
      new URL(queueUrl("http://rooms.test", "b", "member-a")).searchParams.get(
        "key"
      )
    ).toBe("member-a");
  });

  it("is lost once the queue stops answering its pings", () => {
    const { onLost, socket } = ticket();
    socket.answers = false;
    vi.advanceTimersByTime(DEAD_AFTER_MS);
    expect(onLost).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2 * PING_EVERY_MS);
    expect(onLost).toHaveBeenCalledOnce();
    expect(socket.closedWith).not.toBeNull();
  });

  it("keeps waiting while the queue answers", () => {
    const { onLost } = ticket();
    vi.advanceTimersByTime(4 * DEAD_AFTER_MS);
    expect(onLost).not.toHaveBeenCalled();
  });

  it("does not come back when the queue moved its spot to another tab", () => {
    const { onLost, socket } = ticket();
    socket.hear(encodeQueueMessage({ kind: "refused", reason: "replaced" }));
    socket.closedByBrowser();
    vi.advanceTimersByTime(4 * DEAD_AFTER_MS);
    expect(onLost).not.toHaveBeenCalled();
  });
});
