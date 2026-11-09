import { roomsBuild } from "@racer/rooms/build-id";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import { reifyBoundConfigProvider } from "alchemy/Runtime";
import { toEffect } from "alchemy/Test/Core";
import * as Cause from "effect/Cause";
import { ConfigError } from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { rushline } from "../alchemy.run.ts";

const deploy = {
  providers: Cloudflare.providers(),
  state: Alchemy.inMemoryState(),
};

const Bound = Schema.Union([
  Schema.String,
  Schema.declare((input): input is Output.Output<unknown> =>
    Output.isOutput(input)
  ),
]);

const Planned = Schema.Struct({
  Rooms: Schema.Struct({
    Props: Schema.Struct({
      env: Schema.Struct({
        ALCHEMY_DEV: Schema.optional(Bound),
        RUSHLINE_BUILD: Bound,
        RUSHLINE_SIM: Bound,
      }),
    }),
  }),
  Web: Schema.Struct({
    Props: Schema.Struct({
      env: Schema.Struct({ VITE_ROOMS_BUILD: Schema.optional(Schema.String) }),
    }),
  }),
});
const decodePlanned = Schema.decodeUnknownSync(Planned);
const decodeStored = Schema.decodeUnknownSync(Schema.String);
const decodeRedactedText = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({ _tag: Schema.Literal("Redacted"), value: Schema.String })
  )
);

const plainText = (text: string): string =>
  Option.match(decodeRedactedText(text), {
    onNone: () => text,
    onSome: (redacted) => redacted.value,
  });

const stored = (binding: typeof Bound.Type) =>
  Output.evaluate(binding, {}).pipe(
    Effect.map((value) =>
      plainText(
        decodeStored(Redacted.isRedacted(value) ? Redacted.value(value) : value)
      )
    )
  );

const builds = Effect.gen(function* builds() {
  const stack = yield* Alchemy.Stack("RoomsBuild", deploy, rushline);
  const { Rooms, Web } = decodePlanned(stack.resources);
  const roomsEnv = {
    ALCHEMY_DEV:
      Rooms.Props.env.ALCHEMY_DEV === undefined
        ? undefined
        : yield* stored(Rooms.Props.env.ALCHEMY_DEV),
    RUSHLINE_BUILD: yield* stored(Rooms.Props.env.RUSHLINE_BUILD),
  };
  const rooms = yield* roomsBuild.pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      reifyBoundConfigProvider(ConfigProvider.fromUnknown(roomsEnv), roomsEnv)
    )
  );
  return {
    game: Web.Props.env.VITE_ROOMS_BUILD,
    rooms,
    sim: yield* stored(Rooms.Props.env.RUSHLINE_SIM),
  };
});

const built = (
  exit: Exit.Exit<
    typeof builds extends Effect.Effect<infer A, infer _E, infer _R>
      ? A
      : never,
    unknown
  >
) => (Exit.isSuccess(exit) ? exit.value : null);

const deployedWith = async (env: Readonly<Record<string, string>>) =>
  await Effect.runPromiseExit(
    toEffect(
      builds.pipe(
        Effect.provideService(Alchemy.Stage, "prod"),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown(env)
        )
      ),
      deploy
    )
  );

describe("the build the game and the rooms deploy with", () => {
  it("hands the game and the rooms one build, read once from the stack's config", async () => {
    const deployed = await deployedWith({ RUSHLINE_BUILD: "3022e4c8" });
    expect(built(deployed)).toMatchObject({
      game: "3022e4c8",
      rooms: "3022e4c8",
    });
    expect(built(deployed)?.sim).toMatch(/^[\da-f]{32}$/u);
    expect(built(await deployedWith({ ALCHEMY_DEV: "true" }))).toMatchObject({
      game: "local",
      rooms: "local",
    });
    expect(
      built(
        await deployedWith({ ALCHEMY_DEV: "true", RUSHLINE_BUILD: "label" })
      )
    ).toMatchObject({ game: "label", rooms: "label" });
  });

  it("fingerprints the simulation the rooms step with, the same on every plan", async () => {
    const first = built(await deployedWith({ RUSHLINE_BUILD: "3022e4c8" }));
    const second = built(await deployedWith({ ALCHEMY_DEV: "true" }));
    expect(first?.sim).toBe(second?.sim);
  });

  it("deploys nothing when the stack's config names no build", async () => {
    const exit = await deployedWith({});
    expect(
      Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof ConfigError
    ).toBeTruthy();
  });
});
