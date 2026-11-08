import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "vitest";

import { roomsBuild } from "../src/build-id.ts";

const buildWith = (env: Readonly<Record<string, string>>) =>
  Effect.runSyncExit(
    Effect.gen(function* build() {
      return yield* roomsBuild;
    }).pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown(env)
      )
    )
  );

describe("the rooms build a Worker deploys with", () => {
  it("refuses a deploy with no build, or with the local one, so the game and the rooms name the same commit", () => {
    expect(Exit.isFailure(buildWith({}))).toBeTruthy();
    expect(Exit.isFailure(buildWith({ RUSHLINE_BUILD: "local" }))).toBeTruthy();
    expect(Exit.isFailure(buildWith({ RUSHLINE_BUILD: "" }))).toBeTruthy();
  });

  it("takes the commit a deploy names", () => {
    expect(buildWith({ RUSHLINE_BUILD: "3022e4c8" })).toStrictEqual(
      Exit.succeed("3022e4c8")
    );
  });

  it("lets alchemy dev run as the local build, or as any build it is given", () => {
    expect(buildWith({ ALCHEMY_DEV: "true" })).toStrictEqual(
      Exit.succeed("local")
    );
    expect(
      buildWith({ ALCHEMY_DEV: "true", RUSHLINE_BUILD: "label" })
    ).toStrictEqual(Exit.succeed("label"));
  });
});
