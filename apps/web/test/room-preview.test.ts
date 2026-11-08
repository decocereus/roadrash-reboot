import { once } from "node:events";

import type { RoomPreview } from "@racer/rooms/messages";
import {
  launchRoomConfig,
  msOf,
  publicRuleFor,
} from "@racer/rooms/room-config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readRoomPreview } from "../src/components/room-preview.ts";

const preview: RoomPreview = {
  names: ["Ann"],
  phase: "racing",
  rule: publicRuleFor(launchRoomConfig.publicRace, 0),
};

describe(readRoomPreview, () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    ["the shortest hold a room allows", 5],
    ["the launch hold", launchRoomConfig.seatHoldSeconds],
  ])(
    "asks the room again when a request hangs, and hears it inside half of %s",
    async (_hold, holdSeconds) => {
      vi.useFakeTimers();
      const signals: AbortSignal[] = [];
      vi.stubGlobal(
        "fetch",
        async (_url: string, init?: RequestInit): Promise<Response> => {
          const signal = init?.signal ?? new AbortController().signal;
          signals.push(signal);
          if (signals.length === 1) {
            await once(signal, "abort");
            throw new Error("The request was cut off.");
          }
          return Response.json(preview);
        }
      );
      const heard = vi.fn<(heardPreview: RoomPreview) => void>();
      const stop = readRoomPreview(
        "https://rooms.test",
        "abc",
        msOf(holdSeconds),
        heard
      );
      await vi.advanceTimersByTimeAsync(msOf(holdSeconds) / 2);
      stop();
      expect(heard).toHaveBeenCalledExactlyOnceWith(preview);
      expect(signals.map((signal) => signal.aborted)).toStrictEqual([
        true,
        false,
      ]);
    }
  );
});
