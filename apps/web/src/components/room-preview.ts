import { decodeRoomPreview } from "@racer/rooms/messages";
import type { RoomPreview } from "@racer/rooms/messages";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";

const RETRY_EVERY = "2 seconds";

export const readRoomPreview = (
  roomsUrl: string,
  roomId: string,
  onPreview: (preview: RoomPreview) => void
): (() => void) => {
  const fiber = Effect.runFork(
    Effect.tryPromise(async (signal) => {
      const answer = await globalThis.fetch(`${roomsUrl}/rooms/${roomId}`, {
        signal,
      });
      return await answer.text();
    }).pipe(
      Effect.map(decodeRoomPreview),
      Effect.flatMap(Effect.fromOption),
      Effect.retry({ schedule: Schedule.spaced(RETRY_EVERY) }),
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
