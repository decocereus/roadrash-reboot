import type { RaceRules } from "@racer/career/rules";
import { RaceRulesSchema } from "@racer/career/rules-schema";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { RulesDecodeFailed } from "./rules-decode-failed.ts";
import { RulesRequestFailed } from "./rules-request-failed.ts";
import { RulesResponseRejected } from "./rules-response-rejected.ts";

export const RULES_PATH = "/api/race-rules";

export interface RulesTransport {
  readonly fetch: (
    url: string,
    signal: AbortSignal
  ) => ReturnType<typeof globalThis.fetch>;
}

type RulesFailure =
  | RulesRequestFailed
  | RulesResponseRejected
  | RulesDecodeFailed;

export type RulesLoad =
  | { readonly status: "ready"; readonly rules: RaceRules }
  | { readonly status: "failed"; readonly failure: RulesFailure };

const decodeRules = Schema.decodeUnknownEffect(
  Schema.fromJsonString(RaceRulesSchema)
);

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const fetchRules = Effect.fn("rules.load")(function* fetchRules(
  transport: RulesTransport
) {
  const answer = yield* Effect.tryPromise({
    catch: (cause) =>
      new RulesRequestFailed({ cause, message: messageOf(cause) }),
    try: async (signal) => {
      const response = await transport.fetch(RULES_PATH, signal);
      return {
        status: response.status,
        text: response.ok ? await response.text() : null,
      };
    },
  });
  if (answer.text === null) {
    return yield* new RulesResponseRejected({
      message: `The race rules answered ${answer.status}.`,
      status: answer.status,
    });
  }
  return yield* decodeRules(answer.text).pipe(
    Effect.mapError(
      (cause) =>
        new RulesDecodeFailed({
          cause,
          message: "The race rules did not decode.",
        })
    )
  );
});

export const loadRaceRules = (
  transport: RulesTransport,
  settle: (load: RulesLoad) => void
): (() => void) => {
  const fiber = Effect.runFork(
    fetchRules(transport).pipe(
      Effect.match({
        onFailure: (failure): RulesLoad => ({ failure, status: "failed" }),
        onSuccess: (rules): RulesLoad => ({ rules, status: "ready" }),
      }),
      Effect.flatMap((load) =>
        Effect.sync(() => {
          settle(load);
        })
      )
    )
  );
  return () => {
    fiber.interruptUnsafe();
  };
};
