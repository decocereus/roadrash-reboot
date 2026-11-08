import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { toEffect } from "alchemy/Test/Core";
import * as Cause from "effect/Cause";
import { ConfigError } from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { describe, expect, it } from "vitest";

import { QueueServer } from "../src/queue-server.ts";
import { RaceServer } from "../src/race-server.ts";
import Rooms from "../src/worker.ts";

const deploy = {
  providers: Cloudflare.providers(),
  state: Alchemy.inMemoryState(),
};

const plannedWith = async (
  worker: Effect.Effect<Cloudflare.Worker, never, Cloudflare.Providers>,
  env: Readonly<Record<string, string>>
) =>
  await Effect.runPromiseExit(
    toEffect(
      Alchemy.Stack("RoomsBuild", deploy, worker).pipe(
        Effect.provideService(Alchemy.Stage, "prod"),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown(env)
        )
      ),
      deploy
    )
  );

const outcomeOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onFailure: (cause) => ({
      configError: Cause.squash(cause) instanceof ConfigError,
      kind: Cause.hasDies(cause) ? "dies" : "fails",
    }),
    onSuccess: () => ({ configError: false, kind: "plans" }),
  });

const hostOf = (
  durableObject: typeof QueueServer | typeof RaceServer
): Effect.Effect<Cloudflare.Worker, never, Cloudflare.Providers> =>
  Cloudflare.Worker(
    "Host",
    { main: import.meta.url },
    Effect.gen(function* host() {
      yield* durableObject;
      return { fetch: Effect.succeed(HttpServerResponse.empty()) };
    }).pipe(Effect.provide(Cloudflare.RateLimitBinding))
  );

describe("the build a rooms deploy runs as", () => {
  it("refuses to plan the Rooms Worker with no build, or with the local one", async () => {
    const refused = { configError: true, kind: "fails" };
    expect(outcomeOf(await plannedWith(Rooms, {}))).toStrictEqual(refused);
    expect(
      outcomeOf(await plannedWith(Rooms, { RUSHLINE_BUILD: "local" }))
    ).toStrictEqual(refused);
  });

  it("stops each Durable Object at init when its Worker has no build", async () => {
    const stopped = { configError: true, kind: "dies" };
    expect(outcomeOf(await plannedWith(hostOf(RaceServer), {}))).toStrictEqual(
      stopped
    );
    expect(outcomeOf(await plannedWith(hostOf(QueueServer), {}))).toStrictEqual(
      stopped
    );
  });
});
