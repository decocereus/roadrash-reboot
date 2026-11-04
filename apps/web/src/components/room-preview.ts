import { decodeRoomPreview } from "@racer/rooms/messages";
import type { RoomPreview } from "@racer/rooms/messages";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

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
      Effect.match({
        onFailure: () => Option.none<RoomPreview>(),
        onSuccess: decodeRoomPreview,
      }),
      Effect.tap((preview) =>
        Effect.sync(() => {
          if (Option.isSome(preview)) {
            onPreview(preview.value);
          }
        })
      )
    )
  );
  return () => {
    fiber.interruptUnsafe();
  };
};
