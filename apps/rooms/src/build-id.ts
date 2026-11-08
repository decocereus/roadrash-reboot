import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const LOCAL_BUILD = "local";

const DeployedBuild = Schema.NonEmptyString.check(
  Schema.makeFilter(
    (build: string) =>
      build !== LOCAL_BUILD ||
      `RUSHLINE_BUILD is "${LOCAL_BUILD}", which names no commit`,
    { title: "the commit being deployed" }
  )
);

export const roomsBuild = Effect.gen(function* roomsBuild() {
  const dev = yield* Config.Boolean("ALCHEMY_DEV").pipe(
    Config.withDefault(false)
  );
  return yield* dev
    ? Config.String("RUSHLINE_BUILD").pipe(Config.withDefault(LOCAL_BUILD))
    : Config.schema(DeployedBuild, "RUSHLINE_BUILD");
});
