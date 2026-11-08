import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const LOCAL_BUILD = "local";

const BUILD_KEY = "RUSHLINE_BUILD";

const DeployedBuild = Schema.NonEmptyString.check(
  Schema.makeFilter(
    (build: string) =>
      build !== LOCAL_BUILD ||
      `${BUILD_KEY} is "${LOCAL_BUILD}", which names no commit`,
    { title: "the commit being deployed" }
  )
);

export const roomsBuild = Effect.gen(function* roomsBuild() {
  const dev = yield* Config.Boolean("ALCHEMY_DEV").pipe(
    Config.withDefault(false)
  );
  return yield* dev
    ? Config.String(BUILD_KEY).pipe(Config.withDefault(LOCAL_BUILD))
    : Config.schema(DeployedBuild, BUILD_KEY);
});

export const pinRoomsBuild = (build: string) =>
  ConfigProvider.layerAdd(ConfigProvider.fromUnknown({ [BUILD_KEY]: build }), {
    asPrimary: true,
  });
