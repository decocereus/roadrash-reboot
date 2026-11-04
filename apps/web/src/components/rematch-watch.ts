import { decodeRoomPresence } from "@racer/rooms/messages";
import type { RoomPresence } from "@racer/rooms/messages";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

const READ_EVERY_MS = 3000;
const MOST_READS = 200;

const readPresence = (url: string) =>
  Effect.tryPromise(async (signal) => {
    const answer = await globalThis.fetch(url, { signal });
    return await answer.text();
  }).pipe(
    Effect.match({
      onFailure: () => Option.none<RoomPresence>(),
      onSuccess: decodeRoomPresence,
    })
  );

const watching = (url: string, onPresence: (presence: RoomPresence) => void) =>
  Effect.gen(function* reading() {
    for (let read = 0; read < MOST_READS; read += 1) {
      const presence = yield* readPresence(url);
      if (Option.isSome(presence)) {
        onPresence(presence.value);
      }
      yield* Effect.sleep(READ_EVERY_MS);
    }
  });

export const watchRematch = (
  roomsUrl: string,
  roomId: string,
  onPresence: (presence: RoomPresence) => void
): (() => void) => {
  const fiber = Effect.runFork(
    watching(`${roomsUrl}/rooms/${roomId}`, onPresence)
  );
  return () => {
    fiber.interruptUnsafe();
  };
};
