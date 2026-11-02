import type { RoomPresence } from "@racer/rooms/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { watchRematch } from "./rematch-watch.ts";

const READ_EVERY_MS = 3000;
const LONGEST_WATCH_MS = 600_000;

const answering = (body: string) =>
  vi.fn<() => Promise<Response>>(
    async () => await Promise.resolve(new Response(body))
  );

const ignore = (): void => undefined;

describe("watching a rematch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("hears who is in the room", async () => {
    vi.stubGlobal(
      "fetch",
      answering(JSON.stringify({ names: ["mu"], phase: "waiting", tick: 0 }))
    );
    const heard = vi.fn<(presence: RoomPresence) => void>();
    const stop = watchRematch("http://rooms.test", "friday-ride-m1", heard);
    await vi.advanceTimersByTimeAsync(1);
    stop();
    expect(heard).toHaveBeenCalledWith({ names: ["mu"], phase: "waiting" });
  });

  it("keeps reading after a failed read", async () => {
    const reads = vi.fn<() => Promise<Response>>(
      async () => await Promise.reject(new Error("offline"))
    );
    vi.stubGlobal("fetch", reads);
    const stop = watchRematch("http://rooms.test", "friday-ride-m1", ignore);
    await vi.advanceTimersByTimeAsync(READ_EVERY_MS + 1);
    stop();
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it("stops reading a room after ten minutes", async () => {
    const reads = answering("{}");
    vi.stubGlobal("fetch", reads);
    watchRematch("http://rooms.test", "friday-ride-m1", ignore);
    await vi.advanceTimersByTimeAsync(LONGEST_WATCH_MS + 1);
    const made = reads.mock.calls.length;
    await vi.advanceTimersByTimeAsync(READ_EVERY_MS * 4);
    expect(reads).toHaveBeenCalledTimes(made);
  });

  it("stops reading a room once the results close", async () => {
    const reads = answering("{}");
    vi.stubGlobal("fetch", reads);
    const stop = watchRematch("http://rooms.test", "friday-ride-m1", ignore);
    await vi.advanceTimersByTimeAsync(1);
    stop();
    await vi.advanceTimersByTimeAsync(READ_EVERY_MS * 4);
    expect(reads).toHaveBeenCalledOnce();
  });
});
