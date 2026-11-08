import { decodeRoomPreview } from "@racer/rooms/messages";
import type { RoomPreview } from "@racer/rooms/messages";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";

const ASK_EVERY_MS = 6000;
const REOPEN_SEAT_MS = 2000;
const TRIES_INSIDE_HOLD = 2;
const WAIT_SHARE = 1 / 3;

export const NO_HOLD = Number.POSITIVE_INFINITY;

export const readRoomPreview = (
  roomsUrl: string,
  roomId: string,
  holdMs: number,
  onPreview: (preview: RoomPreview) => void
): (() => void) => {
  const askEveryMs = Math.min(
    ASK_EVERY_MS,
    (holdMs - REOPEN_SEAT_MS) / TRIES_INSIDE_HOLD
  );
  const fiber = Effect.runFork(
    Effect.tryPromise(async (signal) => {
      const answer = await globalThis.fetch(`${roomsUrl}/rooms/${roomId}`, {
        signal,
      });
      return await answer.text();
    }).pipe(
      Effect.map(decodeRoomPreview),
      Effect.flatMap(Effect.fromOption),
      Effect.timeout(Duration.millis(askEveryMs * (1 - WAIT_SHARE))),
      Effect.retry({
        schedule: Schedule.spaced(Duration.millis(askEveryMs * WAIT_SHARE)),
      }),
      Effect.tap((preview) =>
        Effect.sync(() => {
          onPreview(preview);
        })
      )
    )
  );
  return () => {
    fiber.interruptUnsafe();
  };
};
