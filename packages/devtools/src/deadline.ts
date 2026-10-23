import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

export const byDeadline =
  <L>(deadline: number, late: () => L) =>
  <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E | L, R> =>
    Clock.currentTimeMillis.pipe(
      Effect.flatMap((now) =>
        Effect.timeoutOrElse(self, {
          duration: deadline - now,
          orElse: () => Effect.fail(late()),
        })
      )
    );
