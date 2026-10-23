import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

export class CleanupOutcomes extends Context.Service<
  CleanupOutcomes,
  Ref.Ref<readonly Cause.Cause<unknown>[]>
>()("@racer/devtools/CleanupOutcomes") {}

export const attempt = <A, E, R>(
  step: Effect.Effect<A, E, R>
): Effect.Effect<Option.Option<A>, never, R | CleanupOutcomes> =>
  Effect.exit(step).pipe(
    Effect.flatMap((exit) =>
      Exit.isSuccess(exit)
        ? Effect.succeed(Option.some(exit.value))
        : CleanupOutcomes.use((outcomes) =>
            Ref.update(outcomes, (failed) => [...failed, exit.cause])
          ).pipe(Effect.as(Option.none()))
    )
  );

export const released = <A, E, R>(
  step: Effect.Effect<A, E, R>
): Effect.Effect<void, never, R | CleanupOutcomes> =>
  Effect.asVoid(attempt(step));

export const cleanupFailed = CleanupOutcomes.use((outcomes) =>
  Ref.get(outcomes).pipe(Effect.map((failed) => failed.length > 0))
);

const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const failureLines = (cause: Cause.Cause<unknown>): string[] =>
  cause.reasons.flatMap((reason) => {
    if (Cause.isFailReason(reason)) {
      return [describe(reason.error)];
    }
    if (Cause.isDieReason(reason)) {
      return [describe(reason.defect)];
    }
    return [];
  });

export const runCommand = <E, R>(
  operation: Effect.Effect<void, E, R>,
  prefix: string
) =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* runToCompletion() {
      const outcomes = yield* Ref.make<readonly Cause.Cause<unknown>[]>([]);
      const exit = yield* restore(Effect.scoped(operation)).pipe(
        Effect.provideService(CleanupOutcomes, outcomes),
        Effect.exit
      );
      const cleanup = yield* Ref.get(outcomes);
      const lines = (
        Exit.isFailure(exit) ? [exit.cause, ...cleanup] : cleanup
      ).flatMap(failureLines);
      if (lines.length > 0) {
        yield* Effect.sync(() => {
          for (const line of lines) {
            process.stderr.write(`${prefix}${line}\n`);
          }
          process.exitCode = 1;
        });
      }
      if (Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)) {
        yield* Effect.interrupt;
      }
    })
  );
