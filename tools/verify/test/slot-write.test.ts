import { ToolProcesses } from "@racer/devtools/process";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";

import { SlotStore, statePath } from "../src/state.ts";
import type { InstanceState } from "../src/state.ts";

const state: InstanceState = {
  browserPid: null,
  buildDir: null,
  builtAt: null,
  builtFrom: null,
  checkout: "/checkout",
  cpu: 1,
  devtoolsPort: 1,
  evidence: "/evidence",
  host: "macos-metal",
  network: "off",
  profile: "/profile",
  run: "20261104-000000-s3",
  serverMode: "external",
  serverPid: null,
  serverUrl: "http://127.0.0.1:1/",
  slot: 3,
  sound: false,
  startedAt: "2026-11-04T00:00:00.000Z",
  upPid: 1,
  watcherPid: null,
};

describe("writing a slot", () => {
  it("never leaves a half-written slot for a bench to read and skip", async () => {
    const steps: string[] = [];
    const files = FileSystem.layerNoop({
      rename: (from, to) =>
        Effect.sync(() => {
          steps.push(`rename ${from} ${to}`);
        }),
      writeFileString: (file) =>
        Effect.sync(() => {
          steps.push(`write ${file}`);
        }),
    });
    const processes = Layer.mock(ToolProcesses)({});
    await Effect.runPromise(
      SlotStore.use((slots) => slots.writeState(state)).pipe(
        Effect.provide(SlotStore.layer),
        Effect.provide(Layer.merge(files, processes))
      )
    );
    const file = statePath(3);
    const draft = `${file}.${process.pid}.draft`;
    expect(steps).toStrictEqual([`write ${draft}`, `rename ${draft} ${file}`]);
  });
});
